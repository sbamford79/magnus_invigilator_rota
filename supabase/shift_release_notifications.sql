create table if not exists public.shift_release_notifications (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  invigilator_id uuid not null references public.invigilators(id) on delete cascade,
  invigilator_name text not null,
  shift_slot_id uuid references public.shift_slots(id) on delete set null,
  exam_date date not null,
  session_key text not null check (
    session_key in ('morning', 'mid', 'afternoon')
  ),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists shift_release_notifications_season_created_idx
  on public.shift_release_notifications (season_id, created_at desc);

alter table public.shift_release_notifications enable row level security;

drop policy if exists "Invigilators can create their release notifications"
  on public.shift_release_notifications;

create policy "Invigilators can create their release notifications"
  on public.shift_release_notifications
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.invigilators
      where invigilators.id = invigilator_id
        and invigilators.auth_user_id = auth.uid()
    )
  );

drop policy if exists "Admins can read release notifications"
  on public.shift_release_notifications;

create policy "Admins can read release notifications"
  on public.shift_release_notifications
  for select
  to authenticated
  using (
    not exists (
      select 1
      from public.invigilators
      where invigilators.auth_user_id = auth.uid()
    )
  );

drop policy if exists "Admins can update release notifications"
  on public.shift_release_notifications;

create policy "Admins can update release notifications"
  on public.shift_release_notifications
  for update
  to authenticated
  using (
    not exists (
      select 1
      from public.invigilators
      where invigilators.auth_user_id = auth.uid()
    )
  )
  with check (
    not exists (
      select 1
      from public.invigilators
      where invigilators.auth_user_id = auth.uid()
    )
  );
