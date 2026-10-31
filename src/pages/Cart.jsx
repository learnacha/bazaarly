import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { formatPrice } from '../lib/format';
import Summary from '../components/Summary';

export default function Cart() {
  const { cart, setQty, totals, clearCart } = useStore();
  const navigate = useNavigate();

  if (cart.length === 0) {
    return (
      <div className="empty">
        <h2>Your cart is empty</h2>
        <Link to="/" className="btn">Start shopping</Link>
      </div>
    );
  }

  return (
    <>
      <h1>Your cart</h1>
      <div className="two-col">
        <div>
          {cart.map(({ product, qty }) => (
            <div key={product.id} className="line">
              <div className="thumb small">{product.emoji}</div>
              <div className="line-info">
                <Link to={`/product/${product.id}`}>{product.name}</Link>
                <span className="muted small">{formatPrice(product.price)} each</span>
              </div>
              <div className="qty">
                <button onClick={() => setQty(product.id, qty - 1)} aria-label="Decrease">−</button>
                <span>{qty}</span>
                <button onClick={() => setQty(product.id, qty + 1)} disabled={qty >= Math.min(product.stock, 20)} aria-label="Increase">+</button>
              </div>
              <strong className="line-total">{formatPrice(product.price * qty)}</strong>
              <button className="link-btn danger" onClick={() => setQty(product.id, 0)}>Remove</button>
            </div>
          ))}
          <button className="link-btn" onClick={clearCart}>Clear cart</button>
        </div>
        <aside className="panel">
          <h3>Order summary</h3>
          <Summary totals={totals} />
          <button className="btn block" onClick={() => navigate('/checkout')}>Checkout</button>
        </aside>
      </div>
    </>
  );
}
