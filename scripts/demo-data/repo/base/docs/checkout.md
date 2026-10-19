# Checkout

Checkout turns a cart into an order in one request to `POST /api/checkout`.

1. The cart is loaded with its lines and current prices.
2. Totals are computed: subtotal, sales tax (8.25%) and total.
3. The order is inserted. The unique index on `orders.cart_id` makes a second submit of the same cart fail with 409 instead of creating a second order.

## Errors

| Status | When |
| --- | --- |
| 400 | The request body is invalid |
| 409 | The cart is empty or was already checked out |

## Testing locally

Seed a cart with `pnpm db:seed`, open `/cart` and place an order. Orders appear under `/orders`.
