import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/ConfirmDialog';
import { Sidebar } from './Sidebar';
import { LoginPage } from './pages/LoginPage';
import { MyEventsPage } from './pages/MyEventsPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { AdminPage } from './pages/AdminPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

/** A diferencia de RequireAuth, esto además exige rol SUPER_ADMIN — un
 * organizador autenticado que teclee /admin a mano rebota a la home, no
 * ve ni un flash de la pantalla de plataforma. */
function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const { token, isSuperAdmin } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;
  return children;
}

function Shell() {
  const { token } = useAuth();
  const routes = (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <MyEventsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/events/:id"
        element={
          <RequireAuth>
            <EventDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireSuperAdmin>
            <AdminPage />
          </RequireSuperAdmin>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );

  if (!token) return routes;

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">{routes}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            <Shell />
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
