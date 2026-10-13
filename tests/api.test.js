// =====================================================================
//  tests/api.test.js — Pruebas automáticas de la API de Auto-Wealth.
//
//  Arrancan el servidor de verdad contra una base de datos PostgreSQL de
//  PRUEBAS y hacen peticiones como lo haría el navegador.
//
//  Cómo correrlas:
//    1. Crea una base de datos de pruebas (en Neon: una rama "pruebas").
//    2. En PowerShell:   $env:TEST_DATABASE_URL="postgresql://..."; npm test
//       En Mac/Linux:    TEST_DATABASE_URL="postgresql://..." npm test
//
//  ⚠️ Nunca uses la base de datos de producción: las pruebas crean usuarios.
//  En GitHub, estas pruebas corren solas en cada Pull Request (ver .github/workflows/ci.yml).
// =====================================================================
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');

const DB = process.env.TEST_DATABASE_URL;
const PUERTO = 3900 + Math.floor(Math.random() * 90);
const B = `http://localhost:${PUERTO}`;
const ORIGEN = { Origin: B };
let servidor;
let salidaServidor = '';

// ------------------------------- Ayudas -------------------------------

// Un "navegador" mínimo que guarda la cookie de sesión
function cliente() {
  let cookie = '';
  async function pedir(ruta, { method = 'GET', body, form, headers = {} } = {}) {
    // Por defecto las peticiones que modifican datos llevan el origen de la propia app
    const opciones = { method, redirect: 'manual', headers: { ...(method !== 'GET' ? ORIGEN : {}), ...headers } };
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

async function registrar(c, extra = {}) {
  const email = `prueba.${unico()}@ejemplo.com`;
  const r = await c.pedir('/api/registro', {
    method: 'POST',
    body: { nombre: 'Persona de Prueba', email, telefono: '3001234567', cedula: cedula(), password: 'clave-segura-1', acepta_datos: true, ...extra },
  });
  return { ...r, email };
}

// Hace todo el flujo de Open Finance y devuelve la URL de regreso del banco
async function autorizarBanco(c, banco = 'ceiba', decision = 'autorizar') {
  const r = await c.pedir('/api/openfinance/consentimientos', { method: 'POST', body: { institucion: banco, acepta: true } });
  assert.equal(r.estado, 201, JSON.stringify(r.datos));
  const state = new URL(B + r.datos.url).searchParams.get('state');
  const pagina = await c.pedir(r.datos.url);
  assert.equal(pagina.estado, 200);
  const banco303 = await c.pedir('/banco-demo/autorizar', { method: 'POST', form: { state, banco, decision } });
  assert.equal(banco303.estado, 303);
  return banco303.ubicacion;
}

// --------------------------- Arranque / cierre ---------------------------

before(async () => {
  if (!DB) return;
  servidor = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(PUERTO),
      DATABASE_URL: DB,
      SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
      DATA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
      EMAIL_PROVIDER: 'consola',
      OPEN_FINANCE_PROVIDER: 'simulado',
      ADMIN_PASSWORD: '',
    },
  });
  servidor.stdout.on('data', (d) => { salidaServidor += d; });
  servidor.stderr.on('data', (d) => { salidaServidor += d; });
  // Esperar a que responda (máximo 30 segundos)
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(B + '/api/salud')).ok) return; } catch { /* todavía arrancando */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('El servidor no arrancó:\n' + salidaServidor);
});

after(() => { if (servidor) servidor.kill(); });

// ---------------------------------- Pruebas ----------------------------------

