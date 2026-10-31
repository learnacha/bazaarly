// Form rules shared by the browser (instant feedback) and the API (the real check).
export const SHIPPING_FIELDS = [
  { name: 'fullName', label: 'Full name', autoComplete: 'name' },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { name: 'phone', label: 'Phone', type: 'tel', autoComplete: 'tel' },
  { name: 'address', label: 'Street address', autoComplete: 'street-address' },
  { name: 'city', label: 'City', autoComplete: 'address-level2' },
  { name: 'postalCode', label: 'Postal code', autoComplete: 'postal-code' },
];

export const PAYMENT_METHODS = [
  { id: 'card', label: 'Credit / debit card (demo)' },
  { id: 'cod', label: 'Cash on delivery' },
];

export function validateShipping(input) {
  const form = input ?? {}; // a JSON body can send null, which a default parameter would not catch
  const errors = {};
  for (const f of SHIPPING_FIELDS) {
    const value = form[f.name];
    if (typeof value !== 'string' || !value.trim()) errors[f.name] = 'Required';
    else if (value.length > 200) errors[f.name] = 'Too long';
  }
  if (!errors.email && !/^\S+@\S+\.\S+$/.test(form.email)) errors.email = 'Enter a valid email';
  if (!errors.phone && !/^[\d\s+()-]{7,}$/.test(form.phone)) errors.phone = 'Enter a valid phone number';
  return errors;
}
