// Product manager API (login-protected)
//   GET    /api/admin/products            → all products, exact stock
//   POST   /api/admin/products            → create or update one product
//   DELETE /api/admin/products?id=...     → delete a product
import { requireAdmin, json } from "../../../shared/access.js";
import { loadCatalog, slugify } from "../../../shared/store.js";

const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, n);

async function guard(request, env, mutating) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (mutating && request.headers.get("Origin") !== new URL(request.url).origin) return json({ error: "Forbidden" }, 403);
  if (!env.DB) return json({ error: "Database not connected (see README, step 10)." }, 503);
  return null;
}

export async function onRequestGet({ request, env }) {
  const no = await guard(request, env, false); if (no) return no;
  return json({ products: await loadCatalog(env.DB, { admin: true }) });
}

export async function onRequestPost({ request, env }) {
  const no = await guard(request, env, true); if (no) return no;
  let b; try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }

  const name = clean(b.name, 80);
  const description = clean(b.description, 1000);
  const price = Math.round(Number(b.price));
  const active = b.active ? 1 : 0;
  if (!name) return json({ error: "Name is required." }, 400);
  if (!Number.isInteger(price) || price < 0 || price > 10_000_00) return json({ error: "Invalid price." }, 400);

  const sizes = Array.isArray(b.variants) ? b.variants : [];
  if (sizes.length > 20) return json({ error: "Too many sizes." }, 400);
  const seen = new Set();
  const variants = [];
  for (const [i, v] of sizes.entries()) {
    const size = clean(v.size, 12).toUpperCase();
    if (!size || seen.has(size)) continue;
    seen.add(size);
    const delta = Math.trunc(Number(v.delta) || 0);
    const stock = Math.max(0, Math.trunc(Number(v.stock) || 0));
    if (Math.abs(delta) > 100000 || stock > 100000) return json({ error: "Stock number too large." }, 400);
    variants.push({ size, delta, stock, sort: i });
  }

  const db = env.DB;
  let id = clean(b.id, 64);
  const exists = id ? await db.prepare("SELECT 1 FROM products WHERE id = ?1").bind(id).first() : null;
  const stmts = [];

  if (!exists) {
    // new product: pick a unique id from the name
    const base = slugify(name);
    id = base;
    for (let n = 2; await db.prepare("SELECT 1 FROM products WHERE id = ?1").bind(id).first(); n++) id = `${base}-${n}`;
    const { m } = (await db.prepare("SELECT COALESCE(MAX(sort), -1) + 1 AS m FROM products").first()) || { m: 0 };
    stmts.push(db.prepare("INSERT INTO products (id, name, description, price, active, sort) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(id, name, description, price, active, m));
    for (const v of variants) {
      stmts.push(db.prepare("INSERT INTO variants (product_id, size, stock, sort) VALUES (?1, ?2, ?3, ?4)").bind(id, v.size, Math.max(0, v.stock + v.delta), v.sort));
    }
  } else {
    stmts.push(db.prepare("UPDATE products SET name = ?2, description = ?3, price = ?4, active = ?5, updated_at = unixepoch() WHERE id = ?1").bind(id, name, description, price, active));
    if (Number.isInteger(b.sort)) stmts.push(db.prepare("UPDATE products SET sort = ?2 WHERE id = ?1").bind(id, b.sort));
    // sizes not in the list are removed
    const keep = variants.map((v) => v.size);
    stmts.push(
      keep.length
        ? db.prepare(`DELETE FROM variants WHERE product_id = ?1 AND size NOT IN (${keep.map((_, i) => `?${i + 2}`).join(",")})`).bind(id, ...keep)
        : db.prepare("DELETE FROM variants WHERE product_id = ?1").bind(id)
    );
    for (const v of variants) {
      // Stock changes are sent as +/- amounts, so a sale that happens while
      // you're editing isn't overwritten.
      stmts.push(db.prepare(
        `INSERT INTO variants (product_id, size, stock, sort) VALUES (?1, ?2, MAX(0, ?3), ?4)
         ON CONFLICT (product_id, size) DO UPDATE SET stock = MAX(0, stock + ?5), sort = ?4`
      ).bind(id, v.size, v.stock + v.delta, v.sort, v.delta));
    }
  }

  await db.batch(stmts);
  const product = (await loadCatalog(db, { admin: true })).find((p) => p.id === id);
  return json({ ok: true, product });
}

export async function onRequestDelete({ request, env }) {
  const no = await guard(request, env, true); if (no) return no;
  const id = clean(new URL(request.url).searchParams.get("id"), 64);
  if (!id) return json({ error: "Missing id" }, 400);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM images WHERE product_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM variants WHERE product_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM products WHERE id = ?1").bind(id),
  ]);
  return json({ ok: true });
}

// reorder the whole list: PUT { ids: [...] }
export async function onRequestPut({ request, env }) {
  const no = await guard(request, env, true); if (no) return no;
  let b; try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const ids = (Array.isArray(b?.ids) ? b.ids : []).slice(0, 500).map((x) => clean(x, 64));
  if (!ids.length) return json({ ok: true });
  await env.DB.batch(ids.map((id, i) => env.DB.prepare("UPDATE products SET sort = ?2 WHERE id = ?1").bind(id, i)));
  return json({ ok: true });
}
