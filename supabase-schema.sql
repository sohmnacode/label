-- Sohmna Label Hub — Supabase Schema
-- Run this once in your Supabase project's SQL editor.

-- ─── Profiles (extends auth.users) ──────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  email       text,
  full_name   text,
  role        text not null default 'artist', -- 'owner' | 'artist' | 'team'
  avatar_url  text,
  created_at  timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Owners can read all profiles
create policy "Owners can read all profiles"
  on public.profiles for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'artist')
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Artists ─────────────────────────────────────────────────────────────────
create table if not exists public.artists (
  id          uuid primary key default gen_random_uuid(),
  label_id    uuid references public.profiles(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  stage_name  text not null,
  legal_name  text,
  email       text,
  phone       text,
  genres      text[] default '{}',
  status      text not null default 'active', -- 'active' | 'inactive' | 'unsigned'
  bio         text,
  socials     jsonb not null default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.artists enable row level security;

create policy "Owners and team can read all artists"
  on public.artists for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','team'))
  );

create policy "Artists can read their own record"
  on public.artists for select using (user_id = auth.uid());

create policy "Owners can insert artists"
  on public.artists for insert with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "Owners can update artists"
  on public.artists for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "Owners can delete artists"
  on public.artists for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

-- ─── Releases ────────────────────────────────────────────────────────────────
create table if not exists public.releases (
  id              uuid primary key default gen_random_uuid(),
  label_id        uuid references public.profiles(id) on delete cascade,
  title           text not null,
  release_type    text not null default 'single', -- 'single' | 'ep' | 'album' | 'mixtape'
  release_date    date,
  status          text not null default 'draft', -- 'draft' | 'scheduled' | 'distributed' | 'live' | 'archived'
  cover_url       text,
  upc             text,
  platform_links  jsonb not null default '{}',
  distributor     text,
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.releases enable row level security;

create policy "Owners and team can read all releases"
  on public.releases for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','team'))
  );

create policy "Owners can manage releases"
  on public.releases for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

-- ─── Tracks ──────────────────────────────────────────────────────────────────
create table if not exists public.tracks (
  id            uuid primary key default gen_random_uuid(),
  release_id    uuid references public.releases(id) on delete cascade,
  title         text not null,
  isrc          text,
  track_number  int,
  duration_sec  int,
  explicit      boolean default false,
  created_at    timestamptz default now()
);

alter table public.tracks enable row level security;

create policy "Owners can manage tracks"
  on public.tracks for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

-- ─── Release Artists (Splits) ────────────────────────────────────────────────
create table if not exists public.release_artists (
  id          uuid primary key default gen_random_uuid(),
  release_id  uuid references public.releases(id) on delete cascade,
  artist_id   uuid references public.artists(id) on delete cascade,
  role        text not null default 'primary', -- 'primary' | 'featured' | 'producer' | 'writer'
  split_pct   numeric(5,2) not null default 0,
  created_at  timestamptz default now(),
  unique (release_id, artist_id)
);

alter table public.release_artists enable row level security;

create policy "Owners and team can read splits"
  on public.release_artists for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','team'))
  );

create policy "Artists can see their own splits"
  on public.release_artists for select using (
    exists (
      select 1 from public.artists a
      where a.id = release_artists.artist_id and a.user_id = auth.uid()
    )
  );

create policy "Owners can manage splits"
  on public.release_artists for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

-- These policies reference release_artists so they must come after the table exists
create policy "Artists can see their releases"
  on public.releases for select using (
    exists (
      select 1 from public.release_artists ra
      join public.artists a on a.id = ra.artist_id
      where ra.release_id = releases.id and a.user_id = auth.uid()
    )
  );

create policy "Same access as parent release"
  on public.tracks for select using (
    exists (
      select 1 from public.releases r
      where r.id = tracks.release_id
        and (
          exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','team'))
          or exists (
            select 1 from public.release_artists ra
            join public.artists a on a.id = ra.artist_id
            where ra.release_id = r.id and a.user_id = auth.uid()
          )
        )
    )
  );

-- ─── Contracts ───────────────────────────────────────────────────────────────
create table if not exists public.contracts (
  id           uuid primary key default gen_random_uuid(),
  label_id     uuid references public.profiles(id) on delete cascade,
  artist_id    uuid references public.artists(id) on delete cascade,
  title        text not null,
  type         text not null default 'recording', -- 'recording' | 'distribution' | 'management' | 'publishing'
  status       text not null default 'draft',     -- 'draft' | 'sent' | 'signed' | 'expired' | 'terminated'
  signed_date  date,
  expiry_date  date,
  file_url     text,
  notes        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table public.contracts enable row level security;

create policy "Owners can read all contracts"
  on public.contracts for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "Artists can read their own contracts"
  on public.contracts for select using (
    exists (
      select 1 from public.artists a
      where a.id = contracts.artist_id and a.user_id = auth.uid()
    )
  );

create policy "Owners can manage contracts"
  on public.contracts for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );
