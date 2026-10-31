// Order maths shared by the browser (estimate) and the server (the real charge).
import { FREE_SHIPPING_OVER, SHIPPING_FEE, TAX_RATE } from './config.js';

const round2 = (n) => Math.round(n * 100) / 100;

export function orderTotals(subtotal) {
  const sub = round2(subtotal);
  const shipping = sub === 0 || sub >= FREE_SHIPPING_OVER ? 0 : SHIPPING_FEE;
  const tax = round2(sub * TAX_RATE);
  return { subtotal: sub, shipping, tax, total: round2(sub + shipping + tax) };
}
