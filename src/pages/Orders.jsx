import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cancelOrder, getOrders } from '../api/api';
import { formatDate, formatPrice } from '../lib/format';

export default function Orders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const justOrdered = useLocation().state?.justOrdered;

  useEffect(() => {
    getOrders().then(setOrders).catch((err) => setError(err.message));
  }, []);

  const cancel = async (o) => {
    if (!window.confirm(`Cancel order ${o.id}?`)) return;
    setBusyId(o.id);
    setError(null);
    try {
      const updated = await cancelOrder(o.id);
      setOrders((list) => list.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (!orders) return error ? <p className="alert">{error}</p> : <p className="muted">Loading…</p>;

  return (
    <>
      {justOrdered && <div className="banner">🎉 Thank you! Your order <strong>{justOrdered}</strong> has been placed.</div>}
      <h1>Your orders</h1>
      {error && <p className="alert">{error}</p>}
      {orders.length === 0 ? (
        <div className="empty">
          <p>You haven't placed any orders yet.</p>
          <Link to="/" className="btn">Start shopping</Link>
        </div>
      ) : (
        orders.map((o) => (
          <div key={o.id} className={`panel order ${o.id === justOrdered ? 'highlight' : ''} ${o.status === 'cancelled' ? 'cancelled' : ''}`}>
            <div className="order-head">
              <div>
                <strong>{o.id}</strong>
                <div className="muted small">{formatDate(o.createdAt)}</div>
              </div>
              <span className={`status ${o.status === 'cancelled' ? 'cancelled' : 'confirmed'}`}>
                {o.status === 'cancelled' ? 'Cancelled' : 'Placed'}
              </span>
              <strong>{formatPrice(o.total)}</strong>
            </div>
            {o.items.map((i) => (
              <div key={i.productId} className="mini-line">
                <span>{i.emoji} {i.name} × {i.qty}</span>
                <span>{formatPrice(i.price * i.qty)}</span>
              </div>
            ))}
            <div className="muted small">Ship to {o.shipping.fullName}, {o.shipping.address}, {o.shipping.city} {o.shipping.postalCode}</div>
            {o.status === 'placed' && (
              <button className="link-btn danger" disabled={busyId === o.id} onClick={() => cancel(o)}>
                {busyId === o.id ? 'Cancelling…' : 'Cancel order'}
              </button>
            )}
          </div>
        ))
      )}
    </>
  );
}
