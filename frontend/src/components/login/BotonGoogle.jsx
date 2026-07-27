import { useEffect, useRef, useState } from 'react';

// Botón "Continuar con Google" (Google Identity Services). Solo se renderiza
// si VITE_GOOGLE_CLIENT_ID está configurado; el script de GIS se carga bajo
// demanda y si falla no rompe el login normal (el formulario sigue intacto).
// onCredential recibe el ID token que el backend verifica en /api/auth/google.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GSI_SRC = 'https://accounts.google.com/gsi/client';

let gsiPromise = null;
function cargarGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gsiPromise) {
    gsiPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GSI_SRC;
      s.async = true;
      s.defer = true;
      s.onload = resolve;
      s.onerror = () => { gsiPromise = null; reject(new Error('No se pudo cargar Google')); };
      document.head.appendChild(s);
    });
  }
  return gsiPromise;
}

export default function BotonGoogle({ onCredential, caption = 'Debes tener una cuenta creada por tu promotor.' }) {
  const ref = useRef(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let activo = true;
    cargarGsi()
      .then(() => {
        if (!activo || !ref.current) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (resp) => onCredential(resp.credential),
        });
        window.google.accounts.id.renderButton(ref.current, {
          theme: 'filled_black',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width: 320,
          locale: 'es',
        });
      })
      .catch(() => { if (activo) setFallo(true); });
    return () => { activo = false; };
    // onCredential es estable en Login (useCallback no requerido: el efecto
    // solo corre al montar porque el botón vive una vez en la pantalla).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!CLIENT_ID || fallo) return null;

  return (
    <div className="mt-5">
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-slate-500">
        <span className="h-px flex-1 bg-indigo-300/15" />
        o
        <span className="h-px flex-1 bg-indigo-300/15" />
      </div>
      <div ref={ref} className="mt-4 flex justify-center" />
      {caption && <p className="mt-2 text-center text-[11px] text-slate-500">{caption}</p>}
    </div>
  );
}
