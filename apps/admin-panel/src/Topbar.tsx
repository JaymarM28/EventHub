import { Link } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';

export function Topbar() {
  const { user, logout } = useAuth();
  return (
    <nav className="topbar">
      <Link to="/" className="brand">
        Event Hub — Organizador
      </Link>
      <div className="row">
        <span className="muted">{user?.email}</span>
        <button className="btn-ghost" onClick={logout}>
          Salir
        </button>
      </div>
    </nav>
  );
}
