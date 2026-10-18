# Hearth

Hearth helps people find a place to rent in **Port Ellis**, a (fictional) harbor city of eight
neighborhoods — Harborview, Old Mill, Kestrel Park, Ferry Point, Larch Hill, Saltmarsh, the Canal
District and Northgate.

- **Search** rentals by keyword, neighborhood, rent, bedrooms, bathrooms and pet policy, with results
  on a map of the city.
- **Listing pages** with a photo gallery, key facts, amenities, a location map and a contact / tour
  request form that goes to the listing agent.
- **Saved homes**: heart any listing to keep it on the Saved page. There are no accounts; favorites
  belong to an anonymous id stored in a cookie.

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

## Project layout

```
client/   Vite + React 19 single-page app (React Router, plain CSS)
  src/components/illustrations/   procedural SVG listing photos
  src/map/                        Port Ellis map geometry, base map and interactive map view
server/   Express 5 API on node:sqlite
  db/migrations/                  numbered SQL migrations (NNN_name.sql)
  db/seed/                        neighborhoods and sample listings
  src/                            app, routes, repositories, query building
shared/   types and pure logic used by both sides (filters, formatting, validation)
```

`shared/` is where anything that both sides must agree on lives: the listing filter model and its
URL encoding, formatting helpers, and inquiry validation (used for inline form errors on the client
and enforced again by the API).

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

Search parameters: `q` (every word must match the address, description or neighborhood),
`neighborhood` (slug), `minPrice`, `maxPrice`, `beds` and `baths` (minimums), `pets` (`cats` or
`dogs`), `sort` (`newest`, `price_asc`, `price_desc`, `size_desc`, `available`) and `page`. Invalid
values are ignored rather than rejected, so a hand-edited URL still returns results.

The client id comes from the `hearth_cid` cookie (set on first request) or an `X-Hearth-Client`
header, which is handy with curl and in tests.

## Database

SQLite through Node's built-in `node:sqlite` driver — no native modules to compile. Migrations in
`server/db/migrations` are applied in order by a small runner (`server/db/migrate.ts`) that records
each version in `schema_migrations` and runs every migration in its own transaction. The server
applies pending migrations on start-up.

Tables: `neighborhoods`, `listings` (rent, deposit, size, location, availability, pet / laundry /
parking policies, amenities as JSON and the listing agent), `favorites` and `inquiries`.

## Tests

`pnpm test` runs Vitest over `shared/test` and `server/test`: filter parsing and URL round-trips,
inquiry validation, the SQL query builder, the migration runner, and the HTTP API end to end via
supertest against an in-memory database seeded with the sample data.
