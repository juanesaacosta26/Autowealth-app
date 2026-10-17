// =====================================================================
//  finanzas/deudas.js — Deudas del usuario y plan para su dinero ocioso.
//  Todas las rutas exigen sesión y solo tocan los datos de ese usuario.
//
//   GET    /api/finanzas/deudas          → lista de deudas y tipos válidos
//   POST   /api/finanzas/deudas          → registrar una deuda
//   PATCH  /api/finanzas/deudas/:id      → actualizar saldo, tasa, cuota, día de pago o nombre
//   DELETE /api/finanzas/deudas/:id      → borrar una deuda
//   GET    /api/finanzas/plan            → dinero ocioso y plan sugerido (pagar deudas / renta fija)
//   GET    /api/finanzas/redirecciones   → historial de pagos e inversiones pedidos
//
//  Mover el dinero (iniciar el pago en el banco) está en src/openfinance/pagos.js.
//  IMPORTANTE: el plan es EDUCACIÓN FINANCIERA. No recomienda productos ni
//  entidades específicas ni promete rentabilidades (ver docs/redireccion-de-dinero.md).
// =====================================================================
const fdb = require('./db');
const auditoria = require('../auditoria');
const { cifrar, descifrar } = require('../cifrado');
const { planDineroOcioso, CUENTAS_PARA_PAGAR } = require('./analisis');
const { enviarJson, leerJson } = require('../http');
const { exigirUsuario } = require('../sesion');

// Tipos de deuda. La etiqueta en MAYÚSCULAS sin tildes es la que ve el banco en el concepto del pago.
const TIPOS_DEUDA = {
  tarjeta_credito: { nombre: 'Tarjeta de crédito', concepto: 'PAGO TARJETA DE CREDITO' }, // pago entre cuentas propias
  consumo: { nombre: 'Crédito de consumo', concepto: 'PAGO DEUDA CREDITO DE CONSUMO' },
  libre_inversion: { nombre: 'Crédito de libre inversión', concepto: 'PAGO DEUDA LIBRE INVERSION' },
  vehiculo: { nombre: 'Crédito de vehículo', concepto: 'PAGO DEUDA CREDITO VEHICULO' },
  hipotecario: { nombre: 'Crédito hipotecario', concepto: 'PAGO DEUDA CREDITO HIPOTECARIO' },
  educativo: { nombre: 'Crédito educativo', concepto: 'PAGO DEUDA CREDITO EDUCATIVO' },
  libranza: { nombre: 'Libranza', concepto: 'PAGO DEUDA LIBRANZA' },
  otro: { nombre: 'Otra deuda', concepto: 'PAGO DEUDA' },
};

// Destinos de inversión GENÉRICOS (no son productos ni entidades): solo explican cómo funciona cada uno
const DESTINOS_INVERSION = {
  cdt: {
    nombre: 'CDT (certificado de depósito a término)',
    concepto: 'INVERSION RENTA FIJA CDT',
    explicacion: 'Dejas el dinero quieto un plazo fijo (por ejemplo 90 o 180 días) a una tasa que conoces desde el inicio. '
      + 'No lo puedes sacar antes del plazo. Los CDT de bancos tienen el seguro de depósitos de Fogafín hasta un monto máximo.',
  },
  fondo_renta_fija: {
    nombre: 'Fondo de inversión colectiva de renta fija',
    concepto: 'INVERSION RENTA FIJA FONDO',
    explicacion: 'Juntas tu dinero con el de muchas personas para comprar deuda (CDT, bonos). Sueles poder retirarlo en pocos días, '
      + 'pero la rentabilidad cambia y puede ser negativa algunos días. No tiene seguro de depósitos.',
  },
};

const AVISO_EDUCATIVO = 'Esto es educación financiera, no asesoría de inversión: Auto-Wealth no recomienda productos ni entidades '
  + 'y no promete rentabilidades. Antes de invertir, compara opciones de entidades vigiladas por la Superintendencia Financiera.';

// Texto que el usuario acepta antes de ir al banco a confirmar un pago (la página lo muestra tal cual).
// Se guarda la versión en cada solicitud: si cambias el texto, SUBE la versión.
const AUTORIZACION_PAGO = {
  version: 'PG-2026-10-v1',
  condiciones: [
    'Es un pago único: no autoriza pagos futuros ni automáticos.',
    'Lo confirmas tú en tu banco. Auto-Wealth no ve tu clave ni puede cambiar el valor, la cuenta ni el destino.',
    'Si no lo confirmas en 15 minutos, la solicitud vence y no se mueve nada.',
    'PROTOTIPO: el banco es de prueba y el pago es simulado. No se mueve dinero real.',
  ],
};

