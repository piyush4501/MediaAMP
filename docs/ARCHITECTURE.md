# Architecture

```text
Browser
   |
   | HTTP/JSON
   v
Express API
   |
   +--> Reservation Service
   |       |
   |       +--> transaction
   |       +--> hold expiry validation
   |       +--> concurrency checks
   |
   +--> Booking/Payment Service
   |
   v
SQLite Database
```

## Core entities

- shows
- seats
- seat_holds
- bookings
- booking_seats
- payments

## State flow

```text
Seat:
AVAILABLE -> HELD -> BOOKED
              |
              +-> EXPIRED/RELEASED -> AVAILABLE

Payment:
INITIATED -> PROCESSING -> SUCCESS
                       -> FAILED
                       -> CANCELLED
```
