/**
 * AUTO-WEALTH · Registro de usuarios + correo con la encuesta
 * ------------------------------------------------------------
 * Pega TODO este código en: Hoja de cálculo de Google → Extensiones → Apps Script
 * Luego: Implementar → Nueva implementación → Aplicación web
 *        Ejecutar como: Yo   |   Quién tiene acceso: Cualquier persona
 * Copia la URL (termina en /exec) y pégala en SCRIPT_URL dentro de Auto-Wealth.html
 *
 * Qué hace:
 *  - Registro: guarda a la persona en la pestaña "Registros" y le envía un correo
 *    con el enlace de la encuesta (Google Forms). Si el correo ya existe, no la
 *    duplica: solo le reenvía el correo.
 *  - Inicio de sesión: busca el correo en "Registros", actualiza "Último ingreso"
 *    y guarda cada ingreso en la pestaña "Ingresos".
 */

const FORM_LINK = 'https://forms.gle/q7PYdBcBk3SMQzUPA';
const REMITENTE = 'Auto-Wealth';
const HOJA_REGISTROS = 'Registros';
const HOJA_INGRESOS = 'Ingresos';

const COLUMNAS_REGISTROS = ['Fecha registro', 'Nombre', 'Email', 'Teléfono', 'Cédula',
  'Autoriza datos', 'Correo encuesta enviado', 'Último ingreso', 'Nº ingresos'];
const COLUMNAS_INGRESOS = ['Fecha', 'Email', 'Nombre', 'Resultado'];

