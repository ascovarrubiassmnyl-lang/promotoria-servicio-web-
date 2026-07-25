import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import PolizasView from '../components/polizas/PolizasView.jsx';

// Pólizas del asesor autenticado. Los promotores (ADMIN/SUPERADMIN) entran
// por el roster de Equipo, no por aquí.
export default function Ventas() {
  const { esAdmin } = useAuth();
  if (esAdmin()) return <Navigate to="/equipo" replace />;
  return <PolizasView titulo="Pólizas" subtitulo="Tus pólizas y las de tus clientes" />;
}
