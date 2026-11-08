create table if not exists public.invigilator_assignment_rules (
  invigilator_id uuid primary key references public.invigilators(id) on delete cascade,
  room_name text not null default 'Sports Hall',
  latest_departure_time time,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.invigilator_assignment_rules
  add column if not exists session_key text not null default 'morning',
  add column if not exists rule_type text not null default 'latest_finish',
  add column if not exists earliest_start_time time,
  add column if not exists weekday integer,
  add column if not exists limit_value integer;

alter table public.invigilator_assignment_rules enable row level security;

create policy "Admins can manage invigilator assignment rules"
  on public.invigilator_assignment_rules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
