"use strict";

const PRESET_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "OS"];
const MAX_PHOTO_PX = 1600;   // photos are shrunk to this before upload

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const euro = (c) => new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format(c / 100);

let PRODUCTS = [];

async function api(path, opts = {}) {
  const r = await fetch(path, { credentials: "same-origin", ...opts });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { location.reload(); throw new Error("Signing in…"); }
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}
const postJSON = (path, body, method = "POST") => api(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function flash(text, isErr) {
  const m = $("#msg"); m.hidden = false; m.className = "adm-msg" + (isErr ? " err" : ""); m.textContent = text;
  if (!isErr) setTimeout(() => { if (m.textContent === text) m.hidden = true; }, 2200);
}

/* ── list ─────────────────────────────────────────────── */
async function load() {
  try {
    PRODUCTS = (await api("/api/admin/products")).products;
    $("#msg").hidden = true;
    render();
  } catch (e) { flash(e.message, true); }
}

function render() {
  const ul = $("#plist"); ul.replaceChildren();
  if (!PRODUCTS.length) { flash("no products yet. add your first one."); return; }
  PRODUCTS.forEach((p, idx) => {
    const li = el("li", "prow" + (p.active ? "" : " off"));

    const mv = el("div", "pmove");
    const up = el("button", null, "▲"); up.setAttribute("aria-label", `Move ${p.name} up`); up.disabled = idx === 0;
    const dn = el("button", null, "▼"); dn.setAttribute("aria-label", `Move ${p.name} down`); dn.disabled = idx === PRODUCTS.length - 1;
    up.onclick = () => move(idx, -1); dn.onclick = () => move(idx, 1);
    mv.append(up, dn);

    const th = el("div", "pthumb");
    if (p.images[0]) { const im = new Image(); im.src = p.images[0].url; im.alt = ""; im.loading = "lazy"; th.append(im); }

    const info = el("div");
    info.append(el("div", "pname", p.name));
    const total = p.variants.reduce((a, v) => a + v.stock, 0);
    info.append(el("div", "pmeta", `${total} in stock · ${p.images.length} photo${p.images.length === 1 ? "" : "s"}`));
    const chips = el("div", "chips");
    p.variants.forEach((v) => chips.append(el("span", "chip" + (v.stock === 0 ? " zero" : v.stock <= 3 ? " low" : ""), `${v.size} ${v.stock}`)));
    if (!p.variants.length) chips.append(el("span", "chip zero", "no sizes"));
    info.append(chips);

    const sw = el("label", "switch");
    const cb = el("input"); cb.type = "checkbox"; cb.checked = p.active;
    cb.onchange = () => quickToggle(p, cb);
    sw.append(cb, el("span", null, p.active ? "visible" : "hidden"));

    const ed = el("button", "ghost edit", "EDIT");
    ed.onclick = () => openEditor(p);

    li.append(mv, th, info, el("div", "pprice", euro(p.price)), sw, ed);
    ul.append(li);
  });
}

async function move(i, dir) {
  const j = i + dir; if (j < 0 || j >= PRODUCTS.length) return;
  [PRODUCTS[i], PRODUCTS[j]] = [PRODUCTS[j], PRODUCTS[i]];
  render();
  try { await postJSON("/api/admin/products", { ids: PRODUCTS.map((p) => p.id) }, "PUT"); } catch (e) { flash(e.message, true); load(); }
}

async function quickToggle(p, cb) {
  cb.disabled = true;
  try {
    const d = await postJSON("/api/admin/products", {
      id: p.id, name: p.name, description: p.description, price: p.price, active: cb.checked,
      variants: p.variants.map((v) => ({ size: v.size, stock: v.stock, delta: 0 })),
    });
    Object.assign(p, d.product); render();
    flash(`${p.name} is now ${p.active ? "visible" : "hidden"}`);
  } catch (e) { cb.checked = !cb.checked; cb.disabled = false; flash(e.message, true); }
}

/* ── editor ───────────────────────────────────────────── */
const dlg = $("#ed");
let cur = null;      // product being edited (null id = new)
let rows = [];       // [{size, loaded, value}]
let delArmed = 0;

function openEditor(p) {
  cur = p ? structuredClone(p) : { id: null, name: "", description: "", price: 2499, active: true, variants: ["S", "M", "L", "XL"].map((s) => ({ size: s, stock: 0 })), images: [] };
  rows = cur.variants.map((v) => ({ size: v.size, loaded: p ? v.stock : 0, value: v.stock }));
  $("#edTitle").textContent = p ? "edit product" : "new product";
  $("#fName").value = cur.name;
  $("#fPrice").value = (cur.price / 100).toFixed(2);
  $("#fDesc").value = cur.description;
  $("#fActive").checked = cur.active;
  $("#edErr").textContent = ""; $("#uplMsg").textContent = cur.id ? "" : "you can add photos now; they upload when you save.";
  $("#delBtn").hidden = !cur.id; $("#delBtn").textContent = "delete product"; delArmed = 0;
  pendingFiles = [];
  renderSizes(); renderPhotos(); renderPresets();
  dlg.showModal();
  $("#fName").focus();
}

function renderSizes() {
  const tb = $("#sizes"); tb.replaceChildren();
  rows.forEach((r, i) => {
    const tr = el("tr");
    tr.append(el("td", "sz", r.size));
    const td = el("td");
    const st = el("div", "stepper");
    const minus = el("button", null, "−"); minus.type = "button"; minus.setAttribute("aria-label", `Remove one ${r.size}`);
    const plus = el("button", null, "+"); plus.type = "button"; plus.setAttribute("aria-label", `Add one ${r.size}`);
    const inp = el("input"); inp.type = "number"; inp.min = "0"; inp.step = "1"; inp.value = r.value; inp.setAttribute("aria-label", `Stock for ${r.size}`);
    const note = el("span", "changed");
    const sync = () => { const d = r.value - r.loaded; note.textContent = cur.id && d ? (d > 0 ? `+${d}` : `${d}`) : ""; inp.value = r.value; };
    minus.onclick = () => { r.value = Math.max(0, r.value - 1); sync(); };
    plus.onclick = () => { r.value += 1; sync(); };
    inp.oninput = () => { r.value = Math.max(0, Math.trunc(Number(inp.value) || 0)); note.textContent = cur.id && r.value - r.loaded ? `${r.value - r.loaded > 0 ? "+" : ""}${r.value - r.loaded}` : ""; };
    inp.onblur = sync;
    st.append(minus, inp, plus); td.append(st, note); sync();
    const rm = el("td"); const x = el("button", "linkish", "remove"); x.type = "button";
    x.onclick = () => { rows.splice(i, 1); renderSizes(); renderPresets(); };
    rm.append(x);
    tr.append(td, rm);
    tb.append(tr);
  });
  if (!rows.length) { const tr = el("tr"); const td = el("td", "hint", "no sizes: add at least one or it can't be bought"); td.colSpan = 3; tr.append(td); tb.append(tr); }
}

function addSize(name) {
  const s = String(name || "").trim().toUpperCase().slice(0, 12);
  if (!s || rows.some((r) => r.size === s)) return;
  rows.push({ size: s, loaded: 0, value: 0 });
  renderSizes(); renderPresets();
}
function renderPresets() {
  const box = $("#presets"); box.replaceChildren();
  PRESET_SIZES.filter((s) => !rows.some((r) => r.size === s)).forEach((s) => {
    const b = el("button", null, s); b.type = "button"; b.onclick = () => addSize(s); box.append(b);
  });
}
$("#addSize").onclick = () => { addSize($("#newSize").value); $("#newSize").value = ""; };
$("#newSize").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("#addSize").click(); } });

