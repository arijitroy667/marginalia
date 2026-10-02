-- 0001_init.sql — PRD §9.1 (copied verbatim; the PRD is the source of truth).
-- Forward-only (NFR-REL-02). Server timestamps by trigger, RLS on every table and on storage.objects.

create type public.annotation_kind as enum ('highlight', 'note', 'bookmark');
create type public.doc_storage_mode as enum ('cloud', 'device');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  settings jsonb not null default '{}'::jsonb,   -- palette, theme, warmth, gutter style, keymap
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  title text not null check (char_length(title) between 1 and 500),
  author text,
  page_count integer not null check (page_count > 0),
  file_size bigint not null check (file_size > 0),
  storage_mode public.doc_storage_mode not null default 'cloud',
  storage_path text,                              -- object name in bucket 'pdfs': {user_id}/{content_hash}.pdf (cloud mode only)
  cover_path text,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index documents_user_hash_live
  on public.documents (user_id, content_hash) where deleted_at is null;
-- target of the composite FKs below: a child row's owner must equal its document's owner (S5, ADR 0005)
alter table public.documents add constraint documents_id_user_key unique (id, user_id);
create index documents_sync_idx on public.documents (user_id, updated_at, id);

create table public.annotations (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid not null,
  kind public.annotation_kind not null,
  page integer not null check (page > 0),
  anchor jsonb not null,                          -- Anchor v1 (see 8.6), Zod-validated on the client
  color_id smallint check (color_id between 1 and 8),
  body text check (char_length(body) <= 20000),   -- note text (Markdown source)
  label text check (char_length(label) <= 200),   -- bookmark label
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint annotations_page_matches_anchor check ((anchor ->> 'page')::integer = page),
  constraint annotations_highlight_needs_color check (kind <> 'highlight' or color_id is not null),
  constraint annotations_note_needs_body check (kind <> 'note' or body is not null),
  constraint annotations_document_fk foreign key (document_id, user_id)
    references public.documents (id, user_id) on delete cascade
);

create index annotations_doc_page_idx
  on public.annotations (user_id, document_id, page) where deleted_at is null;
create index annotations_sync_idx on public.annotations (user_id, updated_at, id);

create table public.reading_positions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid not null,
  page integer not null check (page > 0),
  anchor jsonb,                                   -- reading-line anchor (nullable for page-level resume)
  progress real not null check (progress >= 0 and progress <= 1),
  device_id text not null,
  device_label text,
  updated_at timestamptz not null default now(),
  primary key (user_id, document_id),
  constraint reading_positions_document_fk foreign key (document_id, user_id)
    references public.documents (id, user_id) on delete cascade
);

create index reading_positions_sync_idx on public.reading_positions (user_id, updated_at);

-- Server-assigned timestamps
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

create trigger trg_profiles_updated before insert or update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_documents_updated before insert or update on public.documents
  for each row execute function public.set_updated_at();
create trigger trg_annotations_updated before insert or update on public.annotations
  for each row execute function public.set_updated_at();
create trigger trg_positions_updated before insert or update on public.reading_positions
  for each row execute function public.set_updated_at();

-- Auto-create a profile on signup
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.annotations enable row level security;
alter table public.reading_positions enable row level security;

create policy profiles_owner on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy documents_owner on public.documents for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy annotations_owner on public.annotations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy positions_owner on public.reading_positions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Storage: private bucket, one folder per user. The per-object size cap is set to the
-- plan limit (verify in S5; free plans may cap lower than this).
insert into storage.buckets (id, name, public, file_size_limit)
values ('pdfs', 'pdfs', false, 52428800)
on conflict (id) do nothing;

create policy pdfs_owner_all on storage.objects for all to authenticated
  using (bucket_id = 'pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
