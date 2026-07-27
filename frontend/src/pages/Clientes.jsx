import ClientesView from '../components/clientes/ClientesView.jsx';

// La lista de clientes vive en el contenedor compartido ClientesView (mismo
// patrón que PolizasView): aquí sin asesorId = cartera propia (asesor) o del
// equipo con filtro por asesor (promotor). La vista scoped por asesor la usa
// Asesores → "CRM por asesor".
export default function Clientes() {
  return <ClientesView />;
}