const MAX_DEUDAS = 30;
const TOPE_VALOR = 10_000_000_000;
const textoLimpio = (t, max) => (typeof t === 'string' ? t.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const numero = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const mesActual = () => new Date().toISOString().slice(0, 7);

// Revisa los datos de una deuda. Con parcial = true (PATCH) solo valida los campos que llegan.
// Devuelve { datos } o { error } con un mensaje para mostrar.
function validarDeuda(b, { parcial = false } = {}) {
  const datos = {};
  if (!parcial || b.nombre !== undefined) {
    const nombre = textoLimpio(b.nombre, 60);
    if (nombre.length < 2) return { error: 'Ponle un nombre a la deuda (ej. "Tarjeta Visa" o "Crédito del carro").' };
    datos.nombre = nombre;
  }
  if (!parcial) {
    if (!TIPOS_DEUDA[b.tipo]) return { error: 'Elige el tipo de deuda.' };
    datos.tipo = b.tipo;
  }
  if (!parcial || b.saldo !== undefined) {
    const saldo = Math.round(numero(b.saldo));
    const minimo = parcial ? 0 : 1; // al actualizar se puede poner 0 (ya la pagaste)
    if (!Number.isFinite(saldo) || saldo < minimo || saldo > TOPE_VALOR) return { error: 'Escribe cuánto debes (un valor mayor que cero).' };
    datos.saldo = saldo;
  }
  if (!parcial || b.tasaEA !== undefined) {
    const tasa = Math.round(numero(b.tasaEA) * 100) / 100;
    if (!Number.isFinite(tasa) || tasa < 0 || tasa > 100) return { error: 'Escribe la tasa efectiva anual en % (entre 0 y 100). Está en el extracto de tu deuda.' };
    datos.tasaEA = tasa;
  }
  if (b.cuotaMinima !== undefined && b.cuotaMinima !== '') {
    const cuota = Math.round(numero(b.cuotaMinima));
    if (!Number.isFinite(cuota) || cuota < 0 || cuota > TOPE_VALOR) return { error: 'La cuota mínima no es válida.' };
    datos.cuotaMinima = cuota;
  } else if (!parcial) datos.cuotaMinima = 0;
  if (b.diaPago !== undefined) {
    if (b.diaPago === null || b.diaPago === '') datos.diaPago = null;
    else {
      const dia = numero(b.diaPago);
      if (!Number.isInteger(dia) || dia < 1 || dia > 31) return { error: 'El día de pago debe estar entre 1 y 31.' };
      datos.diaPago = dia;
    }
  } else if (!parcial) datos.diaPago = null;
  if (parcial && Object.keys(datos).length === 0) return { error: 'No llegó ningún dato para cambiar.' };
  return { datos };
}

// Convierte la fila de la base de datos en lo que ve la página (con el nombre descifrado)
function deudaParaRespuesta(d) {
  let nombre;
  try { nombre = descifrar(d.nombre_cifrado); } catch { nombre = '(no se pudo leer)'; }
  return {
    id: d.id, nombre, tipo: d.tipo, tipoNombre: (TIPOS_DEUDA[d.tipo] || TIPOS_DEUDA.otro).nombre,
    saldo: d.saldo, tasaEA: d.tasa_ea, cuotaMinima: d.cuota_minima, diaPago: d.dia_pago, actualizadoEn: d.actualizado_en,
  };
}

// ------------------------------- DEUDAS -------------------------------

async function listarDeudas(req, res) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const deudas = (await fdb.listarDeudas(usuario.id)).map(deudaParaRespuesta);
  enviarJson(res, 200, {
    ok: true,
    deudas,
    total: deudas.reduce((a, d) => a + d.saldo, 0),
    tipos: Object.entries(TIPOS_DEUDA).map(([id, t]) => ({ id, nombre: t.nombre })),
  });
}

