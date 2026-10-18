-- Home buying: a listing is now either for rent or for sale.
--
-- SQLite can't relax NOT NULL constraints in place, so `listings` is rebuilt
-- with the rent-only columns made nullable and a CHECK that requires the right
-- columns for each listing type. Existing rows keep their ids and become
-- rentals. The migration runner turns foreign keys off while this runs (and
-- verifies them before committing), so favorites and inquiries are untouched.

CREATE TABLE listings_next (
  id                INTEGER PRIMARY KEY,
  listing_type      TEXT    NOT NULL DEFAULT 'rent' CHECK (listing_type IN ('rent', 'sale')),
  neighborhood_id   INTEGER NOT NULL REFERENCES neighborhoods (id),
  property_type     TEXT    NOT NULL
                    CHECK (property_type IN ('apartment', 'condo', 'townhouse', 'house', 'loft')),
  address           TEXT    NOT NULL,
  unit              TEXT,
  beds              INTEGER NOT NULL CHECK (beds >= 0),
  baths             REAL    NOT NULL CHECK (baths > 0),
  sqft              INTEGER NOT NULL CHECK (sqft > 0),
  lat               REAL    NOT NULL,
  lng               REAL    NOT NULL,
  pets              TEXT    NOT NULL CHECK (pets IN ('none', 'cats', 'dogs', 'cats_dogs')),
  laundry           TEXT    NOT NULL CHECK (laundry IN ('in_unit', 'shared', 'none')),
  parking           TEXT    NOT NULL CHECK (parking IN ('garage', 'off_street', 'street', 'none')),
  description       TEXT    NOT NULL,
  amenities         TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(amenities)),
  agent_name        TEXT    NOT NULL,
  agent_company     TEXT    NOT NULL,
  agent_phone       TEXT    NOT NULL,
  listed_at         TEXT    NOT NULL,
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  -- Rental terms (listing_type = 'rent')
  rent              INTEGER CHECK (rent > 0),
  deposit           INTEGER CHECK (deposit >= 0),
  available_on      TEXT,
  lease_term_months INTEGER CHECK (lease_term_months > 0),

  -- Sale details (listing_type = 'sale')
  list_price        INTEGER CHECK (list_price > 0),
  sale_status       TEXT    CHECK (sale_status IN ('active', 'pending', 'sold')),
  hoa_monthly       INTEGER CHECK (hoa_monthly >= 0),
  property_tax_rate REAL    CHECK (property_tax_rate >= 0 AND property_tax_rate < 0.05),
  year_built        INTEGER CHECK (year_built BETWEEN 1800 AND 2100),
  lot_sqft          INTEGER CHECK (lot_sqft > 0),
  sold_price        INTEGER CHECK (sold_price > 0),
  sold_on           TEXT,

  CHECK (
    (listing_type = 'rent'
      AND rent IS NOT NULL AND deposit IS NOT NULL
      AND available_on IS NOT NULL AND lease_term_months IS NOT NULL
      AND list_price IS NULL AND sale_status IS NULL)
    OR
    (listing_type = 'sale'
      AND list_price IS NOT NULL AND sale_status IS NOT NULL
      AND hoa_monthly IS NOT NULL AND property_tax_rate IS NOT NULL
      AND rent IS NULL)
  ),
  -- Sold homes, and only sold homes, record the sale.
  CHECK (sale_status IS NULL OR (sale_status = 'sold') = (sold_price IS NOT NULL AND sold_on IS NOT NULL))
);

INSERT INTO listings_next (
  id, listing_type, neighborhood_id, property_type, address, unit, beds, baths, sqft, lat, lng,
  pets, laundry, parking, description, amenities, agent_name, agent_company, agent_phone,
  listed_at, created_at, rent, deposit, available_on, lease_term_months
)
SELECT
  id, 'rent', neighborhood_id, property_type, address, unit, beds, baths, sqft, lat, lng,
  pets, laundry, parking, description, amenities, agent_name, agent_company, agent_phone,
  listed_at, created_at, rent, deposit, available_on, lease_term_months
FROM listings;

DROP TABLE listings;
ALTER TABLE listings_next RENAME TO listings;

CREATE INDEX idx_listings_neighborhood ON listings (neighborhood_id);
CREATE INDEX idx_listings_type_listed_at ON listings (listing_type, listed_at);
CREATE INDEX idx_listings_rent ON listings (rent) WHERE listing_type = 'rent';
CREATE INDEX idx_listings_list_price ON listings (list_price) WHERE listing_type = 'sale';

-- Every price event for a home: earlier sales as well as the current listing.
CREATE TABLE price_history (
  id         INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  event_date TEXT    NOT NULL,
  event      TEXT    NOT NULL CHECK (event IN ('listed', 'price_change', 'pending', 'sold')),
  price      INTEGER NOT NULL CHECK (price > 0)
);

CREATE INDEX idx_price_history_listing ON price_history (listing_id, event_date);

CREATE TABLE offers (
  id                   INTEGER PRIMARY KEY,
  listing_id           INTEGER NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  client_id            TEXT    NOT NULL,
  buyer_name           TEXT    NOT NULL,
  buyer_email          TEXT    NOT NULL,
  amount               INTEGER NOT NULL CHECK (amount > 0),
  financing            TEXT    NOT NULL CHECK (financing IN ('cash', 'conventional', 'fha', 'va')),
  down_payment_percent REAL    NOT NULL CHECK (down_payment_percent BETWEEN 0 AND 100),
  contingencies        TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(contingencies)),
  closing_date         TEXT    NOT NULL,
  message              TEXT,
  status               TEXT    NOT NULL DEFAULT 'submitted'
                       CHECK (status IN ('submitted', 'countered', 'accepted', 'rejected', 'withdrawn')),
  counter_amount       INTEGER CHECK (counter_amount > 0),
  seller_note          TEXT,
  created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (status <> 'countered' OR counter_amount IS NOT NULL)
);

CREATE INDEX idx_offers_client ON offers (client_id, created_at);

-- A buyer can have only one open offer on a home at a time.
CREATE UNIQUE INDEX idx_offers_one_open
  ON offers (client_id, listing_id)
  WHERE status IN ('submitted', 'countered');
