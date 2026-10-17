// =====================================================================
//  analisis.js — Convierte los movimientos en información útil:
//  ingresos, gastos, ahorro, gastos por categoría, suscripciones,
//  "gastos hormiga", fondo de emergencia y recomendaciones.
// =====================================================================
const { NEUTRA, normalizar } = require('./categorias');

const LIQUIDAS = ['ahorros', 'corriente', 'billetera', 'efectivo'];
const UMBRAL_HORMIGA = 25000; // compras pequeñas (en pesos) que, sumadas, pesan
const CATEGORIAS_HORMIGA = ['Restaurantes y domicilios', 'Transporte', 'Otros gastos', 'Entretenimiento', 'Mercado'];

const mesDe = (fecha) => fecha.slice(0, 7);

function mesesAtras(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const lista = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1));
    lista.push(d.toISOString().slice(0, 7));
  }
  return lista;
}

const redondear = (v) => Math.round(v);

// Ingresos y gastos de un grupo de movimientos (sin contar pasos entre cuentas propias)
function totales(movs) {
  let ingresos = 0;
  let gastos = 0;
  for (const m of movs) {
    if (m.categoria === NEUTRA) continue;
    if (m.monto > 0) ingresos += m.monto;
    else gastos += -m.monto;
  }
  return { ingresos: redondear(ingresos), gastos: redondear(gastos) };
}

