import CalendarioView from '../components/citas/CalendarioView.jsx';

// Contenedor compartido: el scope por rol lo resuelven CalendarioView y la API
// (asesor = su agenda; promotor = equipo con filtro por asesor).
export default function Citas() {
  return <CalendarioView />;
}
