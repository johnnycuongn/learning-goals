-- my-roadmaps: many roadmaps per person, each with stages, topics and resources.
-- Every row carries user_id and every table has the same rule: you can only
-- touch your own rows. The publishable key ships to the browser, so Row Level
-- Security is the only thing between one person's roadmaps and another's.

create table public.roadmaps (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null,
  description text not null default '',
  -- draft: produced by research, waiting for review. active: saved officially.
  state       text not null default 'active' check (state in ('draft', 'active', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.stages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  roadmap_id  uuid not null references public.roadmaps (id) on delete cascade,
  title       text not null,
  pace        text not null default '',
  description text not null default '',
  milestone   text,                       -- shown in the gap after this stage
  position    double precision not null default 0
);

-- What to learn.
create table public.topics (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  roadmap_id        uuid not null references public.roadmaps (id) on delete cascade,
  stage_id          uuid not null references public.stages (id) on delete cascade,
  title             text not null,
  description       text not null default '',
  importance        text not null default 'rec' check (importance in ('rec', 'alt', 'opt')),
  status            text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'skipped')),
  status_changed_at timestamptz,
  archived_at       timestamptz,          -- hidden unless "show archived" is on
  notes_md          text not null default '',
  position          double precision not null default 0,
  created_at        timestamptz not null default now()
);

-- Where to learn it: a course, doc, blog post, video, book or project.
create table public.resources (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  roadmap_id        uuid not null references public.roadmaps (id) on delete cascade,
  stage_id          uuid not null references public.stages (id) on delete cascade,
  kind              text not null default 'course' check (kind in ('course', 'doc', 'blog', 'video', 'book', 'project', 'other')),
  title             text not null,
  provider          text not null default '',
  url               text,
  cost              text not null default '',
  duration          text not null default '',
  description       text not null default '',
  importance        text not null default 'rec' check (importance in ('rec', 'alt', 'opt')),
  status            text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'skipped')),
  status_changed_at timestamptz,
  archived_at       timestamptz,
  notes_md          text not null default '',
  position          double precision not null default 0,
  created_at        timestamptz not null default now()
);

-- A resource covers topics. One link per topic may be marked primary ("the main
-- course"); the rest are references.
create table public.topic_resources (
  topic_id    uuid not null references public.topics (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  is_primary  boolean not null default false,
  primary key (topic_id, resource_id)
);

-- Extra links a person adds to a topic or a resource.
create table public.item_links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id    uuid references public.topics (id) on delete cascade,
  resource_id uuid references public.resources (id) on delete cascade,
  url         text not null,
  label       text not null default '',
  created_at  timestamptz not null default now(),
  check ((topic_id is null) <> (resource_id is null))
);

-- Files a person attaches. The bytes live in Storage under <user_id>/...
create table public.item_files (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id    uuid references public.topics (id) on delete cascade,
  resource_id uuid references public.resources (id) on delete cascade,
  path        text not null,
  name        text not null,
  size_bytes  bigint not null default 0,
  mime        text not null default '',
  created_at  timestamptz not null default now(),
  check ((topic_id is null) <> (resource_id is null))
);

create index on public.stages (roadmap_id);
create index on public.topics (roadmap_id);
create index on public.topics (user_id, status, status_changed_at desc);
create index on public.resources (roadmap_id);
create index on public.topic_resources (resource_id);
create index on public.item_links (topic_id);
create index on public.item_links (resource_id);
create index on public.item_files (topic_id);
create index on public.item_files (resource_id);

do $$
declare t text;
begin
  foreach t in array array['roadmaps','stages','topics','resources','topic_resources','item_links','item_files']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- Private file bucket: a person can only reach paths that start with their own id.
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 10485760)
on conflict (id) do nothing;

create policy "own files read"   on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files write"  on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

