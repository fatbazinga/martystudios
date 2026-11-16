// Cloudflare Worker entry point.
// Static files (HTML, CSS, images, videos) are served straight from /public.
// Anything under /api/ is routed to the handlers in /functions/api.

import * as products from "../functions/api/products.js";
import * as checkout from "../functions/api/checkout.js";
import * as checkoutCancel from "../functions/api/checkout/cancel.js";
import * as webhook from "../functions/api/stripe-webhook.js";
import * as img from "../functions/api/img/[id].js";
import * as adminOrders from "../functions/api/admin/orders.js";
import * as adminShip from "../functions/api/admin/ship.js";
import * as adminProducts from "../functions/api/admin/products.js";
import * as adminImages from "../functions/api/admin/images.js";

const ROUTES = [
  ["/api/products", products],
  ["/api/checkout", checkout],
  ["/api/checkout/cancel", checkoutCancel],
  ["/api/stripe-webhook", webhook],
  ["/api/admin/orders", adminOrders],
  ["/api/admin/ship", adminShip],
  ["/api/admin/products", adminProducts],
  ["/api/admin/images", adminImages],
];

const json = (d, s) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path.startsWith("/api/")) {
      let mod = null, params = {};
      const hit = ROUTES.find(([p]) => p === path);
      if (hit) mod = hit[1];
      else if (path.startsWith("/api/img/")) { mod = img; params = { id: path.slice(9) }; }
      if (!mod) return json({ error: "Not found" }, 404);

      const m = request.method.toUpperCase();
      const fn = mod["onRequest" + m[0] + m.slice(1).toLowerCase()] || mod.onRequest;
      if (!fn) return json({ error: "Method not allowed" }, 405);
      try {
        return await fn({ request, env, params, waitUntil: (p) => ctx.waitUntil(p) });
      } catch (e) {
        console.error("Unhandled error on", m, path, e?.stack || e);
        return json({ error: "Something went wrong." }, 500);
      }
    }

    // everything else: static files from /public
    return env.ASSETS.fetch(request);
  },
};
