const Database = require("better-sqlite3");
const path = require("path");

const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "booking.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS shows (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  venue TEXT NOT NULL,
  screen TEXT NOT NULL,
  city TEXT NOT NULL,
  show_date TEXT NOT NULL,
  show_time TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seats (
  id TEXT PRIMARY KEY,
  row_name TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  seat_type TEXT NOT NULL,
  price INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS seat_holds (
  id TEXT PRIMARY KEY,
  show_id TEXT NOT NULL,
  seat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('HELD','RELEASED','EXPIRED')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(show_id, seat_id, status),
  FOREIGN KEY(show_id) REFERENCES shows(id),
  FOREIGN KEY(seat_id) REFERENCES seats(id)
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  show_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING','PAYMENT_PROCESSING','CONFIRMED','PAYMENT_FAILED','CANCELLED','EXPIRED')),
  amount INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY(show_id) REFERENCES shows(id)
);

CREATE TABLE IF NOT EXISTS booking_seats (
  booking_id TEXT NOT NULL,
  show_id TEXT NOT NULL,
  seat_id TEXT NOT NULL,
  PRIMARY KEY(show_id, seat_id),
  FOREIGN KEY(booking_id) REFERENCES bookings(id),
  FOREIGN KEY(show_id) REFERENCES shows(id),
  FOREIGN KEY(seat_id) REFERENCES seats(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('INITIATED','PROCESSING','SUCCESS','FAILED','CANCELLED')),
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(booking_id) REFERENCES bookings(id)
);
`);

function seed() {
  const showCount = db.prepare("SELECT COUNT(*) AS count FROM shows").get().count;
  if (showCount > 0) return;

  const insertShow = db.prepare(`
    INSERT INTO shows(id,title,venue,screen,city,show_date,show_time)
    VALUES(?,?,?,?,?,?,?)
  `);

  insertShow.run("show-1", "Avengers: Secret Wars", "PVR City Mall", "Screen 2", "Jaipur", "2026-09-25", "19:30");
  insertShow.run("show-2", "Avengers: Secret Wars", "PVR City Mall", "Screen 2", "Jaipur", "2026-09-25", "22:15");

  const insertSeat = db.prepare(`
    INSERT INTO seats(id,row_name,seat_number,seat_type,price)
    VALUES(?,?,?,?,?)
  `);

  const rows = ["A","B","C","D","E","F"];
  for (const row of rows) {
    for (let n = 1; n <= 8; n++) {
      const premium = row === "A" || row === "B";
      insertSeat.run(`${row}${n}`, row, n, premium ? "PREMIUM" : "REGULAR", premium ? 350 : 250);
    }
  }
}

seed();

module.exports = db;
