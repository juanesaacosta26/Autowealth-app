// =====================================================================
//  finanzas/rutas.js — API del panel financiero y del centro de privacidad.
//  Todas las rutas exigen sesión y solo tocan los datos de ese usuario.
//
//   GET    /api/finanzas/resumen?mes=YYYY-MM     → indicadores del mes
//   GET    /api/finanzas/movimientos?mes=&cuenta= → lista de movimientos
//   POST   /api/finanzas/movimientos             → registrar un movimiento a mano
//   PATCH  /api/finanzas/movimientos/:id         → cambiar categoría
//   DELETE /api/finanzas/movimientos/:id         → borrar (solo manuales/importados)
//   GET    /api/finanzas/cuentas                 → cuentas y bancos conectados
//   POST   /api/finanzas/cuentas                 → crear cuenta manual
//   DELETE /api/finanzas/cuentas/:id             → borrar cuenta manual
//   POST   /api/finanzas/importar                → importar extracto (filas ya leídas del CSV)
//   GET    /api/privacidad                       → autorizaciones e historial
//   GET    /api/privacidad/exportar              → descargar todos mis datos (JSON)
//   POST   /api/privacidad/borrar-finanzas       → borrar toda mi información financiera
//   POST   /api/privacidad/eliminar-cuenta       → eliminar mi cuenta por completo
//  Las deudas y el plan para el dinero ocioso están en finanzas/deudas.js.
// =====================================================================
const crypto = require('node:crypto');
const db = require('../db');
const fdb = require('./db');
const auditoria = require('../auditoria');
const openfinance = require('../openfinance');
const { cifrar, descifrar } = require('../cifrado');
const { TODAS, INGRESOS, GASTOS, NEUTRA, categorizar } = require('./categorias');
const { resumen: calcularResumen, mesesAtras } = require('./analisis');
const { deudaParaRespuesta } = require('./deudas');
const { enviarJson, leerJson } = require('../http');
const { exigirUsuario } = require('../sesion');
const { verificarContrasena, crearLimitador, cookieCerrarSesion } = require('../seguridad');

const TIPOS_CUENTA = ['ahorros', 'corriente', 'tarjeta_credito', 'billetera', 'efectivo', 'otra'];
const limiteContrasena = crearLimitador({ maximo: 5, ventanaMin: 15 });
const limiteImportar = crearLimitador({ maximo: 20, ventanaMin: 15 });

const hoyISO = () => new Date().toISOString().slice(0, 10);
const mesActual = () => hoyISO().slice(0, 7);
const esMes = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m || '');
const finDeMes = (mes) => {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

function fechaValida(f) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f || '')) return false;
  const d = new Date(f + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== f) return false;
  const hace5anios = new Date(); hace5anios.setUTCFullYear(hace5anios.getUTCFullYear() - 5);
  const manana = new Date(Date.now() + 86_400_000);
  return d >= hace5anios && d <= manana;
}
const textoLimpio = (t, max) => (typeof t === 'string' ? t.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

function descifrarMovimientos(filas) {
  return filas.map(({ descripcion_cifrada, ...m }) => {
    let descripcion;
    try { descripcion = descifrar(descripcion_cifrada); } catch { descripcion = '(no se pudo leer)'; }
    return { ...m, descripcion };
  });
}

// ------------------------------- RESUMEN -------------------------------

async function resumen(req, res, params, url) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const meses = await fdb.mesesConDatos(usuario.id);
  let mes = url.searchParams.get('mes');
  if (!esMes(mes)) {
    // Por defecto: el mes en curso. Pero en los primeros días del mes (cuando casi
    // no hay movimientos ni ha llegado el sueldo) se muestra el mes anterior completo.
    const anterior = mesesAtras(mesActual(), 2)[0];
    const dia = Number(hoyISO().slice(8, 10));
    if (dia < 10 && meses.includes(anterior)) mes = anterior;
    else mes = meses.includes(mesActual()) ? mesActual() : (meses[0] || mesActual());
  }

  const ventana = mesesAtras(mes, 6);
  const movimientos = descifrarMovimientos(await fdb.listarMovimientos(usuario.id, { desde: ventana[0] + '-01', hasta: finDeMes(mes) }));
  const cuentas = await fdb.listarCuentas(usuario.id);
  const conexiones = (await fdb.listarConexiones(usuario.id)).map((c) => ({ ...c, banco: openfinance.nombreBanco(c.institucion) }));

  enviarJson(res, 200, {
    ok: true,
    usuario: { nombre: usuario.nombre.split(' ')[0] },
    mesesDisponibles: meses,
    cuentas,
    conexiones,
    ...calcularResumen({ movimientos, cuentas, mes }),
  });
}

