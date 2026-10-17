// =====================================================================
//  openfinance/pagos.js — Mover el dinero ocioso: abonar a una deuda o
//  invertir en renta fija, como una "INICIACIÓN DE PAGOS".
//
//  Cómo funciona (igual que un pago iniciado por una app en un banco real):
//   1. SOLICITUD: el usuario elige el paso del plan, la cuenta de origen y el
//      valor, y acepta el texto de autorización de ESE pago.
//      → POST /api/finanzas/redirecciones
//   2. AUTORIZACIÓN EN EL BANCO: se le envía a la pantalla de su banco, que le
//      muestra el valor, la cuenta y el concepto. Ahí autoriza o rechaza.
//      Auto-Wealth nunca ve la clave del banco ni mueve dinero por su cuenta.
//   3. REGRESO: el banco devuelve un código de un solo uso + el "state".
//      → GET /openfinance/retorno-pago
//   4. CONFIRMACIÓN: se canjea el código, se marca el pago como hecho, se
//      descuenta de la deuda y se sincroniza el banco para ver el movimiento.
//
//  ⚠️ PROTOTIPO: solo funciona con el banco de prueba. Ningún pago es real.
//  Hacerlo con bancos reales exige autorizaciones de la Superintendencia
//  Financiera que Auto-Wealth no tiene (ver docs/redireccion-de-dinero.md).
// =====================================================================
const crypto = require('node:crypto');
const fdb = require('../finanzas/db');
const auditoria = require('../auditoria');
const { descifrar, huella } = require('../cifrado');
const { calcularPlan, TIPOS_DEUDA, DESTINOS_INVERSION, AUTORIZACION_PAGO } = require('../finanzas/deudas');
const { CUENTAS_PARA_PAGAR } = require('../finanzas/analisis');
const { enviarJson, leerJson } = require('../http');
const { exigirUsuario, usuarioActual } = require('../sesion');
const { crearLimitador } = require('../seguridad');
const { proveedor, sincronizarConexion, nombreBanco, RECEPTOR } = require('./index');

const MONTO_MINIMO = 1000;
const TOPE_VALOR = 10_000_000_000;
const limitePagos = crearLimitador({ maximo: 10, ventanaMin: 15 });

const pesos = (v) => '$' + Math.round(v).toLocaleString('es-CO');

// POST /api/finanzas/redirecciones
//   { tipo: "pago_deuda", deudaId, cuentaId, monto, acepta: true }
//   { tipo: "inversion", destino: "cdt" | "fondo_renta_fija", cuentaId, monto, acepta: true }
async function crearRedireccion(req, res) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const espera = limitePagos(String(usuario.id));
  if (espera) return enviarJson(res, 429, { ok: false, error: `Demasiadas solicitudes. Espera ${espera} min.` });

  const b = await leerJson(req);
  if (!['pago_deuda', 'inversion'].includes(b.tipo)) return enviarJson(res, 400, { ok: false, error: 'Indica si es un pago de deuda o una inversión.' });
  const monto = Math.round(Number(b.monto));
  if (!Number.isFinite(monto) || monto < MONTO_MINIMO || monto > TOPE_VALOR) {
    return enviarJson(res, 400, { ok: false, error: `Escribe un valor de al menos ${pesos(MONTO_MINIMO)}.` });
  }
  if (b.acepta !== true) return enviarJson(res, 400, { ok: false, error: 'Debes aceptar la autorización del pago para continuar.' });

  // Cuenta de origen: debe ser del usuario, de un banco conectado y con la autorización vigente
  const cuenta = await fdb.obtenerCuentaParaPago(usuario.id, Number(b.cuentaId) || 0);
  if (!cuenta) return enviarJson(res, 404, { ok: false, error: 'Cuenta no encontrada.' });
  if (cuenta.origen !== 'openfinance' || !CUENTAS_PARA_PAGAR.includes(cuenta.tipo)) {
    return enviarJson(res, 400, { ok: false, error: 'Solo se puede pagar desde una cuenta de ahorros, corriente o billetera de un banco conectado.' });
  }
  if (cuenta.vencida) return enviarJson(res, 409, { ok: false, error: 'La autorización de ese banco venció. Revócala y vuelve a conectarlo.' });
  if (monto > cuenta.saldo) return enviarJson(res, 400, { ok: false, error: `Esa cuenta tiene ${pesos(cuenta.saldo)}. Escribe un valor menor.` });

  // Destino: una deuda propia con saldo, o un tipo de inversión válido
  let deuda = null;
  let concepto;
  if (b.tipo === 'pago_deuda') {
    deuda = await fdb.obtenerDeuda(usuario.id, Number(b.deudaId) || 0);
    if (!deuda) return enviarJson(res, 404, { ok: false, error: 'Deuda no encontrada.' });
    if (monto > deuda.saldo) return enviarJson(res, 400, { ok: false, error: `Esa deuda tiene un saldo de ${pesos(deuda.saldo)}. No puedes abonar más.` });
    concepto = (TIPOS_DEUDA[deuda.tipo] || TIPOS_DEUDA.otro).concepto;
  } else {
    if (!DESTINOS_INVERSION[b.destino]) return enviarJson(res, 400, { ok: false, error: 'Elige CDT o fondo de renta fija.' });
    concepto = DESTINOS_INVERSION[b.destino].concepto;
  }

  // El colchón de emergencia no se toca: solo se mueve dinero ocioso
  const { plan } = await calcularPlan(usuario.id);
  if (monto > plan.dineroOcioso) {
    return enviarJson(res, 400, {
      ok: false,
      error: plan.dineroOcioso > 0
        ? `Ese valor tocaría tu colchón de emergencia (${plan.mesesReserva} meses de gastos). Puedes mover hasta ${pesos(plan.dineroOcioso)}.`
        : `Hoy no tienes dinero ocioso: lo que tienes disponible es tu colchón de emergencia (${plan.mesesReserva} meses de gastos).`,
    });
  }

  const conexion = await fdb.obtenerConexion(usuario.id, cuenta.conexion_id);
  if (!conexion) return enviarJson(res, 404, { ok: false, error: 'Conexión no encontrada.' });

  const state = crypto.randomBytes(32).toString('base64url');
  const id = await fdb.crearRedireccion({
    usuarioId: usuario.id, tipo: b.tipo, deudaId: deuda ? deuda.id : null, destino: deuda ? null : b.destino,
    conexionId: conexion.id, cuentaIdExterno: cuenta.id_externo, cuentaNombre: cuenta.nombre,
    monto, version: AUTORIZACION_PAGO.version, stateHash: huella(state),
  });
  const { url } = await proveedor().crearPago({
    token: descifrar(conexion.token_cifrado), usuarioId: usuario.id, institucion: conexion.institucion,
    cuentaIdExterno: cuenta.id_externo, monto, concepto, state, receptor: RECEPTOR,
  });
  await auditoria.registrar(usuario.id, 'redireccion_solicitada',
    `${b.tipo === 'pago_deuda' ? 'Pago de deuda' : 'Inversión en renta fija'} · ${nombreBanco(conexion.institucion)} · simulado`);
  enviarJson(res, 201, { ok: true, id, url });
}

