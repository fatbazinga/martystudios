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

## 1. Products

Products are managed at **yoursite.com/admin/products.html**. There you can add or delete products, change names, prices and descriptions, set the stock for each size, upload and reorder photos, hide a product without deleting it, and change the order products appear in the shop.

Your 11 products from Instagram (idkhowtodraw_01–06 and mywife_06–10) are already loaded, with Instagram's 640px photos. **The stock is a placeholder: 5 per size, S to XL.** Set the real numbers before you launch. If you have better-quality photos on your computer, upload them in the editor.

How stock works:
- When someone goes to checkout, their items are held for 30 minutes so nobody else can buy them.
- If they pay, the items are sold. If they leave, or click back on the payment page, the items go back on sale.
- Stock can never go below zero, so two people can't both buy the last one.
- When you change stock in the editor, the site saves your change as "+2" or "−1" rather than a fixed number. That way a sale happening while you're editing isn't overwritten.

## 2. Add your background videos

1. Compress them first so the site loads fast. Aim for under 5 MB each, with no audio:
   ```
   ffmpeg -i input.mov -an -vf "scale=-2:720" -c:v libx264 -crf 28 -preset veryfast -movflags +faststart public/videos/01.mp4
   ```
2. List them at the top of `public/app.js` in the `VIDEOS = [...]` list.

The videos play muted, in random order. They're turned grayscale and blended into the white background, with a small glitch whenever a new clip starts. They're switched off for visitors with "reduce motion" or data saver turned on.

> ⚠️ Use only footage you own or have a licence for. Clips from Twin Peaks or other shows on a store would be a copyright problem. Shoot your own in that mood instead.

## 3. Stripe (payments)

1. Create an account at https://dashboard.stripe.com and complete business verification.
2. **Settings → Payment methods**: make sure **Cards, Apple Pay and Google Pay** are on. Because Checkout is hosted by Stripe, you don't need any Apple domain verification.
3. **Developers → API keys**: copy the **secret key**. Use `sk_test_…` while testing and `sk_live_…` for launch.
4. Optional: in **Settings → Customer emails**, turn on "Successful payments" so customers get receipts.

Orders show up in **Payments** with the customer's address, the items and the sizes (look in `metadata.order`). Stripe's mobile app can notify you about each sale.

## 4. Deploy to Cloudflare Pages

You can do this through the website, with no command line:

1. Push this folder to a GitHub repo (it can be private).
2. In Cloudflare: **Workers & Pages → Create → Pages → Connect to Git** and pick the repo.
   - Build command: *(leave empty)*
   - Build output directory: `public`
3. **Settings → Variables and Secrets**: add `STRIPE_SECRET_KEY` as type **Secret**. Also set up the database (step 10).
4. **Custom domains**: add `martyrstudios.com` (or whatever your domain is).

Or with the command line:
```
npx wrangler pages deploy public --project-name martyrstudios
npx wrangler pages secret put STRIPE_SECRET_KEY --project-name martyrstudios
```

To run it locally: `npx wrangler pages dev public`, then put `STRIPE_SECRET_KEY=sk_test_...` in a `.dev.vars` file. **Never commit that file**, it's already in .gitignore.

Test payment card: `4242 4242 4242 4242`, any future date, any CVC.

## 5. Anti-DDoS / abuse settings (Cloudflare dashboard, on your domain)

- **Security → Bots**: turn on **Bot Fight Mode**.
- **Security → WAF → Rate limiting rules**: add one rule:
  *If URI Path equals `/api/checkout` → more than 10 requests per 1 minute from the same IP → Block for 10 minutes.*
- **SSL/TLS**: set the mode to **Full (strict)** and turn on **Always Use HTTPS**.
- If you're ever under attack: **Overview → Under Attack Mode** (one click).

## 6. Built-in security

- Prices and stock are checked against the database on the server, so a buyer can't edit a price in the browser.
- Sizes, quantities (1–10) and bag size (max 20 lines) are validated, and the request size is capped.
- Checkout only accepts requests from your own domain.
- A strict Content-Security-Policy means only your own scripts can run. There are no third-party scripts, fonts or trackers.
- The Stripe secret key lives in Cloudflare secrets, never in the browser or in git.
- Since there are no logins or passwords, there's no password database that could leak.