// ----------------------------- MOVIMIENTOS -----------------------------

async function listarMovimientos(req, res, params, url) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const mes = url.searchParams.get('mes');
  const cuentaId = Number(url.searchParams.get('cuenta')) || null;
  const filtro = esMes(mes) ? { desde: mes + '-01', hasta: finDeMes(mes), cuentaId } : { cuentaId };
  const movimientos = descifrarMovimientos(await fdb.listarMovimientos(usuario.id, filtro));
  enviarJson(res, 200, { ok: true, movimientos, categorias: { ingresos: INGRESOS, gastos: GASTOS, neutra: NEUTRA } });
}

// Si el usuario no tiene cuentas manuales, se crea "Efectivo y otros" automáticamente
async function cuentaManualPorDefecto(usuarioId) {
  const manual = (await fdb.listarCuentas(usuarioId)).find((c) => c.origen === 'manual');
  if (manual) return manual.id;
  const id = await fdb.crearCuentaManual({ usuarioId, nombre: 'Efectivo y otros', tipo: 'efectivo', saldoInicial: 0 });
  await auditoria.registrar(usuarioId, 'cuenta_manual_creada', 'Efectivo y otros');
  return id;
}

async function crearMovimiento(req, res) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const b = await leerJson(req);
  const descripcion = textoLimpio(b.descripcion, 120);
  const valor = Math.abs(Number(b.valor));
  if (!fechaValida(b.fecha)) return enviarJson(res, 400, { ok: false, error: 'Escribe una fecha válida (de los últimos 5 años).' });
  if (!descripcion) return enviarJson(res, 400, { ok: false, error: 'Escribe una descripción.' });
  if (!Number.isFinite(valor) || valor <= 0 || valor > 10_000_000_000) return enviarJson(res, 400, { ok: false, error: 'Escribe un valor mayor que cero.' });
  if (!['ingreso', 'gasto'].includes(b.tipo)) return enviarJson(res, 400, { ok: false, error: 'Indica si es ingreso o gasto.' });

  const monto = b.tipo === 'ingreso' ? valor : -valor;
  let categoria = b.categoria && TODAS.includes(b.categoria) ? b.categoria : categorizar(descripcion, monto);
  if (b.tipo === 'ingreso' && GASTOS.includes(categoria)) categoria = 'Otros ingresos';
  if (b.tipo === 'gasto' && INGRESOS.includes(categoria)) categoria = 'Otros gastos';

  let cuentaId = Number(b.cuentaId) || null;
  if (cuentaId) {
    const cuenta = await fdb.obtenerCuenta(usuario.id, cuentaId);
    if (!cuenta || cuenta.origen !== 'manual') return enviarJson(res, 400, { ok: false, error: 'Solo puedes registrar movimientos en tus cuentas manuales.' });
  } else {
    cuentaId = await cuentaManualPorDefecto(usuario.id);
  }

  await fdb.insertarMovimientos(usuario.id, cuentaId, 'manual', [{
    id_externo: 'man-' + crypto.randomUUID(), fecha: b.fecha, monto, descripcion_cifrada: cifrar(descripcion), categoria,
  }]);
  await auditoria.registrar(usuario.id, 'movimiento_manual', `${b.tipo} · ${b.fecha}`);
  enviarJson(res, 201, { ok: true, categoria });
}

async function actualizarMovimiento(req, res, params) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const b = await leerJson(req);
  if (!TODAS.includes(b.categoria)) return enviarJson(res, 400, { ok: false, error: 'Categoría no válida.' });
  const ok = await fdb.cambiarCategoria(usuario.id, Number(params.id), b.categoria);
  enviarJson(res, ok ? 200 : 404, ok ? { ok: true } : { ok: false, error: 'Movimiento no encontrado.' });
}

