// =====================================================================
//  server.js — Punto de entrada. Arranca el servidor web de Auto-Wealth.
//
//  Qué hace:
//   1. Muestra las páginas (carpeta public/): inicio, panel (/app) y privacidad,
//      y sus estilos y scripts (public/assets/).
//   2. Registro e inicio de sesión de usuarios (PostgreSQL).
//   3. Envía el correo con la encuesta a cada persona que se registra.
//   4. Panel financiero: Open Finance (conexión con bancos), registro manual,
//      importación de extractos, análisis y centro de privacidad.
//   5. Deudas y plan para el dinero ocioso, con pagos simulados en el banco de prueba.
//
//  Para arrancarlo:  npm start   → abre http://localhost:3000
// =====================================================================
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const config = require('./src/config');
const db = require('./src/db');
const rutas = require('./src/rutas');
const finanzas = require('./src/finanzas/rutas');
const deudas = require('./src/finanzas/deudas');
const openfinance = require('./src/openfinance');
const pagos = require('./src/openfinance/pagos');
const { manejarAdmin } = require('./src/admin');
const { usuarioActual } = require('./src/sesion');
const { aplicarCabecerasSeguridad, enviarJson, mismoOrigen } = require('./src/http');

// ----- Páginas y archivos estáticos (carpeta public/) -----
// En producción se leen una vez y quedan en memoria. En desarrollo se leen en cada
// visita, así los cambios en HTML/CSS/JS se ven al recargar sin reiniciar el servidor.
const CARPETA_PUBLICA = path.join(__dirname, 'public');
const cache = new Map();
function leerPublico(relativo) {
  if (config.esProduccion && cache.has(relativo)) return cache.get(relativo);
  const contenido = fs.readFileSync(path.join(CARPETA_PUBLICA, relativo));
  if (config.esProduccion) cache.set(relativo, contenido);
  return contenido;
}
const PAGINAS = { '/': 'index.html', '/index.html': 'index.html', '/privacidad': 'privacidad.html' };
const TIPOS = {
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

// Sirve /assets/<archivo>. Solo nombres simples (sin "../"), para que nadie pueda leer otros archivos del servidor.
function enviarAsset(res, ruta) {
  const nombre = ruta.slice('/assets/'.length);
  const tipo = TIPOS[path.extname(nombre).toLowerCase()];
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(nombre) || nombre.includes('..') || !tipo) return false;
  try {
    const contenido = leerPublico(path.join('assets', nombre));
    res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-cache' });
    res.end(contenido);
    return true;
  } catch {
    return false;
  }
}

// Tabla de rutas de la API. ":id" es un número que cambia (ej. /api/finanzas/cuentas/12)
const API = [
  ['POST', '/api/registro', rutas.registro],
  ['POST', '/api/ingreso', rutas.ingreso],
  ['POST', '/api/salir', rutas.salir],
  ['GET', '/api/yo', rutas.yo],
  ['GET', '/api/salud', rutas.salud],

  ['GET', '/api/finanzas/resumen', finanzas.resumen],
  ['GET', '/api/finanzas/movimientos', finanzas.listarMovimientos],
  ['POST', '/api/finanzas/movimientos', finanzas.crearMovimiento],
  ['PATCH', '/api/finanzas/movimientos/:id', finanzas.actualizarMovimiento],
  ['DELETE', '/api/finanzas/movimientos/:id', finanzas.eliminarMovimiento],
  ['GET', '/api/finanzas/cuentas', finanzas.listarCuentas],
  ['POST', '/api/finanzas/cuentas', finanzas.crearCuenta],
  ['DELETE', '/api/finanzas/cuentas/:id', finanzas.eliminarCuenta],
  ['POST', '/api/finanzas/importar', finanzas.importar],

  ['GET', '/api/finanzas/deudas', deudas.listarDeudas],
  ['POST', '/api/finanzas/deudas', deudas.crearDeuda],
  ['PATCH', '/api/finanzas/deudas/:id', deudas.actualizarDeuda],
  ['DELETE', '/api/finanzas/deudas/:id', deudas.eliminarDeuda],
  ['GET', '/api/finanzas/plan', deudas.plan],
  ['GET', '/api/finanzas/redirecciones', deudas.listarRedirecciones],
  ['POST', '/api/finanzas/redirecciones', pagos.crearRedireccion],

  ['GET', '/api/openfinance/bancos', openfinance.bancos],
  ['POST', '/api/openfinance/consentimientos', openfinance.crearConsentimiento],
  ['POST', '/api/openfinance/conexiones/:id/sincronizar', openfinance.sincronizar],
  ['DELETE', '/api/openfinance/conexiones/:id', openfinance.revocar],

  ['GET', '/api/privacidad', finanzas.privacidad],
  ['GET', '/api/privacidad/exportar', finanzas.exportar],
  ['POST', '/api/privacidad/borrar-finanzas', finanzas.borrarFinanzas],
  ['POST', '/api/privacidad/eliminar-cuenta', finanzas.eliminarCuentaUsuario],
];

