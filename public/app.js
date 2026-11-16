"use strict";

// ─────────────────────────────────────────────────────────────
//  BACKGROUND VIDEOS — drop files into /public/videos and list them here.
//  They play in random order, muted, looping forever.
//  Missing files are skipped silently, so it's safe to leave this as is.
// ─────────────────────────────────────────────────────────────
const VIDEOS = [
  "/videos/01.mp4",
  "/videos/02.mp4",
  "/videos/03.mp4",
];

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text; // textContent only → no HTML injection
  return n;
};

let CATALOG = new Map();
let CURRENCY = "eur";
let SHIP = { amount: 0, freeOver: null };
const fmt = (c) => new Intl.NumberFormat(undefined, { style: "currency", currency: CURRENCY.toUpperCase() }).format(c / 100);

/* ── background video ───────────────────────────────────────── */
(function videos() {
  const v = $("#bgv");
  if (!v || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const saveData = navigator.connection && navigator.connection.saveData;
  if (saveData) return;

  let queue = [], failed = new Set(), current = null;
  const next = () => {
    const pool = VIDEOS.filter((s) => !failed.has(s));
    if (!pool.length) { v.remove(); return; }
    if (!queue.length) queue = pool.sort(() => Math.random() - 0.5);
    let src = queue.shift();
    if (src === current && pool.length > 1) src = queue.shift() || src;
    current = src;
    v.classList.remove("on");
    v.src = src;
    v.play().catch(() => {});
  };
  v.addEventListener("playing", () => {
    v.classList.add("on", "glitch");
    setTimeout(() => v.classList.remove("glitch"), 400);
  });
  v.addEventListener("ended", next);
  v.addEventListener("error", () => { failed.add(current); next(); });
  // pause when tab hidden — saves battery & bandwidth
  document.addEventListener("visibilitychange", () => (document.hidden ? v.pause() : v.play().catch(() => {})));
  next();
})();

/* ── small weirdness ────────────────────────────────────────── */
const GLYPHS = "▓▒░█▚▞◢◣◤◥/\\|—_";
function scramble(node) {
  if (node.dataset.busy) return;
  const target = node.dataset.text || (node.dataset.text = node.textContent);
  node.dataset.busy = 1;
  let i = 0;
  const t = setInterval(() => {
    node.textContent = [...target].map((ch, k) => (k < i || ch === " " ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join("");
    if (++i > target.length) { clearInterval(t); node.textContent = target; delete node.dataset.busy; }
  }, 28);
}
document.querySelectorAll("[data-scramble]").forEach((n) => {
  if (n.children.length) return; // keep structured elements intact
  n.addEventListener("mouseenter", () => scramble(n));
});
(function clock() {
  const c = $("#clock");
  if (!c) return;
  const tick = () => {
    const d = new Date(Date.now() + 13 * 60 * 1000); // always 13 minutes ahead
    c.textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };
  tick(); setInterval(tick, 10000);
})();
const yr = $("#yr"); if (yr) yr.textContent = new Date().getFullYear();

let toastT;
function toast(msg) {
  const t = $("#toast"); if (!t) return;
  t.textContent = msg; t.classList.add("on");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2200);
}

/* ── images with a fallback placeholder ─────────────────────── */
function imgOrPlaceholder(src, alt, label) {
  const wrap = document.createDocumentFragment();
  const ph = el("div", "ph", label || "");
  const img = new Image();
  img.alt = alt; img.loading = "lazy"; img.decoding = "async";
  img.addEventListener("load", () => ph.remove());
  img.addEventListener("error", () => img.remove());
  img.src = src;
  wrap.append(ph, img);
  return wrap;
}

/* ── bag (stored only in this browser, never sent anywhere until checkout) ── */
const KEY = "ms_bag_v1";
const bag = {
  items: (() => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } })(),
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.items)); } catch {} render(); },
  add(id, size) {
    const f = this.items.find((i) => i.id === id && i.size === size);
    if (f) f.qty = Math.min(10, f.qty + 1); else this.items.push({ id, size, qty: 1 });
    this.save();
  },
  set(idx, qty) { if (qty < 1) this.items.splice(idx, 1); else this.items[idx].qty = Math.min(10, qty); this.save(); },
};