// Un gasto que se repite en al menos 2 de los últimos 4 meses con un valor parecido = suscripción
function detectarSuscripciones(movs, mesesVentana) {
  const grupos = new Map();
  for (const m of movs) {
    if (m.monto >= 0 || m.categoria === NEUTRA || !mesesVentana.includes(mesDe(m.fecha))) continue;
    if (!['Suscripciones', 'Telefonía e internet', 'Servicios públicos', 'Otros gastos', 'Entretenimiento', 'Educación'].includes(m.categoria)) continue;
    const clave = normalizar(m.descripcion).replace(/[0-9*#.\-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(m);
  }
  const resultado = [];
  for (const lista of grupos.values()) {
    const meses = new Set(lista.map((m) => mesDe(m.fecha)));
    if (meses.size < 2) continue;
    const montos = lista.map((m) => -m.monto);
    const promedio = montos.reduce((a, b) => a + b, 0) / montos.length;
    const parecidos = montos.every((v) => Math.abs(v - promedio) <= promedio * 0.2);
    if (!parecidos) continue;
    const ultimo = lista.reduce((a, b) => (a.fecha > b.fecha ? a : b));
    resultado.push({ nombre: ultimo.descripcion, categoria: ultimo.categoria, montoMensual: redondear(promedio), ultimoCobro: ultimo.fecha });
  }
  return resultado.sort((a, b) => b.montoMensual - a.montoMensual);
}

const decimal = (v) => String(v).replace('.', ',');

function formatoPesos(v) {
  return '$' + Math.round(v).toLocaleString('es-CO');
}

function recomendaciones({ actual, suscripciones, hormiga, mesesFondo, tasaAhorro, porCategoria, hayDatos }) {
  const lista = [];
  if (!hayDatos) {
    lista.push({ tipo: 'info', texto: 'Conecta un banco o registra tus movimientos para ver recomendaciones personalizadas.' });
    return lista;
  }
  if (actual.ingresos > 0) {
    if (tasaAhorro < 0) lista.push({ tipo: 'alerta', texto: `En el mes gastaste ${formatoPesos(actual.gastos - actual.ingresos)} más de lo que ingresó. Revisa las categorías más altas.` });
    else if (tasaAhorro < 10) lista.push({ tipo: 'atencion', texto: `En el mes ahorraste el ${tasaAhorro}% de tus ingresos. Una meta sana es al menos el 10–20%.` });
    else lista.push({ tipo: 'bien', texto: `¡Bien! En el mes ahorraste el ${tasaAhorro}% de tus ingresos.` });
  }
  if (mesesFondo !== null) {
    if (mesesFondo < 3) lista.push({ tipo: 'atencion', texto: `Tu dinero disponible cubre ${decimal(mesesFondo)} meses de gastos. Se recomienda un fondo de emergencia de 3 a 6 meses.` });
    else lista.push({ tipo: 'bien', texto: `Tu dinero disponible cubre ${decimal(mesesFondo)} meses de gastos: tienes un buen colchón. Lo que exceda 6 meses podría rendir en un CDT o fondo de bajo riesgo.` });
  }
  if (suscripciones.length) {
    const total = suscripciones.filter((s) => s.categoria === 'Suscripciones').reduce((a, s) => a + s.montoMensual, 0);
    if (total > 0) lista.push({ tipo: 'info', texto: `Pagas ${formatoPesos(total)} al mes en suscripciones (${formatoPesos(total * 12)} al año). ¿Las usas todas?` });
  }
  if (hormiga.cantidad >= 8) {
    lista.push({ tipo: 'info', texto: `Hiciste ${hormiga.cantidad} compras pequeñas en el mes que suman ${formatoPesos(hormiga.total)}. Son "gastos hormiga": reducirlos a la mitad te ahorraría ${formatoPesos(hormiga.total / 2)} al mes.` });
  }
  const mayor = porCategoria[0];
  if (mayor && actual.gastos > 0 && mayor.total / actual.gastos > 0.35 && mayor.categoria !== 'Vivienda') {
    lista.push({ tipo: 'atencion', texto: `"${mayor.categoria}" es el ${Math.round((mayor.total / actual.gastos) * 100)}% de tus gastos del mes.` });
  }
  return lista;
}

// Dinero en cuentas que se pueden usar ya (no cuenta las tarjetas de crédito)
const dineroDisponible = (cuentas) => cuentas.filter((c) => LIQUIDAS.includes(c.tipo)).reduce((a, c) => a + c.saldo, 0);

// Gasto promedio de los 3 meses completos anteriores (o el del mes actual si no hay historia)
function gastoPromedioMensual(serie, actual) {
  const ultimos3 = serie.slice(-4, -1).filter((s) => s.gastos > 0);
  return ultimos3.length ? ultimos3.reduce((a, s) => a + s.gastos, 0) / ultimos3.length : actual.gastos;
}

// =====================================================================
//  PLAN PARA EL DINERO OCIOSO
//  "Dinero ocioso" = lo que tienes disponible por encima de un colchón de
//  emergencia de MESES_RESERVA meses de gastos. Ese colchón NUNCA se toca.
//  Con el ocioso, el plan sugiere (educación financiera, no asesoría):
//   1. Abonar a las deudas, de la tasa más alta a la más baja ("método avalancha"):
//      cada peso que abonas a una deuda al 28 % EA deja de costarte 28 % al año.
//   2. Si sobra, ponerlo en renta fija (CDT o fondo de renta fija), sin
//      recomendar un producto ni prometer rentabilidad.
// =====================================================================
const MESES_RESERVA = 3;
const CUENTAS_PARA_PAGAR = ['ahorros', 'corriente', 'billetera']; // de dónde puede salir un pago

function planDineroOcioso({ movimientos, cuentas, deudas, mes, pendiente = 0 }) {
  const serie = mesesAtras(mes, 6).map((mm) => ({ mes: mm, ...totales(movimientos.filter((m) => mesDe(m.fecha) === mm)) }));
  const actual = totales(movimientos.filter((m) => mesDe(m.fecha) === mes));
  const disponible = dineroDisponible(cuentas);
  const gastoPromedio = redondear(gastoPromedioMensual(serie, actual));
  const reserva = gastoPromedio * MESES_RESERVA;
  const notas = [];

  // Sin historia de gastos no sabemos cuánto colchón necesitas: por prudencia, no hay dinero ocioso
  let ocioso = gastoPromedio > 0 ? Math.max(0, redondear(disponible - reserva - pendiente)) : 0;
  if (gastoPromedio === 0) notas.push('Necesitamos al menos un mes de gastos registrados para calcular tu colchón de emergencia.');
  if (pendiente > 0) notas.push(`Descontamos ${formatoPesos(pendiente)} de pagos que pediste y todavía no autorizas en tu banco.`);

  // Solo se puede mover dinero desde cuentas de un banco conectado (el efectivo o una cuenta manual no)
  const movible = redondear(cuentas.filter((c) => c.origen === 'openfinance' && CUENTAS_PARA_PAGAR.includes(c.tipo))
    .reduce((a, c) => a + Math.max(0, c.saldo), 0));

  const pasos = [];
  let resto = ocioso;
  const pendientes = deudas.filter((d) => d.saldo > 0)
    .sort((a, b) => b.tasa_ea - a.tasa_ea || a.saldo - b.saldo); // tasa más alta primero; si empatan, la más pequeña
  for (const d of pendientes) {
    if (resto <= 0) break;
    const monto = Math.min(resto, redondear(d.saldo));
    pasos.push({
      tipo: 'pago_deuda', deudaId: d.id, nombre: d.nombre, deudaTipo: d.tipo, tasaEA: d.tasa_ea, monto,
      liquida: monto >= d.saldo,
      // Aproximación sencilla: intereses de un año sobre lo que abonas (no incluye capitalización)
      interesesEvitadosAnio: redondear(monto * d.tasa_ea / 100),
    });
    resto -= monto;
  }
  if (resto > 0) pasos.push({ tipo: 'inversion', destino: 'renta_fija', monto: resto });

  const tarjetasConectadas = cuentas.filter((c) => c.origen === 'openfinance' && c.tipo === 'tarjeta_credito' && c.saldo < 0)
    .reduce((a, c) => a - c.saldo, 0);
  if (tarjetasConectadas > 0 && !deudas.some((d) => d.tipo === 'tarjeta_credito')) {
    notas.push(`Tus tarjetas conectadas deben ${formatoPesos(tarjetasConectadas)}. Regístralas como deuda con su tasa para incluirlas en el plan.`);
  }
  if (ocioso > movible) {
    notas.push('Parte de tu dinero ocioso está en efectivo o en cuentas manuales: ese dinero lo mueves tú; desde aquí solo podemos pedir pagos a bancos conectados.');
  }

  return {
    mes,
    disponible: redondear(disponible),
    gastoPromedio,
    mesesReserva: MESES_RESERVA,
    reserva,
    dineroOcioso: ocioso,
    movible,
    deudaTotal: redondear(deudas.reduce((a, d) => a + d.saldo, 0)),
    pasos,
    notas,
  };
}

// Arma todo el resumen del panel para un mes ("YYYY-MM")
function resumen({ movimientos, cuentas, mes }) {
  const ventana6 = mesesAtras(mes, 6);
  const delMes = movimientos.filter((m) => mesDe(m.fecha) === mes);
  const actual = totales(delMes);

  const serie = ventana6.map((mm) => ({ mes: mm, ...totales(movimientos.filter((m) => mesDe(m.fecha) === mm)) }));

  const mapa = new Map();
  for (const m of delMes) {
    if (m.monto >= 0 || m.categoria === NEUTRA) continue;
    mapa.set(m.categoria, (mapa.get(m.categoria) || 0) + -m.monto);
  }
  const porCategoria = [...mapa.entries()].map(([categoria, total]) => ({ categoria, total: redondear(total) }))
    .sort((a, b) => b.total - a.total);

  const suscripciones = detectarSuscripciones(movimientos, mesesAtras(mes, 4));
  const nombresSusc = new Set(suscripciones.map((s) => normalizar(s.nombre)));
  const pequenas = delMes.filter((m) => m.monto < 0 && -m.monto <= UMBRAL_HORMIGA &&
    CATEGORIAS_HORMIGA.includes(m.categoria) && !nombresSusc.has(normalizar(m.descripcion)));
  const hormiga = { cantidad: pequenas.length, total: redondear(pequenas.reduce((a, m) => a - m.monto, 0)) };

  const disponible = dineroDisponible(cuentas);
  const deuda = cuentas.filter((c) => c.tipo === 'tarjeta_credito' && c.saldo < 0).reduce((a, c) => a - c.saldo, 0);
  const gastoPromedio = gastoPromedioMensual(serie, actual);
  const mesesFondo = gastoPromedio > 0 && cuentas.length ? Math.round((disponible / gastoPromedio) * 10) / 10 : null;
  const tasaAhorro = actual.ingresos > 0 ? Math.round(((actual.ingresos - actual.gastos) / actual.ingresos) * 100) : 0;

  return {
    mes,
    ingresos: actual.ingresos,
    gastos: actual.gastos,
    ahorro: actual.ingresos - actual.gastos,
    tasaAhorro,
    disponible: redondear(disponible),
    deudaTarjetas: redondear(deuda),
    mesesFondo,
    serie,
    porCategoria,
    suscripciones,
    hormiga,
    recomendaciones: recomendaciones({ actual, suscripciones, hormiga, mesesFondo, tasaAhorro, porCategoria, hayDatos: movimientos.length > 0 }),
  };
}

module.exports = { resumen, mesesAtras, planDineroOcioso, MESES_RESERVA, CUENTAS_PARA_PAGAR };
