create table if not exists public.staffing_rules (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null unique references public.seasons(id) on delete cascade,
  candidates_per_invigilator integer not null default 30
    check (candidates_per_invigilator >= 1),
  additional_invigilators_per_room integer not null default 1
    check (additional_invigilators_per_room >= 0),
  minimum_invigilators_per_room integer not null default 1
    check (minimum_invigilators_per_room >= 1),
  single_candidate_needs_one boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staffing_rules
  add column if not exists single_candidate_needs_one boolean
  not null default true;

alter table public.staffing_rules enable row level security;

drop policy if exists "Authenticated users can read staffing rules"
  on public.staffing_rules;

create policy "Authenticated users can read staffing rules"
  on public.staffing_rules
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can insert staffing rules"
  on public.staffing_rules;

create policy "Authenticated users can insert staffing rules"
  on public.staffing_rules
  for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated users can update staffing rules"
  on public.staffing_rules;

create policy "Authenticated users can update staffing rules"
  on public.staffing_rules
  for update
  to authenticated
  using (true)
  with check (true);

create table if not exists public.staffing_room_rules (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  room_name text not null,
  candidates_per_invigilator integer not null
    check (candidates_per_invigilator >= 1),
  additional_invigilators_per_room integer not null
    check (additional_invigilators_per_room >= 0),
  minimum_invigilators_per_room integer not null
    check (minimum_invigilators_per_room >= 1),
  single_candidate_needs_one boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, room_name)
);

alter table public.staffing_room_rules
  add column if not exists single_candidate_needs_one boolean
  not null default true;

alter table public.staffing_room_rules enable row level security;

drop policy if exists "Authenticated users can read room staffing rules"
  on public.staffing_room_rules;

create policy "Authenticated users can read room staffing rules"
  on public.staffing_room_rules
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can insert room staffing rules"
  on public.staffing_room_rules;

create policy "Authenticated users can insert room staffing rules"
  on public.staffing_room_rules
  for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated users can update room staffing rules"
  on public.staffing_room_rules;

create policy "Authenticated users can update room staffing rules"
  on public.staffing_room_rules
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated users can delete room staffing rules"
  on public.staffing_room_rules;

create policy "Authenticated users can delete room staffing rules"
  on public.staffing_room_rules
  for delete
  to authenticated
  using (true);
