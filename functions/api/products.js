import { CURRENCY, SHIPPING } from "../../shared/config.js";
import { loadCatalog } from "../../shared/store.js";

export async function onRequestGet({ env }) {
  const products = await loadCatalog(env.DB);
  return new Response(
    JSON.stringify({ currency: CURRENCY, shipping: { amount: SHIPPING.amount, freeOver: SHIPPING.freeOver }, products }),
    { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=15" } }
  );
}
