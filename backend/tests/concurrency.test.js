const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const dbFile = path.join(__dirname, "..", "test-booking.db");
try { fs.unlinkSync(dbFile); } catch {}
process.env.DB_PATH = dbFile;

const db = require("../src/db");
const { holdSeats } = require("../src/reservationService");

test("concurrent users cannot hold the same seat", async () => {
  const attempts = Array.from({length: 10}, (_, i) =>
    Promise.resolve().then(() =>
      holdSeats({
        showId: "show-1",
        userId: "user-" + i,
        seatIds: ["A1"]
      })
    ).then(() => ({ok:true})).catch(e => ({ok:false, code:e.code}))
  );

  const results = await Promise.all(attempts);
  const winners = results.filter(x => x.ok);

  assert.equal(winners.length, 1);
  assert.equal(results.filter(x => x.code === "SEAT_UNAVAILABLE").length, 9);
});

test("multiple seats are acquired atomically", () => {
  const first = holdSeats({showId:"show-2", userId:"atomic-user", seatIds:["A2","A3"]});
  assert.equal(first.seatIds.length, 2);

  assert.throws(
    () => holdSeats({showId:"show-2", userId:"other-user", seatIds:["A2","A4"]}),
    (e) => e.code === "SEAT_UNAVAILABLE"
  );

  const seatA4 = db.prepare(`
    SELECT status FROM seat_holds
    WHERE show_id='show-2' AND seat_id='A4' AND user_id='other-user'
  `).get();

  assert.equal(seatA4, undefined);
});
