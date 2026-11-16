// Serves product photos uploaded through the admin (stored in D1).
// Image ids are random and never reused, so they can be cached forever.
export async function onRequestGet({ request, params, env, waitUntil }) {
  const id = String(params.id || "");
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response("Not found", { status: 404 });

  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  const row = await env.DB.prepare("SELECT mime, data FROM images WHERE id = ?1 AND data IS NOT NULL").bind(id).first();
  if (!row) return new Response("Not found", { status: 404 });

  const res = new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime || "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
  waitUntil(cache.put(request, res.clone()));
  return res;
}
