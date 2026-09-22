# Concurrency & Seat Locking

## Problem

Two clients can send:

```text
POST /shows/show-1/hold-seats
seatIds: ["A1"]
```

at nearly the same time.

Frontend checks cannot guarantee correctness because both clients may observe the seat as available before either request is committed.

## Solution

The reservation service performs the operation inside a database transaction.

1. Expired holds are released logically.
2. Existing confirmed bookings are checked.
3. Active holds are checked.
4. Seat IDs are validated.
5. All requested holds are inserted inside one transaction.
6. If any requested seat conflicts, the transaction fails and no partial reservation is kept.

SQLite's serialized writer behavior protects the critical section in this demo. For a PostgreSQL production deployment, the same business rule should be implemented using a transaction plus row/advisory locking and/or a partial unique index.

## Important invariant

For every:

```text
showId + seatId
```

there can be at most one active hold or confirmed booking.

The backend, not the browser timer, is authoritative.

## Expiration

A hold stores `expires_at`.

A hold is considered active only when:

```text
status = HELD
AND expires_at > current server time
```

A cleanup process can mark old holds as expired, but correctness does not depend on the cleanup process running at the exact expiry second.
