/**
 * Henter quantity + cost price for en liste DCS vare_nr (SKU'er)
 * via xmlVare endpointet.
 */
import fetch from "node-fetch";
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true
});

export async function pnaRequest(skus = []) {
  if (!Array.isArray(skus) || skus.length === 0) {
    throw new Error("pnaRequest: skus array er tomt");
  }

  const customer = process.env.DCS_CUSTOMER_NR;
  const key = process.env.DCS_API_KEY;

  if (!customer || !key) {
    throw new Error("DCS_CUSTOMER_NR eller DCS_API_KEY mangler i .env");
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<pnarequest>
  <customer_nr>${customer}</customer_nr>
  <password>${key}</password>
  ${skus.map(sku => `<item><vare_nr>${sku}</vare_nr></item>`).join("\n  ")}
</pnarequest>`;

  console.log("=== xmlVare REQUEST ===");
  console.log(xml);

  const res = await fetch("https://dcs.dk/xml/xmlVare/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ xml })
  });

  const text = await res.text();

  console.log("=== xmlVare RAW RESPONSE ===");
  console.log(text);

  if (!res.ok) {
    throw new Error(`DCS xmlVare HTTP ${res.status}: ${text}`);
  }

  const json = parser.parse(text);
  console.log("=== xmlVare PARSED JSON ===");
  console.dir(json, { depth: 10 });

  // Fejlformat fra dokumentationen:
  // <pnaresponse><errorTekst>...</errorTekst><code>...</code>...</pnaresponse>
  if (json?.pnaresponse?.errorTekst) {
    const msg = json.pnaresponse.errorTekst;
    const code = json.pnaresponse.code;
    throw new Error(`DCS xmlVare fejl: ${msg} (code ${code})`);
  }

  const items = json?.pnaresponse?.item;
  if (!items) {
    throw new Error("xmlVare gav ingen item-data (ingen <item> i pnaresponse)");
  }

  const list = Array.isArray(items) ? items : [items];

  return list.map(i => ({
    sku: String(i.vare_nr),
    qty: Number(i.quantity ?? 0),
    cost: Number(i.price ?? 0)
  }));
}

