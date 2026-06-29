-- Mayday MDT payroll refactor: payroll dihitung dari absensi yang sudah ACC.

alter table profiles
add column if not exists attendance_count int not null default 0;

alter table profiles
add column if not exists izin_count int not null default 0;

alter table profiles
add column if not exists cuti_count int not null default 0;

alter table profiles
add column if not exists pending_payroll int not null default 0;

alter table profiles
add column if not exists total_payroll_received int not null default 0;

alter table attendance
add column if not exists payroll_value int not null default 0;

alter table attendance
add column if not exists duty_start_date date;

alter table attendance
add column if not exists duty_start_time text;

alter table attendance
add column if not exists duty_end_date date;

alter table attendance
add column if not exists duty_end_time text;

alter table attendance
add column if not exists duty_start_at timestamptz;

alter table attendance
add column if not exists duty_end_at timestamptz;

alter table attendance
add column if not exists total_minutes int not null default 0;

alter table attendance
add column if not exists total_hours numeric not null default 0;

alter table attendance
add column if not exists total_points numeric not null default 0;

alter table attendance
add column if not exists leave_start_date date;

alter table attendance
add column if not exists leave_end_date date;

alter table payrolls
add column if not exists requested_points numeric not null default 0;

alter table payrolls
add column if not exists requested_minutes int not null default 0;

alter table payrolls
add column if not exists requested_amount int not null default 0;

alter table payrolls
add column if not exists approved_amount int not null default 0;

alter table payrolls
add column if not exists attendance_count int not null default 0;

alter table payrolls
add column if not exists izin_count int not null default 0;

alter table payrolls
add column if not exists cuti_count int not null default 0;

alter table payrolls
add column if not exists deduction_amount int not null default 0;

alter table payrolls
add column if not exists salary_rate int not null default 0;

update profiles
set divisi = 'NON DIVISI'
where upper(coalesce(divisi, '')) in ('CASIS', 'NON DEVISI');
