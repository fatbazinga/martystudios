// Product photos (login-protected)
//   POST   /api/admin/images?product=ID   body = the image file (jpeg/png/webp, ≤ 1.8 MB)
//   PUT    /api/admin/images              { product, ids: [...] }  → new order
//   DELETE /api/admin/images?id=ID
// The admin page shrinks photos in your browser before uploading, so big
// phone photos are fine.
import { requireAdmin, json } from "../../../shared/access.js";

const MAX = 1_800_000;

function sniff(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

async function guard(request, env) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (request.headers.get("Origin") !== new URL(request.url).origin) return json({ error: "Forbidden" }, 403);
  if (!env.DB) return json({ error: "Database not connected." }, 503);
  return null;
}

export async function onRequestPost({ request, env }) {
  const no = await guard(request, env); if (no) return no;
  const product = String(new URL(request.url).searchParams.get("product") || "").slice(0, 64);
  if (!(await env.DB.prepare("SELECT 1 FROM products WHERE id = ?1").bind(product).first())) return json({ error: "Save the product first." }, 404);
  if (Number(request.headers.get("Content-Length") || 0) > MAX) return json({ error: "Photo too large." }, 413);

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX) return json({ error: "Photo too large." }, 413);
  const mime = sniff(bytes);
  if (!mime) return json({ error: "Only JPG, PNG or WebP photos." }, 415);

  const { n } = (await env.DB.prepare("SELECT COUNT(*) AS n FROM images WHERE product_id = ?1").bind(product).first()) || { n: 0 };
  if (n >= 12) return json({ error: "Max 12 photos per product." }, 400);
  const { p } = (await env.DB.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM images WHERE product_id = ?1").bind(product).first()) || { p: 0 };

  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO images (id, product_id, position, mime, data) VALUES (?1, ?2, ?3, ?4, ?5)").bind(id, product, p, mime, bytes).run();
  return json({ ok: true, image: { id, url: `/api/img/${id}` } });
}

export async function onRequestPut({ request, env }) {
  const no = await guard(request, env); if (no) return no;
  let b; try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const product = String(b?.product || "").slice(0, 64);
  const ids = (Array.isArray(b?.ids) ? b.ids : []).slice(0, 12).map(String);
  if (!ids.length) return json({ ok: true });
  await env.DB.batch(ids.map((id, i) => env.DB.prepare("UPDATE images SET position = ?3 WHERE id = ?1 AND product_id = ?2").bind(id, product, i)));
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const no = await guard(request, env); if (no) return no;
  const id = String(new URL(request.url).searchParams.get("id") || "").slice(0, 64);
  await env.DB.prepare("DELETE FROM images WHERE id = ?1").bind(id).run();
  return json({ ok: true });
}
