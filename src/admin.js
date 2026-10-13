// =====================================================================
//  admin.js — Descargar los datos en archivos CSV (se abren en Excel).
//
//   /admin                   → página con los dos botones de descarga
//   /admin/usuarios.csv      → todas las personas registradas
//   /admin/ingresos.csv      → historial de inicios de sesión
//
//  Protegido con usuario y contraseña (ADMIN_USER / ADMIN_PASSWORD).
//  El navegador muestra una ventanita para escribirlos.
// =====================================================================
const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');
const { crearLimitador } = require('./seguridad');
const { ipCliente } = require('./http');

const limiteAdmin = crearLimitador({ maximo: 20, ventanaMin: 15 });

function igualSeguro(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Devuelve true si el usuario y la contraseña son correctos
function autorizado(req) {
  const [tipo, credenciales] = String(req.headers.authorization || '').split(' ');
  if (tipo !== 'Basic' || !credenciales) return false;
  const decodificado = Buffer.from(credenciales, 'base64').toString('utf8');
  const i = decodificado.indexOf(':');
  const usuario = decodificado.slice(0, i);
  const contrasena = decodificado.slice(i + 1);
  // Se comparan ambos siempre (aunque el primero falle) para no dar pistas por el tiempo de respuesta
  const usuarioOk = igualSeguro(usuario, config.admin.usuario);
  const contrasenaOk = igualSeguro(contrasena, config.admin.contrasena);
  return usuarioOk && contrasenaOk;
}

function pedirContrasena(res) {
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Auto-Wealth admin", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Se requiere usuario y contraseña de administrador.');
}

// ----- Convertir filas a CSV (separado por ";" para Excel en español) -----
function celda(valor) {
  if (valor === null || valor === undefined) return '';
  let s = valor instanceof Date ? formatoFecha(valor) : String(valor);
  if (typeof valor === 'boolean') s = valor ? 'Sí' : 'No';
  if (/^[=+\-@]/.test(s)) s = "'" + s; // evita que Excel ejecute fórmulas
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function formatoFecha(fecha) {
  // Hora de Colombia, formato 2026-09-30 18:15
  return new Date(fecha).toLocaleString('sv-SE', { timeZone: 'America/Bogota' }).slice(0, 16);
}

function aCsv(encabezados, filas, columnas) {
  const lineas = [encabezados.join(';')];
  for (const f of filas) lineas.push(columnas.map((c) => celda(f[c])).join(';'));
  return '﻿' + lineas.join('\r\n'); // ﻿ hace que Excel reconozca las tildes
}

function enviarCsv(res, nombreArchivo, contenido) {
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    'Cache-Control': 'no-store',
  });
  res.end(contenido);
}

const PAGINA_ADMIN = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Auto-Wealth · Admin</title>
<style>body{font-family:system-ui,Arial,sans-serif;background:#f8f5fc;color:#2d2640;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
.card{background:#fff;border-radius:16px;padding:32px;max-width:420px;width:100%;box-shadow:0 10px 30px rgba(124,92,191,.12)}
h1{color:#7c5cbf;font-size:1.4rem;margin:0 0 .4rem}p{color:#6b6280;font-size:.9rem;margin:0 0 1.4rem}
a{display:block;text-align:center;background:#7c5cbf;color:#fff;text-decoration:none;padding:14px;border-radius:30px;font-weight:600;margin-bottom:.8rem}
a.sec{background:#fff;color:#7c5cbf;border:2px solid #7c5cbf}</style></head><body><div class="card">
<h1>Panel de administración</h1><p>Descarga los datos en archivos que se abren con Excel.</p>
<a href="/admin/usuarios.csv">Descargar usuarios registrados</a>
<a class="sec" href="/admin/ingresos.csv">Descargar historial de ingresos</a></div></body></html>`;

async function manejarAdmin(req, res, ruta) {
  if (!config.admin.contrasena) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('El panel de administración está desactivado (falta ADMIN_PASSWORD).');
  }
  if (limiteAdmin(ipCliente(req))) {
    res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Demasiados intentos. Espera unos minutos.');
  }
  if (!autorizado(req)) return pedirContrasena(res);

  if (ruta === '/admin' || ruta === '/admin/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(PAGINA_ADMIN);
  }
  if (ruta === '/admin/usuarios.csv') {
    const filas = await db.listarUsuarios();
    return enviarCsv(res, 'usuarios-autowealth.csv', aCsv(
      ['ID', 'Fecha registro', 'Nombre', 'Email', 'Teléfono', 'Cédula', 'Autoriza datos', 'Correo encuesta enviado', 'Error correo', 'Último ingreso', 'Nº ingresos'],
      filas,
      ['id', 'creado_en', 'nombre', 'email', 'telefono', 'cedula', 'acepta_datos', 'correo_encuesta_enviado_en', 'correo_encuesta_error', 'ultimo_ingreso_en', 'num_ingresos']
    ));
  }
  if (ruta === '/admin/ingresos.csv') {
    const filas = await db.listarIngresos();
    return enviarCsv(res, 'ingresos-autowealth.csv', aCsv(
      ['Fecha', 'Email', 'Nombre', 'Exitoso'], filas, ['creado_en', 'email', 'nombre', 'exitoso']
    ));
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('No encontrado');
}

module.exports = { manejarAdmin };
