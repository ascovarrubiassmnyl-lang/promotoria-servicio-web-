import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function ProtectedRoute({ children, adminOnly, seccion }) {
  const { user, loading, esAdmin, puede } = useAuth();
  if (loading) return <div className="p-10 text-center text-slate-400">Cargando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !esAdmin()) return <Navigate to="/" replace />;
  if (seccion && !puede(seccion)) return <Navigate to="/" replace />;
  return children;
}

export function AdminRoute({ children }) {
  return <ProtectedRoute adminOnly>{children}</ProtectedRoute>;
}

export function SeccionRoute({ children, seccion }) {
  return <ProtectedRoute seccion={seccion}>{children}</ProtectedRoute>;
}
