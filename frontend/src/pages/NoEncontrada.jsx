import { Link, useLocation } from 'react-router-dom';

// 404 (2026-10-13, auditoría de UI): antes cualquier URL desconocida mandaba
// en silencio al Dashboard y el usuario no sabía si el link estaba roto.
export default function NoEncontrada() {
  const { pathname } = useLocation();
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <p className="text-5xl font-bold text-slate-300 dark:text-slate-600">404</p>
      <h1 className="mt-3 text-lg font-semibold text-slate-800 dark:text-slate-100">Esta página no existe</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        No encontramos <span className="font-mono break-all">{pathname}</span>. Puede que el link esté mal escrito o que el registro ya no exista.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Link to="/" className="btn-primary">Ir al inicio</Link>
        <Link to="/clientes" className="btn-secondary">Ver CRM</Link>
      </div>
    </div>
  );
}
