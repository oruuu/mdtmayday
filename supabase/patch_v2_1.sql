alter table attendance
add column if not exists reject_reason text;

alter table attendance
add column if not exists location text;

alter table attendance
add column if not exists badge_number text;

alter table attendance
add column if not exists rank_detail text;

alter table profiles
add column if not exists rank_detail text not null default 'CASIS';

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

alter table audit_logs enable row level security;

drop policy if exists "audit_select" on audit_logs;
drop policy if exists "audit_insert" on audit_logs;

create policy "audit_select" on audit_logs
for select to authenticated using (true);

create policy "audit_insert" on audit_logs
for insert to authenticated with check (true);
