create table if not exists public.invigilator_notices (
  id text primary key,
  title text not null,
  content text not null,
  position integer not null unique,
  updated_at timestamptz not null default now()
);

insert into public.invigilator_notices (id, title, content, position)
values
  (
    'mock-exams',
    'Mock Exams: Last Updated 6/5/26',
    'During the Y10 mock exam seasons there will be 2 sessions in a day. The exams will begin at 8:45am and 1:00pm. Please arrive 30 minutes before these start times.',
    1
  ),
  (
    'summer-exams',
    'Summer Exams: Last Updated 6/5/26',
    'During the summer exam season there will be 2 sessions in a day. The exams will begin at 9:00am and 1:00pm. Please arrive 30 minutes before these start times.',
    2
  ),
  (
    'general-information',
    'General Information',
    'Please check this area for important updates from the exams team.',
    3
  )
on conflict (id) do nothing;

alter table public.invigilator_notices enable row level security;

create policy "Logged-in users can view invigilator notices"
on public.invigilator_notices
for select
to authenticated
using (true);

create policy "Logged-in users can manage invigilator notices"
on public.invigilator_notices
for all
to authenticated
using (true)
with check (true);
