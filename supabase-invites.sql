-- Run this in your Supabase SQL editor to add the invite system.

create table if not exists public.invites (
  id          uuid primary key default gen_random_uuid(),
  label_id    uuid references public.profiles(id) on delete cascade,
  email       text,
  role        text not null default 'artist',
  token       uuid not null default gen_random_uuid() unique,
  used        boolean not null default false,
  created_at  timestamptz default now(),
  expires_at  timestamptz default (now() + interval '7 days')
);

alter table public.invites enable row level security;

create policy "Owners can manage invites"
  on public.invites for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

-- Anyone can read an invite by token (needed for the accept flow — no auth yet)
create policy "Anyone can read invite by token"
  on public.invites for select using (true);
