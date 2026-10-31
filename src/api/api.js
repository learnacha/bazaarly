// All server calls go through here. The API lives on the same origin under /api,
// so no base URL or CORS setup is needed. The session cookie from sign-in is sent automatically;
// see src/api/auth.js for sign-in/up/out.
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.details);
  return data;
}

export const getCategories = () => request('/categories');
export const getProducts = () => request('/products');
export const getOrders = () => request('/orders');

export async function getProduct(id) {
  try {
    return await request(`/products/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

// Only ids and quantities are sent; the server reprices from its own data and checks stock.
export const createOrder = ({ items, shipping, payment }) =>
  request('/orders', { method: 'POST', body: { items, shipping, payment } });

export const cancelOrder = (id) => request(`/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
