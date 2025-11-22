// lib/products.js
import { gql } from "./shopify.js";

/**
 * Henter ALLE varianter med SKU, hvor produktets leverandør (vendor) = "DCS".
 * (Du skal sætte "DCS" som leverandør på alle DCS-produkter i Shopify.)
 */
export async function getAllDcsVariants() {
  let variants = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const query = `
      query($cursor: String) {
        productVariants(first: 250, after: $cursor) {
          pageInfo {
            hasNextPage
          }
          edges {
            cursor
            node {
              id
              sku
              price
              inventoryItem { id }
              product {
                id
                title
                vendor
                productType
              }
            }
          }
        }
      }
    `;

    const data = await gql(query, { cursor });
    const edges = data.productVariants.edges;

    for (const edge of edges) {
      const v = edge.node;
      const p = v.product;

      // Filtrer:
      // 1) kun varianter med SKU
      // 2) kun produkter hvor vendor = "DCS"
      // 3) SKU skal se ud som et DCS-nummer (kun tal)
      if (
        v.sku &&
        typeof v.sku === "string" &&
        /^\d+$/.test(v.sku) &&
        p.vendor === "DCS"
      ) {
        variants.push({
          variantId: v.id,
          productId: p.id,
          inventoryItemId: v.inventoryItem.id,
          sku: v.sku,
          price: Number(v.price),
          title: p.title
        });
      }
    }

    hasNext = data.productVariants.pageInfo.hasNextPage;
    cursor = hasNext ? edges[edges.length - 1].cursor : null;
  }

  return variants;
}