## 7. Orders dashboard: `yoursite.com/admin`

The dashboard shows every paid order with the customer's name, shipping address, phone, email, items and sizes. You can:
- copy an address
- enter the carrier and tracking number, then mark the order shipped
- email the customer a shipping update in one click
- export a CSV for the courier

Shipped status is saved on the payment inside Stripe, so there's still no database.

**Login (Cloudflare Access, free).** Nobody can see `/admin` except the emails you allow. You sign in with a one-time code sent to your email, and there's no password to leak.
1. In Cloudflare, open **Zero Trust**. The first time, pick a team name; the free plan is fine.
2. **Access → Applications → Add → Self-hosted.**
   - Name: `martyrstudios admin`
   - Add two destinations on your domain: path `admin` and path `api/admin`
   - Policy: **Allow**, Include → **Emails** → your email address
   - Login method: **One-time PIN**
3. After saving, open the application and copy its **Application Audience (AUD) Tag**.
4. In your Pages project, go to **Settings → Variables and Secrets** and add:
   - `ACCESS_TEAM_DOMAIN` = `yourteam.cloudflareaccess.com`
   - `ACCESS_AUD` = the AUD tag you copied
   - `ADMIN_EMAILS` = `you@gmail.com` (separate several emails with commas)

The server checks the login itself on every request, so the dashboard stays locked even if something above is misconfigured: it shows "not configured" instead of opening up.

## 8. Font

The sigil's lettering is a worn letterpress serif. The closest free match is **IM Fell English SC**:
https://fonts.google.com/specimen/IM+Fell+English+SC (free for commercial use).
Download it and put `IMFellEnglishSC-Regular.ttf` in `public/fonts/`. Until you do, the site falls back to Baskerville or Times. An "ink bleed" filter roughens the big headings either way, so they look printed like the sigil.

## 9. Blood cursor

The settings are at the top of `public/cursor.js`. You can swap the cursor PNG, add your own blood-splat PNGs (`SPLAT_SPRITES`), change the colours, and set the intensity. It's switched off for visitors with "reduce motion" turned on. On phones, a tap makes a splash.

## 10. Database (Cloudflare D1, free)

Products and stock are kept in a small database. To set it up from the Cloudflare website:
1. Go to **Storage & Databases → D1 → Create database**, name it `martyrstudios`, and create it.
2. Open the database, go to **Console**, and paste and run the whole of `migrations/0001_init.sql`. Then do the same with `migrations/0002_seed_instagram.sql` (your Instagram products).
3. In your **Pages project → Settings → Bindings → Add → D1 database**, set the variable name to `DB` and pick `martyrstudios`. Redeploy.

Or with the command line:
```
npx wrangler d1 create martyrstudios        # paste the id it prints into wrangler.toml
npx wrangler d1 migrations apply martyrstudios --remote
```

## 11. Stripe webhook (keeps stock correct)

1. In Stripe, go to **Developers → Webhooks → Add endpoint**.
2. URL: `https://yourdomain.com/api/stripe-webhook`
3. Events: `checkout.session.completed` and `checkout.session.expired`
4. Copy the **signing secret** (`whsec_…`) into Cloudflare Pages as a Secret named `STRIPE_WEBHOOK_SECRET`.

Every webhook message is checked against this secret, so nobody can fake one.

## Before launch checklist
- [ ] Database created and bound as `DB` (step 10)
- [ ] Stripe webhook added (step 11)
- [ ] **Real stock numbers** set in /admin/products.html (currently a placeholder of 5 per size)
- [ ] Font file in `public/fonts/`
- [ ] Cloudflare Access set up for `/admin` (step 7). Visit `/admin` in a private window and check that it asks for a code
- [ ] Fill in the [brackets] in `public/info.html` (legal name, address, VAT/ΑΦΜ, email), and have an accountant check VAT. Selling to other EU countries above €10k/year means registering for **OSS** (One-Stop Shop). Stripe Tax can automate that.
- [ ] Switch the Stripe key from `sk_test_` to `sk_live_`
- [ ] Do a real €1 test order, then refund it