function render() {
  // drop items that no longer exist in the catalog
  if (CATALOG.size) bag.items = bag.items.filter((i) => CATALOG.has(i.id) && i.size in CATALOG.get(i.id).sizes);
  const count = bag.items.reduce((a, i) => a + i.qty, 0);
  $("#bagCount").textContent = count;

  const list = $("#bagList");
  list.replaceChildren();
  let sub = 0;
  bag.items.forEach((it, idx) => {
    const p = CATALOG.get(it.id); if (!p) return;
    sub += p.price * it.qty;
    const li = el("li");
    const th = el("div", "thumb"); th.append(imgOrPlaceholder(p.image, p.name));
    const mid = el("div");
    mid.append(el("div", null, p.name), el("div", "rm-size", `size ${it.size} · ${fmt(p.price)}`));
    const q = el("div", "qty");
    const minus = el("button", null, "−"); minus.setAttribute("aria-label", "Decrease quantity");
    const plus = el("button", null, "+"); plus.setAttribute("aria-label", "Increase quantity");
    minus.onclick = () => bag.set(idx, it.qty - 1);
    plus.onclick = () => bag.set(idx, it.qty + 1);
    q.append(minus, el("span", null, it.qty), plus);
    mid.append(q);
    const rm = el("button", "rm", "remove"); rm.onclick = () => bag.set(idx, 0);
    li.append(th, mid, rm);
    list.append(li);
  });
  if (!bag.items.length) list.append(el("li", "empty", "the bag is empty. for now."));

  $("#bagSub").textContent = fmt(sub);
  const ship = !sub ? "—" : SHIP.freeOver != null && sub >= SHIP.freeOver ? "free" : fmt(SHIP.amount);
  $("#bagShip").textContent = ship;
  $("#checkoutBtn").disabled = !bag.items.length;
}

const bagEl = $("#bag"), scrim = $("#scrim"), bagBtn = $("#bagBtn");
function openBag(open) {
  bagEl.classList.toggle("open", open);
  bagEl.setAttribute("aria-hidden", String(!open));
  bagBtn.setAttribute("aria-expanded", String(open));
  scrim.hidden = !open;
  if (open) $("#bagClose").focus();
}
bagBtn.onclick = () => openBag(true);
$("#bagClose").onclick = () => openBag(false);
scrim.onclick = () => openBag(false);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && bagEl.classList.contains("open")) openBag(false); });
if (location.hash === "#bag") setTimeout(() => openBag(true), 300);
// came back from Stripe without paying → release the held stock right away
(function releaseHold() {
  const q = new URLSearchParams(location.search), sid = q.get("cancelled");
  if (!sid) return;
  fetch("/api/checkout/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session: sid }) }).catch(() => {});
  history.replaceState(null, "", location.pathname + location.hash);
})();

/* ── checkout ───────────────────────────────────────────────── */
$("#checkoutBtn").onclick = async (e) => {
  const btn = e.currentTarget, err = $("#bagErr");
  err.textContent = "";
  btn.disabled = true; btn.textContent = "OPENING…";
  try {
    const r = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: bag.items.map(({ id, size, qty }) => ({ id, size, qty })) }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) throw new Error(d.error || "Something went wrong.");
    location.assign(d.url); // → Stripe's secure payment page
  } catch (x) {
    err.textContent = x.message;
    btn.disabled = false; btn.textContent = "CHECKOUT";
  }
};

