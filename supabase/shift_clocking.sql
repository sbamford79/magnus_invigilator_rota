alter table public.shift_assignments
  add column if not exists clock_in_at timestamptz;

alter table public.shift_assignments
  add column if not exists clock_out_at timestamptz;

create or replace function public.clock_shift(
  p_assignment_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.shift_assignments;
begin
  if p_action not in ('in', 'out') then
    raise exception 'Invalid clock action';
  end if;

  select assignment.*
    into v_assignment
  from public.shift_assignments assignment
  join public.invigilators invigilator
    on invigilator.id = assignment.invigilator_id
  join public.shift_slots slot
    on slot.id = assignment.shift_slot_id
  join public.exam_days exam_day
    on exam_day.id = slot.exam_day_id
  join public.seasons season
    on season.id = exam_day.season_id
  where assignment.id = p_assignment_id
    and invigilator.auth_user_id = auth.uid()
    and assignment.published = true
    and exam_day.exam_date = current_date
    and season.status = 'active';

  if not found then
    raise exception 'This shift cannot be clocked';
  end if;

  if p_action = 'in' then
    update public.shift_assignments
    set clock_in_at = coalesce(clock_in_at, now())
    where id = p_assignment_id;
  else
    if v_assignment.clock_in_at is null then
      raise exception 'Clock in before clocking out';
    end if;

    update public.shift_assignments
    set clock_out_at = coalesce(clock_out_at, now())
    where id = p_assignment_id;
  end if;
end;
$$;

revoke all on function public.clock_shift(uuid, text) from public;
grant execute on function public.clock_shift(uuid, text) to authenticated;
