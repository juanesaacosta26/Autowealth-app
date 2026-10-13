// =====================================================================
//  openfinance/index.js — El flujo de Open Finance de Auto-Wealth.
//
//  1. CONSENTIMIENTO: el usuario elige su banco y acepta un texto claro que
//     dice quién recibe los datos, cuáles, para qué y por cuánto tiempo
//     (los elementos que exige el Decreto 0368 de 2026).
//  2. AUTORIZACIÓN EN EL BANCO: se le envía a la pantalla de su banco.
//     Auto-Wealth NUNCA pide ni ve la clave del banco.
//  3. REGRESO: el banco devuelve un código de un solo uso + el "state"
//     (que comprueba que la respuesta corresponde a esta solicitud).
//  4. CONEXIÓN: se cambia el código por un token, que se guarda CIFRADO.
//  5. SINCRONIZACIÓN: se traen cuentas, saldos y movimientos (solo lectura).
//  6. REVOCACIÓN: el usuario puede cortar el acceso cuando quiera; se avisa
//     al proveedor y se borran los datos traídos de ese banco.
// =====================================================================
const crypto = require('node:crypto');
const config = require('../config');
const fdb = require('../finanzas/db');
const auditoria = require('../auditoria');
const { cifrar, descifrar, huella } = require('../cifrado');
const { categorizar } = require('../finanzas/categorias');
const { enviarJson, leerJson } = require('../http');
const { exigirUsuario, usuarioActual } = require('../sesion');
const { crearLimitador } = require('../seguridad');

const PROVEEDORES = { simulado: require('./simulado') };
const proveedor = () => PROVEEDORES[config.openFinance.proveedor];

const RECEPTOR = 'Auto-Wealth';
const VERSION_TEXTO = 'OF-2026-10-v1';
const ALCANCE = ['cuentas', 'saldos', 'movimientos'];
const FINALIDAD = 'Mostrarte un resumen de tus finanzas personales (ingresos, gastos, ahorro, suscripciones) ' +
  'y darte recomendaciones dentro de Auto-Wealth. Tus datos no se venden ni se comparten con terceros.';

const limiteSync = crearLimitador({ maximo: 1, ventanaMin: 1 }); // una sincronización por minuto por conexión
const limiteConsent = crearLimitador({ maximo: 10, ventanaMin: 15 });

// Texto de consentimiento que se muestra al usuario (la app lo pinta tal cual)
function textoConsentimiento() {
  return {
    version: VERSION_TEXTO,
    receptor: RECEPTOR,
    datos: [
      'Tus cuentas y productos (tipo y últimos 4 dígitos)',
      'Los saldos de esas cuentas',
      'Tus movimientos de los últimos 12 meses',
    ],
    finalidad: FINALIDAD,
    duracionMeses: config.openFinance.mesesConsentimiento,
    tipoAcceso: 'Solo lectura. Auto-Wealth no puede mover tu dinero ni hacer pagos.',
    derechos: 'Puedes revocar esta autorización cuando quieras desde "Privacidad". Al revocarla, borramos los datos traídos de ese banco. ' +
      'También puedes conocer, actualizar, rectificar y suprimir tus datos (Ley 1581 de 2012 y Ley 1266 de 2008).',
  };
}

// ---------------------------------------------------------------------
//  Rutas de la API
// ---------------------------------------------------------------------

// GET /api/openfinance/bancos
async function bancos(req, res) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  enviarJson(res, 200, { ok: true, proveedor: proveedor().nombre, bancos: proveedor().instituciones(), consentimiento: textoConsentimiento() });
}

// POST /api/openfinance/consentimientos  { institucion, acepta: true }
async function crearConsentimiento(req, res) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const espera = limiteConsent(String(usuario.id));
  if (espera) return enviarJson(res, 429, { ok: false, error: `Demasiadas solicitudes. Espera ${espera} min.` });

  const body = await leerJson(req);
  const banco = proveedor().institucionPorId(body.institucion);
  if (!banco) return enviarJson(res, 400, { ok: false, error: 'Elige un banco de la lista.' });
  if (body.acepta !== true) return enviarJson(res, 400, { ok: false, error: 'Debes aceptar la autorización para continuar.' });

  const state = crypto.randomBytes(32).toString('base64url');
  await fdb.crearConsentimiento({
    usuarioId: usuario.id, proveedor: proveedor().nombre, institucion: banco.id, alcance: ALCANCE.join(','),
    finalidad: FINALIDAD, version: VERSION_TEXTO, meses: config.openFinance.mesesConsentimiento, stateHash: huella(state),
  });
  const url = proveedor().urlAutorizacion({
    state, institucion: banco.id, alcance: ALCANCE, meses: config.openFinance.mesesConsentimiento, receptor: RECEPTOR,
  });
  enviarJson(res, 201, { ok: true, url });
}

