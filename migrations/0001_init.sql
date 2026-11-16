-- martyrstudios: products, sizes/stock, images, checkout reservations

CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price       INTEGER NOT NULL CHECK (price >= 0),        -- cents
  active      INTEGER NOT NULL DEFAULT 1,                 -- 1 = visible in shop
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS variants (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size       TEXT NOT NULL,
  stock      INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),  -- can never go below zero
  sort       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, size)
);

CREATE TABLE IF NOT EXISTS images (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  mime       TEXT,
  data       BLOB,          -- uploaded through the admin
  url        TEXT,          -- or a static file in /public/img
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS images_by_product ON images (product_id, position);

-- stock held while a customer is on the Stripe payment page
CREATE TABLE IF NOT EXISTS reservations (
  session_id TEXT PRIMARY KEY,
  items      TEXT NOT NULL,                    -- JSON [{id,size,qty}]
  status     TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | released
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
