# API

## GET /api/shows

Returns available demo shows.

## GET /api/shows/:showId/seats

Returns seat map and server-calculated seat status.

## POST /api/shows/:showId/hold-seats

Request:

```json
{
  "userId": "demo-user",
  "seatIds": ["A1", "A2"]
}
```

Returns a 10-minute expiration timestamp.

## POST /api/payments/mock

Request:

```json
{
  "showId": "show-1",
  "userId": "demo-user",
  "seatIds": ["A1"],
  "paymentResult": "SUCCESS",
  "idempotencyKey": "unique-request-key"
}
```

`paymentResult` can be `SUCCESS`, `FAILED`, or `CANCELLED`.

## GET /api/bookings/:id

Returns booking and payment information.

## GET /api/bookings?userId=demo-user

Returns booking history for a user.
