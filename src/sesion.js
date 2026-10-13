// =====================================================================
//  sesion.js — Saber quién está usando la app y proteger las rutas privadas.
// =====================================================================
const db = require('./db');
const seg = require('./seguridad');
const { enviarJson, leerCookies } = require('./http');

// Devuelve { id, nombre, email } del usuario con sesión abierta, o null
async function usuarioActual(req) {
  const uid = seg.leerTokenSesion(leerCookies(req)[seg.NOMBRE_COOKIE]);
  return uid ? db.buscarUsuarioPorId(uid) : null;
}

// Para rutas de la API que exigen sesión: si no hay, responde 401 y devuelve null
async function exigirUsuario(req, res) {
  const usuario = await usuarioActual(req);
  if (!usuario) {
    enviarJson(res, 401, { ok: false, error: 'Tu sesión terminó. Inicia sesión de nuevo.', sesion: false });
    return null;
  }
  return usuario;
}

module.exports = { usuarioActual, exigirUsuario };
