// ─────────────────────────────────────────────────────────────
//  MARTYRSTUDIOS — PRODUCT CATALOG (single source of truth)
//  The checkout function reads prices from HERE, never from the
//  browser, so nobody can change a price in devtools and pay less.
//  Prices are in cents (4500 = €45.00).
// ─────────────────────────────────────────────────────────────

export const CURRENCY = "eur";

export const SHIPPING = {
  label: "Tracked shipping",
  amount: 800,          // €8.00
  freeOver: 15000,      // free shipping over €150 (set to null to disable)
  // ISO country codes you ship to
  countries: ["GR", "CY", "DE", "FR", "IT", "ES", "NL", "BE", "AT", "PT", "IE", "DK", "SE", "FI", "PL", "CZ", "GB", "US", "CA"],
};

export const PRODUCTS = [
  {
    id: "hallway-tee",
    name: "HALLWAY TEE",
    price: 4500,
    desc: "Heavy 260gsm cotton. Boxy fit. The print reads correctly only in a mirror.",
    sizes: { S: true, M: true, L: true, XL: false }, // false = sold out
    image: "/img/hallway-tee.jpg",
  },
  {
    id: "static-hoodie",
    name: "STATIC HOODIE",
    price: 9500,
    desc: "Brushed fleece, dropped shoulder. Embroidered at the nape: 'you were here before'.",
    sizes: { S: true, M: true, L: true, XL: true },
    image: "/img/static-hoodie.jpg",
  },
  {
    id: "curtain-trousers",
    name: "CURTAIN TROUSERS",
    price: 11000,
    desc: "Wide-leg wool blend in deep curtain red. Pleated. Heavier than they look.",
    sizes: { S: true, M: true, L: false, XL: false },
    image: "/img/curtain-trousers.jpg",
  },
  {
    id: "owl-cap",
    name: "NIGHT CAP",
    price: 3800,
    desc: "Washed cotton six-panel. One size. Do not wear it after midnight.",
    sizes: { OS: true },
    image: "/img/night-cap.jpg",
  },
];
