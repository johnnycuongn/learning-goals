-- Per-person settings (which model, when the weekly focus refreshes) and the
-- latest "This week" briefing. Both sync, so the read-only web viewer can show
-- a briefing that the desktop app generated.
create table public.user_settings (
  user_id          uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  ai_model         text not null default '',
  briefing_enabled boolean not null default true,
  briefing_time    text not null default '08:00' check (briefing_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  updated_at       timestamptz not null default now()
);
create table public.briefings (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  content      jsonb not null,
  model        text not null default '',
  generated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
alter table public.briefings enable row level security;
create policy "own rows" on public.user_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.briefings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