// ---------- Puntos de entrada ----------
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'login') return responder(iniciarSesion(data));
    return responder(registrar(data));
  } catch (err) {
    return responder({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return responder({ ok: true, estado: 'Auto-Wealth activo' });
}

// ---------- Registro ----------
function registrar(d) {
  const nombre = limpiar(d.nombre);
  const email = limpiar(d.email).toLowerCase();
  const telefono = limpiar(d.telefono);
  const cedula = limpiar(d.cedula);
  if (!nombre || !email || !telefono || !cedula) return { ok: false, error: 'Faltan datos' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Correo inválido' };
  if (d.consentimiento !== true) return { ok: false, error: 'Sin autorización de datos' };

  const hoja = obtenerHoja(HOJA_REGISTROS, COLUMNAS_REGISTROS);
  const fila = buscarFilaPorEmail(hoja, email);

  if (fila) {
    // Ya registrado: no duplicar, solo reenviar el correo
    enviarCorreoEncuesta(email, hoja.getRange(fila, 2).getValue() || nombre);
    hoja.getRange(fila, 7).setValue(new Date());
    return { ok: true, existing: true };
  }

  hoja.appendRow([new Date(), nombre, email, telefono, cedula, 'Sí', '', '', 0]);
  const nuevaFila = hoja.getLastRow();
  try {
    enviarCorreoEncuesta(email, nombre);
    hoja.getRange(nuevaFila, 7).setValue(new Date());
  } catch (err) {
    hoja.getRange(nuevaFila, 7).setValue('ERROR: ' + err);
  }
  return { ok: true, existing: false };
}

// ---------- Inicio de sesión ----------
function iniciarSesion(d) {
  const email = limpiar(d.email).toLowerCase();
  const hoja = obtenerHoja(HOJA_REGISTROS, COLUMNAS_REGISTROS);
  const log = obtenerHoja(HOJA_INGRESOS, COLUMNAS_INGRESOS);
  const fila = buscarFilaPorEmail(hoja, email);

  if (!fila) {
    log.appendRow([new Date(), email, '', 'No registrado']);
    return { ok: true, found: false };
  }
  const nombre = hoja.getRange(fila, 2).getValue();
  const ingresos = Number(hoja.getRange(fila, 9).getValue()) || 0;
  hoja.getRange(fila, 8, 1, 2).setValues([[new Date(), ingresos + 1]]);
  log.appendRow([new Date(), email, nombre, 'Ingreso correcto']);
  return { ok: true, found: true, name: String(nombre).split(' ')[0] };
}

// ---------- Correo ----------
function enviarCorreoEncuesta(email, nombre) {
  const primerNombre = escaparHtml(String(nombre).split(' ')[0]);
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#2d2640;">' +
      '<div style="background:#7c5cbf;padding:24px;border-radius:14px 14px 0 0;text-align:center;">' +
        '<h1 style="color:#ffffff;margin:0;font-size:22px;">Auto-Wealth</h1>' +
        '<p style="color:#e8e0f7;margin:6px 0 0;font-size:13px;">Motor de Riqueza Inteligente</p>' +
      '</div>' +
      '<div style="background:#f8f5fc;padding:28px 24px;border-radius:0 0 14px 14px;">' +
        '<p style="font-size:16px;margin-top:0;">Hola ' + primerNombre + ',</p>' +
        '<p style="font-size:15px;line-height:1.55;">Gracias por registrarte en Auto-Wealth. Para construir un ambiente ' +
        'personalizado y adecuado para tus finanzas, te pedimos responder esta breve encuesta. Toma menos de 3 minutos.</p>' +
        '<p style="text-align:center;margin:28px 0;">' +
          '<a href="' + FORM_LINK + '" style="background:#7c5cbf;color:#ffffff;padding:14px 30px;border-radius:30px;' +
          'text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Responder encuesta</a>' +
        '</p>' +
        '<p style="font-size:13px;color:#6b6280;">Si el botón no funciona, copia este enlace en tu navegador:<br>' +
          '<a href="' + FORM_LINK + '" style="color:#7c5cbf;">' + FORM_LINK + '</a></p>' +
        '<p style="font-size:15px;margin-bottom:0;">Equipo Auto-Wealth</p>' +
      '</div>' +
    '</div>';

  MailApp.sendEmail({
    to: email,
    name: REMITENTE,
    subject: 'Bienvenido/a a Auto-Wealth · Cuéntanos sobre tus finanzas',
    body: 'Hola ' + nombre + ',\n\nGracias por registrarte en Auto-Wealth. Responde esta breve encuesta: ' +
          FORM_LINK + '\n\nEquipo Auto-Wealth',
    htmlBody: html
  });
}

// ---------- Utilidades ----------
function obtenerHoja(nombre, columnas) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(nombre);
  if (!hoja) {
    hoja = ss.insertSheet(nombre);
    hoja.appendRow(columnas);
    hoja.getRange(1, 1, 1, columnas.length).setFontWeight('bold').setBackground('#ede7f6');
    hoja.setFrozenRows(1);
    if (nombre === HOJA_REGISTROS) hoja.getRange('D:E').setNumberFormat('@'); // teléfono y cédula como texto
  }
  return hoja;
}

function buscarFilaPorEmail(hoja, email) {
  const ultima = hoja.getLastRow();
  if (ultima < 2) return null;
  const emails = hoja.getRange(2, 3, ultima - 1, 1).getValues();
  for (let i = 0; i < emails.length; i++) {
    if (String(emails[i][0]).trim().toLowerCase() === email) return i + 2;
  }
  return null;
}

function limpiar(v) {
  // Evita que un texto que empiece por = + - @ se ejecute como fórmula en la hoja
  let s = String(v == null ? '' : v).trim().slice(0, 200);
  if (/^[=@]/.test(s) || /^[+\-][^\d\s]/.test(s)) s = "'" + s;
  return s;
}

function escaparHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Ejecuta esta función UNA vez desde el editor para autorizar el correo y probar el envío. */
function probarEnvio() {
  const miCorreo = Session.getActiveUser().getEmail();
  enviarCorreoEncuesta(miCorreo, 'Prueba');
  obtenerHoja(HOJA_REGISTROS, COLUMNAS_REGISTROS);
  obtenerHoja(HOJA_INGRESOS, COLUMNAS_INGRESOS);
  Logger.log('Correo de prueba enviado a ' + miCorreo);
}
