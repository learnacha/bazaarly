import { useEffect, useMemo, useState } from 'react';
import { getCategories, getProducts } from '../api/api';
import { LABELS } from '../../shared/config';
import { formatPrice } from '../lib/format';
import ProductCard from '../components/ProductCard';

const SORTS = {
  featured: { label: 'Top rated', fn: (a, b) => b.rating - a.rating },
  low: { label: 'Price: low to high', fn: (a, b) => a.price - b.price },
  high: { label: 'Price: high to low', fn: (a, b) => b.price - a.price },
  name: { label: 'Name', fn: (a, b) => a.name.localeCompare(b.name) },
};

export default function Home() {
  const [products, setProducts] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState('featured');
  const [maxPrice, setMaxPrice] = useState(null);
  const [inStock, setInStock] = useState(false);

  useEffect(() => {
    Promise.all([getProducts(), getCategories()])
      .then(([p, c]) => {
        setProducts(p);
        setCategories(c);
      })
      .catch((err) => setError(err.message));
  }, []);

  const ceiling = useMemo(() => (products ? Math.ceil(Math.max(...products.map((p) => p.price), 1)) : 0), [products]);
  const limit = maxPrice ?? ceiling;

  const visible = useMemo(() => {
    if (!products) return [];
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => category === 'All' || p.category === category)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
      .filter((p) => p.price <= limit)
      .filter((p) => !inStock || p.stock > 0)
      .sort(SORTS[sort].fn);
  }, [products, query, category, limit, inStock, sort]);

  return (
    <>
      <section className="hero">
        <h1>Everything you need, delivered.</h1>
        <p>Free shipping on orders over $50 at {LABELS.appName}.</p>
      </section>

      <div className="toolbar">
        <input type="search" placeholder="Search products…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </select>
      </div>

      <div className="chips">
        {['All', ...categories].map((c) => (
          <button key={c} className={`chip ${c === category ? 'active' : ''}`} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>

      <div className="filters">
        <label>
          Up to {formatPrice(limit)}
          <input type="range" min="1" max={ceiling || 1} value={limit} onChange={(e) => setMaxPrice(Number(e.target.value))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} /> In stock only
        </label>
      </div>

      {error ? (
        <p className="alert">{error}</p>
      ) : !products ? (
        <p className="muted">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="empty">No products match your filters.</p>
      ) : (
        <div className="grid">
          {visible.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </>
  );
}
