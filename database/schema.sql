PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS guild_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(guild_id, setting_key)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT UNIQUE NOT NULL,
  discord_username TEXT,
  avatar_url TEXT,
  display_name TEXT,
  badge_number TEXT,
  jabatan_id INTEGER,
  division_id INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jabatan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  group_name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS divisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  guild_id TEXT,
  discord_id TEXT,
  nama TEXT,
  jabatan TEXT,
  divisi TEXT,
  type TEXT NOT NULL,
  note TEXT,
  evidence_url TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  discord_message_id TEXT,
  discord_thread_id TEXT,
  approved_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  guild_id TEXT,
  type TEXT NOT NULL,
  payload TEXT,
  evidence_url TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  approved_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS disciplinary_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_user_id INTEGER,
  target_name TEXT,
  issued_by TEXT,
  sp_level INTEGER NOT NULL,
  reason TEXT NOT NULL,
  evidence_url TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payrolls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  period TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  approved_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  actor_discord_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO divisions (code, name) VALUES
('CASIS','CASIS'),
('SABHARA','SABHARA'),
('SATBRIMOB','SATBRIMOB'),
('SATLANTAS','SATLANTAS'),
('POLAIRUD','POLAIRUD'),
('BARESKRIM','BARESKRIM'),
('SETUM','SETUM'),
('BIDPROPAM','BIDPROPAM');

INSERT OR IGNORE INTO jabatan (code, name, group_name, level) VALUES
('CASIS','CASIS','CASIS',1),
('BHARADA','Bhayangkara Dua','TAMTAMA',2),
('BHARATU','Bhayangkara Satu','TAMTAMA',3),
('BHARAKA','Bhayangkara Kepala','TAMTAMA',4),
('BRIPDA','Brigadir Dua','BINTARA',5),
('BRIPTU','Brigadir Satu','BINTARA',6),
('BRIGPOL','Brigadir Polisi','BINTARA',7),
('BRIPKA','Brigadir Kepala','BINTARA',8),
('AIPDA','Ajun Inspektur Polisi Dua','BINTARA',9),
('AIPTU','Ajun Inspektur Polisi Satu','BINTARA',10),
('IPDA','Inspektur Polisi Dua','PAMA',11),
('IPTU','Inspektur Polisi Satu','PAMA',12),
('AKP','Ajun Komisaris Polisi','PAMA',13),
('KOMPOL','Komisaris Polisi','PAMEN',14),
('AKBP','Ajun Komisaris Besar Polisi','PAMEN',15),
('KOMBES','Komisaris Besar Polisi','PAMEN',16),
('BRIGJEN','Brigadir Jenderal Polisi','PATI',17),
('IRJEN','Inspektur Jenderal Polisi','PATI',18),
('KOMJEN','Komisaris Jenderal Polisi','PATI',19),
('JENDERAL','Jenderal Polisi','PATI',20),
('SUPER_ADMIN','Super Admin','SUPER ADMIN',99);
