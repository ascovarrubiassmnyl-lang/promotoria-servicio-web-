import { useAuth } from '../context/AuthContext.jsx';
import { CalendarioMio } from './CalendarioMio.jsx';
import { CalendarioGeneral } from './CalendarioGeneral.jsx';

export default function Citas() {
  const { esAdmin } = useAuth();
  return esAdmin() ? <CalendarioGeneral /> : <CalendarioMio />;
}
