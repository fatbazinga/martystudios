// Verifies that a request was authenticated by Cloudflare Access
// (the email-code login in front of /admin). Fails CLOSED: if anything
// is missing or wrong, the request is rejected.
//
// Needs these environment variables (Cloudflare Pages → Settings → Variables):
//   ACCESS_TEAM_DOMAIN  e.g. "martyrstudios.cloudflareaccess.com"
//   ACCESS_AUD          the "Application Audience (AUD) Tag" of your Access app
//   ADMIN_EMAILS        comma-separated list of emails allowed in, e.g. "you@gmail.com"

let certCache = { at: 0, keys: [] };

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + ((4 - (s.length % 4)) % 4), "=")), (c) => c.charCodeAt(0));
const decodeJSON = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));

async function getKeys(team) {
  if (Date.now() - certCache.at < 3600_000 && certCache.keys.length) return certCache.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error("certs");
  const { keys } = await r.json();
  certCache = { at: Date.now(), keys };
  return keys;
}

export async function requireAdmin(request, env) {
  const team = env.ACCESS_TEAM_DOMAIN, aud = env.ACCESS_AUD;
  const allowed = (env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!team || !aud || !allowed.length) return { ok: false, status: 503, error: "Admin is not configured yet (see README, step 7)." };

  let token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) {
    const m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
    token = m && m[1];
  }
  if (!token) return { ok: false, status: 401, error: "Not signed in." };

  try {
    const [h, p, sig] = token.split(".");
    const header = decodeJSON(h), payload = decodeJSON(p);
    if (header.alg !== "RS256") throw 0;
    const jwk = (await getKeys(team)).find((k) => k.kid === header.kid);
    if (!jwk) throw 0;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(sig), new TextEncoder().encode(`${h}.${p}`));
    const now = Math.floor(Date.now() / 1000);
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!valid || payload.exp < now || (payload.nbf && payload.nbf > now + 60) || !auds.includes(aud) || payload.iss !== `https://${team}`) throw 0;
    const email = String(payload.email || "").toLowerCase();
    if (!allowed.includes(email)) return { ok: false, status: 403, error: "This account is not allowed." };
    return { ok: true, email };
  } catch {
    return { ok: false, status: 401, error: "Not signed in." };
  }
}

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
