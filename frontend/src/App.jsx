import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { ProtectedRoute, SeccionRoute } from './components/Protected.jsx';
import Login from './pages/Login.jsx';
import Invitacion from './pages/Invitacion.jsx';
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
import Puntos from './pages/Puntos.jsx';
import Clinica from './pages/Clinica.jsx';
import Candidatos from './pages/Candidatos.jsx';
import CandidatoDetalle from './pages/CandidatoDetalle.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/invitacion/:token" element={<Invitacion />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<SeccionRoute seccion="dashboard"><Dashboard /></SeccionRoute>} />
        <Route path="/clientes" element={<SeccionRoute seccion="clientes"><Clientes /></SeccionRoute>} />
        <Route path="/clientes/:id" element={<SeccionRoute seccion="clientes"><ClienteDetalle /></SeccionRoute>} />
        <Route path="/citas" element={<SeccionRoute seccion="citas"><Citas /></SeccionRoute>} />
        <Route path="/ventas" element={<SeccionRoute seccion="ventas"><Ventas /></SeccionRoute>} />
        {/* Vista de promotor: roster de asesores y consulta de carteras ajenas.
            Solo ADMIN/SUPERADMIN con la sección Pólizas permitida. */}
        <Route path="/equipo" element={<ProtectedRoute adminOnly seccion="ventas"><Equipo /></ProtectedRoute>} />
        <Route path="/equipo/:asesorId" element={<ProtectedRoute adminOnly seccion="ventas"><EquipoAsesor /></ProtectedRoute>} />
        <Route path="/actividad" element={<SeccionRoute seccion="actividad"><Actividad /></SeccionRoute>} />
        <Route path="/asesores" element={<SeccionRoute seccion="asesores"><Asesores /></SeccionRoute>} />
        <Route path="/configuracion" element={<SeccionRoute seccion="configuracion"><Configuracion /></SeccionRoute>} />
        {/* Metas: el promotor gestiona equipo e individuales; el asesor solo
            ve la suya (la API fuerza el alcance, tercera capa). */}
        <Route path="/targets" element={<SeccionRoute seccion="metas"><Targets /></SeccionRoute>} />
        {/* 25 puntos y Clínica telefónica: compartidas por ambos roles; el
            alcance (propio vs. por asesor) lo fuerza la API. */}
        <Route path="/puntos" element={<SeccionRoute seccion="puntos"><Puntos /></SeccionRoute>} />
        <Route path="/clinica" element={<SeccionRoute seccion="clinica"><Clinica /></SeccionRoute>} />
        {/* Candidatos (reclutamiento): sección con piso de rol ADMIN/SUPERADMIN
            en el servidor; la política del rol Asesor nunca la concede. */}
        <Route path="/candidatos" element={<SeccionRoute seccion="candidatos"><Candidatos /></SeccionRoute>} />
        <Route path="/candidatos/:id" element={<SeccionRoute seccion="candidatos"><CandidatoDetalle /></SeccionRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
