// Shop-wide settings. Products, prices and stock are managed in /admin/products.html
export const CURRENCY = "eur";

export const SHIPPING = {
  label: "Tracked shipping",
  amount: 800,          // €8.00
  freeOver: 15000,      // free shipping over €150 (null = never free)
  countries: ["GR", "CY", "DE", "FR", "IT", "ES", "NL", "BE", "AT", "PT", "IE", "DK", "SE", "FI", "PL", "CZ", "GB", "US", "CA"],
};

export const LOW_STOCK = 3;        // show "only N left" at or below this
export const HOLD_MINUTES = 30;    // how long stock is held while someone is paying (Stripe minimum: 30)
