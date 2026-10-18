# Hearth

Hearth helps people rent or buy a home in **Port Ellis**, a (fictional) harbor city of eight
neighborhoods — Harborview, Old Mill, Kestrel Park, Ferry Point, Larch Hill, Saltmarsh, the Canal
District and Northgate.

- **Search** rentals or homes for sale (the Rent / Buy toggle) by keyword, neighborhood, price,
  bedrooms, bathrooms and pet policy or sale status, with results on a map of the city.
- **Listing pages** with a photo gallery, key facts, amenities, a location map and a way to reach the
  listing agent.
- **Buying**: homes for sale show an estimated monthly payment, an interactive mortgage calculator,
  the price history, neighborhood market stats and a tour scheduler. Buyers can **make an offer** in
  a few steps (price, financing, contingencies, review) and follow it on **My offers**, where they
  can withdraw it or see the sellers' counter.
- **Affordability**: how much home a buyer can afford under debt-to-income limits, with a link to
  the homes in that budget.
- **Saved**: heart listings and save searches (with an alert frequency). There are no accounts;
  everything belongs to an anonymous id stored in a cookie.

Every listing, person and place in the sample data is made up. Listing "photos" are flat SVG
illustrations generated from the listing id, and the map is a hand-drawn SVG of Port Ellis — the app
needs no image hosting or map tiles.

## Getting started

Requires Node.js 22.13+ (for the built-in `node:sqlite` module) and pnpm 10.

```sh
pnpm install
pnpm build      # type-checks and builds the client into client/dist
pnpm db:reset   # creates server/data/hearth.db, runs migrations and loads sample data
pnpm start      # API + built client on http://localhost:4100
```

For development, run `pnpm dev`: Vite serves the client on http://localhost:5173 with hot reload and
proxies `/api` to the API server on port 4100, which restarts on changes.

| Script            | What it does                                                   |
| ----------------- | -------------------------------------------------------------- |
| `pnpm dev`        | API server (watch mode) and Vite dev server side by side       |
| `pnpm build`      | Type-check and build the client                                |
| `pnpm start`      | Serve the API and the built client on port 4100 (`PORT=…`)    |
| `pnpm test`       | Run the Vitest suites for `shared/` and `server/`              |
| `pnpm typecheck`  | Type-check every package                                       |
| `pnpm db:migrate` | Apply pending migrations to the local database                 |
| `pnpm db:reset`   | Recreate the local database from migrations and seed data      |

The database lives at `server/data/hearth.db` by default; set `HEARTH_DB` to use another file.

### Demo data

The seed loads 40 rentals and 30 homes for sale (active, pending and recently sold, each with a price
history going back to earlier sales). It also gives the anonymous client id `demo-buyer` a few
offers in different states (countered, accepted, withdrawn, not accepted) and two saved searches.
To see them, set the `hearth_cid` cookie to `demo-buyer` (for example in your browser’s developer
tools), or send `X-Hearth-Client: demo-buyer` with API requests:

```sh
curl -H 'X-Hearth-Client: demo-buyer' http://localhost:4100/api/offers
```

## Project layout

```
client/   Vite + React 19 single-page app (React Router, plain CSS)
  src/components/illustrations/   procedural SVG listing photos
  src/map/                        Port Ellis map geometry, base map and interactive map view
server/   Express 5 API on node:sqlite
  db/migrations/                  numbered SQL migrations (NNN_name.sql)
  db/seed/                        neighborhoods and sample listings
  src/                            app, routes, repositories, query building
shared/   types and pure logic used by both sides
  src/mortgage.ts, src/affordability.ts   payment, amortization, PMI and affordability math
  src/offers.ts, src/tours.ts, ...        validation rules shared by the forms and the API
```

`shared/` is where anything that both sides must agree on lives: the listing filter model and its
URL encoding, formatting helpers, the mortgage math behind every payment estimate, and the
validation rules for inquiries, offers, tours and saved searches (used for inline form errors on
the client and enforced again by the API).

## API

All endpoints are under `/api` and speak JSON. Errors look like
`{ "error": { "message": "…", "fields": { "email": "Enter a valid email address" } } }`.

