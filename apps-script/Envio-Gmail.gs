/**
 * =====================================================================
 *  AUTO-WEALTH · Envío del correo de la encuesta desde tu Gmail
 * =====================================================================
 *  Tu servidor (Render) llama a este script cada vez que alguien se
 *  registra, y el script envía el correo DESDE TU CUENTA DE GMAIL.
 *  Así Google lo reconoce como un correo legítimo.
 *
 *  1. Cambia SECRETO por una clave larga (mínimo 20 caracteres).
 *     Esa misma clave va en Render como GMAIL_SCRIPT_SECRET.
 *  2. Ejecuta la función "probar" una vez para dar permisos.
 *  3. Implementar → Nueva implementación → Aplicación web
 *     Ejecutar como: Yo  |  Quién tiene acceso: Cualquier persona
 *  4. Copia la URL (termina en /exec) → en Render como GMAIL_SCRIPT_URL
 *
 *  Para cambiar el diseño o el texto del correo, edita la función
 *  plantillaHtml() de abajo y vuelve a implementar (Nueva versión).
 * =====================================================================
 */

const SECRETO = 'CAMBIA-ESTO-POR-UNA-CLAVE-LARGA-Y-SECRETA';
const ENLACE_ENCUESTA = 'https://forms.gle/q7PYdBcBk3SMQzUPA';
const NOMBRE_REMITENTE = 'Auto-Wealth';
const ASUNTO = 'Bienvenido/a a Auto-Wealth · Cuéntanos sobre tus finanzas';

function doPost(e) {
  try {
    const datos = JSON.parse(e.postData.contents);

    // Solo tu servidor conoce el SECRETO: nadie más puede usar tu Gmail
    if (datos.secreto !== SECRETO || SECRETO.indexOf('CAMBIA-ESTO') === 0) {
      return responder({ ok: false, error: 'Clave secreta incorrecta' });
    }

    const para = String(datos.para || '').trim();
    const nombre = String(datos.nombre || '').trim().slice(0, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(para)) {
      return responder({ ok: false, error: 'Correo de destino inválido' });
    }
    if (MailApp.getRemainingDailyQuota() < 1) {
      return responder({ ok: false, error: 'Se alcanzó el límite diario de correos de Gmail' });
    }

    const primerNombre = nombre.split(' ')[0] || 'hola';
    MailApp.sendEmail({
      to: para,
      name: NOMBRE_REMITENTE,
      subject: ASUNTO,
      htmlBody: plantillaHtml(primerNombre),
      body: 'Hola ' + primerNombre + ',\n\nGracias por registrarte en Auto-Wealth. ' +
            'Responde esta breve encuesta (menos de 3 minutos): ' + ENLACE_ENCUESTA + '\n\nEquipo Auto-Wealth',
    });

    return responder({ ok: true, restantesHoy: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return responder({ ok: false, error: String(err) });
  }
}

// Para revisar en el navegador que el script está activo
function doGet() {
  return responder({ ok: true, estado: 'Envío de correos Auto-Wealth activo' });
}

function plantillaHtml(primerNombre) {
  const nombre = escaparHtml(primerNombre);
  return '' +
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#2d2640;">' +
      '<div style="background:#7c5cbf;padding:24px;border-radius:14px 14px 0 0;text-align:center;">' +
        '<h1 style="color:#ffffff;margin:0;font-size:22px;">Auto-Wealth</h1>' +
        '<p style="color:#e8e0f7;margin:6px 0 0;font-size:13px;">Motor de Riqueza Inteligente</p>' +
      '</div>' +
      '<div style="background:#f8f5fc;padding:28px 24px;border-radius:0 0 14px 14px;">' +
        '<p style="font-size:16px;margin-top:0;">Hola ' + nombre + ',</p>' +
        '<p style="font-size:15px;line-height:1.55;">Gracias por registrarte en Auto-Wealth. Para construir un ambiente ' +
        'personalizado y adecuado para tus finanzas, te pedimos responder esta breve encuesta. Toma menos de 3 minutos.</p>' +
        '<p style="text-align:center;margin:28px 0;">' +
          '<a href="' + ENLACE_ENCUESTA + '" style="background:#7c5cbf;color:#ffffff;padding:14px 30px;border-radius:30px;' +
          'text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Responder encuesta</a>' +
        '</p>' +
        '<p style="font-size:13px;color:#6b6280;">Si el botón no funciona, copia este enlace en tu navegador:<br>' +
          '<a href="' + ENLACE_ENCUESTA + '" style="color:#7c5cbf;">' + ENLACE_ENCUESTA + '</a></p>' +
        '<p style="font-size:15px;margin-bottom:0;">Equipo Auto-Wealth</p>' +
      '</div>' +
    '</div>';
}

function escaparHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Ejecútala UNA vez desde el editor: pide los permisos y te envía un correo de prueba. */
function probar() {
  const miCorreo = Session.getActiveUser().getEmail();
  MailApp.sendEmail({ to: miCorreo, name: NOMBRE_REMITENTE, subject: '[Prueba] ' + ASUNTO, htmlBody: plantillaHtml('Prueba') });
  Logger.log('Correo de prueba enviado a ' + miCorreo + '. Te quedan ' + MailApp.getRemainingDailyQuota() + ' envíos hoy.');
}
