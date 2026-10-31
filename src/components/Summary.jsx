import { FREE_SHIPPING_OVER, TAX_RATE } from '../../shared/config';
import { formatPrice } from '../lib/format';

export default function Summary({ totals }) {
  return (
    <>
      <dl className="summary">
        <dt>Subtotal</dt><dd>{formatPrice(totals.subtotal)}</dd>
        <dt>Shipping</dt><dd>{totals.shipping === 0 ? 'Free' : formatPrice(totals.shipping)}</dd>
        <dt>Tax ({Math.round(TAX_RATE * 100)}%)</dt><dd>{formatPrice(totals.tax)}</dd>
        <dt className="total">Total</dt><dd className="total">{formatPrice(totals.total)}</dd>
      </dl>
      {totals.shipping > 0 && (
        <p className="note">Add {formatPrice(FREE_SHIPPING_OVER - totals.subtotal)} more for free shipping.</p>
      )}
    </>
  );
}
