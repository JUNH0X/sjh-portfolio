-- Multiple photo attachments for portfolios and research records. Safe to re-run.
-- Run this in Supabase Dashboard > SQL Editor before deploying the updated app.

alter table public.portfolios
  add column if not exists photo_urls jsonb not null default '[]'::jsonb;

alter table public.research_records
  add column if not exists photo_urls jsonb not null default '[]'::jsonb;

-- Migrate existing single-photo URLs into the new array without removing photo_url.
update public.portfolios
set photo_urls = jsonb_build_array(photo_url)
where photo_url is not null
  and photo_url <> ''
  and (photo_urls is null or photo_urls = '[]'::jsonb);

update public.research_records
set photo_urls = jsonb_build_array(photo_url)
where photo_url is not null
  and photo_url <> ''
  and (photo_urls is null or photo_urls = '[]'::jsonb);
