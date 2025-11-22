
// lib/shopify.js
import fetch from "node-fetch";

const SHOP = process.env.SHOP;
const TOKEN = process.env.SHOP_TOKEN;
const API_VERSION = process.env.SHOP_API_VERSION || "2025-01";
const LOCATION_GID = process.env.LOCATION_ID;

if (!SHOP || !TOKEN || !LOCATION_GID) {
  console.warn("SHOP / SHOP_TOKEN / LOCATION_ID mangler i .env – fix det før produktion");
}

const GRAPHQL_URL = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;
const REST_BASE = `https://${SHOP}/admin/api/${API_VERSION}`;

const locationIdNumeric = LOCATION_GID ? LOCATION_GID.split("/").pop() : null;

async function shopifyFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "X-Shopify-Access-Token": TOKEN,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Shopify returned non-JSON: ${text}`);
  }
  if (!res.ok) {
    throw new Error(`Shopify HTTP ${res.status}: ${text}`);
  }
  return json;
}

export async function gql(query, variables = {}) {
  const body = JSON.stringify({ query, variables });
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": TOKEN,
      "Content-Type": "application/json"
    },
    body
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`GraphQL gav ikke JSON: ${text}`);
  }
  if (json.errors) {
    console.error("GraphQL errors:", json.errors);
    throw new Error("Shopify GraphQL fejl – se log");
  }
  return json.data;
}

/**
 * Find første variant med given SKU.
 */
export async function findVariantBySKU(sku) {
  const q = `
    query($q: String!) {
      productVariants(first: 1, query: $q) {
        nodes {
          id
          sku
          price
          inventoryItem {
            id
          }
          product {
            id
            title
            productType
          }
        }
      }
    }
  `;
  const data = await gql(q, { q: `sku:${sku}` });
  return data.productVariants.nodes[0] || null;
}



/**
 * Sætter DCS-metafields på en variant.
 */
export async function setDcsMetafieldsForVariant(variantId, { cost, qty }) {
  const now = new Date().toISOString();
  const metafields = [];

  if (cost != null) {
    metafields.push({
      ownerId: variantId,
      namespace: "dcs",
      key: "cost_dkk",
      type: "number_decimal",
      value: String(cost)
    });
  }
  if (qty != null) {
    metafields.push({
      ownerId: variantId,
      namespace: "dcs",
      key: "qty",
      type: "number_integer",
      value: String(qty)
    });
  }
  metafields.push({
    ownerId: variantId,
    namespace: "dcs",
    key: "last_sync_at",
    type: "date_time",
    value: now
  });

  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await gql(mutation, { metafields });
  const errs = data.metafieldsSet.userErrors;
  if (errs && errs.length) {
    console.error("metafieldsSet errors:", errs);
    throw new Error("Kunne ikke sætte metafields");
  }
}

/**
 * Sæt lager absolut via REST: inventory_levels/set
 */
export async function setInventory( inventoryItemId, available ) {
  if (!locationIdNumeric) {
    throw new Error("LOCATION_ID (gid) mangler eller er ugyldig");
  }

  const payload = {
    location_id: Number(locationIdNumeric),
    inventory_item_id: inventoryItemId.split("/").pop(), // GraphQL gid → numeric ID
    available: Number(available)
  };

  const json = await shopifyFetch(`${REST_BASE}/inventory_levels/set.json`, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return json;
}

export async function updateVariantPrice(variantId, productId, newPrice) {
  const mutation = `
    mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants, allowPartialUpdates: true) {
        productVariants {
          id
          price
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    productId,
    variants: [
      {
        id: variantId,
        price: String(newPrice)
      }
    ]
  };

  const data = await gql(mutation, variables);
  const payload = data.productVariantsBulkUpdate;
  const errors = payload.userErrors;

  if (errors && errors.length) {
    console.error("updateVariantPrice userErrors:", errors);
    throw new Error("Kunne ikke opdatere variantpris (productVariantsBulkUpdate)");
  }

  return payload.productVariants?.[0] || null;
}

