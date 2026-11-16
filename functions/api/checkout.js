// Creates a Stripe Checkout Session and returns its URL.
// Stripe hosts the payment page → Apple Pay, Google Pay, cards, 3-D Secure, receipts.
// Stock is held (taken from the database) while the customer pays, and given
// back automatically if they don't (see stripe-webhook.js).

import { CURRENCY, SHIPPING, HOLD_MINUTES } from "../../shared/config.js";
import { takeStock, returnStock } from "../../shared/store.js";

const MAX_LINES = 20;
const MAX_QTY = 10;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_SECRET_KEY) return json({ error: "Checkout is not configured yet." }, 503);

  const origin = new URL(request.url).origin;
  const reqOrigin = request.headers.get("Origin");
  if (reqOrigin && reqOrigin !== origin) return json({ error: "Forbidden" }, 403);
  if (!(request.headers.get("Content-Type") || "").includes("application/json")) return json({ error: "Bad request" }, 415);
  if (Number(request.headers.get("Content-Length") || 0) > 4096) return json({ error: "Too large" }, 413);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const raw = Array.isArray(body?.items) ? body.items : null;
  if (!raw || raw.length === 0 || raw.length > MAX_LINES) return json({ error: "Your bag is empty." }, 400);

  // merge duplicate lines, basic validation
  const merged = new Map();
  for (const it of raw) {
    const id = String(it?.id ?? ""), size = String(it?.size ?? ""), qty = Number(it?.qty);
    if (!id || !size || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return json({ error: "Invalid item in bag." }, 400);
    const k = `${id}\u0000${size}`;
    merged.set(k, { id, size, qty: Math.min(MAX_QTY, (merged.get(k)?.qty || 0) + qty) });
  }
  const items = [...merged.values()];

  // load prices + stock from the database (never trust the browser)
  const ids = [...new Set(items.map((i) => i.id))];
  const marks = ids.map((_, i) => `?${i + 1}`).join(",");
  const { results: prods } = await env.DB.prepare(`SELECT id, name, price FROM products WHERE active = 1 AND id IN (${marks})`).bind(...ids).all();
  const { results: vars } = await env.DB.prepare(`SELECT product_id, size, stock FROM variants WHERE product_id IN (${marks})`).bind(...ids).all();
  const P = new Map(prods.map((p) => [p.id, p]));
  const V = new Map(vars.map((v) => [`${v.product_id}\u0000${v.size}`, v.stock]));

  let subtotal = 0;
  for (const it of items) {
    const p = P.get(it.id);
    if (!p) return json({ error: "Something in your bag is no longer available. Please remove it." }, 409);
    const stock = V.get(`${it.id}\u0000${it.size}`);
    if (stock == null) return json({ error: `Size ${it.size} doesn't exist for ${p.name}.` }, 400);
    if (stock < it.qty) return json({ error: stock === 0 ? `${p.name} in ${it.size} is sold out.` : `Only ${stock} left of ${p.name} in ${it.size}.` }, 409);
    it.name = p.name; it.price = p.price;
    subtotal += p.price * it.qty;
  }

  // hold the stock (all-or-nothing; the database refuses to go below zero)
  try {
    await takeStock(env.DB, items);
  } catch {
    return json({ error: "Someone just bought the last one. Please check your bag." }, 409);
  }

  const shippingAmount = SHIPPING.freeOver != null && subtotal >= SHIPPING.freeOver ? 0 : SHIPPING.amount;
  const hold = items.map((i) => `${i.id}:${i.size}:${i.qty}`).join(",");

  const f = new URLSearchParams();
  f.append("mode", "payment");
  f.append("success_url", `${origin}/thanks.html`);
  f.append("cancel_url", `${origin}/?cancelled={CHECKOUT_SESSION_ID}#bag`);
  f.append("expires_at", String(Math.floor(Date.now() / 1000) + Math.max(30, HOLD_MINUTES) * 60 + 30));
  f.append("locale", "auto");
  f.append("billing_address_collection", "auto");
  f.append("phone_number_collection[enabled]", "true");
  SHIPPING.countries.forEach((c, i) => f.append(`shipping_address_collection[allowed_countries][${i}]`, c));
  f.append("shipping_options[0][shipping_rate_data][type]", "fixed_amount");
  f.append("shipping_options[0][shipping_rate_data][display_name]", shippingAmount === 0 ? "Free tracked shipping" : SHIPPING.label);
  f.append("shipping_options[0][shipping_rate_data][fixed_amount][amount]", String(shippingAmount));
  f.append("shipping_options[0][shipping_rate_data][fixed_amount][currency]", CURRENCY);
  items.forEach((it, i) => {
    f.append(`line_items[${i}][quantity]`, String(it.qty));
    f.append(`line_items[${i}][price_data][currency]`, CURRENCY);
    f.append(`line_items[${i}][price_data][unit_amount]`, String(it.price));
    f.append(`line_items[${i}][price_data][product_data][name]`, `${it.name} — ${it.size}`);
    f.append(`line_items[${i}][price_data][product_data][metadata][sku]`, `${it.id}:${it.size}`);
  });
  f.append("metadata[order]", hold.slice(0, 500));
  f.append("payment_intent_data[metadata][order]", hold.slice(0, 500));

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: f,
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.url) {
    await returnStock(env.DB, items); // give the hold back
    console.error("Stripe error:", data?.error?.message || res.status);
    return json({ error: "Checkout is temporarily unavailable. Please try again." }, 502);
  }

  await env.DB.prepare("INSERT INTO reservations (session_id, items) VALUES (?1, ?2)")
    .bind(data.id, JSON.stringify(items.map(({ id, size, qty }) => ({ id, size, qty }))))
    .run();

  return json({ url: data.url });
}

export const onRequest = () => json({ error: "Method not allowed" }, 405);
