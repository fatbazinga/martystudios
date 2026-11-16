// POST /api/checkout/cancel { session }
// Called when a customer clicks "back" on the Stripe page: closes their
// unpaid session right away so the held stock goes back on sale now
// instead of after 30 minutes. Stripe refuses to expire a paid session,
// so this can't cancel a real order.
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function onRequestPost({ request, env }) {
  const origin = new URL(request.url).origin;
  if (request.headers.get("Origin") !== origin) return json({ error: "Forbidden" }, 403);
  let b; try { b = await request.json(); } catch { return json({ ok: false }, 400); }
  const id = String(b?.session || "");
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(id)) return json({ ok: false }, 400);

  const pending = await env.DB.prepare("SELECT 1 FROM reservations WHERE session_id = ?1 AND status = 'pending'").bind(id).first();
  if (!pending) return json({ ok: true });

  // expiring triggers checkout.session.expired → the webhook returns the stock
  await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}/expire`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  }).catch(() => {});
  return json({ ok: true });
}
