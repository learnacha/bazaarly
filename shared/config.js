// The app's vocabulary and business rules, in one place. Used by both the browser and the server.
export const LABELS = {
  appName: 'Bazaarly',
  appEmoji: '🛍️',
};

export const CURRENCY = 'USD';
export const TAX_RATE = 0.08;
export const SHIPPING_FEE = 5.99;
export const FREE_SHIPPING_OVER = 50;   // subtotal at or above this ships free
export const MAX_QTY_PER_LINE = 20;
export const MAX_LINES = 50;
export const MAX_ACTIVE_ORDERS_PER_USER = 25; // accounts are free, so this limits hoarding stock, not abuse
