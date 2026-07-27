// Genera el GMAIL_REFRESH_TOKEN para el mailer (una sola vez, en tu máquina):
//
//   node backend/scripts/gmail-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET>
//
// Abre la URL que imprime, autoriza con la cuenta de Gmail que enviará los
// correos, y el token aparece aquí en la terminal para copiarlo a las
// variables de Railway. No guarda nada en disco.
import http from 'node:http';
import { randomBytes } from 'node:crypto';

const [clientId, clientSecret] = process.argv.slice(2);
if (!clientId || !clientSecret) {
  console.error('Uso: node backend/scripts/gmail-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET>');
  process.exit(1);
}

const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}`;
const state = randomBytes(8).toString('hex');

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.send',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  const code = u.searchParams.get('code');
  const error = u.searchParams.get('error');
  if (error) {
    res.end(`Autorización rechazada: ${error}. Puedes cerrar esta pestaña.`);
    console.error('\nGoogle devolvió error:', error);
    server.close();
    return;
  }
  if (!code || u.searchParams.get('state') !== state) {
    res.writeHead(404).end();
    return;
  }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
    }),
  });
  const data = await r.json();
  if (!data.refresh_token) {
    res.end('No llegó refresh_token — revisa la terminal.');
    console.error('\nRespuesta sin refresh_token:', JSON.stringify(data, null, 2));
    console.error('Tip: revoca el acceso previo en https://myaccount.google.com/permissions y vuelve a intentar.');
  } else {
    res.end('¡Listo! Regresa a la terminal para copiar el token.');
    console.log('\nCopia estas variables a Railway (servicio → Variables):\n');
    console.log(`GMAIL_CLIENT_ID=${clientId}`);
    console.log(`GMAIL_CLIENT_SECRET=${clientSecret}`);
    console.log(`GMAIL_REFRESH_TOKEN=${data.refresh_token}`);
  }
  server.close();
});

server.listen(PORT, () => {
  console.log('1) Abre esta URL en tu navegador y autoriza con la cuenta de Gmail remitente:\n');
  console.log(authUrl + '\n');
  console.log('2) Al terminar, el refresh token aparecerá aquí.');
});
