# SeatLock — Movie & Event Booking Platform

A GitHub-ready full-stack booking application inspired by modern movie/event ticketing platforms.

## Core technical challenge

The application implements **10-minute server-authoritative seat holds** and protects against concurrent booking attempts.

For a given `showId + seatId`, only one active hold/confirmed booking can exist.

### Flow

```text
AVAILABLE
   ↓
HELD (10 minutes)
   ↓
PAYMENT_PROCESSING
   ↓
CONFIRMED / BOOKED
```

Failed/cancelled/expired holds return to `AVAILABLE`.

## Demo

This repository contains a self-contained Node.js/Express + SQLite implementation that can be run locally without external services.

## Run

```bash
cd backend
npm install
npm start
```

Open:

`http://localhost:4000`

## Test concurrency

```bash
cd backend
npm test
```

The test suite includes a concurrent seat-hold test where multiple requests target the same seat. The database transaction + unique constraint ensures only one request wins.

## Project structure

```text
booking-platform/
├── backend/
│   ├── src/
│   │   ├── db.js
│   │   ├── server.js
│   │   ├── reservationService.js
│   │   └── public/
│   │       └── index.html
│   ├── tests/
│   │   └── concurrency.test.js
│   ├── package.json
│   └── .env.example
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CONCURRENCY.md
│   └── API.md
├── .gitignore
└── README.md
```

## Important implementation decisions

- The backend is authoritative for seat availability, price, hold expiry and booking state.
- A hold expires after 10 minutes.
- Expiration is checked by the backend, so correctness does not depend on a browser timer or cleanup job.
- Seat holds are scoped to a show, so booking A1 for one show does not affect A1 for another show.
- Multiple requested seats are acquired atomically.
- Duplicate payment/confirmation requests use idempotency keys.
- The mock payment system supports success, failure and cancellation.
- SQLite is used for a simple zero-setup demonstration. PostgreSQL can replace it for production deployment.

## GitHub submission checklist

- [x] Source code
- [x] Seat locking logic
- [x] Concurrency test
- [x] Mock payment
- [x] Booking flow
- [x] Documentation
- [x] `.env.example`
- [x] No secrets committed
