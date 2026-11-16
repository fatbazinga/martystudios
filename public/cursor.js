"use strict";
// ─────────────────────────────────────────────────────────────
//  BLOOD CURSOR: a cross cursor that sprays blood as it moves
//  and bursts when you click. Drops fall, splat, drip, then fade.
//
//  To use your own PNGs:
//   • CURSOR: replace /img/cursor-cross.png (32×32 works best,
//     max 128×128). HOTSPOT is the pixel that does the clicking.
//   • SPLATS: put blood-splat PNGs in /img/blood/ and list them
//     in SPLAT_SPRITES. They'll be used for landed drops instead
//     of the drawn blobs.
// ─────────────────────────────────────────────────────────────
const BLOOD = {
  CURSOR: "/img/cursor-cross.png",
  HOTSPOT: [16, 16],
  SPLAT_SPRITES: [],          // e.g. ["/img/blood/splat1.png", "/img/blood/splat2.png"]
  COLORS: ["#5e0009", "#7a000f", "#8f0414", "#a5081c"],
  INTENSITY: 1,               // 0.5 = calmer, 2 = horror movie
  STAIN_LIFE: 5000,           // ms a stain stays before fading out
  MAX_DROPS: 260,
  MAX_STAINS: 220,
};

(function () {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(pointer: fine)").matches;

  // cross cursor (works even when blood is off)
  const [hx, hy] = BLOOD.HOTSPOT;
  const style = document.createElement("style");
  style.textContent =
    `html, html * { cursor: url("${BLOOD.CURSOR}") ${hx} ${hy}, crosshair !important; }` +
    `input[type=text], input[type=search], input[type=email], textarea { cursor: text !important; }`;
  document.head.append(style);
  if (reduce) return;

  const cv = document.createElement("canvas");
  cv.setAttribute("aria-hidden", "true");
  cv.className = "blood-layer";
  document.body.append(cv);
  const ctx = cv.getContext("2d");
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize();
  addEventListener("resize", resize);

  const sprites = BLOOD.SPLAT_SPRITES.map((src) => { const i = new Image(); i.src = src; return i; });
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  const drops = [];   // flying droplets
  const stains = [];  // landed splats (with drips)

  function spawnDrop(x, y, vx, vy, r) {
    if (drops.length >= BLOOD.MAX_DROPS) drops.shift();
    drops.push({
      x, y, px: x, py: y, vx, vy, r,
      color: pick(BLOOD.COLORS),
      floor: y + rand(30, 260),   // where it lands on the "page"
    });
  }

  function splat(x, y, r, color) {
    if (stains.length >= BLOOD.MAX_STAINS) stains.shift();
    const sats = [];
    const n = (rand(1, 5) * (r / 3)) | 0;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), d = rand(r * 1.2, r * 3.2);
      sats.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: rand(0.6, r * 0.45) });
    }
    stains.push({
      x, y, r, color, sats, born: performance.now(),
      sprite: sprites.length ? pick(sprites) : null, rot: rand(0, Math.PI * 2),
      drip: r > 2.4 && Math.random() < 0.55 ? { len: 0, max: rand(20, 140), speed: rand(0.15, 0.6), w: r * rand(0.35, 0.6) } : null,
    });
  }

  // ── input ──
  let lx = null, ly = null, lt = 0, hovering = false;
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" && !finePointer) return;
    const now = performance.now();
    if (lx === null) { lx = e.clientX; ly = e.clientY; lt = now; return; }
    const dx = e.clientX - lx, dy = e.clientY - ly, dt = Math.max(16, now - lt);
    const speed = Math.hypot(dx, dy) / dt;              // px per ms
    let n = Math.min(5, speed * 1.6 * BLOOD.INTENSITY);
    if (hovering) n += 0.4 * BLOOD.INTENSITY;           // links/buttons bleed more
    for (; n > 0; n--) {
      if (n < 1 && Math.random() > n) break;
      spawnDrop(
        e.clientX + rand(-2, 2), e.clientY + rand(-2, 2),
        -dx / dt * rand(2, 6) + rand(-1.2, 1.2),        // flung backwards, like a whip
        -dy / dt * rand(2, 6) + rand(-2.5, 0.5),
        rand(0.8, 2.6) + speed * 0.6
      );
    }
    lx = e.clientX; ly = e.clientY; lt = now;
    wake();
  }, { passive: true });

  addEventListener("pointerover", (e) => { hovering = !!e.target.closest?.("a, button, label, [role=button]"); }, { passive: true });

  addEventListener("pointerdown", (e) => {
    const n = (26 + Math.random() * 18) * BLOOD.INTENSITY;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(1, 7);
      spawnDrop(e.clientX, e.clientY, Math.cos(a) * s, Math.sin(a) * s - rand(1, 4), rand(0.8, 3.4));
    }
    splat(e.clientX, e.clientY, rand(5, 9), pick(BLOOD.COLORS));
    wake();
  }, { passive: true });

  // ── render loop (sleeps when nothing is moving) ──
  let running = false;
  function wake() { if (!running) { running = true; requestAnimationFrame(frame); } }

  function frame(now) {
    ctx.clearRect(0, 0, W, H);

    // stains
    for (let i = stains.length - 1; i >= 0; i--) {
      const s = stains[i], age = now - s.born;
      const life = BLOOD.STAIN_LIFE;
      if (age > life) { stains.splice(i, 1); continue; }
      const alpha = age < life * 0.6 ? 1 : 1 - (age - life * 0.6) / (life * 0.4);
      ctx.globalAlpha = alpha * 0.92;
      ctx.fillStyle = s.color;

      if (s.drip && s.drip.len < s.drip.max) { s.drip.len += s.drip.speed; s.drip.speed *= 0.995; }
      if (s.drip) {
        const d = s.drip;
        ctx.beginPath();
        ctx.moveTo(s.x - d.w, s.y);
        ctx.quadraticCurveTo(s.x - d.w * 0.6, s.y + d.len * 0.7, s.x - d.w * 0.5, s.y + d.len);
        ctx.lineTo(s.x + d.w * 0.5, s.y + d.len);
        ctx.quadraticCurveTo(s.x + d.w * 0.6, s.y + d.len * 0.7, s.x + d.w, s.y);
        ctx.fill();
        ctx.beginPath(); ctx.arc(s.x, s.y + d.len, d.w * 0.9, 0, Math.PI * 2); ctx.fill(); // bead at the end
      }

      if (s.sprite && s.sprite.complete && s.sprite.naturalWidth) {
        const size = s.r * 8;
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot);
        ctx.drawImage(s.sprite, -size / 2, -size / 2, size, size);
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        for (const t of s.sats) { ctx.beginPath(); ctx.arc(s.x + t.dx, s.y + t.dy, t.r, 0, Math.PI * 2); ctx.fill(); }
        // wet highlight
        ctx.globalAlpha = alpha * 0.25; ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(s.x - s.r * 0.35, s.y - s.r * 0.35, s.r * 0.28, 0, Math.PI * 2); ctx.fill();
      }
    }

    // flying drops
    ctx.globalAlpha = 1;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.px = d.x; d.py = d.y;
      d.vy += 0.32;            // gravity
      d.vx *= 0.985; d.vy *= 0.995;
      d.x += d.vx; d.y += d.vy;
      if ((d.vy > 0 && d.y >= d.floor) || d.y > H + 20) {
        drops.splice(i, 1);
        if (d.y <= H + 20) splat(d.x, d.y, d.r * rand(1, 1.6), d.color);
        continue;
      }
      // streak from previous position → looks like a flying droplet
      ctx.strokeStyle = d.color; ctx.lineWidth = d.r * 2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(d.px, d.py); ctx.lineTo(d.x, d.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (drops.length || stains.length) requestAnimationFrame(frame);
    else { running = false; ctx.clearRect(0, 0, W, H); }
  }
})();
