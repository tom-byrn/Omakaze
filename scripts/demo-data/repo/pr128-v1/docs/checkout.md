# Checkout

Checkout turns a cart into an order in one request to `POST /api/checkout`.

1. The cart is loaded with its lines and current prices.
2. A promo code, if one was sent, is checked and its discount is taken off the subtotal.
3. Totals are computed: subtotal, discount, sales tax (8.25% of the discounted subtotal) and total.
4. The order is inserted. The unique index on `orders.cart_id` makes a second submit of the same cart fail with 409 instead of creating a second order.

## Promo codes

Codes live in the `promo_codes` table and are matched without regard to case. A code is either a percentage (`kind = 'percent'`) or a fixed amount in cents (`kind = 'fixed'`), and can have a start date, an end date, a minimum subtotal and a redemption limit. `POST /api/promo/preview` checks a code without redeeming it.

## Errors

| Status | When |
| --- | --- |
| 400 | The request body is invalid |
| 409 | The cart is empty or was already checked out |
| 422 | The promo code can't be used; `code` says why |

## Testing locally

Seed a cart with `pnpm db:seed`, open `/cart` and place an order. Orders appear under `/orders`. The seed also creates the codes `WELCOME10` (10%) and `FREESHIP` (500 cents off orders over $50).
