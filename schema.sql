-- Run this in Supabase Dashboard > SQL Editor.
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  storage_path text not null,
  custom_domain text unique,
  created_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects(user_id);
create index if not exists projects_custom_domain_idx on public.projects(custom_domain);

alter table public.projects enable row level security;

-- The API uses the service-role key server-side and verifies the user's JWT
-- before every private project operation. Do not expose service-role keys.
-- No public RLS policies are intentionally created.