// Busca la ruta que coincide y extrae los parámetros (ej. { id: "12" })
function buscarRuta(metodo, ruta) {
  const partes = ruta.split('/');
  let existeRuta = false;
  for (const [m, patron, manejador] of API) {
    const p = patron.split('/');
    if (p.length !== partes.length) continue;
    const params = {};
    const coincide = p.every((seg, i) => {
      if (seg === ':id') { params.id = partes[i]; return /^\d{1,9}$/.test(partes[i]); }
      return seg === partes[i];
    });
    if (!coincide) continue;
    existeRuta = true;
    if (m === metodo) return { manejador, params };
  }
  return { existeRuta };
}

function enviarPagina(res, contenido) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(contenido);
}

async function atender(req, res) {
  aplicarCabecerasSeguridad(res);
  const url = new URL(req.url, 'http://localhost');
  const ruta = url.pathname;

  // Todo lo que modifica datos debe venir de nuestra propia página
  if (req.method !== 'GET' && req.method !== 'HEAD' && !mismoOrigen(req)) {
    return enviarJson(res, 403, { ok: false, error: 'Origen no permitido' });
  }

  // 1) La API
  if (ruta.startsWith('/api/')) {
    const { manejador, params, existeRuta } = buscarRuta(req.method, ruta);
    if (!manejador) return enviarJson(res, existeRuta ? 405 : 404, { ok: false, error: existeRuta ? 'Método no permitido' : 'Ruta no encontrada' });
    return manejador(req, res, params, url);
  }

  // 2) Regreso desde el banco y páginas del proveedor de Open Finance
  if (ruta === '/openfinance/retorno' && req.method === 'GET') return openfinance.retorno(req, res, url);
  if (ruta === '/openfinance/retorno-pago' && req.method === 'GET') return pagos.retornoPago(req, res, url);
  if (ruta.startsWith('/banco-demo/') && await openfinance.manejarRutaProveedor(req, res, ruta, url)) return;

  // 3) Panel de administración
  if (ruta === '/admin' || ruta.startsWith('/admin/')) return manejarAdmin(req, res, ruta);

  // 4) Páginas y archivos estáticos
  if (req.method === 'GET') {
    if (PAGINAS[ruta]) return enviarPagina(res, leerPublico(PAGINAS[ruta]));
    if (ruta === '/app') {
      // El panel es privado: sin sesión, se vuelve al inicio para iniciar sesión
      if (!(await usuarioActual(req))) { res.writeHead(303, { Location: '/?entrar=1' }); return res.end(); }
      return enviarPagina(res, leerPublico('app.html'));
    }
    if (ruta.startsWith('/assets/') && enviarAsset(res, ruta)) return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Página no encontrada');
}

const servidor = http.createServer((req, res) => {
  atender(req, res).catch((err) => {
    // Error inesperado: se anota en la terminal, pero al visitante no se le muestran detalles
    const estado = err.estado || 500;
    if (estado === 500) console.error('❌ Error en', req.method, req.url, '→', err);
    if (!res.headersSent) enviarJson(res, estado, { ok: false, error: estado === 500 ? 'Error interno. Intenta de nuevo.' : err.message });
    else res.end();
  });
});

async function arrancar() {
  try {
    await db.inicializar();
    console.log('🗄️  Base de datos lista.');
  } catch (err) {
    console.error('\n❌ No se pudo conectar a la base de datos. Revisa DATABASE_URL en el archivo .env');
    console.error('   Detalle:', err.message, '\n');
    process.exit(1);
  }

  servidor.listen(config.puerto, () => {
    console.log(`🚀 Auto-Wealth funcionando en http://localhost:${config.puerto}`);
    console.log(`📧 Correo: modo "${config.correo.proveedor}"`);
    console.log(`🏦 Open Finance: proveedor "${config.openFinance.proveedor}"`);
    console.log(`🔐 Panel admin: ${config.admin.contrasena ? `http://localhost:${config.puerto}/admin` : 'desactivado (sin ADMIN_PASSWORD)'}`);
  });
}

// Apagado ordenado (Render envía SIGTERM al reiniciar)
function apagar() {
  console.log('Cerrando el servidor...');
  servidor.close(() => db.cerrar().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);

arrancar();
