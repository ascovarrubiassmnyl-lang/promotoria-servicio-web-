import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { ProtectedRoute, AdminRoute, SeccionRoute } from './components/Protected.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clientes from './pages/Clientes.jsx';
import ClienteDetalle from './pages/ClienteDetalle.jsx';
import Citas from './pages/Citas.jsx';
import Ventas from './pages/Ventas.jsx';
import Equipo, { EquipoAsesor } from './pages/Equipo.jsx';
import Actividad from './pages/Actividad.jsx';
import Asesores from './pages/Asesores.jsx';
import Configuracion from './pages/Configuracion.jsx';
import Targets from './pages/Targets.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<SeccionRoute seccion="dashboard"><Dashboard /></SeccionRoute>} />
        <Route path="/clientes" element={<SeccionRoute seccion="clientes"><Clientes /></SeccionRoute>} />
        <Route path="/clientes/:id" element={<SeccionRoute seccion="clientes"><ClienteDetalle /></SeccionRoute>} />
        <Route path="/citas" element={<SeccionRoute seccion="citas"><Citas /></SeccionRoute>} />
        <Route path="/ventas" element={<SeccionRoute seccion="ventas"><Ventas /></SeccionRoute>} />
        {/* Vista de promotor: roster de asesores y consulta de carteras ajenas.
            Solo ADMIN/SUPERADMIN; un ASESOR que navegue manualmente es redirigido. */}
        <Route path="/equipo" element={<AdminRoute><Equipo /></AdminRoute>} />
        <Route path="/equipo/:asesorId" element={<AdminRoute><EquipoAsesor /></AdminRoute>} />
        <Route path="/actividad" element={<SeccionRoute seccion="actividad"><Actividad /></SeccionRoute>} />
        <Route path="/asesores" element={<AdminRoute><Asesores /></AdminRoute>} />
        <Route path="/configuracion" element={<AdminRoute><Configuracion /></AdminRoute>} />
        <Route path="/targets" element={<AdminRoute><Targets /></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
