import { NavLink } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';

function TicketIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V9Z" />
      <path d="M13 5v14" strokeDasharray="2 3" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4 6v6c0 4.5 3.2 7.7 8 9 4.8-1.3 8-4.5 8-9V6l-8-3Z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function Sidebar() {
  const { user, isSuperAdmin, logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">Event Hub</div>

      <nav className="sidebar-nav">
        <NavLink to="/" end className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
          <TicketIcon />
          Mis eventos
        </NavLink>
        {isSuperAdmin && (
          <NavLink to="/admin" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
            <ShieldIcon />
            Administración
          </NavLink>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="row" style={{ gap: 10, marginBottom: 10 }}>
          <span className="avatar">{user?.email.charAt(0).toUpperCase()}</span>
          <span className="muted" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.email}
          </span>
        </div>
        <button className="sidebar-link" style={{ width: '100%' }} onClick={logout}>
          <LogoutIcon />
          Salir
        </button>
      </div>
    </aside>
  );
}
