alter table public.shift_slots
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists display_label text;

update public.shift_slots
set start_time = case session_key
      when 'morning' then time '09:00'
      when 'mid' then time '11:30'
      when 'afternoon' then time '13:00'
    end,
    end_time = case session_key
      when 'morning' then time '11:30'
      when 'mid' then time '13:00'
      when 'afternoon' then time '15:30'
    end,
    display_label = case session_key
      when 'morning' then 'Morning'
      when 'mid' then 'Mid'
      when 'afternoon' then 'Afternoon'
    end
where start_time is null;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conrelid::regclass as table_name, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in (
        'public.shift_slots'::regclass,
        'public.room_requirements'::regclass,
        'public.shift_release_notifications'::regclass
      )
      and pg_get_constraintdef(oid) ilike '%session_key%'
  loop
    execute format(
      'alter table %s drop constraint %I',
      constraint_row.table_name,
      constraint_row.conname
    );
  end loop;
end;
$$;
