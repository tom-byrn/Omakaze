-- Rentals: neighborhoods, listings, favorites and inquiries.

CREATE TABLE neighborhoods (
  id          INTEGER PRIMARY KEY,
  slug        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  tagline     TEXT    NOT NULL,
  description TEXT    NOT NULL,
  center_lat  REAL    NOT NULL,
  center_lng  REAL    NOT NULL
);

CREATE TABLE listings (
  id                INTEGER PRIMARY KEY,
  neighborhood_id   INTEGER NOT NULL REFERENCES neighborhoods (id),
  property_type     TEXT    NOT NULL
                    CHECK (property_type IN ('apartment', 'condo', 'townhouse', 'house', 'loft')),
  address           TEXT    NOT NULL,
  unit              TEXT,
  rent              INTEGER NOT NULL CHECK (rent > 0),
  deposit           INTEGER NOT NULL CHECK (deposit >= 0),
  beds              INTEGER NOT NULL CHECK (beds >= 0),
  baths             REAL    NOT NULL CHECK (baths > 0),
  sqft              INTEGER NOT NULL CHECK (sqft > 0),
  lat               REAL    NOT NULL,
  lng               REAL    NOT NULL,
  available_on      TEXT    NOT NULL,
  lease_term_months INTEGER NOT NULL DEFAULT 12 CHECK (lease_term_months > 0),
  pets              TEXT    NOT NULL CHECK (pets IN ('none', 'cats', 'dogs', 'cats_dogs')),
  laundry           TEXT    NOT NULL CHECK (laundry IN ('in_unit', 'shared', 'none')),
  parking           TEXT    NOT NULL CHECK (parking IN ('garage', 'off_street', 'street', 'none')),
  description       TEXT    NOT NULL,
  amenities         TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(amenities)),
  agent_name        TEXT    NOT NULL,
  agent_company     TEXT    NOT NULL,
  agent_phone       TEXT    NOT NULL,
  listed_at         TEXT    NOT NULL,
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_listings_neighborhood ON listings (neighborhood_id);
CREATE INDEX idx_listings_rent ON listings (rent);
CREATE INDEX idx_listings_listed_at ON listings (listed_at);

-- Favorites belong to an anonymous client id (cookie), not to an account.
CREATE TABLE favorites (
  client_id  TEXT    NOT NULL,
  listing_id INTEGER NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (client_id, listing_id)
);

CREATE TABLE inquiries (
  id           INTEGER PRIMARY KEY,
  listing_id   INTEGER NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  client_id    TEXT    NOT NULL,
  kind         TEXT    NOT NULL CHECK (kind IN ('question', 'tour')),
  name         TEXT    NOT NULL,
  email        TEXT    NOT NULL,
  phone        TEXT,
  message      TEXT    NOT NULL,
  move_in_date TEXT,
  tour_date    TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (kind = 'question' OR tour_date IS NOT NULL)
);

CREATE INDEX idx_inquiries_listing ON inquiries (listing_id);
