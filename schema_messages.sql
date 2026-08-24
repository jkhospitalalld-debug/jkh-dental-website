CREATE TABLE IF NOT EXISTS case_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image TEXT NOT NULL,
  label TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  patient_type TEXT,
  service TEXT,
  pref_date TEXT,
  pref_time TEXT,
  message TEXT,
  status TEXT DEFAULT 'pending',
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS appointment_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS doctors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  designation TEXT,
  photo TEXT,
  bio TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  youtube_id TEXT NOT NULL,
  title TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  display_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS patient_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uhid TEXT NOT NULL,
  phone TEXT NOT NULL,
  patient_name TEXT,
  sender TEXT NOT NULL,
  message TEXT NOT NULL,
  read_by_admin INTEGER DEFAULT 0,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER
);
