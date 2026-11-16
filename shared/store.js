// Database helpers (Cloudflare D1, bound as env.DB)
import { LOW_STOCK } from "./config.js";

export function imageUrl(img) {
  return img.url || `/api/img/${img.id}`;
}

// Returns products with their sizes and images.
// admin=true → includes hidden products and exact stock numbers.
export async function loadCatalog(db, { admin = false } = {}) {
  const [p, v, i] = await db.batch([
    db.prepare(`SELECT id, name, description, price, active, sort FROM products ${admin ? "" : "WHERE active = 1"} ORDER BY sort, created_at`),
    db.prepare("SELECT product_id, size, stock FROM variants ORDER BY sort, rowid"),
    db.prepare("SELECT id, product_id, url FROM images ORDER BY position, created_at"),
  ]);
  const byId = new Map();
  for (const r of p.results) byId.set(r.id, { ...r, active: !!r.active, variants: [], images: [] });
  for (const r of v.results) byId.get(r.product_id)?.variants.push({ size: r.size, stock: r.stock });
  for (const r of i.results) byId.get(r.product_id)?.images.push({ id: r.id, url: imageUrl(r) });
  const list = [...byId.values()];
  if (admin) return list;

  // public shape: no exact stock numbers, just availability + "only N left"
  return list.map((pr) => ({
    id: pr.id,
    name: pr.name,
    desc: pr.description,
    price: pr.price,
    image: pr.images[0]?.url || null,
    images: pr.images.map((x) => x.url),
    sizes: Object.fromEntries(pr.variants.map((x) => [x.size, x.stock > 0])),
    low: Object.fromEntries(pr.variants.filter((x) => x.stock > 0 && x.stock <= LOW_STOCK).map((x) => [x.size, x.stock])),
  }));
}

// Atomically take stock for a list of {id,size,qty}. All-or-nothing:
// if any size doesn't have enough, nothing is taken and it throws.
export async function takeStock(db, items) {
  await db.batch(items.map((it) => db.prepare("UPDATE variants SET stock = stock - ?1 WHERE product_id = ?2 AND size = ?3").bind(it.qty, it.id, it.size)));
}

export async function returnStock(db, items) {
  if (!items.length) return;
  await db.batch(items.map((it) => db.prepare("UPDATE variants SET stock = stock + ?1 WHERE product_id = ?2 AND size = ?3").bind(it.qty, it.id, it.size)));
}

export const slugify = (s) =>
  String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "product";
