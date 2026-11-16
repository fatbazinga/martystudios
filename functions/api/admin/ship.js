// POST /api/admin/ship  { paymentIntent, tracking, carrier, shipped: true|false }
// Marks an order shipped (or un-ships it). Saved on the payment in Stripe,
// so there's still no database to run or leak.
import { requireAdmin, json } from "../../../shared/access.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const origin = new URL(request.url).origin;
  if (request.headers.get("Origin") !== origin) return json({ error: "Forbidden" }, 403);

  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const pi = String(b?.paymentIntent || "");
  if (!/^pi_[A-Za-z0-9_]+$/.test(pi)) return json({ error: "Bad order id" }, 400);

  const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, n);
  const f = new URLSearchParams();
  if (b.shipped) {
    f.append("metadata[shipped_at]", String(Math.floor(Date.now() / 1000)));
    f.append("metadata[tracking]", clean(b.tracking, 100));
    f.append("metadata[carrier]", clean(b.carrier, 40));
    f.append("metadata[shipped_by]", auth.email);
  } else {
    // empty value = delete the key in Stripe
    ["shipped_at", "tracking", "carrier", "shipped_by"].forEach((k) => f.append(`metadata[${k}]`, ""));
  }

  const r = await fetch(`https://api.stripe.com/v1/payment_intents/${pi}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: f,
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    console.error("Stripe update error:", d?.error?.message);
    return json({ error: "Couldn't save to Stripe." }, 502);
  }
  return json({ ok: true });
}

export const onRequest = () => json({ error: "Method not allowed" }, 405);
