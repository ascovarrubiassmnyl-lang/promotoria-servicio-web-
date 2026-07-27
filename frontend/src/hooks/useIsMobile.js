import { useEffect, useState } from 'react';

// Breakpoint móvil = por debajo de `md` de Tailwind (768px), el mismo corte que
// usa Layout.jsx para la tab bar inferior. Sirve para montar árboles distintos
// por dispositivo sin tocar el markup de escritorio.
const QUERY = '(max-width: 767px)';

export default function useIsMobile() {
  const [esMovil, setEsMovil] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = (e) => setEsMovil(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return esMovil;
}
