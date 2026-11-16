# martyrstudios: website

A minimal white storefront with weird looping background video. No accounts, no database, no tracking.

- **Payments:** Stripe Checkout (Apple Pay, Google Pay, cards, 3-D Secure, receipts). Card numbers never touch your code.
- **Hosting and anti-DDoS:** Cloudflare Pages. It's free, every request goes through Cloudflare's network, and DDoS protection is always on.
- **Customer data:** Stripe collects it at checkout and keeps it in your Stripe dashboard. The site itself stores nothing.

```
public/            ← the website (HTML/CSS/JS, videos, images)
  videos/          ← put your background videos here
  img/             ← product photos
  _headers         ← security headers (CSP, HSTS, etc.)
functions/api/     ← two tiny serverless functions
  products.js      ← serves the catalog
  checkout.js      ← creates the Stripe payment page (prices checked server-side)
  admin/           ← your orders dashboard (yoursite.com/admin)
  fonts/           ← put the IM Fell English SC font here
  cursor.js        ← the blood cursor (settings at the top)
  admin/products.html ← product manager: add/edit/remove products, stock, photos
functions/api/admin/ ← orders, products, photos (all login-protected)
functions/api/stripe-webhook.js ← keeps stock correct after payments
migrations/        ← database setup + your products imported from Instagram
shared/config.js   ← shipping price, countries, currency
shared/access.js   ← checks the admin login on every request
```

---