async function eliminarMovimiento(req, res, params) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const ok = await fdb.eliminarMovimiento(usuario.id, Number(params.id));
  enviarJson(res, ok ? 200 : 404, ok ? { ok: true } : { ok: false, error: 'Solo puedes borrar movimientos que registraste o importaste tú.' });
}

// ------------------------------- CUENTAS -------------------------------

async function listarCuentas(req, res) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const cuentas = await fdb.listarCuentas(usuario.id);
  const conexiones = (await fdb.listarConexiones(usuario.id)).map((c) => ({ ...c, banco: openfinance.nombreBanco(c.institucion) }));
  enviarJson(res, 200, { ok: true, cuentas, conexiones, tipos: TIPOS_CUENTA });
}

async function crearCuenta(req, res) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const b = await leerJson(req);
  const nombre = textoLimpio(b.nombre, 60);
  const saldoInicial = Number(b.saldoInicial || 0);
  if (nombre.length < 2) return enviarJson(res, 400, { ok: false, error: 'Ponle un nombre a la cuenta.' });
  if (!TIPOS_CUENTA.includes(b.tipo)) return enviarJson(res, 400, { ok: false, error: 'Elige el tipo de cuenta.' });
  if (!Number.isFinite(saldoInicial) || Math.abs(saldoInicial) > 10_000_000_000) return enviarJson(res, 400, { ok: false, error: 'Saldo inicial no válido.' });
  const id = await fdb.crearCuentaManual({ usuarioId: usuario.id, nombre, tipo: b.tipo, saldoInicial });
  await auditoria.registrar(usuario.id, 'cuenta_manual_creada', nombre);
  enviarJson(res, 201, { ok: true, id });
}

async function eliminarCuenta(req, res, params) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const ok = await fdb.eliminarCuentaManual(usuario.id, Number(params.id));
  if (ok) await auditoria.registrar(usuario.id, 'cuenta_manual_eliminada', `cuenta ${params.id}`);
  enviarJson(res, ok ? 200 : 404, ok ? { ok: true }
    : { ok: false, error: 'Solo se pueden borrar cuentas manuales. Para un banco conectado, revoca la autorización.' });
}

// ------------------------------- IMPORTAR ------------------------------
// La página lee el CSV en el navegador y envía solo fecha, descripción y valor.

async function importar(req, res) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const espera = limiteImportar(String(usuario.id));
  if (espera) return enviarJson(res, 429, { ok: false, error: `Demasiadas importaciones. Espera ${espera} min.` });

  const b = await leerJson(req, 1024 * 1024); // hasta 1 MB
  if (!Array.isArray(b.filas) || b.filas.length === 0) return enviarJson(res, 400, { ok: false, error: 'El archivo no tiene filas para importar.' });
  if (b.filas.length > 3000) return enviarJson(res, 400, { ok: false, error: 'Máximo 3.000 movimientos por archivo.' });

  let cuentaId = Number(b.cuentaId) || null;
  if (cuentaId) {
    const cuenta = await fdb.obtenerCuenta(usuario.id, cuentaId);
    if (!cuenta || cuenta.origen !== 'manual') return enviarJson(res, 400, { ok: false, error: 'Elige una de tus cuentas manuales.' });
  } else {
    const nombre = textoLimpio(b.nombreCuentaNueva, 60) || 'Cuenta importada';
    const tipo = TIPOS_CUENTA.includes(b.tipoCuentaNueva) ? b.tipoCuentaNueva : 'ahorros';
    cuentaId = await fdb.crearCuentaManual({ usuarioId: usuario.id, nombre, tipo, saldoInicial: 0 });
    await auditoria.registrar(usuario.id, 'cuenta_manual_creada', nombre);
  }

  const validas = [];
  let invalidas = 0;
  const vistas = {};
  for (const f of b.filas) {
    const descripcion = textoLimpio(f && f.descripcion, 120);
    const monto = Math.round(Number(f && f.monto) * 100) / 100;
    if (!f || !fechaValida(f.fecha) || !descripcion || !Number.isFinite(monto) || monto === 0 || Math.abs(monto) > 10_000_000_000) {
      invalidas++;
      continue;
    }
    // Identificador estable: importar el mismo extracto dos veces no duplica
    const base = `${f.fecha}|${descripcion}|${monto}`;
    vistas[base] = (vistas[base] || 0) + 1;
    const idExterno = 'csv-' + crypto.createHash('sha256').update(`${base}|${vistas[base]}`).digest('hex').slice(0, 32);
    validas.push({ id_externo: idExterno, fecha: f.fecha, monto, descripcion_cifrada: cifrar(descripcion), categoria: categorizar(descripcion, monto) });
  }
  const nuevos = await fdb.insertarMovimientos(usuario.id, cuentaId, 'extracto', validas);
  await auditoria.registrar(usuario.id, 'extracto_importado', `${nuevos} movimientos`);
  enviarJson(res, 201, { ok: true, cuentaId, importados: nuevos, duplicados: validas.length - nuevos, invalidas });
}

