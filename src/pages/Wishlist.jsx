import { Link } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import ProductCard from '../components/ProductCard';

// Wishlist holds product snapshots in localStorage (not per account), so stock shown may be stale.
export default function Wishlist() {
  const { wishlist } = useStore();
  return (
    <>
      <h1>Wishlist</h1>
      {wishlist.length === 0 ? (
        <div className="empty">
          <p>Nothing saved yet.</p>
          <Link to="/" className="btn">Browse products</Link>
        </div>
      ) : (
        <div className="grid">{wishlist.map((p) => <ProductCard key={p.id} product={p} />)}</div>
      )}
    </>
  );
}