async function crearDeuda(req, res) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const { datos, error } = validarDeuda(await leerJson(req));
  if (error) return enviarJson(res, 400, { ok: false, error });
  if (await fdb.contarDeudas(usuario.id) >= MAX_DEUDAS) {
    return enviarJson(res, 400, { ok: false, error: `Puedes registrar hasta ${MAX_DEUDAS} deudas.` });
  }
  const id = await fdb.crearDeuda({ usuarioId: usuario.id, ...datos, nombreCifrado: cifrar(datos.nombre) });
  await auditoria.registrar(usuario.id, 'deuda_registrada', TIPOS_DEUDA[datos.tipo].nombre);
  enviarJson(res, 201, { ok: true, id });
}

async function actualizarDeuda(req, res, params) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const { datos, error } = validarDeuda(await leerJson(req), { parcial: true });
  if (error) return enviarJson(res, 400, { ok: false, error });
  const cambios = { ...datos, nombreCifrado: datos.nombre ? cifrar(datos.nombre) : undefined };
  const ok = await fdb.actualizarDeuda(usuario.id, Number(params.id), cambios);
  if (!ok) return enviarJson(res, 404, { ok: false, error: 'Deuda no encontrada.' });
  await auditoria.registrar(usuario.id, 'deuda_actualizada', `deuda ${params.id}`);
  enviarJson(res, 200, { ok: true });
}

async function eliminarDeuda(req, res, params) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const ok = await fdb.eliminarDeuda(usuario.id, Number(params.id));
  if (!ok) return enviarJson(res, 404, { ok: false, error: 'Deuda no encontrada.' });
  await auditoria.registrar(usuario.id, 'deuda_eliminada', `deuda ${params.id}`);
  enviarJson(res, 200, { ok: true });
}

// --------------------------------- PLAN ---------------------------------

// Calcula el plan del usuario con sus datos actuales. También lo usa src/openfinance/pagos.js
// para no dejar mover más dinero del que el plan considera ocioso.
async function calcularPlan(usuarioId) {
  const mes = mesActual();
  const [a, m] = mes.split('-').map(Number);
  const desde = new Date(Date.UTC(a, m - 6, 1)).toISOString().slice(0, 10); // 6 meses hacia atrás
  const movimientos = await fdb.listarMovimientos(usuarioId, { desde });
  const cuentas = await fdb.listarCuentas(usuarioId);
  const deudas = (await fdb.listarDeudas(usuarioId)).map((d) => ({ ...d, nombre: deudaParaRespuesta(d).nombre }));
  const pendiente = await fdb.montoPendiente(usuarioId);
  const plan = planDineroOcioso({ movimientos, cuentas, deudas, mes, pendiente });
  return { plan, cuentas };
}

async function plan(req, res) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const { plan: p, cuentas } = await calcularPlan(usuario.id);
  // Cuentas desde las que se puede pedir un pago (de un banco conectado)
  const cuentasOrigen = cuentas
    .filter((c) => c.origen === 'openfinance' && CUENTAS_PARA_PAGAR.includes(c.tipo) && c.saldo > 0)
    .map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo, ultimos4: c.numero_ultimos4, saldo: c.saldo }));
  enviarJson(res, 200, {
    ok: true,
    plan: p,
    cuentasOrigen,
    destinos: Object.entries(DESTINOS_INVERSION).map(([id, d]) => ({ id, nombre: d.nombre, explicacion: d.explicacion })),
    autorizacionPago: AUTORIZACION_PAGO,
    aviso: AVISO_EDUCATIVO,
    simulado: true,
  });
}

// ----------------------------- REDIRECCIONES -----------------------------

async function listarRedirecciones(req, res) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const filas = await fdb.listarRedirecciones(usuario.id);
  const ejecutadas = filas.filter((r) => r.estado === 'ejecutada');
  enviarJson(res, 200, {
    ok: true,
    redirecciones: filas.map((r) => ({
      ...r,
      destinoNombre: r.destino && DESTINOS_INVERSION[r.destino] ? DESTINOS_INVERSION[r.destino].nombre : null,
    })),
    totales: {
      abonadoDeudas: ejecutadas.filter((r) => r.tipo === 'pago_deuda').reduce((a, r) => a + r.monto, 0),
      invertido: ejecutadas.filter((r) => r.tipo === 'inversion').reduce((a, r) => a + r.monto, 0),
    },
  });
}

module.exports = {
  listarDeudas, crearDeuda, actualizarDeuda, eliminarDeuda, plan, listarRedirecciones,
  calcularPlan, deudaParaRespuesta, TIPOS_DEUDA, DESTINOS_INVERSION, AVISO_EDUCATIVO, AUTORIZACION_PAGO,
};