// ------------------------------ PRIVACIDAD -----------------------------

async function privacidad(req, res) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const consentimientos = (await fdb.listarConsentimientos(usuario.id)).map((c) => ({
    ...c,
    banco: openfinance.nombreBanco(c.institucion),
    estado: c.estado === 'activo' && new Date(c.expira_en) < new Date() ? 'vencido' : c.estado,
  }));
  enviarJson(res, 200, { ok: true, consentimientos, historial: await auditoria.listar(usuario.id, 60), textoConsentimiento: openfinance.textoConsentimiento() });
}

async function exportar(req, res) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const perfil = await db.buscarUsuarioCompleto(usuario.id);
  delete perfil.password_hash; // nunca se exporta (ni siquiera cifrada)
  const datos = {
    generado_en: new Date().toISOString(),
    nota: 'Copia de todos los datos que Auto-Wealth tiene sobre ti (Ley 1581 de 2012, derecho de acceso).',
    perfil,
    autorizaciones: await fdb.listarConsentimientos(usuario.id),
    cuentas: await fdb.listarCuentas(usuario.id),
    movimientos: descifrarMovimientos(await fdb.listarMovimientos(usuario.id)),
    deudas: (await fdb.listarDeudas(usuario.id)).map(deudaParaRespuesta),
    pagos_e_inversiones: await fdb.listarRedirecciones(usuario.id),
    historial: await auditoria.listar(usuario.id, 1000),
  };
  await auditoria.registrar(usuario.id, 'datos_exportados', '');
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="mis-datos-autowealth-${hoyISO()}.json"`,
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(datos, null, 2));
}

// Las acciones irreversibles piden la contraseña otra vez
async function confirmarContrasena(req, res, usuario) {
  const espera = limiteContrasena(String(usuario.id));
  if (espera) { enviarJson(res, 429, { ok: false, error: `Demasiados intentos. Espera ${espera} min.` }); return false; }
  const b = await leerJson(req);
  const completo = await db.buscarUsuarioCompleto(usuario.id);
  const ok = typeof b.password === 'string' && await verificarContrasena(b.password, completo.password_hash);
  if (!ok) enviarJson(res, 401, { ok: false, error: 'La contraseña no es correcta.' });
  return ok;
}

async function borrarFinanzas(req, res) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario || !(await confirmarContrasena(req, res, usuario))) return;
  await openfinance.revocarTodas(usuario.id);
  await fdb.borrarFinanzas(usuario.id);
  await auditoria.registrar(usuario.id, 'finanzas_borradas', '');
  enviarJson(res, 200, { ok: true });
}

async function eliminarCuentaUsuario(req, res) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario || !(await confirmarContrasena(req, res, usuario))) return;
  await openfinance.revocarTodas(usuario.id);
  await db.eliminarUsuario(usuario.id); // borra en cascada todo lo relacionado
  console.log(`🗑️  Cuenta eliminada a petición del usuario (id ${usuario.id})`);
  enviarJson(res, 200, { ok: true }, { 'Set-Cookie': cookieCerrarSesion() });
}

module.exports = {
  resumen, listarMovimientos, crearMovimiento, actualizarMovimiento, eliminarMovimiento,
  listarCuentas, crearCuenta, eliminarCuenta, importar,
  privacidad, exportar, borrarFinanzas, eliminarCuentaUsuario,
};
