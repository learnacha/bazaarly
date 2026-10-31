import { CURRENCY } from '../../shared/config';

export const formatPrice = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY }).format(n);

export const formatDate = (iso) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