/* ── product dialog ─────────────────────────────────────────── */
const pd = $("#pd");
let pdProduct = null, pdSize = null;
function openProduct(p) {
  pdProduct = p; pdSize = null;
  $("#pdName").textContent = p.name;
  $("#pdPrice").textContent = fmt(p.price);
  $("#pdDesc").textContent = p.desc;
  const imgs = p.images && p.images.length ? p.images : [p.image];
  let gi = 0;
  const box = $("#pdImg");
  const show = () => {
    box.replaceChildren(imgOrPlaceholder(imgs[gi], p.name, "photo coming"));
    if (imgs.length > 1) {
      const dots = el("div", "dots");
      imgs.forEach((_, k) => { const d = el("button", k === gi ? "on" : null); d.type = "button"; d.setAttribute("aria-label", `Photo ${k + 1} of ${imgs.length}`); d.onclick = (e) => { e.stopPropagation(); gi = k; show(); }; dots.append(d); });
      box.append(dots);
    }
  };
  box.onclick = () => { if (imgs.length > 1) { gi = (gi + 1) % imgs.length; show(); } };
  show();
  const fs = $("#pdSizes");
  fs.querySelectorAll("label").forEach((l) => l.remove());
  Object.entries(p.sizes).forEach(([s, avail]) => {
    const lab = el("label");
    const inp = el("input"); inp.type = "radio"; inp.name = "size"; inp.value = s; inp.disabled = !avail;
    inp.onchange = () => { pdSize = s; const b = $("#pdAdd"); b.disabled = false; b.textContent = "ADD TO BAG"; };
    lab.append(inp, el("span", null, s));
    lab.title = avail ? "" : "sold out";
    if (p.low && p.low[s]) { lab.classList.add("low"); lab.dataset.left = `${p.low[s]} left`; }
    fs.append(lab);
  });
  // auto-select if only one available size
  const avail = Object.entries(p.sizes).filter(([, a]) => a);
  const add = $("#pdAdd");
  if (avail.length === 1) { fs.querySelector(`input[value="${avail[0][0]}"]`).click(); }
  else { add.disabled = true; add.textContent = avail.length ? "SELECT A SIZE" : "SOLD OUT"; }
  pd.showModal();
}
$("#pdAdd").onclick = () => {
  if (!pdProduct || !pdSize) return;
  bag.add(pdProduct.id, pdSize);
  pd.close();
  toast(`${pdProduct.name} (${pdSize}) is in the bag`);
};
pd.addEventListener("click", (e) => { if (e.target === pd || e.target.closest("[data-close]")) pd.close(); });

/* ── load products ──────────────────────────────────────────── */
(async function load() {
  const status = $("#shopStatus"), grid = $("#grid");
  try {
    const r = await fetch("/api/products");
    if (!r.ok) throw 0;
    const d = await r.json();
    CURRENCY = d.currency || "eur"; SHIP = d.shipping || SHIP;
    d.products.forEach((p) => CATALOG.set(p.id, p));
    status.remove();
    d.products.forEach((p) => {
      const soldOut = !Object.values(p.sizes).some(Boolean);
      const card = el("button", "card");
      card.type = "button";
      card.setAttribute("aria-label", `${p.name}, ${fmt(p.price)}${soldOut ? ", sold out" : ""}`);
      const im = el("div", "img"); im.append(imgOrPlaceholder(p.image, p.name, p.name.toLowerCase()));
      if (p.images && p.images[1]) { const alt = new Image(); alt.className = "alt"; alt.src = p.images[1]; alt.alt = ""; alt.loading = "lazy"; im.append(alt); }
      const meta = el("div", "meta");
      const name = el("span", null, p.name);
      meta.append(name, el("span", soldOut ? "soldout" : null, soldOut ? "sold out" : fmt(p.price)));
      card.append(im, meta);
      card.addEventListener("mouseenter", () => scramble(name));
      card.onclick = () => openProduct(p);
      grid.append(card);
    });
  } catch {
    status.textContent = "the room is closed right now. try again in a moment.";
  }
  render();
})();
