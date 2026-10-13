// =====================================================================
//  openfinance/simulado.js — PROVEEDOR DE PRUEBA ("sandbox").
//
//  Imita a un banco que cumple el estándar de Open Finance:
//   1. Muestra su propia pantalla de autorización (como lo haría el banco real).
//   2. Si el usuario autoriza, devuelve un código de un solo uso.
//   3. Ese código se cambia por un "token" de acceso.
//   4. Con el token se piden cuentas, saldos y movimientos.
//
//  Los bancos son FICTICIOS y los datos se generan con un patrón realista de
//  gastos en Colombia. Nada aquí toca un banco real.
//
//  Un proveedor real (API estándar de la SFC o un agregador) debe ofrecer
//  estas mismas funciones: instituciones, urlAutorizacion, manejarRuta (si aplica),
//  canjearCodigo, obtenerDatos y revocar.
// =====================================================================
const crypto = require('node:crypto');

const nombre = 'simulado';

const INSTITUCIONES = [
  { id: 'ceiba', nombre: 'Banco Ceiba', tipo: 'banco', color: '#1f6f5c' },
  { id: 'andes', nombre: 'Banco Andes Unión', tipo: 'banco', color: '#1d4e89' },
  { id: 'colibri', nombre: 'Colibrí', tipo: 'billetera', color: '#b4441a' },
];

const instituciones = () => INSTITUCIONES.map(({ id, nombre: n, tipo }) => ({ id, nombre: n, tipo, demo: true }));
const institucionPorId = (id) => INSTITUCIONES.find((i) => i.id === id) || null;

// Códigos de autorización pendientes (un solo uso, vencen en 5 minutos)
const codigos = new Map();
setInterval(() => {
  const ahora = Date.now();
  for (const [k, v] of codigos) if (v.vence < ahora) codigos.delete(k);
}, 60_000).unref();