| Method & path                      | Description                                                      |
| ---------------------------------- | ---------------------------------------------------------------- |
| `GET /api/neighborhoods`           | Neighborhoods with listing counts and median rent                |
| `GET /api/listings`                | Search; see filters below. Returns a page of results plus map points for every match |
| `GET /api/listings/:id`            | Full listing                                                     |
| `POST /api/listings/:id/inquiries` | Contact the agent or request a tour (validated)                  |
| `GET /api/favorites`               | The current client's saved listings                              |
| `PUT /api/favorites/:listingId`    | Save a listing                                                   |
| `DELETE /api/favorites/:listingId` | Remove a saved listing                                           |
| `GET /api/listings/:id/price-history` | Price events for a home: earlier sales and the current listing |
| `GET /api/market/:neighborhood`    | Median list price, $/sqft, days on market and sale-to-list ratio, with citywide figures |
| `POST /api/listings/:id/offers`    | Make an offer (validated, one open offer per home per buyer)     |
| `GET /api/offers`                  | The current client's offers, with their homes                    |
| `PATCH /api/offers/:id`            | Withdraw an open offer (`{ "status": "withdrawn" }`)             |
| `GET /api/listings/:id/tours/availability` | A week of tour slots and whether each is free            |
| `POST /api/listings/:id/tours`     | Request an in-person or video tour                               |
| `GET /api/mortgage/rates`          | Today's rates by loan program and term                           |
| `POST /api/mortgage/estimate`      | Monthly payment for a price (or a `listingId`), with an optional yearly schedule |
| `GET/POST /api/saved-searches`, `DELETE /api/saved-searches/:id` | Saved searches with match counts |

Search parameters: `type` (`rent`, the default, or `sale`), `q` (every word must match the address,
description or neighborhood), `neighborhood` (slug), `minPrice`, `maxPrice` (rent or asking price),
`beds` and `baths` (minimums), `pets` (`cats` or `dogs`, rentals only), `status` (`active`,
`pending` or `sold`; homes for sale default to active and pending), `sort` (`newest`, `price_asc`,
`price_desc`, `size_desc`, plus `available` for rentals and `price_per_sqft` for sales) and `page`.
Invalid values are ignored rather than rejected, so a hand-edited URL still returns results.

Offers follow the shared rules in `shared/src/offers.ts`: 70–130% of the asking price, at least 3%
down for a conventional loan, 3.5% for FHA and 0% for VA (cash pays in full and can't have a
financing contingency), and a closing 14 (cash) or 21 (financed) to 120 days out.

The client id comes from the `hearth_cid` cookie (set on first request) or an `X-Hearth-Client`
header, which is handy with curl and in tests.

## Database

SQLite through Node's built-in `node:sqlite` driver — no native modules to compile. Migrations in
`server/db/migrations` are applied in order by a small runner (`server/db/migrate.ts`) that records
each version in `schema_migrations` and runs every migration in its own transaction. The server
applies pending migrations on start-up.

Tables: `neighborhoods`, `listings` (rentals and homes for sale: size, location, pet / laundry /
parking policies, amenities as JSON and the listing agent, plus rental terms or sale details),
`price_history`, `favorites`, `inquiries`, `offers`, `tours` and `saved_searches`.

Migration `002_buying` rebuilds `listings` (SQLite can't relax `NOT NULL` in place) with CHECK
constraints that require the right columns for each listing type. Because that means dropping a
table other tables reference, the migration runner switches foreign keys off around pending
migrations and runs `PRAGMA foreign_key_check` before committing each one.

Payment estimates assume 20% down on a 30-year fixed loan at today's rate (`server/src/rates.ts`),
the listing's property tax rate and HOA dues, and insurance at 0.35% of the price a year. PMI applies
to conventional loans below 20% down until the balance reaches 78% of the price; FHA loans carry
mortgage insurance, VA loans don't.

## Tests

`pnpm test` runs Vitest over `shared/test` and `server/test`: filter parsing and URL round-trips,
the mortgage and affordability math (pinned to known payment values), offer, tour, saved search and
inquiry validation, the SQL query builder, market statistics, the migration runner (including the
listings rebuild), and the HTTP API end to end via supertest against an in-memory database seeded
with the sample data.