// GET /openfinance/retorno-pago?state=...&code=...   (aquí regresa el usuario desde el banco)
async function retornoPago(req, res, url) {
  const ir = (destino) => { res.writeHead(303, { Location: destino }); res.end(); };
  const usuario = await usuarioActual(req);
  if (!usuario) return ir('/?sesion=vencida');

  const state = url.searchParams.get('state') || '';
  const r = state ? await fdb.buscarRedireccionPorState(huella(state)) : null;
  // El "state" debe existir, ser de este usuario, estar pendiente y ser reciente (15 min)
  if (!r || r.usuario_id !== usuario.id || r.estado !== 'pendiente' || !r.reciente) return ir('/app?pago=invalido#plan');

  const error = url.searchParams.get('error');
  if (error || !url.searchParams.get('code')) {
    const sinFondos = error === 'fondos_insuficientes';
    await fdb.cerrarRedireccion(r.id, sinFondos ? 'fallida' : 'rechazada');
    await auditoria.registrar(usuario.id, 'redireccion_rechazada', sinFondos ? 'El banco no tenía fondos suficientes' : 'Rechazaste el pago en el banco');
    return ir(`/app?pago=${sinFondos ? 'sin-fondos' : 'rechazado'}#plan`);
  }

  try {
    const { idPago } = await proveedor().confirmarPago({ code: url.searchParams.get('code'), state });
    await fdb.cerrarRedireccion(r.id, 'ejecutada', String(idPago));
    if (r.tipo === 'pago_deuda' && r.deuda_id) await fdb.abonarDeuda(usuario.id, r.deuda_id, r.monto);
    await auditoria.registrar(usuario.id, 'redireccion_ejecutada',
      `${r.tipo === 'pago_deuda' ? 'Pago de deuda' : 'Inversión en renta fija'} · simulado`);
  } catch (err) {
    console.error('Error confirmando un pago:', err.message);
    await fdb.cerrarRedireccion(r.id, 'fallida').catch(() => {});
    return ir('/app?pago=error#plan');
  }

  // Traer del banco el movimiento del pago y el saldo nuevo. Si falla, el pago igual quedó hecho.
  if (r.conexion_id) {
    await sincronizarConexion(usuario.id, r.conexion_id).catch((err) => console.error('No se pudo sincronizar después del pago:', err.message));
  }
  return ir('/app?pago=ejecutado#plan');
}

module.exports = { crearRedireccion, retornoPago };
