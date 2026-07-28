alter table public.shift_assignments
  add column if not exists attended boolean not null default false;

alter table public.shift_assignments
  add column if not exists attended_at timestamptz;
