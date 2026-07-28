create table if not exists public.invigilator_shift_notifications (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  invigilator_id uuid not null references public.invigilators(id) on delete cascade,
  notification_type text not null check (
    notification_type in ('shifts_available', 'assignments_published')
  ),
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists invigilator_shift_notifications_recipient_idx
  on public.invigilator_shift_notifications
  (invigilator_id, read_at, created_at desc);

alter table public.invigilator_shift_notifications enable row level security;

drop policy if exists "Admins can create invigilator shift notifications"
  on public.invigilator_shift_notifications;

create policy "Admins can create invigilator shift notifications"
  on public.invigilator_shift_notifications
  for insert
  to authenticated
  with check (
    not exists (
      select 1
      from public.invigilators
      where invigilators.auth_user_id = auth.uid()
    )
  );

drop policy if exists "Invigilators can read their shift notifications"
  on public.invigilator_shift_notifications;

create policy "Invigilators can read their shift notifications"
  on public.invigilator_shift_notifications
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.invigilators
      where invigilators.id = invigilator_id
        and invigilators.auth_user_id = auth.uid()
    )
  );

drop policy if exists "Invigilators can update their shift notifications"
  on public.invigilator_shift_notifications;

create policy "Invigilators can update their shift notifications"
  on public.invigilator_shift_notifications
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.invigilators
      where invigilators.id = invigilator_id
        and invigilators.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.invigilators
      where invigilators.id = invigilator_id
        and invigilators.auth_user_id = auth.uid()
    )
  );
