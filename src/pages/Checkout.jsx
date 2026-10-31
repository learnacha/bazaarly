import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { createOrder } from '../api/api';
import { load, save } from '../api/storage';
import { useSession } from '../api/auth';
import { useStore } from '../context/StoreContext';
import { PAYMENT_METHODS, SHIPPING_FIELDS, validateShipping } from '../../shared/validation';
import { formatPrice } from '../lib/format';
import Summary from '../components/Summary';

export default function Checkout() {
  const { cart, totals, clearCart } = useStore();
  const { data: session } = useSession();
  const navigate = useNavigate();
  // Remember the last address to make repeat orders faster; the account fills the gaps.
  const [form, setForm] = useState(() => ({
    fullName: session?.user.name ?? '',
    email: session?.user.email ?? '',
    ...load('shipping', {}),
  }));
  const [payment, setPayment] = useState('card');
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Not while submitting: clearing the cart on success would otherwise bounce us to /cart
  // before the navigation to /orders lands.
  if (cart.length === 0 && !submitting) return <Navigate to="/cart" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    const errs = validateShipping(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    save('shipping', form);
    try {
      // Only ids and quantities go to the server; it sets the prices.
      const order = await createOrder({
        items: cart.map((l) => ({ id: l.product.id, qty: l.qty })),
        shipping: form,
        payment,
      });
      navigate('/orders', { state: { justOrdered: order.id }, replace: true });
      clearCart();
    } catch (err) {
      setErrors(err.details ?? {});
      setSubmitError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <>
      <h1>Checkout</h1>
      <form className="two-col" onSubmit={handleSubmit} noValidate>
        <div className="panel">
          <h3>Shipping details</h3>
          <div className="form-grid">
            {SHIPPING_FIELDS.map((f) => (
              <label key={f.name} className={errors[f.name] ? 'invalid' : ''}>
                {f.label}
                <input
                  type={f.type ?? 'text'}
                  autoComplete={f.autoComplete}
                  value={form[f.name] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                />
                {errors[f.name] && <span className="error">{errors[f.name]}</span>}
              </label>
            ))}
          </div>
          <h3>Payment</h3>
          {PAYMENT_METHODS.map((m) => (
            <label key={m.id} className="check">
              <input type="radio" name="payment" checked={payment === m.id} onChange={() => setPayment(m.id)} /> {m.label}
            </label>
          ))}
          <p className="muted small">This is a demo. No real payment is taken and no card details are collected.</p>
        </div>
        <aside className="panel">
          <h3>Your order</h3>
          {cart.map(({ product, qty }) => (
            <div key={product.id} className="mini-line">
              <span>{product.emoji} {product.name} × {qty}</span>
              <span>{formatPrice(product.price * qty)}</span>
            </div>
          ))}
          <Summary totals={totals} />
          {submitError && <p className="alert">{submitError} <Link to="/cart">Review cart</Link></p>}
          <button type="submit" className="btn block" disabled={submitting}>
            {submitting ? 'Placing order…' : `Place order · ${formatPrice(totals.total)}`}
          </button>
        </aside>
      </form>
    </>
  );
}
