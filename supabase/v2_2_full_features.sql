-- MAYDAY MDT V3.4 FULL FEATURE PATCH

alter table profiles
add column if not exists rank_detail text not null default 'CASIS';

alter table profiles
add column if not exists last_login timestamptz;

alter table profiles
add column if not exists last_seen timestamptz;

alter table profiles
add column if not exists online_status text not null default 'OFFLINE';

alter table attendance
add column if not exists reject_reason text;

alter table attendance
add column if not exists approval_note text;

alter table attendance
add column if not exists location text;

alter table attendance
add column if not exists badge_number text;

alter table attendance
add column if not exists rank_detail text;

alter table attendance
add column if not exists evidence_urls jsonb not null default '[]'::jsonb;

alter table reports
add column if not exists badge_number text;

alter table reports
add column if not exists evidence_urls jsonb not null default '[]'::jsonb;

alter table disciplinary_records
add column if not exists evidence_urls jsonb not null default '[]'::jsonb;

create table if not exists audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id bigint,
  actor_name text,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb,
  created_at timestamptz default now()
);

create table if not exists role_history (
  id bigint generated always as identity primary key,
  user_id bigint references profiles(id) on delete cascade,
  old_jabatan text,
  new_jabatan text,
  old_rank_detail text,
  new_rank_detail text,
  changed_by text,
  created_at timestamptz default now()
);

create table if not exists division_history (
  id bigint generated always as identity primary key,
  user_id bigint references profiles(id) on delete cascade,
  old_divisi text,
  new_divisi text,
  changed_by text,
  created_at timestamptz default now()
);

create table if not exists bot_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING',
  processed_at timestamptz,
  created_at timestamptz default now()
);

alter table audit_logs enable row level security;
alter table role_history enable row level security;
alter table division_history enable row level security;
alter table bot_events enable row level security;

drop policy if exists "audit_select" on audit_logs;
drop policy if exists "audit_insert" on audit_logs;
drop policy if exists "role_history_select" on role_history;
drop policy if exists "role_history_insert" on role_history;
drop policy if exists "division_history_select" on division_history;
drop policy if exists "division_history_insert" on division_history;
drop policy if exists "bot_events_select" on bot_events;
drop policy if exists "bot_events_insert" on bot_events;
drop policy if exists "bot_events_update" on bot_events;

create policy "audit_select" on audit_logs for select to authenticated using (true);
create policy "audit_insert" on audit_logs for insert to authenticated with check (true);

create policy "role_history_select" on role_history for select to authenticated using (true);
create policy "role_history_insert" on role_history for insert to authenticated with check (true);

create policy "division_history_select" on division_history for select to authenticated using (true);
create policy "division_history_insert" on division_history for insert to authenticated with check (true);

create policy "bot_events_select" on bot_events for select to authenticated using (true);
create policy "bot_events_insert" on bot_events for insert to authenticated with check (true);
create policy "bot_events_update" on bot_events for update to authenticated using (true);