// GET /openfinance/retorno?state=...&code=...   (aquí regresa el usuario desde el banco)
async function retorno(req, res, url) {
  const ir = (destino) => { res.writeHead(303, { Location: destino }); res.end(); };
  const usuario = await usuarioActual(req);
  if (!usuario) return ir('/?sesion=vencida');

  const state = url.searchParams.get('state') || '';
  const consentimiento = state ? await fdb.buscarConsentimientoPorState(huella(state)) : null;
  // El "state" debe existir, ser de este usuario, estar pendiente y ser reciente (15 min)
  if (!consentimiento || consentimiento.usuario_id !== usuario.id || consentimiento.estado !== 'pendiente' || !consentimiento.reciente) {
    return ir('/app?of=invalido');
  }

  if (url.searchParams.get('error') || !url.searchParams.get('code')) {
    await fdb.cambiarEstadoConsentimiento(consentimiento.id, 'rechazado');
    await auditoria.registrar(usuario.id, 'consentimiento_rechazado', nombreBanco(consentimiento.institucion));
    return ir('/app?of=rechazado');
  }

  try {
    const { token } = await proveedor().canjearCodigo({ code: url.searchParams.get('code'), state });
    await fdb.cambiarEstadoConsentimiento(consentimiento.id, 'activo');
    const conexionId = await fdb.crearConexion({
      usuarioId: usuario.id, consentimientoId: consentimiento.id, proveedor: consentimiento.proveedor,
      institucion: consentimiento.institucion, tokenCifrado: cifrar(token),
    });
    await auditoria.registrar(usuario.id, 'consentimiento_otorgado',
      `${nombreBanco(consentimiento.institucion)} · datos: ${consentimiento.alcance} · versión ${VERSION_TEXTO}`);
    await auditoria.registrar(usuario.id, 'conexion_creada', nombreBanco(consentimiento.institucion));
    await sincronizarConexion(usuario.id, conexionId);
    return ir('/app?of=conectado');
  } catch (err) {
    console.error('Error completando la conexión Open Finance:', err.message);
    await fdb.cambiarEstadoConsentimiento(consentimiento.id, 'rechazado').catch(() => {});
    return ir('/app?of=error');
  }
}

// Trae cuentas y movimientos del proveedor y los guarda (descripciones cifradas)
async function sincronizarConexion(usuarioId, conexionId) {
  const conexion = await fdb.obtenerConexion(usuarioId, conexionId);
  if (!conexion) throw Object.assign(new Error('Conexión no encontrada'), { estado: 404 });
  if (conexion.vencida) {
    throw Object.assign(new Error('La autorización de este banco venció. Revócala y vuelve a conectarlo.'), { estado: 409 });
  }
  const datos = await proveedor().obtenerDatos({ token: descifrar(conexion.token_cifrado), usuarioId });

  const idsCuentas = {};
  for (const c of datos.cuentas) {
    idsCuentas[c.idExterno] = await fdb.guardarCuentaExterna({
      usuarioId, conexionId, idExterno: c.idExterno, nombre: c.nombre, tipo: c.tipo,
      ultimos4: c.ultimos4 ? String(c.ultimos4).slice(-4) : null, saldo: c.saldo,
    });
  }
  let nuevos = 0;
  for (const [idExterno, cuentaId] of Object.entries(idsCuentas)) {
    const filas = datos.movimientos
      .filter((m) => m.idExternoCuenta === idExterno)
      .map((m) => ({
        id_externo: m.idExterno, fecha: m.fecha, monto: m.monto,
        descripcion_cifrada: cifrar(m.descripcion), categoria: categorizar(m.descripcion, m.monto),
      }));
    nuevos += await fdb.insertarMovimientos(usuarioId, cuentaId, 'openfinance', filas);
  }
  await fdb.marcarSincronizada(conexionId);
  await auditoria.registrar(usuarioId, 'sincronizacion', `${nombreBanco(conexion.institucion)} · ${nuevos} movimientos nuevos`);
  return { nuevos, cuentas: datos.cuentas.length };
}

// POST /api/openfinance/conexiones/:id/sincronizar
async function sincronizar(req, res, params) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const espera = limiteSync(`${usuario.id}:${params.id}`);
  if (espera) return enviarJson(res, 429, { ok: false, error: 'Ya se actualizó hace un momento. Intenta en un minuto.' });
  try {
    const r = await sincronizarConexion(usuario.id, Number(params.id));
    enviarJson(res, 200, { ok: true, ...r });
  } catch (err) {
    if (err.estado) return enviarJson(res, err.estado, { ok: false, error: err.message });
    throw err;
  }
}

// DELETE /api/openfinance/conexiones/:id   (revocar autorización)
async function revocar(req, res, params) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const conexion = await fdb.obtenerConexion(usuario.id, Number(params.id));
  if (!conexion) return enviarJson(res, 404, { ok: false, error: 'Conexión no encontrada.' });
  await revocarConexion(usuario.id, conexion);
  enviarJson(res, 200, { ok: true });
}

async function revocarConexion(usuarioId, conexion) {
  try {
    await proveedor().revocar({ token: descifrar(conexion.token_cifrado) });
  } catch (err) {
    console.error('El proveedor no confirmó la revocación:', err.message); // igual se borra aquí
  }
  await fdb.eliminarConexion(usuarioId, conexion.id); // borra cuentas y movimientos de ese banco
  await fdb.cambiarEstadoConsentimiento(conexion.consentimiento_id, 'revocado');
  await auditoria.registrar(usuarioId, 'consentimiento_revocado', `${nombreBanco(conexion.institucion)} · datos borrados`);
}

// Revoca todas las conexiones de un usuario (al borrar sus datos o su cuenta)
async function revocarTodas(usuarioId) {
  for (const c of await fdb.listarConexiones(usuarioId)) {
    const completa = await fdb.obtenerConexion(usuarioId, c.id);
    if (completa) await revocarConexion(usuarioId, completa);
  }
}

function nombreBanco(id) {
  const b = proveedor().institucionPorId(id);
  return b ? b.nombre : id;
}

// Páginas propias del proveedor (solo el simulado las tiene)
async function manejarRutaProveedor(req, res, ruta, url) {
  return proveedor().manejarRuta ? proveedor().manejarRuta(req, res, ruta, url) : false;
}

module.exports = {
  bancos, crearConsentimiento, retorno, sincronizar, revocar, revocarTodas,
  manejarRutaProveedor, nombreBanco, textoConsentimiento,
};
