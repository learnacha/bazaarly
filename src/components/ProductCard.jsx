import { Link } from 'react-router-dom';
import { formatPrice } from '../lib/format';
import { useStore } from '../context/StoreContext';

export default function ProductCard({ product }) {
  const { addToCart, toggleWish, wishlist } = useStore();
  const liked = wishlist.some((p) => p.id === product.id);
  return (
    <div className="card">
      <button
        className={`heart ${liked ? 'liked' : ''}`}
        aria-label={liked ? 'Remove from wishlist' : 'Add to wishlist'}
        onClick={() => toggleWish(product)}
      >
        {liked ? '♥' : '♡'}
      </button>
      <Link to={`/product/${product.id}`} className="card-link">
        <div className="thumb">{product.emoji}</div>
        <div className="card-body">
          <span className="muted small">{product.category}</span>
          <h3>{product.name}</h3>
          <span className="rating">★ {product.rating.toFixed(1)}</span>
          <div className="price">{formatPrice(product.price)}</div>
          {product.stock === 0 && <span className="danger small">Out of stock</span>}
          {product.stock > 0 && product.stock <= 5 && <span className="danger small">Only {product.stock} left</span>}
        </div>
      </Link>
      <button className="btn" disabled={product.stock === 0} onClick={() => addToCart(product)}>
        {product.stock === 0 ? 'Sold out' : 'Add to cart'}
      </button>
    </div>
  );
}
