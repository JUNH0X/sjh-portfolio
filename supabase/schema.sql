-- 신준호 포트폴리오: Supabase SQL Editor에서 전체를 실행하세요.
-- 공개 방문자는 SELECT만 할 수 있고, 글쓰기/프로필 수정은 Cloudflare Pages Functions에서만 수행합니다.

create table if not exists public.profiles (
  id smallint primary key check (id = 1),
  display_name text not null default '신준호',
  description text not null default '오픈소스 AI 모델을 연구하고 개조하며, 배운 내용을 기록하는 학생 개발자입니다.',
  avatar_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  link text,
  photo_url text,
  photo_urls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.research_records (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  link text,
  photo_url text,
  photo_urls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 기존 데이터베이스에도 안전하게 반영: 링크는 선택사항이며 사진 URL 컬럼을 추가합니다.
alter table public.portfolios add column if not exists photo_url text;
alter table public.portfolios add column if not exists photo_urls jsonb not null default '[]'::jsonb;
alter table public.portfolios alter column link drop not null;
alter table public.research_records add column if not exists photo_url text;
alter table public.research_records add column if not exists photo_urls jsonb not null default '[]'::jsonb;

-- Migrate existing single-photo records into the new multi-photo array.
update public.portfolios set photo_urls = jsonb_build_array(photo_url)
where photo_url is not null and photo_url <> '' and photo_urls = '[]'::jsonb;
update public.research_records set photo_urls = jsonb_build_array(photo_url)
where photo_url is not null and photo_url <> '' and photo_urls = '[]'::jsonb;


insert into public.profiles (id, display_name, description)
values (1, '신준호', '오픈소스 AI 모델을 연구하고 개조하며, 배운 내용을 기록하는 학생 개발자입니다.')
on conflict (id) do nothing;

-- 명시적으로 RLS를 활성화하고, 브라우저 공개 키에는 읽기 권한만 부여합니다.
alter table public.profiles enable row level security;
alter table public.portfolios enable row level security;
alter table public.research_records enable row level security;

revoke all privileges on table public.profiles from anon, authenticated;
revoke all privileges on table public.portfolios from anon, authenticated;
revoke all privileges on table public.research_records from anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant select on table public.portfolios to anon, authenticated;
grant select on table public.research_records to anon, authenticated;
grant all privileges on table public.profiles to service_role;
grant all privileges on table public.portfolios to service_role;
grant all privileges on table public.research_records to service_role;

drop policy if exists "Public can read profile" on public.profiles;
create policy "Public can read profile" on public.profiles for select to anon, authenticated using (true);
drop policy if exists "Public can read portfolios" on public.portfolios;
create policy "Public can read portfolios" on public.portfolios for select to anon, authenticated using (true);
drop policy if exists "Public can read research records" on public.research_records;
create policy "Public can read research records" on public.research_records for select to anon, authenticated using (true);

-- 포트폴리오/연구 기록을 저장할 때 실시간 이벤트를 받을 수 있도록 publication에 추가합니다.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'portfolios') then
    alter publication supabase_realtime add table public.portfolios;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'research_records') then
    alter publication supabase_realtime add table public.research_records;
  end if;
end $$;

-- 프로필 사진은 서버 기능을 통해서만 업로드합니다. 공개 읽기는 프로필 이미지 표시를 위해 허용합니다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-images', 'profile-images', true, 1048576, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update set
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif'];

-- 공개 포트폴리오/연구 기록 사진 버킷. 업로드는 관리자 서버 함수에서만 실행합니다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('record-images', 'record-images', true, 5242880, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif'];