/* photos */
let pendingFiles = []; // for a product that isn't saved yet: [{blob, url}]

function renderPhotos() {
  const g = $("#pgrid"); g.replaceChildren();
  const all = cur.images.map((im) => ({ kind: "saved", ...im })).concat(pendingFiles.map((f, i) => ({ kind: "pending", url: f.url, i })));
  all.forEach((ph, idx) => {
    const t = el("div", "ptile" + (ph.busy ? " busy" : ""));
    const im = new Image(); im.src = ph.url; im.alt = ""; t.append(im);
    const bar = el("div", "bar");
    const l = el("button", null, "←"); l.type = "button"; l.setAttribute("aria-label", "Move photo left");
    const x = el("button", null, "✕"); x.type = "button"; x.setAttribute("aria-label", "Delete photo");
    const r = el("button", null, "→"); r.type = "button"; r.setAttribute("aria-label", "Move photo right");
    if (ph.kind === "saved") {
      l.disabled = idx === 0; r.disabled = idx >= cur.images.length - 1;
      l.onclick = () => reorder(idx, -1); r.onclick = () => reorder(idx, 1);
      x.onclick = () => deletePhoto(ph.id);
    } else {
      l.disabled = r.disabled = true;
      x.onclick = () => { URL.revokeObjectURL(ph.url); pendingFiles.splice(ph.i, 1); renderPhotos(); };
    }
    bar.append(l, x, r); t.append(bar); g.append(t);
  });
}

