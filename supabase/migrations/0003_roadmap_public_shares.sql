-- Public share links. One row, so one link, per roadmap.
--
-- Anonymous visitors get no table access at all. They can call exactly one
-- function, get_shared_roadmap(token), which returns a single roadmap as JSON
-- and deliberately leaves out: notes, attached files, extra links, archived
-- items, and (unless the owner opted in) every status. Retiring a link means
-- replacing the token; the old one then matches nothing.
--
-- Supabase's linter warns that get_shared_roadmap is a SECURITY DEFINER function
-- callable by anon. That is the feature, and the reason it is this narrow.
create table public.roadmap_shares (
  roadmap_id     uuid primary key references public.roadmaps (id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token          text not null unique check (token ~ '^[A-Za-z0-9_-]{22,64}$'),
  enabled        boolean not null default true,
  include_status boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.roadmap_shares enable row level security;
create policy "own rows" on public.roadmap_shares for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.roadmaps r where r.id = roadmap_id and r.user_id = (select auth.uid()))
  );
-- The two functions are in the applied migration; see the Supabase migration
-- history (roadmap_public_shares) for their full text:
--   shared_roadmap_json(uuid, boolean)  internal, execute revoked from everyone
--   get_shared_roadmap(text)            public entry point, granted to anon
