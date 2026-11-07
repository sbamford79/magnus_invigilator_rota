create table if not exists public.published_shift_assignments (
  season_id uuid not null references public.seasons(id) on delete cascade,
  shift_slot_id uuid not null references public.shift_slots(id) on delete cascade,
  invigilator_id uuid not null references public.invigilators(id) on delete cascade,
  primary key (season_id, shift_slot_id, invigilator_id)
);

create table if not exists public.published_shift_availability (
  season_id uuid not null references public.seasons(id) on delete cascade,
  shift_slot_id uuid not null references public.shift_slots(id) on delete cascade,
  needed integer not null check (needed >= 0),
  primary key (season_id, shift_slot_id)
);

alter table public.published_shift_assignments enable row level security;
alter table public.published_shift_availability enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'published_shift_assignments'
      and policyname = 'Authenticated users can view published assignment snapshots'
  ) then
    create policy "Authenticated users can view published assignment snapshots"
    on public.published_shift_assignments
    for select
    to authenticated
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'published_shift_availability'
      and policyname = 'Authenticated users can manage published availability snapshots'
  ) then
    create policy "Authenticated users can manage published availability snapshots"
    on public.published_shift_availability
    for all
    to authenticated
    using (true)
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'published_shift_assignments'
      and policyname = 'Authenticated users can manage published assignment snapshots'
  ) then
    create policy "Authenticated users can manage published assignment snapshots"
    on public.published_shift_assignments
    for all
    to authenticated
    using (true)
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'Authenticated users can create notifications'
  ) then
    create policy "Authenticated users can create notifications"
    on public.notifications
    for insert
    to authenticated
    with check (true);
  end if;
end $$;
