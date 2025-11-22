
// lib/price.js

/**
 * Beregn salgspris for elektronik ud fra kostpris.
 * Markup:
 *  - < 500  -> 1.6
 *  - < 1000 -> 1.5
 *  - < 2000 -> 1.4
 *  - >=2000 -> 1.35
 * Runder op til nærmeste 10 kr.
 */
export function calcElectronicsPrice(cost) {
  const c = Number(cost);
  if (!Number.isFinite(c) || c <= 0) return null;

  let factor;
  if (c < 500) {
    factor = 1.6;
  } else if (c < 1000) {
    factor = 1.5;
  } else if (c < 2000) {
    factor = 1.4;
  } else {
    factor = 1.35;
  }

  let price = c * factor;

  // rund op til nærmeste 10 kr.
  price = Math.ceil(price / 10) * 10;

  return price;
}
