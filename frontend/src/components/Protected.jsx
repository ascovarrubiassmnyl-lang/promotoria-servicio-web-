import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Ruta de cada sección, en el orden de preferencia para redirigir a alguien
// que no puede ver la que pidió (evita el loop de mandar siempre a "/" cuando
// justo es el dashboard lo bloqueado).
const DESTINOS = [
  ['dashboard', '/'],
  ['clientes', '/clientes'],
  ['citas', '/citas'],
  ['ventas', '/ventas'],
  ['actividad', '/actividad'],
  ['metas', '/targets'],
  ['asesores', '/asesores'],
  ['configuracion', '/configuracion'],
];

export function ProtectedRoute({ children, adminOnly, seccion }) {
  const { user, loading, esAdmin, puede } = useAuth();
  if (loading) return <div className="p-10 text-center text-slate-400">Cargando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if ((adminOnly && !esAdmin()) || (seccion && !puede(seccion))) {
    const destino = DESTINOS.find(([s]) => s !== seccion && puede(s));
    if (!destino) return <div className="p-10 text-center text-slate-400">Sin acceso a ninguna sección. Contacta a tu promotor.</div>;
    const ruta = destino[0] === 'ventas' && esAdmin() ? '/equipo' : destino[1];
    return <Navigate to={ruta} replace />;
  }
  return children;
}

export function AdminRoute({ children }) {
  return <ProtectedRoute adminOnly>{children}</ProtectedRoute>;
}

export function SeccionRoute({ children, seccion }) {
  return <ProtectedRoute seccion={seccion}>{children}</ProtectedRoute>;
}
