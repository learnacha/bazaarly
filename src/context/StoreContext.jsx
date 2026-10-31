import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { load, save } from '../api/storage';
import { MAX_QTY_PER_LINE } from '../../shared/config';
import { orderTotals } from '../../shared/pricing';

const StoreContext = createContext(null);
export const useStore = () => useContext(StoreContext);

// Cart lines hold a product snapshot, so they can go stale (price, stock). That's fine: they only
// drive the on-screen estimate. The server reprices and checks stock when the order is placed.
export function StoreProvider({ children }) {
  const [cart, setCart] = useState(() => load('cart', []));
  const [wishlist, setWishlist] = useState(() => load('wishlist', []));

  useEffect(() => save('cart', cart), [cart]);
  useEffect(() => save('wishlist', wishlist), [wishlist]);

  const addToCart = useCallback((product, qty = 1) => {
    setCart((lines) => {
      const found = lines.find((l) => l.product.id === product.id);
      const clamp = (n) => Math.max(1, Math.min(n, product.stock, MAX_QTY_PER_LINE));
      if (found) return lines.map((l) => (l.product.id === product.id ? { product, qty: clamp(l.qty + qty) } : l));
      return [...lines, { product, qty: clamp(qty) }];
    });
  }, []);

  const setQty = useCallback((id, qty) => {
    setCart((lines) => lines.flatMap((l) => {
      if (l.product.id !== id) return [l];
      if (qty < 1) return [];
      return [{ ...l, qty: Math.min(qty, l.product.stock, MAX_QTY_PER_LINE) }];
    }));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const toggleWish = useCallback((product) => {
    setWishlist((list) => (list.some((p) => p.id === product.id) ? list.filter((p) => p.id !== product.id) : [...list, product]));
  }, []);

  const value = useMemo(() => {
    const subtotal = cart.reduce((s, l) => s + l.product.price * l.qty, 0);
    return {
      cart, wishlist, addToCart, setQty, clearCart, toggleWish,
      count: cart.reduce((n, l) => n + l.qty, 0),
      totals: orderTotals(subtotal),
    };
  }, [cart, wishlist, addToCart, setQty, clearCart, toggleWish]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
