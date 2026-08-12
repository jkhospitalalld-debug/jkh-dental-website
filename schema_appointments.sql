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
