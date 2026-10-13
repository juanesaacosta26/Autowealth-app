// =====================================================================
//  rutas.js — La "API": lo que hace el servidor cuando la página le pide algo.
//
//   POST /api/registro   → crea la cuenta, la guarda y envía el correo
//   POST /api/ingreso    → inicia sesión (y lo anota en la tabla ingresos)
//   POST /api/salir      → cierra la sesión
//   GET  /api/yo         → dice si hay una sesión abierta y de quién
//   GET  /api/salud      → comprueba que el servidor y la base de datos funcionan
// =====================================================================
const db = require('./db');
const seg = require('./seguridad');
const { validarRegistro, validarIngreso } = require('./validacion');
const { enviarCorreoEncuesta } = require('./correo');
const { enviarJson, leerJson, leerCookies, ipCliente } = require('./http');

// Límites de intentos (cada 15 minutos). Son generosos por IP porque muchas
// personas pueden compartir la misma red (ej. la wifi de una universidad),
// y estrictos por cuenta para frenar a quien intente adivinar una contraseña.
const limiteRegistroIp = seg.crearLimitador({ maximo: 30, ventanaMin: 15 });
const limiteIngresoIp = seg.crearLimitador({ maximo: 100, ventanaMin: 15 });
const limiteIngresoCuenta = seg.crearLimitador({ maximo: 8, ventanaMin: 15 });
const mensajeEspera = (min) => `Demasiados intentos. Intenta de nuevo en ${min} min.`;

const primerNombre = (nombre) => String(nombre).split(' ')[0];

async function registro(req, res) {
  const { datos, error } = validarRegistro(await leerJson(req));
  if (error) return enviarJson(res, 400, { ok: false, error }); // un error de escritura no cuenta como intento

  const espera = limiteRegistroIp(ipCliente(req));
  if (espera) return enviarJson(res, 429, { ok: false, error: mensajeEspera(espera) });

  const passwordHash = await seg.crearHashContrasena(datos.password);

  let usuario;
  try {
    usuario = await db.crearUsuario({ ...datos, passwordHash });
  } catch (err) {
    if (err.code === '23505') { // 23505 = dato repetido (UNIQUE)
      const campo = String(err.constraint || '').includes('cedula') ? 'esa cédula' : 'ese correo';
      return enviarJson(res, 409, { ok: false, error: `Ya existe una cuenta con ${campo}. Inicia sesión.` });
    }
    throw err;
  }

  // Enviar el correo con la encuesta. Si falla, la cuenta igual queda creada
  // y el error queda anotado en la base de datos para revisarlo después.
  let correoEnviado = true;
  try {
    await enviarCorreoEncuesta(usuario.email, usuario.nombre);
    await db.marcarCorreoEnviado(usuario.id);
  } catch (err) {
    correoEnviado = false;
    console.error(`No se pudo enviar el correo a ${usuario.email}:`, err.message);
    await db.marcarCorreoFallido(usuario.id, err.message).catch(() => {});
  }

  console.log(`✅ Nuevo registro: ${usuario.email}`);
  const token = seg.crearTokenSesion(usuario.id);
  enviarJson(res, 201, { ok: true, nombre: primerNombre(usuario.nombre), correoEnviado },
    { 'Set-Cookie': seg.cookieSesion(token) });
}

async function ingreso(req, res) {
  const { datos, error } = validarIngreso(await leerJson(req));
  if (error) return enviarJson(res, 400, { ok: false, error });

  const espera = limiteIngresoIp(ipCliente(req)) || limiteIngresoCuenta(datos.email);
  if (espera) return enviarJson(res, 429, { ok: false, error: mensajeEspera(espera) });

  const usuario = await db.buscarUsuarioPorEmail(datos.email);
  const correcta = usuario
    ? await seg.verificarContrasena(datos.password, usuario.password_hash)
    : await seg.compararConHashFalso(datos.password);

  await db.registrarIngreso({ usuarioId: usuario ? usuario.id : null, email: datos.email, exitoso: correcta });

  if (!correcta) {
    // Mismo mensaje para "no existe" y "contraseña incorrecta" (no revelar qué correos existen)
    return enviarJson(res, 401, { ok: false, error: 'Correo o contraseña incorrectos.' });
  }

  const token = seg.crearTokenSesion(usuario.id);
  enviarJson(res, 200, { ok: true, nombre: primerNombre(usuario.nombre) }, { 'Set-Cookie': seg.cookieSesion(token) });
}

async function salir(req, res) {
  enviarJson(res, 200, { ok: true }, { 'Set-Cookie': seg.cookieCerrarSesion() });
}

async function yo(req, res) {
  const uid = seg.leerTokenSesion(leerCookies(req)[seg.NOMBRE_COOKIE]);
  const usuario = uid ? await db.buscarUsuarioPorId(uid) : null;
  if (!usuario) return enviarJson(res, 200, { ok: true, sesion: false });
  enviarJson(res, 200, { ok: true, sesion: true, nombre: primerNombre(usuario.nombre) });
}

async function salud(req, res) {
  try {
    await db.verificarConexion();
    enviarJson(res, 200, { ok: true, baseDeDatos: 'conectada' });
  } catch (err) {
    enviarJson(res, 503, { ok: false, baseDeDatos: 'sin conexión' });
  }
}

module.exports = { registro, ingreso, salir, yo, salud };
