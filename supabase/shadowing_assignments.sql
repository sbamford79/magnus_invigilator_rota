-- Run this once in the Supabase SQL editor before using shadowing shifts.
alter table public.shift_assignments
  add column if not exists is_shadowing boolean not null default false;

-- Shadowing invigilators are visible as part of the team, but availability
-- calculations must count only normal staffed assignments.
create or replace view public.published_shift_team as
select id, shift_slot_id, invigilator_id, published, is_shadowing
from public.shift_assignments
where published = true;

revoke all on public.published_shift_team from public;
grant select on public.published_shift_team to authenticated;
