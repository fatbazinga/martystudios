// Stripe → your site. Keeps stock correct:
//   checkout.session.completed → the held stock is now sold (nothing to give back)
//   checkout.session.expired   → customer didn't pay → put the held stock back
// Every message is verified with your webhook signing secret, so nobody else can fake one.
import { returnStock } from "../../shared/store.js";

const TOLERANCE = 300; // seconds

async function verify(payload, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => { const i = kv.indexOf("="); return [kv.slice(0, i), kv.slice(i + 1)]; }));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > TOLERANCE) return false;
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  // constant-time compare
  return sigs.some((s) => s.length === hex.length && [...s].reduce((acc, c, i) => acc | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}

export async function onRequestPost({ request, env }) {
  const payload = await request.text();
  if (!(await verify(payload, request.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET))) {
    return new Response("Bad signature", { status: 400 });
  }
  const event = JSON.parse(payload);
  const session = event.data?.object;
  if (!session?.id) return new Response("ok");

  if (event.type === "checkout.session.completed") {
    await env.DB.prepare("UPDATE reservations SET status = 'paid' WHERE session_id = ?1 AND status = 'pending'").bind(session.id).run();
  }

  if (event.type === "checkout.session.expired") {
    // only the first delivery of this event gets to release the stock
    const r = await env.DB.prepare("UPDATE reservations SET status = 'released' WHERE session_id = ?1 AND status = 'pending' RETURNING items").bind(session.id).first();
    if (r) await returnStock(env.DB, JSON.parse(r.items));
  }

  return new Response("ok");
}
