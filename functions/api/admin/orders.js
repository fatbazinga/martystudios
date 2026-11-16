// GET /api/admin/orders?after=<session_id>
// Lists paid orders from Stripe, newest first, with everything needed to ship them.
import { requireAdmin, json } from "../../../shared/access.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const url = new URL(request.url);
  const q = new URLSearchParams({ limit: "100", status: "complete" });
  q.append("expand[]", "data.line_items");
  q.append("expand[]", "data.payment_intent.latest_charge");
  const after = url.searchParams.get("after");
  if (after && /^cs_[A-Za-z0-9_]+$/.test(after)) q.set("starting_after", after);

  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions?${q}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("Stripe list error:", d?.error?.message);
    return json({ error: "Couldn't load orders from Stripe." }, 502);
  }

  const orders = d.data
    .filter((s) => s.payment_status === "paid")
    .map((s) => {
      const ship = s.collected_information?.shipping_details || s.shipping_details || {};
      const cust = s.customer_details || {};
      const pi = typeof s.payment_intent === "object" && s.payment_intent ? s.payment_intent : null;
      const meta = pi?.metadata || {};
      return {
        id: s.id,
        ref: (pi?.id || s.id).slice(-8).toUpperCase(),
        paymentIntent: pi?.id || null,
        created: s.created,
        currency: s.currency,
        total: s.amount_total,
        shippingCost: s.shipping_cost?.amount_total ?? null,
        email: cust.email || "",
        phone: cust.phone || "",
        name: ship.name || cust.name || "",
        address: ship.address || cust.address || {},
        items: (s.line_items?.data || []).map((li) => ({ name: li.description, qty: li.quantity, amount: li.amount_total })),
        refunded: pi?.latest_charge?.refunded || pi?.status === "canceled" || false,
        shippedAt: meta.shipped_at ? Number(meta.shipped_at) : null,
        tracking: meta.tracking || "",
        carrier: meta.carrier || "",
      };
    });

  return json({ orders, hasMore: d.has_more, next: d.data.at(-1)?.id || null, you: auth.email });
}
