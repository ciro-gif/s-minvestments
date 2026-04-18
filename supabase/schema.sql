-- S&M Investments Member Portal — Supabase Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension (usually already enabled)
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text not null default 'Member',
  bio text not null default '',
  avatar_color text not null default '#4A9EFF',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  ticker text not null,
  company_name text,
  pulled_at timestamptz not null default now(),
  metrics_snapshot jsonb
);

create table if not exists public.forum_posts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  post_type text not null check (post_type in ('Analysis Share', 'Watchlist Add', 'General Discussion')),
  content text not null,
  image_url text,
  ticker_tag text,
  created_at timestamptz not null default now()
);

create table if not exists public.forum_replies (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references public.forum_posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.private_notes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  ticker text,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.research_history enable row level security;
alter table public.forum_posts enable row level security;
alter table public.forum_replies enable row level security;
alter table public.private_notes enable row level security;

-- Profiles: all authenticated members can read; only owner updates
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

create policy "profiles_insert" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

create policy "profiles_update" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Research history: all authenticated members can read; owner inserts
create policy "history_select" on public.research_history
  for select to authenticated using (true);

create policy "history_insert" on public.research_history
  for insert to authenticated with check (auth.uid() = user_id);

-- Forum posts: all authenticated can read; owner can insert/update/delete
create policy "posts_select" on public.forum_posts
  for select to authenticated using (true);

create policy "posts_insert" on public.forum_posts
  for insert to authenticated with check (auth.uid() = user_id);

create policy "posts_update" on public.forum_posts
  for update to authenticated using (auth.uid() = user_id);

create policy "posts_delete" on public.forum_posts
  for delete to authenticated using (auth.uid() = user_id);

-- Forum replies: all authenticated can read; owner can insert/delete
create policy "replies_select" on public.forum_replies
  for select to authenticated using (true);

create policy "replies_insert" on public.forum_replies
  for insert to authenticated with check (auth.uid() = user_id);

create policy "replies_delete" on public.forum_replies
  for delete to authenticated using (auth.uid() = user_id);

-- Private notes: only owner can access
create policy "notes_owner" on public.private_notes
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  colors text[] := array['#4A9EFF', '#00C48C', '#F5A623', '#FF4D4D'];
  member_count int;
  assigned_color text;
  name_val text;
begin
  select count(*) into member_count from public.profiles;
  assigned_color := colors[(member_count % 4) + 1];
  name_val := coalesce(
    new.raw_user_meta_data->>'display_name',
    split_part(new.email, '@', 1)
  );
  insert into public.profiles (id, display_name, avatar_color)
  values (new.id, name_val, assigned_color);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- STORAGE BUCKET FOR FORUM IMAGES
-- ============================================================

insert into storage.buckets (id, name, public)
values ('forum-images', 'forum-images', true)
on conflict (id) do nothing;

create policy "forum_images_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'forum-images');

create policy "forum_images_read" on storage.objects
  for select using (bucket_id = 'forum-images');

create policy "forum_images_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'forum-images' and auth.uid()::text = (storage.foldername(name))[1]);
