// =====================================================================
//  seguridad.js — Contraseñas, sesiones y límite de intentos.
//  Todo usa el módulo "crypto" que ya viene con Node.js.
// =====================================================================
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const config = require('./config');

const scrypt = promisify(crypto.scrypt);

// ------------------------------------------------------------------
//  CONTRASEÑAS
//  Nunca se guarda la contraseña. Se guarda un "hash" con scrypt:
//  un resultado irreversible, con una "sal" aleatoria distinta por usuario.
//  Formato guardado:  scrypt$N$r$p$sal$hash
// ------------------------------------------------------------------
const SCRYPT = { N: 32768, r: 8, p: 1, largo: 64 };
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

async function crearHashContrasena(contrasena) {
  const sal = crypto.randomBytes(16);
  const hash = await scrypt(contrasena, sal, SCRYPT.largo, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT_MAXMEM });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, sal.toString('base64'), hash.toString('base64')].join('$');
}

async function verificarContrasena(contrasena, guardado) {
  try {
    const [algoritmo, N, r, p, salB64, hashB64] = String(guardado).split('$');
    if (algoritmo !== 'scrypt') return false;
    const esperado = Buffer.from(hashB64, 'base64');
    const calculado = await scrypt(contrasena, Buffer.from(salB64, 'base64'), esperado.length,
      { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT_MAXMEM });
    return crypto.timingSafeEqual(esperado, calculado);
  } catch {
    return false;
  }
}

// Hash "de mentira" para que responder "ese correo no existe" tarde lo mismo
// que "contraseña incorrecta" (así nadie puede adivinar qué correos existen).
let hashFalso = null;
async function compararConHashFalso(contrasena) {
  if (!hashFalso) hashFalso = await crearHashContrasena('contrasena-de-relleno');
  await verificarContrasena(contrasena, hashFalso);
  return false;
}

// ------------------------------------------------------------------
//  SESIONES
//  Al iniciar sesión se entrega una cookie firmada con SESSION_SECRET.
//  Si alguien la modifica, la firma deja de coincidir y se rechaza.
// ------------------------------------------------------------------
const NOMBRE_COOKIE = 'aw_sesion';
// 12 horas: como la app muestra información financiera, la sesión no debe durar días
const DURACION_SESION_SEG = 12 * 60 * 60;

function firmar(texto) {
  return crypto.createHmac('sha256', config.sessionSecret).update(texto).digest('base64url');
}

function crearTokenSesion(usuarioId) {
  const datos = Buffer.from(JSON.stringify({ uid: usuarioId, exp: Math.floor(Date.now() / 1000) + DURACION_SESION_SEG })).toString('base64url');
  return datos + '.' + firmar(datos);
}

function leerTokenSesion(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [datos, firma] = token.split('.');
  const esperada = firmar(datos);
  if (firma.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8'));
    if (!Number.isInteger(uid) || exp < Math.floor(Date.now() / 1000)) return null;
    return uid;
  } catch {
    return null;
  }
}

function cookieSesion(token) {
  const partes = [`${NOMBRE_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${DURACION_SESION_SEG}`];
  if (config.esProduccion) partes.push('Secure');
  return partes.join('; ');
}

function cookieCerrarSesion() {
  return `${NOMBRE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${config.esProduccion ? '; Secure' : ''}`;
}

// ------------------------------------------------------------------
//  LÍMITE DE INTENTOS (evita que un robot pruebe miles de contraseñas)
// ------------------------------------------------------------------
function crearLimitador({ maximo, ventanaMin }) {
  const intentos = new Map(); // clave -> { cuenta, reinicio }
  const ventanaMs = ventanaMin * 60 * 1000;
  // Limpieza periódica para no acumular memoria
  setInterval(() => {
    const ahora = Date.now();
    for (const [clave, v] of intentos) if (v.reinicio < ahora) intentos.delete(clave);
  }, ventanaMs).unref();

  // Devuelve null si puede seguir, o los minutos que debe esperar
  return function revisar(clave) {
    const ahora = Date.now();
    const v = intentos.get(clave);
    if (!v || v.reinicio < ahora) {
      intentos.set(clave, { cuenta: 1, reinicio: ahora + ventanaMs });
      return null;
    }
    v.cuenta += 1;
    if (v.cuenta > maximo) return Math.ceil((v.reinicio - ahora) / 60000);
    return null;
  };
}

module.exports = {
  crearHashContrasena, verificarContrasena, compararConHashFalso,
  NOMBRE_COOKIE, crearTokenSesion, leerTokenSesion, cookieSesion, cookieCerrarSesion,
  crearLimitador,
};
