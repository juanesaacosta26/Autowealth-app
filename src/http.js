// =====================================================================
//  http.js — Pequeñas ayudas para leer peticiones y enviar respuestas.
// =====================================================================
const config = require('./config');

// Cabeceras de seguridad que se envían en TODAS las respuestas
const CABECERAS_SEGURIDAD = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  // Qué puede cargar la página: solo lo propio + íconos (cdnjs) + fuentes (Google Fonts)
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
    "font-src 'self' data: https://cdnjs.cloudflare.com https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};
if (config.esProduccion) CABECERAS_SEGURIDAD['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';

function aplicarCabecerasSeguridad(res) {
  for (const [k, v] of Object.entries(CABECERAS_SEGURIDAD)) res.setHeader(k, v);
}

function enviarJson(res, estado, datos, extras = {}) {
  const cuerpo = JSON.stringify(datos);
  res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extras });
  res.end(cuerpo);
}

// Lee el cuerpo JSON de la petición (máximo 10 KB para evitar abusos)
function leerJson(req, limiteBytes = 10 * 1024) {
  return new Promise((resolve, reject) => {
    const tipo = req.headers['content-type'] || '';
    if (!tipo.includes('application/json')) return reject(Object.assign(new Error('Se esperaba JSON'), { estado: 415 }));
    let tamano = 0;
    const partes = [];
    req.on('data', (parte) => {
      tamano += parte.length;
      if (tamano > limiteBytes) {
        reject(Object.assign(new Error('Petición demasiado grande'), { estado: 413 }));
        req.destroy();
      } else partes.push(parte);
    });
    req.on('end', () => {
      try {
        const datos = JSON.parse(Buffer.concat(partes).toString('utf8') || '{}');
        if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new Error();
        resolve(datos);
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { estado: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function leerCookies(req) {
  const resultado = {};
  (req.headers.cookie || '').split(';').forEach((par) => {
    const i = par.indexOf('=');
    if (i > 0) resultado[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  });
  return resultado;
}

// IP del visitante (para el límite de intentos)
function ipCliente(req) {
  if (config.confiarEnProxy) {
    const reenviada = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (reenviada) return reenviada;
  }
  return req.socket.remoteAddress || 'desconocida';
}

// Protección extra: las peticiones que modifican datos deben venir de nuestra propia página
function mismoOrigen(req) {
  const origen = req.headers.origin;
  if (!origen) return true; // navegadores antiguos o herramientas sin cabecera Origin
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return new URL(origen).host === host;
  } catch {
    return false;
  }
}

module.exports = { aplicarCabecerasSeguridad, enviarJson, leerJson, leerCookies, ipCliente, mismoOrigen };
