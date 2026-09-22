const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const db = require("./db");
const { getSeats, holdSeats, verifyHold, releaseExpiredHolds } = require("./reservationService");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function ok(res, data, message="Success") {
  res.json({ success: true, data, message });
}

function fail(res, status, message, errorCode) {
  res.status(status).json({ success: false, data: null, message, errorCode });
}

app.get("/api/health", (_, res) => ok(res, { status: "ok" }));

app.get("/api/shows", (_, res) => {
  ok(res, db.prepare("SELECT * FROM shows ORDER BY show_date, show_time").all());
});

app.get("/api/shows/:showId/seats", (req, res) => {
  try {
    const show = db.prepare("SELECT * FROM shows WHERE id=?").get(req.params.showId);
    if (!show) return fail(res, 404, "Show not found", "SHOW_NOT_FOUND");
    ok(res, getSeats(req.params.showId));
  } catch (e) {
    fail(res, 500, e.message, "SERVER_ERROR");
  }
});

app.post("/api/shows/:showId/hold-seats", (req, res) => {
  const { userId, seatIds } = req.body;
  try {
    const result = holdSeats({ showId: req.params.showId, userId: userId || "demo-user", seatIds });
    ok(res, result, "Seats reserved for 10 minutes");
  } catch (e) {
    fail(res, e.code === "SEAT_UNAVAILABLE" ? 409 : 400, e.message, e.code || "HOLD_FAILED");
  }
});

app.post("/api/payments/mock", (req, res) => {
  const { showId, userId="demo-user", seatIds, paymentResult="SUCCESS", idempotencyKey } = req.body;
  if (!idempotencyKey) return fail(res, 400, "idempotencyKey is required", "IDEMPOTENCY_REQUIRED");

  const existing = db.prepare(`
    SELECT b.*, p.id AS payment_id, p.status AS payment_status
    FROM bookings b LEFT JOIN payments p ON p.booking_id=b.id
    WHERE b.idempotency_key=?
  `).get(idempotencyKey);

  if (existing) return ok(res, existing, "Existing idempotent result returned");

  try {
    const amountRows = db.prepare(`
      SELECT price FROM seats WHERE id IN (${seatIds.map(() => "?").join(",")})
    `).all(...seatIds);
    const amount = amountRows.reduce((sum, x) => sum + x.price, 0) + 60;

    const transaction = db.transaction(() => {
      verifyHold({ showId, userId, seatIds });

      const bookingId = "BK-" + crypto.randomUUID().slice(0, 8).toUpperCase();
      const paymentId = "PAY-" + crypto.randomUUID().slice(0, 8).toUpperCase();
      const now = new Date().toISOString();

      const bookingStatus = paymentResult === "SUCCESS" ? "CONFIRMED"
        : paymentResult === "CANCELLED" ? "CANCELLED" : "PAYMENT_FAILED";

      const paymentStatus = paymentResult === "SUCCESS" ? "SUCCESS"
        : paymentResult === "CANCELLED" ? "CANCELLED" : "FAILED";

      db.prepare(`
        INSERT INTO bookings(id,show_id,user_id,status,amount,idempotency_key,created_at)
        VALUES(?,?,?,?,?,?,?)
      `).run(bookingId, showId, userId, bookingStatus, amount, idempotencyKey, now);

      const insertSeat = db.prepare(`
        INSERT INTO booking_seats(booking_id,show_id,seat_id) VALUES(?,?,?)
      `);
      for (const seatId of seatIds) insertSeat.run(bookingId, showId, seatId);

      db.prepare(`
        INSERT INTO payments(id,booking_id,status,amount,created_at)
        VALUES(?,?,?,?,?)
      `).run(paymentId, bookingId, paymentStatus, amount, now);

      db.prepare(`
        UPDATE seat_holds
        SET status=?
        WHERE show_id=? AND user_id=? AND status='HELD'
          AND seat_id IN (${seatIds.map(() => "?").join(",")})
      `).run(paymentResult === "SUCCESS" ? "RELEASED" : "RELEASED", showId, userId, ...seatIds);

      return { bookingId, paymentId, bookingStatus, paymentStatus, amount };
    });

    ok(res, transaction(), "Mock payment processed");
  } catch (e) {
    const status = e.code === "HOLD_EXPIRED" ? 409 : 400;
    fail(res, status, e.message, e.code || "PAYMENT_FAILED");
  }
});

app.get("/api/bookings/:id", (req, res) => {
  const booking = db.prepare(`
    SELECT b.*, p.id AS payment_id, p.status AS payment_status,
           s.title, s.venue, s.screen, s.city, s.show_date, s.show_time
    FROM bookings b
    JOIN shows s ON s.id=b.show_id
    LEFT JOIN payments p ON p.booking_id=b.id
    WHERE b.id=?
  `).get(req.params.id);

  if (!booking) return fail(res, 404, "Booking not found", "BOOKING_NOT_FOUND");

  const seats = db.prepare(`
    SELECT seat_id FROM booking_seats WHERE booking_id=?
  `).all(req.params.id).map(x => x.seat_id);

  ok(res, { ...booking, seats });
});

app.get("/api/bookings", (req, res) => {
  const userId = req.query.userId || "demo-user";
  ok(res, db.prepare(`
    SELECT b.*, s.title, s.venue, s.show_date, s.show_time
    FROM bookings b JOIN shows s ON s.id=b.show_id
    WHERE b.user_id=? ORDER BY b.created_at DESC
  `).all(userId));
});

app.get("*", (_, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

if (require.main === module) {
  const port = Number(process.env.PORT || 4000);
  app.listen(port, () => console.log(`SeatLock running at http://localhost:${port}`));
}

module.exports = app;
