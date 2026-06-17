create table if not exists profiles (
  id bigint generated always as identity primary key,
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  discord_id text,
  display_name text not null,
  avatar_url text,
  badge_number text default '#0000',
  jabatan text not null default 'CASIS',
  divisi text not null default 'CASIS',
  status text not null default 'PENDING',
  prp int not null default 0,
  created_at timestamptz default now()
);
create table if not exists bot_settings (
  id bigint generated always as identity primary key,
  guild_id text not null,
  setting_key text not null,
  setting_value text not null,
  unique(guild_id, setting_key)
);
create table if not exists attendance (
  id bigint generated always as identity primary key,
  user_id bigint references profiles(id) on delete set null,
  discord_id text,nama text,jabatan text,divisi text,type text not null,note text,evidence_url text,
  status text not null default 'PENDING',approved_by text,discord_message_id text,discord_thread_id text,created_at timestamptz default now()
);
create table if not exists reports (
  id bigint generated always as identity primary key,
  user_id bigint references profiles(id) on delete set null,
  type text not null,nama text,divisi text,payload jsonb,evidence_url text,status text not null default 'PENDING',approved_by text,created_at timestamptz default now()
);
create table if not exists disciplinary_records (
  id bigint generated always as identity primary key,
  target_user_id bigint references profiles(id) on delete set null,
  target_name text,issued_by text,sp_level int not null,reason text not null,evidence_url text,status text not null default 'ACTIVE',created_at timestamptz default now()
);
create table if not exists payrolls (
  id bigint generated always as identity primary key,
  user_id bigint references profiles(id) on delete set null,
  period text not null,amount int not null default 0,status text not null default 'PENDING',approved_by text,created_at timestamptz default now()
);
alter table profiles enable row level security;
alter table attendance enable row level security;
alter table reports enable row level security;
alter table disciplinary_records enable row level security;
alter table payrolls enable row level security;
alter table bot_settings enable row level security;
create policy "profiles_select" on profiles for select to authenticated using (true);
create policy "profiles_insert" on profiles for insert to authenticated with check (auth.uid() = auth_user_id);
create policy "profiles_update" on profiles for update to authenticated using (true);
create policy "attendance_select" on attendance for select to authenticated using (true);
create policy "attendance_insert" on attendance for insert to authenticated with check (true);
create policy "attendance_update" on attendance for update to authenticated using (true);
create policy "reports_select" on reports for select to authenticated using (true);
create policy "reports_insert" on reports for insert to authenticated with check (true);
create policy "reports_update" on reports for update to authenticated using (true);
create policy "disciplinary_select" on disciplinary_records for select to authenticated using (true);
create policy "disciplinary_insert" on disciplinary_records for insert to authenticated with check (true);
create policy "payrolls_select" on payrolls for select to authenticated using (true);
create policy "payrolls_insert" on payrolls for insert to authenticated with check (true);
insert into storage.buckets (id, name, public) values ('evidence', 'evidence', true) on conflict (id) do nothing;
create policy "evidence_read" on storage.objects for select using (bucket_id='evidence');
create policy "evidence_upload" on storage.objects for insert to authenticated with check (bucket_id='evidence');
