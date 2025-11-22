import express from "express";
import "dotenv/config";
import { pnaRequest } from "./lib/dcs.js";
import {
  findVariantBySKU,
  setDcsMetafieldsForVariant,
  setInventory,
  updateVariantPrice
} from "./lib/shopify.js";
import { calcElectronicsPrice } from "./lib/price.js";
import { getAllDcsVariants } from "./lib/products.js";

const app = express();
const port = process.env.PORT || 3000;

app.get("/health", (_req, res) => {
  res.send("DCS Bridge OK");
});

/**
 * /sync-test
 * Tester sync for EN enkelt SKU.
 * Bruger xmlVare -> opdaterer metafields, lager og pris.
 */
app.get("/sync-test", async (_req, res) => {
  try {
    // Sæt en DCS vare_nr her som du VED findes i DCS og som er sat som SKU i Shopify:
    const skus = [
      "1002484228"
    ];

    const dcsItems = await pnaRequest(skus);
    console.log("DCS items:", dcsItems);

    const results = [];

    for (const item of dcsItems) {
      const { sku, qty, cost } = item;

      const variant = await findVariantBySKU(sku);
      if (!variant) {
        results.push({ sku, status: "no-variant-in-shopify" });
        continue;
      }

      // Metafields (cost, qty, last_sync_at)
      await setDcsMetafieldsForVariant(variant.id, { cost, qty });

      // Lager
      await setInventory(variant.inventoryItem.id, qty);

      // Pris
      const newPrice = calcElectronicsPrice(cost);
      let priceUpdated = false;
      let oldPrice = null;

      if (newPrice != null) {
        oldPrice = Number(variant.price);

        if (!Number.isFinite(oldPrice) || Math.abs(oldPrice - newPrice) >= 1) {
          await updateVariantPrice(variant.id, variant.product.id, newPrice);
          priceUpdated = true;
          console.log(
            `Pris opdateret for ${sku}: ${oldPrice || "?"} -> ${newPrice}`
          );
        } else {
          console.log(
            `Pris uændret for ${sku}: ${oldPrice} (beregnet ${newPrice})`
          );
        }
      } else {
        console.warn(`Kunne ikke beregne salgspris for ${sku} (cost=${cost})`);
      }

      results.push({
        sku,
        status: "ok",
        qty,
        cost,
        oldPrice,
        newPrice,
        priceUpdated
      });
    }

    res.json({ ok: true, results });
  } catch (err) {
    console.error("Fejl i /sync-test:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * /sync-all
 * 1) Henter ALLE varianter i Shopify med SKU
 * 2) Henter qty + cost for ALLE disse SKU'er fra DCS via xmlVare
 * 3) Opdaterer metafields, lager og salgspris for hver variant
 */
app.get("/sync-all", async (_req, res) => {
  try {
    // 1) Hent alle varianter med SKU i Shopify
    const variants = await getAllDcsVariants();


    if (!variants.length) {
      return res.json({ ok: true, count: 0, results: [] });
    }

    const skus = variants.map(v => v.sku);
    const uniqueSkus = [...new Set(skus)];

    console.log(`Syncer ${uniqueSkus.length} DCS SKU'er...`);

    // 2) Hent DCS data for alle SKU'er på én gang
    const dcsItems = await pnaRequest(uniqueSkus);

    const dcsMap = {};
    dcsItems.forEach(i => {
      dcsMap[i.sku] = i;
    });

    const results = [];

    // 3) Loop over alle varianter og sync én for én
    for (const v of variants) {
      const info = dcsMap[v.sku];

      if (!info) {
        results.push({
          sku: v.sku,
          status: "missing_in_dcs"
        });
        continue;
      }

      const cost = info.cost;
      const qty = info.qty;

      // Metafields
      await setDcsMetafieldsForVariant(v.variantId, { cost, qty });

      // Lager
      await setInventory(v.inventoryItemId, qty);

      // Pris
      const newPrice = calcElectronicsPrice(cost);
      let updated = false;
      const oldPrice = Number(v.price);

      if (newPrice !== null && (!Number.isFinite(oldPrice) || Math.abs(newPrice - oldPrice) >= 1)) {
        await updateVariantPrice(v.variantId, v.productId, newPrice);
        updated = true;
      }

      results.push({
        sku: v.sku,
        qty,
        cost,
        oldPrice,
        newPrice,
        priceUpdated: updated
      });
    }

    res.json({ ok: true, count: results.length, results });
  } catch (err) {
    console.error("Fejl i /sync-all:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(port, () => {
  console.log(`DCS Bridge lytter på port ${port}`);
});
