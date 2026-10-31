import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LABELS } from '../../shared/config';
import { signOut, useSession } from '../api/auth';
import { useStore } from '../context/StoreContext';

export default function Header() {
  const { data: session } = useSession();
  const { count, wishlist } = useStore();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut().catch(() => {});
    navigate('/');
  }

  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="logo">{LABELS.appEmoji} {LABELS.appName}</Link>
        <nav className="nav">
          <NavLink to="/" end>Shop</NavLink>
          <NavLink to="/wishlist">Wishlist{wishlist.length > 0 && <span className="badge">{wishlist.length}</span>}</NavLink>
          <NavLink to="/orders">Orders</NavLink>
          <NavLink to="/cart">Cart{count > 0 && <span className="badge">{count}</span>}</NavLink>
          {session ? (
            <>
              <span className="nav-user muted small">{session.user.name}</span>
              <button className="link-btn" onClick={handleSignOut}>Sign out</button>
            </>
          ) : (
            <NavLink to="/login">Sign in</NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}
