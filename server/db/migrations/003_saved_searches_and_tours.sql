-- Saved searches (with alert emails) and tour requests.

CREATE TABLE saved_searches (
  id              INTEGER PRIMARY KEY,
  client_id       TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  -- Normalized listing filters, minus the page.
  criteria        TEXT    NOT NULL CHECK (json_valid(criteria)),
  alert_frequency TEXT    NOT NULL DEFAULT 'daily'
                  CHECK (alert_frequency IN ('instant', 'daily', 'weekly', 'off')),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_saved_searches_client ON saved_searches (client_id, created_at);

CREATE TABLE tours (
  id         INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  client_id  TEXT    NOT NULL,
  tour_type  TEXT    NOT NULL CHECK (tour_type IN ('in_person', 'video')),
  tour_date  TEXT    NOT NULL,
  time_slot  TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  email      TEXT    NOT NULL,
  phone      TEXT,
  status     TEXT    NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'cancelled')),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- The listing agent can only show a home to one party per slot.
CREATE UNIQUE INDEX idx_tours_slot ON tours (listing_id, tour_date, time_slot) WHERE status <> 'cancelled';