describe('Auto-Wealth API', { skip: !DB && 'Define TEST_DATABASE_URL para correr las pruebas (ver comentario al inicio del archivo)' }, () => {
  test('el servidor y la base de datos responden', async () => {
    const r = await cliente().pedir('/api/salud');
    assert.equal(r.estado, 200);
    assert.equal(r.datos.baseDeDatos, 'conectada');
  });

  test('registro: valida datos, crea la cuenta y no permite duplicados', async () => {
    const c = cliente();
    const malo = await registrar(c, { password: '123' });
    assert.equal(malo.estado, 400);
    const sinPermiso = await registrar(c, { acepta_datos: false });
    assert.equal(sinPermiso.estado, 400);

    const ok = await registrar(c);
    assert.equal(ok.estado, 201);
    assert.equal(ok.datos.ok, true);
    const yo = await c.pedir('/api/yo');
    assert.equal(yo.datos.sesion, true);

    const repetido = await cliente().pedir('/api/registro', {
      method: 'POST',
      body: { nombre: 'Otra Persona', email: ok.email, telefono: '3001234567', cedula: cedula(), password: 'clave-segura-1', acepta_datos: true },
    });
    assert.equal(repetido.estado, 409);
  });

  test('inicio de sesión: rechaza clave incorrecta y acepta la correcta', async () => {
    const { email } = await registrar(cliente());
    const c = cliente();
    const mal = await c.pedir('/api/ingreso', { method: 'POST', body: { email, password: 'otra-clave-9' } });
    assert.equal(mal.estado, 401);
    const bien = await c.pedir('/api/ingreso', { method: 'POST', body: { email, password: 'clave-segura-1' } });
    assert.equal(bien.estado, 200);
  });

  test('rutas privadas exigen sesión', async () => {
    const c = cliente();
    assert.equal((await c.pedir('/api/finanzas/resumen')).estado, 401);
    const app = await c.pedir('/app');
    assert.equal(app.estado, 303);
    assert.match(app.ubicacion, /entrar=1/);
  });

  test('peticiones desde otro sitio web son rechazadas', async () => {
    const c = cliente();
    await registrar(c);
    const r = await c.pedir('/api/finanzas/cuentas', { method: 'POST', body: { nombre: 'X', tipo: 'efectivo' }, headers: { Origin: 'https://sitio-malicioso.com' } });
    assert.equal(r.estado, 403);
  });

  test('Open Finance: conectar un banco de prueba trae cuentas y movimientos', async () => {
    const c = cliente();
    await registrar(c);
    const regreso = await autorizarBanco(c);
    const r = await c.pedir(regreso);
    assert.equal(r.estado, 303);
    assert.match(r.ubicacion, /of=conectado/);

    const resumen = await c.pedir('/api/finanzas/resumen');
    assert.equal(resumen.estado, 200);
    assert.ok(resumen.datos.cuentas.length >= 1, 'debe haber cuentas');
    assert.ok(resumen.datos.mesesDisponibles.length >= 12, 'debe haber 12 meses de datos');

    // El mismo código no se puede usar dos veces
    const repetido = await c.pedir(regreso);
    assert.match(repetido.ubicacion, /of=invalido/);
  });

  test('Open Finance: otro usuario no puede completar mi autorización', async () => {
    const yo = cliente();
    const otro = cliente();
    await registrar(yo);
    await registrar(otro);
    const regreso = await autorizarBanco(yo);
    const r = await otro.pedir(regreso);
    assert.match(r.ubicacion, /of=invalido/);
  });

  test('Open Finance: si el usuario rechaza en el banco, no se conecta', async () => {
    const c = cliente();
    await registrar(c);
    const regreso = await autorizarBanco(c, 'colibri', 'rechazar');
    const r = await c.pedir(regreso);
    assert.match(r.ubicacion, /of=rechazado/);
    const cuentas = await c.pedir('/api/finanzas/cuentas');
    assert.equal(cuentas.datos.conexiones.length, 0);
  });

  test('aislamiento: un usuario no puede ver ni modificar datos de otro', async () => {
    const a = cliente();
    const b = cliente();
    await registrar(a);
    await registrar(b);
    await a.pedir(await autorizarBanco(a));
    const movs = await a.pedir('/api/finanzas/movimientos');
    const mov = movs.datos.movimientos[0];
    const conexion = (await a.pedir('/api/finanzas/cuentas')).datos.conexiones[0];

    assert.equal((await b.pedir('/api/finanzas/movimientos')).datos.movimientos.length, 0);
    assert.equal((await b.pedir(`/api/finanzas/movimientos/${mov.id}`, { method: 'PATCH', body: { categoria: 'Mercado' } })).estado, 404);
    assert.equal((await b.pedir(`/api/openfinance/conexiones/${conexion.id}`, { method: 'DELETE' })).estado, 404);
  });

  test('registro manual e importación de extracto (sin duplicar)', async () => {
    const c = cliente();
    await registrar(c);
    const hoy = new Date().toISOString().slice(0, 10);
    const m = await c.pedir('/api/finanzas/movimientos', { method: 'POST', body: { tipo: 'gasto', fecha: hoy, valor: 18500, descripcion: 'Almuerzo' } });
    assert.equal(m.estado, 201);
    assert.equal(m.datos.categoria, 'Restaurantes y domicilios');

    const filas = [
      { fecha: hoy, descripcion: 'NETFLIX.COM', monto: -44900 },
      { fecha: hoy, descripcion: 'PAGO NOMINA', monto: 2000000 },
    ];
    const i1 = await c.pedir('/api/finanzas/importar', { method: 'POST', body: { filas, nombreCuentaNueva: 'Extracto prueba' } });
    assert.equal(i1.datos.importados, 2);
    const i2 = await c.pedir('/api/finanzas/importar', { method: 'POST', body: { filas, cuentaId: i1.datos.cuentaId } });
    assert.equal(i2.datos.importados, 0);
    assert.equal(i2.datos.duplicados, 2);
  });

  test('revocar un banco borra sus datos y deja la autorización como revocada', async () => {
    const c = cliente();
    await registrar(c);
    await c.pedir(await autorizarBanco(c));
    const { conexiones } = (await c.pedir('/api/finanzas/cuentas')).datos;
    const r = await c.pedir(`/api/openfinance/conexiones/${conexiones[0].id}`, { method: 'DELETE' });
    assert.equal(r.estado, 200);
    const despues = (await c.pedir('/api/finanzas/cuentas')).datos;
    assert.equal(despues.conexiones.length, 0);
    assert.equal(despues.cuentas.length, 0);
    const priv = (await c.pedir('/api/privacidad')).datos;
    assert.equal(priv.consentimientos[0].estado, 'revocado');
  });

  test('eliminar la cuenta pide la contraseña y borra todo', async () => {
    const c = cliente();
    await registrar(c);
    assert.equal((await c.pedir('/api/privacidad/eliminar-cuenta', { method: 'POST', body: { password: 'mala' } })).estado, 401);
    assert.equal((await c.pedir('/api/privacidad/eliminar-cuenta', { method: 'POST', body: { password: 'clave-segura-1' } })).estado, 200);
    assert.equal((await c.pedir('/api/finanzas/resumen')).estado, 401);
  });

  test('archivos estáticos: sirve /assets y bloquea rutas raras', async () => {
    const c = cliente();
    assert.equal((await c.pedir('/assets/panel.css')).estado, 200);
    assert.equal((await c.pedir('/assets/%2e%2e%2fserver.js')).estado, 404);
    assert.equal((await c.pedir('/assets/no-existe.js')).estado, 404);
  });
});
