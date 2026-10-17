// =====================================================================
//  tests/deudas.test.js — Pruebas de deudas, plan del dinero ocioso y
//  pagos simulados (abonar a una deuda o invertir en renta fija).
//
//  Igual que tests/api.test.js: arrancan el servidor de verdad contra una
//  base de datos de PRUEBAS. Se corren con  npm test  (necesita TEST_DATABASE_URL).
//  ⚠️ Nunca uses la base de datos de producción: las pruebas crean usuarios.
// =====================================================================
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');

const DB = process.env.TEST_DATABASE_URL;
const PUERTO = 4000 + Math.floor(Math.random() * 90); // distinto del rango de api.test.js
const B = `http://localhost:${PUERTO}`;
const CLAVE = 'clave-segura-1';
let servidor;
let salidaServidor = '';

// ------------------------------- Ayudas -------------------------------
// (las mismas de tests/api.test.js: un "navegador" mínimo que guarda la cookie)

function cliente() {
  let cookie = '';
  async function pedir(ruta, { method = 'GET', body, form, headers = {} } = {}) {
    const opciones = { method, redirect: 'manual', headers: { ...(method !== 'GET' ? { Origin: B } : {}), ...headers } };
    if (cookie) opciones.headers.Cookie = cookie;
    if (body !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(body); }
    if (form) { opciones.headers['Content-Type'] = 'application/x-www-form-urlencoded'; opciones.body = new URLSearchParams(form).toString(); }
    const res = await fetch(ruta.startsWith('http') ? ruta : B + ruta, opciones);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0].endsWith('=') ? '' : setCookie.split(';')[0];
    const tipo = res.headers.get('content-type') || '';
    const datos = tipo.includes('json') ? await res.json() : await res.text();
    return { estado: res.status, datos, ubicacion: res.headers.get('location') };
  }
  return { pedir };
}

const unico = () => crypto.randomBytes(4).toString('hex');
const cedula = () => String(10_000_000 + Math.floor(Math.random() * 89_999_999));

async function registrar(c) {
  const r = await c.pedir('/api/registro', {
    method: 'POST',
    body: { nombre: 'Persona de Prueba', email: `deudas.${unico()}@ejemplo.test`, telefono: '3001234567', cedula: cedula(), password: CLAVE, acepta_datos: true },
  });
  assert.equal(r.estado, 201, JSON.stringify(r.datos));
}

// Conecta un banco de prueba completo (consentimiento → banco → regreso)
async function conectarBanco(c, banco = 'colibri') {
  const r = await c.pedir('/api/openfinance/consentimientos', { method: 'POST', body: { institucion: banco, acepta: true } });
  const state = new URL(B + r.datos.url).searchParams.get('state');
  const b = await c.pedir('/banco-demo/autorizar', { method: 'POST', form: { state, banco, decision: 'autorizar' } });
  const fin = await c.pedir(b.ubicacion);
  assert.match(fin.ubicacion, /of=conectado/);
}

// Un usuario con banco conectado y con dinero ocioso para mover. Los datos del banco de
// prueba dependen del usuario, así que se intenta con varios hasta que haya al menos $200.000.
async function usuarioConOcioso() {
  for (let i = 0; i < 6; i++) {
    const c = cliente();
    await registrar(c);
    await conectarBanco(c, 'colibri');
    const r = await c.pedir('/api/finanzas/plan');
    if (r.datos.plan.dineroOcioso >= 200_000) return { c, ...r.datos };
  }
  throw new Error('No se encontró un usuario de prueba con dinero ocioso');
}

// Pide un pago y recorre la pantalla del banco. Devuelve la URL de regreso a Auto-Wealth.
async function pedirYDecidir(c, cuerpo, decision = 'autorizar') {
  const r = await c.pedir('/api/finanzas/redirecciones', { method: 'POST', body: { acepta: true, ...cuerpo } });
  assert.equal(r.estado, 201, JSON.stringify(r.datos));
  assert.match(r.datos.url, /^\/banco-demo\/pagar\?pago=/);
  const pagina = await c.pedir(r.datos.url);
  assert.equal(pagina.estado, 200);
  assert.match(pagina.datos, /ENTORNO DE PRUEBAS/);
  const pago = new URL(B + r.datos.url).searchParams.get('pago');
  const banco = await c.pedir('/banco-demo/pagar', { method: 'POST', form: { pago, decision } });
  assert.equal(banco.estado, 303);
  return banco.ubicacion;
}

const deudaBase = { nombre: 'Tarjeta de prueba', tipo: 'consumo', saldo: 5_000_000, tasaEA: 28.5, cuotaMinima: 250_000, diaPago: 15 };

