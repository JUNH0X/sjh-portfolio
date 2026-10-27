-- 기존 SJH Portfolio Supabase 데이터베이스에 사진 첨부를 추가합니다.
-- Supabase Dashboard > SQL Editor에서 전체 내용을 실행하세요.

alter table public.portfolios add column if not exists photo_url text;
alter table public.portfolios alter column link drop not null;
alter table public.research_records add column if not exists photo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('record-images', 'record-images', true, 5242880, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif'];
