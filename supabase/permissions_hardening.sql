-- Magnus Invigilator Rota: permissions hardening
-- Run once in the Supabase SQL editor before deploying the matching app changes.

begin;

create table if not exists public.admin_users (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Preserve the app's existing administrators. Before this migration an account
-- was treated as an admin when it existed in Auth but was not linked to an
-- invigilator record.
insert into public.admin_users (auth_user_id)
select users.id
from auth.users as users
where not exists (
  select 1
  from public.invigilators
  where invigilators.auth_user_id = users.id
)
on conflict (auth_user_id) do nothing;

alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where admin_users.auth_user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.current_invigilator_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select invigilators.id
  from public.invigilators
  where invigilators.auth_user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.current_invigilator_id() from public;
grant execute on function public.current_invigilator_id() to authenticated;

-- Remove every existing policy on the app tables so older permissive policies
-- cannot remain active alongside the new rules.
do $$
declare
  table_name text;
  policy_row record;
begin
  foreach table_name in array array[
    'admin_users',
    'invigilators',
    'seasons',
    'exam_days',
    'exam_sessions',
    'exam_timetable',
    'room_requirements',
    'staffing_rules',
    'staffing_room_rules',
    'shift_slots',
    'shift_applications',
    'shift_assignments',
    'invigilator_notices',
    'invigilator_shift_notifications',
    'shift_release_notifications',
    'shift_release_notification_reads',
    'shift_setup_drafts',
    'assign_invigilators_drafts',
    'published_rotas'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);

      for policy_row in
        select policyname
        from pg_policies
        where schemaname = 'public'
          and tablename = table_name
      loop
        execute format(
          'drop policy %I on public.%I',
          policy_row.policyname,
          table_name
        );
      end loop;
    end if;
  end loop;
end
$$;

create policy "Admins can view admin membership"
on public.admin_users for select to authenticated
using (public.is_admin());

create policy "Admins can manage admin membership"
on public.admin_users for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage invigilators"
on public.invigilators for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Invigilators can view their own record"
on public.invigilators for select to authenticated
using (auth_user_id = auth.uid());

-- A safe directory supplies names for the My Team screen without exposing
-- invigilator email addresses or authentication identifiers.
create or replace view public.invigilator_directory as
select id, full_name, active
from public.invigilators;

revoke all on public.invigilator_directory from public;
grant select on public.invigilator_directory to authenticated;

create policy "Logged-in users can view seasons"
on public.seasons for select to authenticated using (true);
create policy "Admins can manage seasons"
on public.seasons for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "Logged-in users can view exam days"
on public.exam_days for select to authenticated using (true);
create policy "Admins can manage exam days"
on public.exam_days for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "Logged-in users can view exam sessions"
on public.exam_sessions for select to authenticated using (true);
create policy "Admins can manage exam sessions"
on public.exam_sessions for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "Logged-in users can view the exam timetable"
on public.exam_timetable for select to authenticated using (true);
create policy "Admins can manage the exam timetable"
on public.exam_timetable for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "Logged-in users can view room requirements"
on public.room_requirements for select to authenticated using (true);
create policy "Admins can manage room requirements"
on public.room_requirements for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "Logged-in users can view staffing rules"
on public.staffing_rules for select to authenticated using (true);
create policy "Admins can manage staffing rules"
on public.staffing_rules for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "Logged-in users can view room staffing rules"
on public.staffing_room_rules for select to authenticated using (true);
create policy "Admins can manage room staffing rules"
on public.staffing_room_rules for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "Admins can manage shift slots"
on public.shift_slots for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy "Invigilators can view published shift slots"
on public.shift_slots for select to authenticated
using (published = true);

create policy "Admins can manage shift applications"
on public.shift_applications for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy "Invigilators can view their applications"
on public.shift_applications for select to authenticated
using (invigilator_id = public.current_invigilator_id());
create policy "Invigilators can apply for themselves"
on public.shift_applications for insert to authenticated
with check (
  invigilator_id = public.current_invigilator_id()
  and exists (
    select 1 from public.shift_slots
    where shift_slots.id = shift_slot_id
      and shift_slots.published = true
  )
);
create policy "Invigilators can withdraw their applications"
on public.shift_applications for delete to authenticated
using (invigilator_id = public.current_invigilator_id());

create policy "Admins can manage shift assignments"
on public.shift_assignments for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy "Invigilators can view their assignments"
on public.shift_assignments for select to authenticated
using (invigilator_id = public.current_invigilator_id());
create policy "Invigilators can release their assignments"
on public.shift_assignments for delete to authenticated
using (invigilator_id = public.current_invigilator_id());

-- The team view deliberately exposes only published assignment identifiers;
-- attendance and clocking information remain private to the individual/admin.
create or replace view public.published_shift_team as
select id, shift_slot_id, invigilator_id, published
from public.shift_assignments
where published = true;

revoke all on public.published_shift_team from public;
grant select on public.published_shift_team to authenticated;

create policy "Logged-in users can view notices"
on public.invigilator_notices for select to authenticated using (true);
create policy "Admins can manage notices"
on public.invigilator_notices for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "Admins can create shift notifications"
on public.invigilator_shift_notifications for insert to authenticated
with check (public.is_admin());
create policy "Invigilators can view their shift notifications"
on public.invigilator_shift_notifications for select to authenticated
using (invigilator_id = public.current_invigilator_id());
create policy "Invigilators can mark their shift notifications read"
on public.invigilator_shift_notifications for update to authenticated
using (invigilator_id = public.current_invigilator_id())
with check (invigilator_id = public.current_invigilator_id());

create policy "Invigilators can create their release notifications"
on public.shift_release_notifications for insert to authenticated
with check (invigilator_id = public.current_invigilator_id());
create policy "Admins can view release notifications"
on public.shift_release_notifications for select to authenticated
using (public.is_admin());
create policy "Admins can update release notifications"
on public.shift_release_notifications for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "Admins can view their notification reads"
on public.shift_release_notification_reads for select to authenticated
using (public.is_admin() and admin_user_id = auth.uid());
create policy "Admins can create their notification reads"
on public.shift_release_notification_reads for insert to authenticated
with check (public.is_admin() and admin_user_id = auth.uid());
create policy "Admins can update their notification reads"
on public.shift_release_notification_reads for update to authenticated
using (public.is_admin() and admin_user_id = auth.uid())
with check (public.is_admin() and admin_user_id = auth.uid());

-- These legacy tables are not present in every installation. Secure them when
-- they exist without preventing the migration from running when they do not.
do $$
begin
  if to_regclass('public.shift_setup_drafts') is not null then
    execute 'create policy "Admins can manage shift setup drafts" on public.shift_setup_drafts for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;

  if to_regclass('public.assign_invigilators_drafts') is not null then
    execute 'create policy "Admins can manage assignment drafts" on public.assign_invigilators_drafts for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;

  if to_regclass('public.published_rotas') is not null then
    execute 'create policy "Admins can manage published rotas" on public.published_rotas for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;
end
$$;

commit;