// --------------------------- Arranque / cierre ---------------------------

before(async () => {
  if (!DB) return;
  servidor = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'test', PORT: String(PUERTO), DATABASE_URL: DB,
      SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
      DATA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
      EMAIL_PROVIDER: 'consola', OPEN_FINANCE_PROVIDER: 'simulado', ADMIN_PASSWORD: '',
    },
  });
  servidor.stdout.on('data', (d) => { salidaServidor += d; });
  servidor.stderr.on('data', (d) => { salidaServidor += d; });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(B + '/api/salud')).ok) return; } catch { /* todavía arrancando */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('El servidor no arrancó:\n' + salidaServidor);
});

after(() => { if (servidor) servidor.kill(); });

// ---------------------------------- Pruebas ----------------------------------

describe('Deudas y dinero ocioso', { skip: !DB && 'Define TEST_DATABASE_URL para correr las pruebas' }, () => {
  test('deudas: crear, validar, actualizar y borrar (el nombre se guarda cifrado)', async () => {
    const c = cliente();
    await registrar(c);

    assert.equal((await c.pedir('/api/finanzas/deudas', { method: 'POST', body: { ...deudaBase, tipo: 'inventado' } })).estado, 400);
    assert.equal((await c.pedir('/api/finanzas/deudas', { method: 'POST', body: { ...deudaBase, saldo: 0 } })).estado, 400);
    assert.equal((await c.pedir('/api/finanzas/deudas', { method: 'POST', body: { ...deudaBase, tasaEA: 150 } })).estado, 400);
    assert.equal((await c.pedir('/api/finanzas/deudas', { method: 'POST', body: { ...deudaBase, diaPago: 40 } })).estado, 400);

    const creada = await c.pedir('/api/finanzas/deudas', { method: 'POST', body: deudaBase });
    assert.equal(creada.estado, 201);
    const id = creada.datos.id;

    let lista = (await c.pedir('/api/finanzas/deudas')).datos;
    assert.equal(lista.deudas.length, 1);
    assert.equal(lista.deudas[0].nombre, 'Tarjeta de prueba');
    assert.equal(lista.deudas[0].tasaEA, 28.5);
    assert.equal(lista.total, 5_000_000);
    assert.ok(lista.tipos.some((t) => t.id === 'hipotecario'));

    assert.equal((await c.pedir(`/api/finanzas/deudas/${id}`, { method: 'PATCH', body: { saldo: 4_200_000, diaPago: null } })).estado, 200);
    assert.equal((await c.pedir(`/api/finanzas/deudas/${id}`, { method: 'PATCH', body: {} })).estado, 400);
    lista = (await c.pedir('/api/finanzas/deudas')).datos;
    assert.equal(lista.deudas[0].saldo, 4_200_000);
    assert.equal(lista.deudas[0].diaPago, null);
    assert.equal(lista.deudas[0].tasaEA, 28.5, 'lo que no se envía no cambia');

    assert.equal((await c.pedir(`/api/finanzas/deudas/${id}`, { method: 'DELETE' })).estado, 200);
    assert.equal((await c.pedir(`/api/finanzas/deudas/${id}`, { method: 'DELETE' })).estado, 404);
  });

  test('deudas: otro usuario no puede verlas, cambiarlas ni borrarlas (404)', async () => {
    const a = cliente();
    const b = cliente();
    await registrar(a);
    await registrar(b);
    const { id } = (await a.pedir('/api/finanzas/deudas', { method: 'POST', body: deudaBase })).datos;
    assert.equal((await b.pedir('/api/finanzas/deudas')).datos.deudas.length, 0);
    assert.equal((await b.pedir(`/api/finanzas/deudas/${id}`, { method: 'PATCH', body: { saldo: 1 } })).estado, 404);
    assert.equal((await b.pedir(`/api/finanzas/deudas/${id}`, { method: 'DELETE' })).estado, 404);
    assert.equal((await b.pedir('/api/finanzas/redirecciones', { method: 'POST', body: { tipo: 'pago_deuda', deudaId: id, cuentaId: 1, monto: 10_000, acepta: true } })).estado, 404);
  });

  test('plan: sin historia de gastos no hay dinero ocioso (por prudencia)', async () => {
    const c = cliente();
    await registrar(c);
    await c.pedir('/api/finanzas/cuentas', { method: 'POST', body: { nombre: 'Ahorros', tipo: 'ahorros', saldoInicial: 20_000_000 } });
    const { plan } = (await c.pedir('/api/finanzas/plan')).datos;
    assert.equal(plan.dineroOcioso, 0);
    assert.equal(plan.pasos.length, 0);
    assert.ok(plan.notas.some((n) => n.includes('al menos un mes de gastos')));
  });

  test('plan: ocioso = disponible − colchón; deudas de la tasa más alta a la más baja; el resto a renta fija', async () => {
    const { c, plan: antes } = await usuarioConOcioso();
    assert.equal(antes.mesesReserva, 3);
    assert.equal(antes.reserva, antes.gastoPromedio * 3);
    assert.equal(antes.dineroOcioso, Math.max(0, antes.disponible - antes.reserva));

    // Dos deudas pequeñas: el plan debe pagar primero la más cara y después invertir lo que sobra
    await c.pedir('/api/finanzas/deudas', { method: 'POST', body: { ...deudaBase, nombre: 'Barata', saldo: 50_000, tasaEA: 12 } });
    await c.pedir('/api/finanzas/deudas', { method: 'POST', body: { ...deudaBase, nombre: 'Cara', saldo: 60_000, tasaEA: 32 } });
    const { plan, cuentasOrigen, destinos, aviso, autorizacionPago } = (await c.pedir('/api/finanzas/plan')).datos;
    assert.deepEqual(plan.pasos.map((p) => p.nombre || p.destino), ['Cara', 'Barata', 'renta_fija']);
    assert.equal(plan.pasos[0].interesesEvitadosAnio, Math.round(60_000 * 0.32));
    assert.equal(plan.pasos.reduce((a, p) => a + p.monto, 0), plan.dineroOcioso);
    assert.ok(cuentasOrigen.length >= 1);
    assert.deepEqual(destinos.map((d) => d.id), ['cdt', 'fondo_renta_fija']);
    assert.match(aviso, /no asesoría/);
    assert.equal(autorizacionPago.version, 'PG-2026-10-v1');
  });

  test('pago de deuda: se autoriza en el banco, baja la deuda y el saldo, y aparece el movimiento', async () => {
    const { c, cuentasOrigen } = await usuarioConOcioso();
    const cuenta = cuentasOrigen[0];
    const { id: deudaId } = (await c.pedir('/api/finanzas/deudas', { method: 'POST', body: deudaBase })).datos;
    const monto = 150_000;

    const regreso = await pedirYDecidir(c, { tipo: 'pago_deuda', deudaId, cuentaId: cuenta.id, monto });
    assert.match(regreso, /^\/openfinance\/retorno-pago\?/);
    const fin = await c.pedir(regreso);
    assert.equal(fin.ubicacion, '/app?pago=ejecutado#plan');

    const deuda = (await c.pedir('/api/finanzas/deudas')).datos.deudas[0];
    assert.equal(deuda.saldo, deudaBase.saldo - monto);

    const cuentaDespues = (await c.pedir('/api/finanzas/cuentas')).datos.cuentas.find((k) => k.id === cuenta.id);
    assert.equal(cuentaDespues.saldo, cuenta.saldo - monto, 'el banco descontó el pago y Auto-Wealth sincronizó');

    const movs = (await c.pedir(`/api/finanzas/movimientos?cuenta=${cuenta.id}`)).datos.movimientos;
    const mov = movs.find((m) => m.descripcion === 'PAGO DEUDA CREDITO DE CONSUMO');
    assert.ok(mov, 'el pago aparece como movimiento del banco');
    assert.equal(mov.monto, -monto);
    assert.equal(mov.categoria, 'Deudas y créditos');

    // El enlace de regreso solo sirve una vez
    assert.equal((await c.pedir(regreso)).ubicacion, '/app?pago=invalido#plan');

    const hist = (await c.pedir('/api/finanzas/redirecciones')).datos;
    assert.equal(hist.redirecciones[0].estado, 'ejecutada');
    assert.equal(hist.redirecciones[0].simulado, true);
    assert.equal(hist.totales.abonadoDeudas, monto);
  });

  test('inversión en renta fija: no cuenta como gasto y queda en el historial', async () => {
    const { c, cuentasOrigen } = await usuarioConOcioso();
    const cuenta = cuentasOrigen[0];
    assert.equal((await c.pedir('/api/finanzas/redirecciones', { method: 'POST', body: { tipo: 'inversion', destino: 'acciones', cuentaId: cuenta.id, monto: 50_000, acepta: true } })).estado, 400);

    const fin = await c.pedir(await pedirYDecidir(c, { tipo: 'inversion', destino: 'cdt', cuentaId: cuenta.id, monto: 100_000 }));
    assert.equal(fin.ubicacion, '/app?pago=ejecutado#plan');
    const movs = (await c.pedir(`/api/finanzas/movimientos?cuenta=${cuenta.id}`)).datos.movimientos;
    const mov = movs.find((m) => m.descripcion === 'INVERSION RENTA FIJA CDT');
    assert.equal(mov.categoria, 'Movimiento entre cuentas', 'invertir no es gastar');
    const hist = (await c.pedir('/api/finanzas/redirecciones')).datos;
    assert.equal(hist.totales.invertido, 100_000);
    assert.match(hist.redirecciones[0].destinoNombre, /CDT/);
  });

  test('si el usuario rechaza en el banco, no se mueve nada', async () => {
    const { c, cuentasOrigen } = await usuarioConOcioso();
    const cuenta = cuentasOrigen[0];
    const { id: deudaId } = (await c.pedir('/api/finanzas/deudas', { method: 'POST', body: deudaBase })).datos;
    const fin = await c.pedir(await pedirYDecidir(c, { tipo: 'pago_deuda', deudaId, cuentaId: cuenta.id, monto: 80_000 }, 'rechazar'));
    assert.equal(fin.ubicacion, '/app?pago=rechazado#plan');
    assert.equal((await c.pedir('/api/finanzas/deudas')).datos.deudas[0].saldo, deudaBase.saldo);
    const despues = (await c.pedir('/api/finanzas/cuentas')).datos.cuentas.find((k) => k.id === cuenta.id);
    assert.equal(despues.saldo, cuenta.saldo);
    assert.equal((await c.pedir('/api/finanzas/redirecciones')).datos.redirecciones[0].estado, 'rechazada');
  });

  test('protecciones: colchón de emergencia, cuentas manuales, saldo de la deuda y aceptación', async () => {
    const { c, plan, cuentasOrigen } = await usuarioConOcioso();
    const cuenta = cuentasOrigen[0];
    const { id: deudaId } = (await c.pedir('/api/finanzas/deudas', { method: 'POST', body: { ...deudaBase, saldo: 30_000 } })).datos;
    const pedir = (cuerpo) => c.pedir('/api/finanzas/redirecciones', { method: 'POST', body: { tipo: 'inversion', destino: 'cdt', cuentaId: cuenta.id, acepta: true, ...cuerpo } });

    const tocaColchon = await pedir({ monto: plan.dineroOcioso + 1000 });
    assert.equal(tocaColchon.estado, 400);
    assert.match(tocaColchon.datos.error, /colchón/);
    assert.equal((await pedir({ monto: 500 })).estado, 400, 'mínimo $1.000');
    assert.equal((await pedir({ monto: 10_000, acepta: false })).estado, 400);
    assert.equal((await pedir({ tipo: 'pago_deuda', deudaId, monto: 40_000 })).estado, 400, 'no se abona más de lo que se debe');

    // Saldo 0 para no cambiar el dinero disponible (el efectivo también cuenta como disponible)
    const { id: manual } = (await c.pedir('/api/finanzas/cuentas', { method: 'POST', body: { nombre: 'Efectivo', tipo: 'efectivo', saldoInicial: 0 } })).datos;
    const desdeManual = await pedir({ cuentaId: manual, monto: 10_000 });
    assert.equal(desdeManual.estado, 400);
    assert.match(desdeManual.datos.error, /banco conectado/);

    // Una solicitud pendiente "aparta" su dinero: no se puede pedir dos veces el mismo ocioso
    const primera = await pedir({ monto: plan.dineroOcioso });
    assert.equal(primera.estado, 201);
    assert.equal((await pedir({ monto: 1000 })).estado, 400);
  });

  test('borrar mi información financiera también borra deudas y pagos; exportar los incluye', async () => {
    const c = cliente();
    await registrar(c);
    await c.pedir('/api/finanzas/deudas', { method: 'POST', body: deudaBase });
    const exportado = (await c.pedir('/api/privacidad/exportar')).datos;
    assert.equal(exportado.deudas[0].nombre, 'Tarjeta de prueba');
    assert.ok(Array.isArray(exportado.pagos_e_inversiones));
    assert.equal((await c.pedir('/api/privacidad/borrar-finanzas', { method: 'POST', body: { password: CLAVE } })).estado, 200);
    assert.equal((await c.pedir('/api/finanzas/deudas')).datos.deudas.length, 0);
  });

  test('rutas nuevas exigen sesión', async () => {
    const c = cliente();
    for (const ruta of ['/api/finanzas/deudas', '/api/finanzas/plan', '/api/finanzas/redirecciones']) {
      assert.equal((await c.pedir(ruta)).estado, 401, ruta);
    }
    const r = await c.pedir('/openfinance/retorno-pago?state=x&code=y');
    assert.equal(r.estado, 303);
    assert.match(r.ubicacion, /sesion=vencida/);
  });
});
