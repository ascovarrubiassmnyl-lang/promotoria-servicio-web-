import { api, TIMEOUT_SUBIDA } from '../api/client.js';

// Descarga un archivo de la API. La API va con token en el header, así que no
// se puede apuntar un <a href> directo: se trae el blob y se guarda desde un
// object URL local (mismo motivo que el visor de documentos).
export async function descargarDeApi(ruta, nombre, params) {
  const { data } = await api.get(ruta, { params, responseType: 'blob', timeout: TIMEOUT_SUBIDA });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