async function reorder(i, dir) {
  const j = i + dir; const imgs = cur.images;
  [imgs[i], imgs[j]] = [imgs[j], imgs[i]]; renderPhotos();
  try { await postJSON("/api/admin/images", { product: cur.id, ids: imgs.map((x) => x.id) }, "PUT"); syncBack(); }
  catch (e) { $("#edErr").textContent = e.message; }
}
async function deletePhoto(id) {
  try {
    await api(`/api/admin/images?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    cur.images = cur.images.filter((x) => x.id !== id); renderPhotos(); syncBack();
  } catch (e) { $("#edErr").textContent = e.message; }
}

// shrink a photo in the browser before uploading (keeps uploads small and fast)
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_PHOTO_PX / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [0.86, 0.78, 0.68, 0.55]) {
    const b = await new Promise((res) => c.toBlob(res, "image/jpeg", q));
    if (b && b.size < 1_700_000) return b;
  }
  throw new Error("Photo is too detailed to shrink. Try a smaller one.");
}

async function uploadOne(blob) {
  const d = await api(`/api/admin/images?product=${encodeURIComponent(cur.id)}`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
  cur.images.push(d.image);
}

$("#files").onchange = async (e) => {
  const files = [...e.target.files]; e.target.value = "";
  const msg = $("#uplMsg");
  for (const [n, f] of files.entries()) {
    msg.textContent = `preparing photo ${n + 1} of ${files.length}…`;
    try {
      const blob = await shrink(f);
      if (!cur.id) { pendingFiles.push({ blob, url: URL.createObjectURL(blob) }); renderPhotos(); continue; }
      msg.textContent = `uploading photo ${n + 1} of ${files.length}…`;
      await uploadOne(blob); renderPhotos(); syncBack();
    } catch (err) { msg.textContent = `${f.name}: ${err.message}`; return; }
  }
  msg.textContent = cur.id ? "" : "photos will upload when you save.";
};

// keep the list behind the dialog in sync with photo changes
function syncBack() {
  const p = PRODUCTS.find((x) => x.id === cur.id);
  if (p) { p.images = structuredClone(cur.images); render(); }
}

/* save / delete */
$("#edForm").onsubmit = async (e) => {
  e.preventDefault();
  const err = $("#edErr"); err.textContent = "";
  const name = $("#fName").value.trim();
  const price = Math.round(parseFloat(String($("#fPrice").value).replace(",", ".")) * 100);
  if (!name) { err.textContent = "Give it a name."; return; }
  if (!Number.isFinite(price) || price < 0) { err.textContent = "Price must be a number, like 24.99"; return; }

  const btn = $("#saveBtn"); btn.disabled = true; btn.textContent = "SAVING…";
  try {
    const d = await postJSON("/api/admin/products", {
      id: cur.id, name, price, description: $("#fDesc").value, active: $("#fActive").checked,
      variants: rows.map((r) => ({ size: r.size, stock: r.loaded, delta: r.value - r.loaded })),
    });
    const isNew = !cur.id;
    cur = { ...d.product, images: d.product.images };
    if (isNew && pendingFiles.length) {
      btn.textContent = "UPLOADING PHOTOS…";
      for (const f of pendingFiles) { await uploadOne(f.blob); URL.revokeObjectURL(f.url); }
      pendingFiles = [];
    }
    dlg.close();
    await load();
    flash(`saved ${name}`);
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    btn.disabled = false; btn.textContent = "SAVE";
  }
};

$("#delBtn").onclick = async () => {
  // no browser confirm() dialogs: click twice within 4 seconds
  if (Date.now() - delArmed > 4000) { delArmed = Date.now(); $("#delBtn").textContent = "click again to delete forever"; return; }
  try {
    await api(`/api/admin/products?id=${encodeURIComponent(cur.id)}`, { method: "DELETE" });
    dlg.close(); await load(); flash("deleted");
  } catch (e) { $("#edErr").textContent = e.message; }
};

dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-close]")) dlg.close(); });
dlg.addEventListener("close", () => { pendingFiles.forEach((f) => URL.revokeObjectURL(f.url)); pendingFiles = []; });
$("#newBtn").onclick = () => openEditor(null);

load();