function urlAutorizacion({ state, institucion, alcance, meses, receptor }) {
  const p = new URLSearchParams({ banco: institucion, state, alcance: alcance.join(','), meses: String(meses), receptor });
  return '/banco-demo/autorizar?' + p.toString();
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ETIQUETAS_ALCANCE = {
  cuentas: 'Tus cuentas y productos (tipo y últimos 4 dígitos)',
  saldos: 'Los saldos de esas cuentas',
  movimientos: 'Tus movimientos de los últimos 12 meses',
};

function paginaAutorizacion({ banco, state, alcance, meses, receptor }) {
  const items = alcance.map((a) => `<li>${esc(ETIQUETAS_ALCANCE[a] || a)}</li>`).join('');
  const vence = new Date();
  vence.setMonth(vence.getMonth() + meses);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(banco.nombre)} · Autorizar acceso (demo)</title>
<style>
  *{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f3f4f6;color:#111827}
  .demo{background:#fef3c7;color:#78350f;text-align:center;padding:10px 16px;font-size:.85rem;font-weight:600}
  header{background:${banco.color};color:#fff;padding:18px 16px;display:flex;align-items:center;gap:12px}
  .logo{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.2);display:grid;place-items:center;font-weight:800;font-size:1.2rem}
  header b{font-size:1.15rem}main{max-width:520px;margin:24px auto;padding:0 16px}
  .card{background:#fff;border-radius:14px;padding:24px;box-shadow:0 4px 18px rgba(0,0,0,.06)}
  h1{font-size:1.25rem;margin:0 0 6px}p{line-height:1.5;color:#374151;font-size:.95rem}
  ul{padding-left:20px;color:#111827;line-height:1.7;margin:8px 0 16px}.meta{background:#f9fafb;border-radius:10px;padding:12px 14px;font-size:.88rem;color:#374151;margin:14px 0}
  .nota{border-left:3px solid ${banco.color};padding:8px 12px;font-size:.85rem;color:#4b5563;background:#f9fafb;margin:16px 0}
  .acciones{display:flex;gap:10px;margin-top:20px}button{flex:1;border:0;border-radius:10px;padding:14px;font-size:1rem;font-weight:700;cursor:pointer}
  .si{background:${banco.color};color:#fff}.no{background:#e5e7eb;color:#111827}
</style></head><body>
<div class="demo">ENTORNO DE PRUEBAS · ${esc(banco.nombre)} es un banco ficticio. Nunca escribas aquí claves reales.</div>
<header><div class="logo">${esc(banco.nombre.replace('Banco ', '').charAt(0))}</div><b>${esc(banco.nombre)}</b></header>
<main><div class="card">
  <h1>${esc(receptor)} quiere acceder a tu información</h1>
  <p>Si autorizas, ${esc(banco.nombre)} compartirá con <b>${esc(receptor)}</b> solo lectura de:</p>
  <ul>${items}</ul>
  <div class="meta"><b>Duración:</b> ${meses} meses (hasta el ${vence.toLocaleDateString('es-CO')}) o hasta que la revoques.<br>
  <b>Tipo de acceso:</b> solo consulta. ${esc(receptor)} no puede mover tu dinero ni hacer pagos.</div>
  <div class="nota">En un banco real, aquí iniciarías sesión con tu usuario y clave <b>en la página o app oficial del banco</b>.
  ${esc(receptor)} nunca ve ni guarda tu clave.</div>
  <form method="post" action="/banco-demo/autorizar">
    <input type="hidden" name="state" value="${esc(state)}"><input type="hidden" name="banco" value="${esc(banco.id)}">
    <div class="acciones">
      <button class="no" name="decision" value="rechazar">Rechazar</button>
      <button class="si" name="decision" value="autorizar">Autorizar</button>
    </div>
  </form>
</div></main></body></html>`;
}

function leerFormulario(req) {
  return new Promise((resolve, reject) => {
    let cuerpo = '';
    req.on('data', (p) => {
      cuerpo += p;
      if (cuerpo.length > 4096) { reject(Object.assign(new Error('Formulario demasiado grande'), { estado: 413 })); req.destroy(); }
    });
    req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(cuerpo))));
    req.on('error', reject);
  });
}

// Atiende las páginas del "banco". Devuelve true si la ruta era suya.
async function manejarRuta(req, res, ruta, url) {
  if (ruta !== '/banco-demo/autorizar') return false;
  const html = (estado, contenido) => { res.writeHead(estado, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(contenido); };

  if (req.method === 'GET') {
    const banco = institucionPorId(url.searchParams.get('banco'));
    const state = url.searchParams.get('state') || '';
    const alcance = (url.searchParams.get('alcance') || '').split(',').filter((a) => ETIQUETAS_ALCANCE[a]);
    const meses = Math.min(24, Math.max(1, Number(url.searchParams.get('meses')) || 12));
    const receptor = (url.searchParams.get('receptor') || 'Auto-Wealth').slice(0, 40);
    if (!banco || !/^[A-Za-z0-9_-]{20,100}$/.test(state) || !alcance.length) {
      html(400, 'Solicitud de autorización inválida.');
      return true;
    }
    html(200, paginaAutorizacion({ banco, state, alcance, meses, receptor }));
    return true;
  }

  if (req.method === 'POST') {
    const f = await leerFormulario(req);
    if (!institucionPorId(f.banco) || !/^[A-Za-z0-9_-]{20,100}$/.test(f.state || '')) {
      html(400, 'Solicitud inválida.');
      return true;
    }
    const destino = new URLSearchParams({ state: f.state });
    if (f.decision === 'autorizar') {
      const code = crypto.randomBytes(24).toString('base64url');
      codigos.set(code, { state: f.state, banco: f.banco, vence: Date.now() + 5 * 60_000 });
      destino.set('code', code);
    } else {
      destino.set('error', 'access_denied');
    }
    res.writeHead(303, { Location: '/openfinance/retorno?' + destino.toString() });
    res.end();
    return true;
  }
  return false;
}

// Cambia el código de un solo uso por un token de acceso
async function canjearCodigo({ code, state }) {
  const datos = codigos.get(code);
  codigos.delete(code);
  if (!datos || datos.vence < Date.now() || datos.state !== state) throw new Error('Código de autorización inválido o vencido');
  return { token: 'sim_' + datos.banco + '_' + crypto.randomBytes(24).toString('hex') };
}

async function revocar() {
  return true; // en un proveedor real: avisarle al banco que el permiso terminó
}

// ----------------------- Generador de datos realistas -----------------------

function semilla(texto) {
  const h = crypto.createHash('sha256').update(texto).digest();
  return h.readUInt32LE(0);
}
// Generador pseudoaleatorio con semilla: los mismos datos cada vez para el mismo usuario
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generar({ usuarioId, institucion, hoy = new Date() }) {
  const banco = institucionPorId(institucion);
  const base = `${usuarioId}:${institucion}`;
  const r0 = prng(semilla(base + ':perfil'));
  const entre = (r, min, max, paso = 100) => Math.round((min + r() * (max - min)) / paso) * paso;
  const elegir = (r, lista) => lista[Math.floor(r() * lista.length)];

  const esBilletera = banco.tipo === 'billetera';
  const salario = entre(r0, 3_000_000, 7_500_000, 10_000);
  const perfil = {
    salario,
    arriendo: Math.min(entre(r0, 900_000, 2_400_000, 10_000), Math.round(salario * 0.33 / 10_000) * 10_000),
    tieneCarro: r0() < 0.4,
    empresa: elegir(r0, ['EMPRESA ANDINA SAS', 'SERVICIOS DEL VALLE SA', 'GRUPO MONTAÑA SAS', 'TECNOLOGIA CARIBE SAS']),
    servicios: elegir(r0, ['EPM SERVICIOS PUBLICOS', 'ENEL CODENSA ENERGIA', 'VANTI GAS NATURAL']),
    suscripciones: [
      ['NETFLIX.COM', 44_900, 3], ['SPOTIFY P1', 16_900, 7], ['DISNEY PLUS', 38_900, 11],
      ['SMART FIT MENSUALIDAD', 89_900, 1], ['YOUTUBE PREMIUM', 23_900, 18], ['APPLE.COM/BILL ICLOUD', 3_900, 22],
    ].filter(() => r0() < 0.55),
    ultimos4: [String(1000 + Math.floor(r0() * 9000)), String(1000 + Math.floor(r0() * 9000))],
  };

  const cuentasDef = esBilletera
    ? [{ id: 'billetera', nombre: `Billetera ${banco.nombre}`, tipo: 'billetera' }]
    : [{ id: 'ahorros', nombre: 'Cuenta de Ahorros', tipo: 'ahorros' }, { id: 'tarjeta', nombre: 'Tarjeta de Crédito Visa', tipo: 'tarjeta_credito' }];

  const hoyStr = hoy.toISOString().slice(0, 10);
  const inicio = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 12, 1));
  const movs = [];
  let comprasTarjetaMesAnterior = 0;

  for (let i = -1; i <= 12; i++) {
    const d0 = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + i, 1));
    const anio = d0.getUTCFullYear();
    const mes = d0.getUTCMonth();
    const diasMes = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
    const clave = d0.toISOString().slice(0, 7);
    const r = prng(semilla(`${base}:${clave}`));
    const delMes = [];
    const fecha = (dia) => `${clave}-${String(Math.min(diasMes, Math.max(1, dia))).padStart(2, '0')}`;
    const add = (cuenta, dia, descripcion, monto) => delMes.push({ cuenta, fecha: fecha(dia), descripcion, monto });
    const dia = () => 1 + Math.floor(r() * diasMes);

    if (esBilletera) {
      const n = 2 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) add('billetera', dia(), 'TRANSFERENCIA RECIBIDA', entre(r, 60_000, 380_000, 1000));
      for (let k = 0; k < 4 + Math.floor(r() * 8); k++) add('billetera', dia(), 'RAPPI*RAPPI COLOMBIA', -entre(r, 14_000, 58_000));
      for (let k = 0; k < 3 + Math.floor(r() * 8); k++) add('billetera', dia(), elegir(r, ['UBER *TRIP', 'DIDI RIDES']), -entre(r, 7_000, 32_000));
      for (let k = 0; k < 3 + Math.floor(r() * 7); k++) add('billetera', dia(), elegir(r, ['JUAN VALDEZ CAFE', 'TOSTAO CAFE Y PAN']), -entre(r, 5_500, 14_000));
      for (let k = 0; k < 2 + Math.floor(r() * 5); k++) add('billetera', dia(), 'PAGO QR TIENDA DE BARRIO', -entre(r, 4_000, 35_000));
      if (r() < 0.7) add('billetera', 14, 'MOVISTAR RECARGA', -entre(r, 20_000, 40_000, 1000));
    } else {
      // Cuenta de ahorros
      add('ahorros', 15, `PAGO DE NOMINA ${perfil.empresa}`, perfil.salario / 2);
      add('ahorros', diasMes, `PAGO DE NOMINA ${perfil.empresa}`, perfil.salario / 2);
      add('ahorros', 5, 'TRANSFERENCIA ARRIENDO INMOBILIARIA LOS PINOS', -perfil.arriendo);
      add('ahorros', 10, perfil.servicios, -entre(r, 110_000, 260_000));
      add('ahorros', 12, 'CLARO HOGAR INTERNET', -entre(r, 89_000, 119_000, 900));
      add('ahorros', 14, 'MOVISTAR PLAN MOVIL', -entre(r, 45_000, 65_000, 900));
      if (comprasTarjetaMesAnterior > 0) add('ahorros', 8, 'PAGO TARJETA DE CREDITO', -comprasTarjetaMesAnterior);
      if (r() < 0.3) add('ahorros', 20 + Math.floor(r() * 8), 'TRANSFERENCIA RECIBIDA NEQUI', entre(r, 150_000, 900_000, 10_000));
      for (let k = 0; k < 1 + Math.floor(r() * 2); k++) add('ahorros', dia(), 'RETIRO CAJERO AUTOMATICO', -entre(r, 100_000, 300_000, 10_000));
      for (let k = 0; k < 1 + Math.floor(r() * 2); k++) add('ahorros', dia(), 'COMPRA TIENDAS D1', -entre(r, 25_000, 120_000));

      // Tarjeta de crédito
      for (const [desc, valor, d] of perfil.suscripciones) add('tarjeta', d, desc, -valor);
      for (let k = 0; k < 3 + Math.floor(r() * 3); k++) add('tarjeta', dia(), elegir(r, ['COMPRA EXITO', 'CARULLA', 'JUMBO', 'OLIMPICA', 'TIENDAS ARA']), -entre(r, 45_000, 320_000));
      for (let k = 0; k < 5 + Math.floor(r() * 8); k++) add('tarjeta', dia(), 'RAPPI*RAPPI COLOMBIA', -entre(r, 16_000, 68_000));
      for (let k = 0; k < 4 + Math.floor(r() * 10); k++) add('tarjeta', dia(), elegir(r, ['UBER *TRIP', 'DIDI RIDES', 'CABIFY']), -entre(r, 8_000, 36_000));
      for (let k = 0; k < 4 + Math.floor(r() * 9); k++) add('tarjeta', dia(), elegir(r, ['JUAN VALDEZ CAFE', 'TOSTAO CAFE Y PAN', 'STARBUCKS']), -entre(r, 5_500, 16_000));
      if (perfil.tieneCarro) {
        for (let k = 0; k < 2 + Math.floor(r() * 2); k++) add('tarjeta', dia(), elegir(r, ['TERPEL EDS', 'PRIMAX ESTACION']), -entre(r, 90_000, 170_000, 1000));
        for (let k = 0; k < 2 + Math.floor(r() * 4); k++) add('tarjeta', dia(), 'PARQUEADERO CITYPARKING', -entre(r, 6_000, 20_000));
      }
      for (let k = 0; k < Math.floor(r() * 3); k++) add('tarjeta', dia(), elegir(r, ['MERCADOLIBRE', 'FALABELLA', 'ARTURO CALLE']), -entre(r, 50_000, 450_000, 1000));
      for (let k = 0; k < Math.floor(r() * 3); k++) add('tarjeta', dia(), 'DROGUERIA CRUZ VERDE', -entre(r, 18_000, 95_000));
      if (r() < 0.5) add('tarjeta', dia(), 'CINE COLOMBIA', -entre(r, 18_000, 60_000, 1000));
      add('tarjeta', 25, 'CUOTA DE MANEJO TARJETA', -32_990);
      if (comprasTarjetaMesAnterior > 0) add('tarjeta', 8, 'PAGO RECIBIDO GRACIAS', comprasTarjetaMesAnterior);

      // 4x1000 sobre las salidas de la cuenta de ahorros
      const salidas = delMes.filter((m) => m.cuenta === 'ahorros' && m.monto < 0).reduce((a, m) => a - m.monto, 0);
      add('ahorros', diasMes, 'GMF 4X1000', -Math.round(salidas * 0.004));
      comprasTarjetaMesAnterior = delMes.filter((m) => m.cuenta === 'tarjeta' && m.monto < 0).reduce((a, m) => a - m.monto, 0);
    }

    // Identificador estable de cada movimiento (no depende del día de hoy)
    delMes.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
    const contador = {};
    for (const m of delMes) {
      const k = m.cuenta + m.fecha;
      contador[k] = (contador[k] || 0) + 1;
      m.idExterno = `${m.cuenta}-${m.fecha.replace(/-/g, '')}-${contador[k]}`;
    }
    if (i >= 0) movs.push(...delMes); // el mes -1 solo sirve para calcular el pago de la tarjeta
  }

  const visibles = movs.filter((m) => m.fecha <= hoyStr);

  // Saldos coherentes con los movimientos (la cuenta nunca queda en negativo)
  const cuentas = cuentasDef.map((c, idx) => {
    const propios = visibles.filter((m) => m.cuenta === c.id);
    if (c.tipo === 'tarjeta_credito') {
      const mesActual = hoyStr.slice(0, 7);
      const deuda = propios.filter((m) => m.fecha.startsWith(mesActual) && m.monto < 0).reduce((a, m) => a - m.monto, 0);
      return { idExterno: c.id, nombre: c.nombre, tipo: c.tipo, ultimos4: perfil.ultimos4[idx], saldo: -deuda };
    }
    let acumulado = 0;
    let minimo = 0;
    for (const m of propios) { acumulado += m.monto; minimo = Math.min(minimo, acumulado); }
    const inicial = 200_000 - minimo + entre(r0, 800_000, 5_000_000, 10_000);
    return { idExterno: c.id, nombre: c.nombre, tipo: c.tipo, ultimos4: perfil.ultimos4[idx], saldo: inicial + acumulado };
  });

  return {
    cuentas,
    movimientos: visibles.map((m) => ({ idExternoCuenta: m.cuenta, idExterno: m.idExterno, fecha: m.fecha, descripcion: m.descripcion, monto: m.monto })),
  };
}

// Con el token, el "banco" entrega cuentas, saldos y movimientos
async function obtenerDatos({ token, usuarioId }) {
  const partes = String(token).split('_');
  if (partes[0] !== 'sim' || !institucionPorId(partes[1])) throw new Error('Token inválido');
  return generar({ usuarioId, institucion: partes[1] });
}

module.exports = { nombre, instituciones, institucionPorId, urlAutorizacion, manejarRuta, canjearCodigo, obtenerDatos, revocar, generar };
