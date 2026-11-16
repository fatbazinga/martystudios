"use strict";

const CARRIERS = ["ACS", "ELTA Courier", "Geniki Taxydromiki", "Speedex", "BOX NOW", "DHL", "UPS", "FedEx", "Other"];

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const regionName = (() => { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return { of: (c) => c }; } })();
const money = (c, cur) => new Intl.NumberFormat(undefined, { style: "currency", currency: (cur || "eur").toUpperCase() }).format((c || 0) / 100);
const when = (t) => new Date(t * 1000).toLocaleString([], { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

let ORDERS = [], next = null, filter = "todo", query = "";

function addressText(o) {
  const a = o.address || {};
  return [o.name, a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(" "), a.state, a.country ? regionName.of(a.country) : ""]
    .filter(Boolean).join("\n");
}

async function api(path, opts) {
  const r = await fetch(path, { credentials: "same-origin", ...opts });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { location.reload(); throw new Error("Signing in…"); } // Access will show its login
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}

async function load(more = false) {
  const msg = $("#msg");
  msg.className = "adm-msg"; msg.textContent = more ? "loading older orders…" : "loading orders…"; msg.hidden = false;
  try {
    const d = await api(`/api/admin/orders${more && next ? `?after=${encodeURIComponent(next)}` : ""}`);
    ORDERS = more ? ORDERS.concat(d.orders) : d.orders;
    next = d.next; $("#more").hidden = !d.hasMore;
    $("#who").textContent = d.you || "";
    render();
  } catch (e) {
    msg.className = "adm-msg err"; msg.textContent = e.message;
  }
}

function visible() {
  const q = query.trim().toLowerCase();
  return ORDERS.filter((o) => {
    if (filter === "todo" && (o.shippedAt || o.refunded)) return false;
    if (filter === "shipped" && !o.shippedAt) return false;
    if (!q) return true;
    return [o.ref, o.name, o.email, o.phone, addressText(o), ...o.items.map((i) => i.name)].join(" ").toLowerCase().includes(q);
  });
}

function render() {
  const todo = ORDERS.filter((o) => !o.shippedAt && !o.refunded);
  $("#nTodo").textContent = todo.length;
  $("#nShipped").textContent = ORDERS.filter((o) => o.shippedAt).length;
  $("#nAll").textContent = ORDERS.length;

  // quick stats (loaded orders only)
  const cur = ORDERS[0]?.currency || "eur";
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const month = ORDERS.filter((o) => o.created * 1000 >= monthStart && !o.refunded);
  const stats = $("#stats"); stats.replaceChildren();
  [["to ship", todo.length], ["orders this month", month.length], ["revenue this month", money(month.reduce((a, o) => a + o.total, 0), cur)]]
    .forEach(([l, v]) => { const d = el("div", null, l); d.prepend(el("b", null, v)); stats.append(d); });

  const list = visible();
  const box = $("#orders"); box.replaceChildren();
  const msg = $("#msg");
  if (!list.length) {
    msg.hidden = false; msg.className = "adm-msg";
    msg.textContent = ORDERS.length ? (filter === "todo" ? "nothing to ship. the room is quiet." : "no matching orders.") : "no orders yet.";
    return;
  }
  msg.hidden = true;
  list.forEach((o) => box.append(card(o)));
}

function card(o) {
  const c = el("article", "order" + (o.shippedAt ? " done" : ""));

  // ── col 1: what ──
  const c1 = el("div", "o-col");
  c1.append(el("div", "o-ref", `#${o.ref}`), el("div", "o-date", when(o.created)));
  c1.append(o.refunded ? el("span", "tag ref", "REFUNDED") : o.shippedAt ? el("span", "tag ok", "SHIPPED") : el("span", "tag todo", "TO SHIP"));
  const ul = el("ul", "o-items");
  o.items.forEach((i) => { const li = el("li"); li.append(el("span", null, `${i.qty} × ${i.name}`), el("span", null, money(i.amount, o.currency))); ul.append(li); });
  c1.append(ul);
  if (o.shippingCost != null) { const s = el("div", "o-date", `shipping ${money(o.shippingCost, o.currency)}`); c1.append(s); }
  const tot = el("div", "o-total"); tot.append(el("span", null, "total"), el("b", null, money(o.total, o.currency))); c1.append(tot);

  // ── col 2: where ──
  const c2 = el("div", "o-col");
  c2.append(el("div", "o-label", "SHIP TO"), el("div", "o-addr", addressText(o)));
  const contact = el("div", "o-contact");
  if (o.email) { const a = el("a", null, o.email); a.href = `mailto:${o.email}`; contact.append(a, el("br")); }
  if (o.phone) { const a = el("a", null, o.phone); a.href = `tel:${o.phone.replace(/[^\d+]/g, "")}`; contact.append(a); }
  c2.append(contact);
  const copy = el("button", "linkish", "copy address");
  copy.onclick = async () => { try { await navigator.clipboard.writeText(addressText(o) + (o.phone ? `\n${o.phone}` : "")); copy.textContent = "copied ✓"; setTimeout(() => (copy.textContent = "copy address"), 1500); } catch { copy.textContent = "couldn't copy"; } };
  c2.append(copy);

  // ── col 3: ship it ──
  const c3 = el("div", "o-col");
  c3.append(el("div", "o-label", o.shippedAt ? `SHIPPED ${when(o.shippedAt)}` : "SHIP IT"));
  const row = el("div", "row2");
  const carrier = el("select"); carrier.setAttribute("aria-label", "Carrier");
  CARRIERS.forEach((n) => { const op = el("option", null, n); op.value = n; carrier.append(op); });
  if (o.carrier) carrier.value = o.carrier;
  const track = el("input"); track.type = "text"; track.placeholder = "tracking number"; track.value = o.tracking; track.setAttribute("aria-label", "Tracking number");
  row.append(carrier); c3.append(row, track);

  const btn = el("button", "cta", o.shippedAt ? "UPDATE TRACKING" : "MARK SHIPPED");
  btn.disabled = o.refunded || !o.paymentIntent;
  btn.onclick = () => setShipped(o, true, track.value, carrier.value, btn);
  c3.append(btn);

  if (o.email && (o.shippedAt || track.value)) {
    const mail = el("a", "linkish", "email shipping update to customer");
    const update = () => {
      const t = track.value.trim();
      const body = `Hi ${o.name.split(" ")[0] || ""},\n\nYour martyrstudios order #${o.ref} has left the room.\n\n` +
        (t ? `Carrier: ${carrier.value}\nTracking: ${t}\n\n` : "") + `Thank you.\n— martyrstudios`;
      mail.href = `mailto:${o.email}?subject=${encodeURIComponent(`Your order #${o.ref} has shipped`)}&body=${encodeURIComponent(body)}`;
    };
    update(); track.addEventListener("input", update); carrier.addEventListener("change", update);
    c3.append(mail);
  }
  if (o.shippedAt) {
    const undo = el("button", "linkish", "mark as not shipped");
    undo.onclick = () => { if (confirmUndo()) setShipped(o, false, "", "", undo); };
    c3.append(undo);
  }

  c.append(c1, c2, c3);
  return c;
}

// no browser confirm() dialogs: second click within 3s confirms
let undoArmed = 0;
function confirmUndo() {
  if (Date.now() - undoArmed < 3000) return true;
  undoArmed = Date.now();
  const m = $("#msg"); m.hidden = false; m.className = "adm-msg err"; m.textContent = "click “mark as not shipped” again to confirm";
  setTimeout(() => { if (m.textContent.startsWith("click")) m.hidden = true; }, 3000);
  return false;
}

async function setShipped(o, shipped, tracking, carrier, btn) {
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "SAVING…";
  try {
    await api("/api/admin/ship", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentIntent: o.paymentIntent, shipped, tracking, carrier }),
    });
    o.shippedAt = shipped ? Math.floor(Date.now() / 1000) : null;
    o.tracking = shipped ? tracking : ""; o.carrier = shipped ? carrier : "";
    render();
  } catch (e) {
    btn.disabled = false; btn.textContent = label;
    const m = $("#msg"); m.hidden = false; m.className = "adm-msg err"; m.textContent = e.message;
  }
}

function exportCSV() {
  const rows = [["ref", "date", "name", "email", "phone", "address1", "address2", "postcode", "city", "state", "country", "items", "total", "status", "carrier", "tracking"]];
  visible().forEach((o) => {
    const a = o.address || {};
    rows.push([o.ref, new Date(o.created * 1000).toISOString(), o.name, o.email, o.phone, a.line1, a.line2, a.postal_code, a.city, a.state, a.country,
      o.items.map((i) => `${i.qty}x ${i.name}`).join("; "), (o.total / 100).toFixed(2), o.refunded ? "refunded" : o.shippedAt ? "shipped" : "to ship", o.carrier, o.tracking]);
  });
  // quote everything; neutralise spreadsheet formulas (=, +, -, @)
  const csv = rows.map((r) => r.map((v) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; }).join(",")).join("\r\n");
  const a = el("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `martyrstudios-orders-${filter}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
  filter = b.dataset.f;
  document.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
  render();
}));
$("#q").addEventListener("input", (e) => { query = e.target.value; render(); });
$("#refresh").onclick = () => load();
$("#more").onclick = () => load(true);
$("#csv").onclick = exportCSV;
load();
