import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getProduct } from '../api/api';
import { formatPrice } from '../lib/format';
import { useStore } from '../context/StoreContext';

export default function ProductDetail() {
  const { id } = useParams();
  const { addToCart, toggleWish, wishlist } = useStore();
  const [product, setProduct] = useState(undefined); // undefined = loading, null = not found
  const [error, setError] = useState(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let off = false;
    setProduct(undefined);
    setError(null);
    getProduct(id).then((p) => !off && setProduct(p)).catch((err) => !off && setError(err.message));
    return () => { off = true; };
  }, [id]);

  if (error) return <p className="alert">{error}</p>;
  if (product === undefined) return <p className="muted">Loading…</p>;
  if (product === null) return <div className="empty"><h2>Product not found</h2><Link to="/" className="btn">Back to shop</Link></div>;

  const liked = wishlist.some((p) => p.id === product.id);
  const max = Math.min(product.stock, 20);

  return (
    <>
      <Link to="/" className="link-btn">← Back to shop</Link>
      <div className="detail-grid">
        <div className="thumb large">{product.emoji}</div>
        <div className="detail">
          <span className="muted small">{product.category}</span>
          <h1>{product.name}</h1>
          <span className="rating">★ {product.rating.toFixed(1)}</span>
          <div className="price big">{formatPrice(product.price)}</div>
          <p>{product.description}</p>
          <p className={product.stock === 0 ? 'danger' : product.stock <= 5 ? 'danger' : 'success'}>
            {product.stock === 0 ? 'Out of stock' : product.stock <= 5 ? `Only ${product.stock} left` : 'In stock'}
          </p>
          {product.stock > 0 && (
            <div className="row">
              <div className="qty">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}>−</button>
                <span>{qty}</span>
                <button onClick={() => setQty((q) => Math.min(max, q + 1))} disabled={qty >= max}>+</button>
              </div>
              <button className="btn" onClick={() => { addToCart(product, qty); setAdded(true); }}>Add to cart</button>
              <button className="btn secondary" style={{ marginTop: 0 }} onClick={() => toggleWish(product)}>
                {liked ? '♥ Saved' : '♡ Save'}
              </button>
            </div>
          )}
          {added && <p className="note">Added to your cart. <Link to="/cart">View cart</Link></p>}
        </div>
      </div>
    </>
  );
}
