import { tipoCambioVigente } from '../services/tipoCambio.js';

// Extraído de routes/ventas.js (2026-08-31) para poder reusarlo también en
// jobs/automatizacionesJob.js (ver reconciliarPrimasPendientes) — antes vivía
// solo ahí y no había forma de recalcular una prima pendiente desde el job.
export const MONEDAS = ['MXN', 'USD', 'UDI'];

// Prima en MXN a partir del monto en la moneda original. `primaAnual` SIEMPRE
// queda en pesos porque es la que suman métricas, comisiones, metas y
// ranking; convertirla aquí evita que cada consumidor invente su propia
// conversión.
//
// El tipo de cambio NO lo captura el asesor (2026-08-15): la póliza se firma
// en la moneda que diga el contrato — el asesor solo transcribe la cifra tal
// cual viene, nunca debería tener que ir a buscar ni calcular un tipo de
// cambio para poder guardarla. Esta función resuelve el TC ella misma contra
// `tipoCambioVigente()` (Banxico, o el respaldo manual en .env si Banxico no
// respondió — ver tipoCambio.js) y solo usa `tipoCambio` si alguien lo manda
// explícito (edición de una póliza histórica pactada a otra paridad).
//
// SIN TC DISPONIBLE (2026-08-31, corrección de diseño): ya NO se rechaza el
// registro con 400 — antes eso bloqueaba por completo dar de alta una póliza
// en USD/UDI cuando Banxico y el respaldo manual fallaban a la vez (pasó en
// producción por falta de esas variables de entorno). Ahora se guarda igual,
// con `primaAnual: 0` y `tipoCambio: null` como marca de "pendiente de
// conversión" — es la MISMA marca que detecta el frontend
// (`primaPendienteConversion()` en components/polizas/tipos.js) para avisar
// en vez de mostrar $0 como si fuera definitivo. `reconciliarPrimasPendientes()`
// (jobs/automatizacionesJob.js) vuelve a intentar cada hora y la resuelve sola
// en cuanto haya un tipo de cambio real. Solo "Prima inválida" (monto en 0 o
// vacío) sigue siendo un error de captura, no de tipo de cambio.
export async function resolverPrima({ moneda, primaAnual, primaMoneda, tipoCambio }) {
  const divisa = MONEDAS.includes(moneda) ? moneda : 'MXN';
  if (divisa === 'MXN') {
    return { moneda: 'MXN', primaAnual: +primaAnual, primaMoneda: null, tipoCambio: null };
  }
  const original = primaMoneda != null && primaMoneda !== '' ? +primaMoneda : +primaAnual;
  if (!original || original <= 0) return { error: 'Prima inválida' };

  let tc = +tipoCambio;
  let fuenteTC = 'manual';
  if (!tc || tc <= 0) {
    const oficial = await tipoCambioVigente(divisa);
    if (!(oficial?.valor > 0)) {
      return {
        moneda: divisa,
        primaAnual: 0,
        primaMoneda: original,
        tipoCambio: null,
        fuenteTC: 'pendiente',
        pendiente: true,
      };
    }
    tc = oficial.valor;
    fuenteTC = oficial.fuente;
  }
  return {
    moneda: divisa,
    primaAnual: +(original * tc).toFixed(2),
    primaMoneda: original,
    tipoCambio: tc,
    fuenteTC,
  };
}
