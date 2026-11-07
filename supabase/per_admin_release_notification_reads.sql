create table if not exists public.shift_release_notification_reads (
  notification_id uuid not null
    references public.shift_release_notifications(id) on delete cascade,
  admin_user_id uuid not null
    references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, admin_user_id)
);

create index if not exists shift_release_notification_reads_admin_idx
  on public.shift_release_notification_reads (admin_user_id, read_at desc);

alter table public.shift_release_notification_reads enable row level security;

drop policy if exists "Admins can read their own release notification reads"
  on public.shift_release_notification_reads;

create policy "Admins can read their own release notification reads"
  on public.shift_release_notification_reads
  for select
  to authenticated
  using (
    admin_user_id = auth.uid()
    and not exists (
      select 1
      from public.invigilators
      where invigilators.auth_user_id = auth.uid()
    )
  );

drop policy if exists "Admins can create their own release notification reads"
  on public.shift_release_notification_reads;

create policy "Admins can create their own release notification reads"
  on public.shift_release_notification_reads
  for insert
  to authenticated
  with check (
    admin_user_id = auth.uid()
    and not exists (
      select 1
      from public.invigilators
      where invigilators.auth_user_id = auth.uid()
    )
  );
