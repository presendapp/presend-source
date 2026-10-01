-- Waitlist for the "Presend for teams" demand test (opened 2026-10).
-- No IP address, no User-Agent. Deleted by 2026-12-01 if the offer is not built.
CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  email TEXT NOT NULL UNIQUE,
  team_size TEXT NOT NULL,
  ecosystem TEXT NOT NULL,
  would_pay TEXT NOT NULL,
  note TEXT
);
