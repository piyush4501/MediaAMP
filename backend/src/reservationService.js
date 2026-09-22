const crypto = require("crypto");
const db = require("./db");

const HOLD_MINUTES = Number(process.env.HOLD_MINUTES || 10);

function nowIso() {
  return new Date().toISOString();
}

function expiryIso() {
  return new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();
}

function releaseExpiredHolds(showId) {
  const now = nowIso();
  db.prepare(`
    UPDATE seat_holds
    SET status='EXPIRED'
    WHERE show_id=?
      AND status='HELD'
      AND expires_at <= ?
  `).run(showId, now);
}

function getSeats(showId) {
  releaseExpiredHolds(showId);

  const seats = db.prepare(`
    SELECT s.id, s.row_name, s.seat_number, s.seat_type, s.price,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM booking_seats bs
          WHERE bs.show_id=s.show_id AND bs.seat_id=s.id
        ) THEN 'BOOKED'
        WHEN EXISTS (
          SELECT 1 FROM seat_holds h
          WHERE h.show_id=s.show_id AND h.seat_id=s.id
            AND h.status='HELD' AND h.expires_at > ?
        ) THEN 'HELD'
        ELSE 'AVAILABLE'
      END AS status
    FROM (
      SELECT seats.*, ? AS show_id FROM seats
    ) s
    ORDER BY s.row_name, s.seat_number
  `).all(nowIso(), showId);

  return seats;
}

function holdSeats({ showId, userId, seatIds }) {
  if (!Array.isArray(seatIds) || seatIds.length === 0) {
    throw new Error("At least one seat is required");
  }

  const uniqueSeatIds = [...new Set(seatIds)];

  // IMMEDIATE transaction serializes writers in SQLite.
  const transaction = db.transaction(() => {
    releaseExpiredHolds(showId);

    const placeholders = uniqueSeatIds.map(() => "?").join(",");
    const booked = db.prepare(`
      SELECT seat_id FROM booking_seats
      WHERE show_id=? AND seat_id IN (${placeholders})
    `).all(showId, ...uniqueSeatIds);

    if (booked.length) {
      throw Object.assign(new Error("One or more seats are already booked"), {
        code: "SEAT_UNAVAILABLE"
      });
    }

    const held = db.prepare(`
      SELECT seat_id FROM seat_holds
      WHERE show_id=? AND status='HELD'
        AND expires_at > ?
        AND seat_id IN (${placeholders})
    `).all(showId, nowIso(), ...uniqueSeatIds);

    if (held.length) {
      throw Object.assign(new Error("One or more seats are currently reserved"), {
        code: "SEAT_UNAVAILABLE",
        seats: held.map(x => x.seat_id)
      });
    }

    const valid = db.prepare(`
      SELECT id FROM seats WHERE id IN (${placeholders})
    `).all(...uniqueSeatIds).map(x => x.id);

    if (valid.length !== uniqueSeatIds.length) {
      throw Object.assign(new Error("Invalid seat selected"), {
        code: "INVALID_SEAT"
      });
    }

    const holdId = crypto.randomUUID();
    const createdAt = nowIso();
    const expiresAt = expiryIso();

    const insert = db.prepare(`
      INSERT INTO seat_holds(id,show_id,seat_id,user_id,status,expires_at,created_at)
      VALUES(?,?,?,?,?,?,?)
    `);

    for (const seatId of uniqueSeatIds) {
      try {
        insert.run(holdId + ":" + seatId, showId, seatId, userId, "HELD", expiresAt, createdAt);
      } catch (error) {
        throw Object.assign(new Error("Seat became unavailable during reservation"), {
          code: "SEAT_UNAVAILABLE"
        });
      }
    }

    return { holdId, showId, userId, seatIds: uniqueSeatIds, expiresAt };
  });

  return transaction();
}

function verifyHold({ showId, userId, seatIds }) {
  const now = nowIso();
  releaseExpiredHolds(showId);

  const placeholders = seatIds.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT seat_id, expires_at FROM seat_holds
    WHERE show_id=? AND user_id=? AND status='HELD'
      AND expires_at > ?
      AND seat_id IN (${placeholders})
  `).all(showId, userId, now, ...seatIds);

  if (rows.length !== seatIds.length) {
    throw Object.assign(new Error("Seat hold has expired or is no longer valid"), {
      code: "HOLD_EXPIRED"
    });
  }

  return rows[0].expires_at;
}

module.exports = {
  getSeats,
  holdSeats,
  verifyHold,
  releaseExpiredHolds
};
