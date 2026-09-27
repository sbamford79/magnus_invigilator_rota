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
  if p_action not in ('in', 'out', 'undo_in', 'undo_out') then
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
  elsif p_action = 'out' then
    if v_assignment.clock_in_at is null then
      raise exception 'Clock in before clocking out';
    end if;

    update public.shift_assignments
    set clock_out_at = coalesce(clock_out_at, now())
    where id = p_assignment_id;
  elsif p_action = 'undo_out' then
    update public.shift_assignments
    set clock_out_at = null
    where id = p_assignment_id;
  else
    if v_assignment.clock_out_at is not null then
      raise exception 'Undo clock out before undoing clock in';
    end if;

    update public.shift_assignments
    set clock_in_at = null
    where id = p_assignment_id;
  end if;
end;
$$;

revoke all on function public.clock_shift(uuid, text) from public;
grant execute on function public.clock_shift(uuid, text) to authenticated;

create or replace function public.set_shift_clock_times(
  p_assignment_id uuid,
  p_clock_in_at timestamptz,
  p_clock_out_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
begin
  if p_clock_in_at is null and p_clock_out_at is not null then
    raise exception 'Enter a start time before adding a finish time';
  end if;

  if p_clock_in_at is not null
    and (p_clock_in_at at time zone 'Europe/London')::date <> v_today then
    raise exception 'The start time must be for today';
  end if;

  if p_clock_out_at is not null
    and (p_clock_out_at at time zone 'Europe/London')::date <> v_today then
    raise exception 'The finish time must be for today';
  end if;

  if p_clock_in_at is not null
    and p_clock_out_at is not null
    and p_clock_out_at < p_clock_in_at then
    raise exception 'The finish time cannot be before the start time';
  end if;

  update public.shift_assignments assignment
  set clock_in_at = p_clock_in_at,
      clock_out_at = p_clock_out_at
  from public.invigilators invigilator,
       public.shift_slots slot,
       public.exam_days exam_day,
       public.seasons season
  where assignment.id = p_assignment_id
    and invigilator.id = assignment.invigilator_id
    and invigilator.auth_user_id = auth.uid()
    and slot.id = assignment.shift_slot_id
    and exam_day.id = slot.exam_day_id
    and exam_day.exam_date = v_today
    and season.id = exam_day.season_id
    and season.status = 'active'
    and assignment.published = true;

  if not found then
    raise exception 'These shift times can only be changed on the day';
  end if;
end;
$$;

revoke all on function public.set_shift_clock_times(uuid, timestamptz, timestamptz) from public;
grant execute on function public.set_shift_clock_times(uuid, timestamptz, timestamptz) to authenticated;
