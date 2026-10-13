// =====================================================================
//  correo.js — Envía el correo de bienvenida con el enlace a la encuesta.
//
//  Proveedores:
//   - "consola": no envía nada, imprime el correo en la terminal (para probar).
//   - "gmail":   envía desde tu Gmail real, a través de un Apps Script de Google.
//                Es el que mejor llega a la bandeja principal (máx. 100 al día).
//   - "brevo":   envía con la API de Brevo (máx. 300 al día). Con un remitente
//                @gmail.com suele caer en spam; ideal si tienes dominio propio.
//  Todos usan HTTPS y no SMTP, porque el plan gratis de Render bloquea SMTP.
// =====================================================================
const config = require('./config');

const escaparHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function plantillaEncuesta(nombre) {
  const primerNombre = escaparHtml(String(nombre).split(' ')[0]);
  const enlace = escaparHtml(config.surveyUrl);
  const asunto = 'Bienvenido/a a Auto-Wealth · Cuéntanos sobre tus finanzas';

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#2d2640;">
  <div style="background:#7c5cbf;padding:24px;border-radius:14px 14px 0 0;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Auto-Wealth</h1>
    <p style="color:#e8e0f7;margin:6px 0 0;font-size:13px;">Motor de Riqueza Inteligente</p>
  </div>
  <div style="background:#f8f5fc;padding:28px 24px;border-radius:0 0 14px 14px;">
    <p style="font-size:16px;margin-top:0;">Hola ${primerNombre},</p>
    <p style="font-size:15px;line-height:1.55;">Gracias por registrarte en Auto-Wealth. Para construir un ambiente
      personalizado y adecuado para tus finanzas, te pedimos responder esta breve encuesta. Toma menos de 3 minutos.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${enlace}" style="background:#7c5cbf;color:#ffffff;padding:14px 30px;border-radius:30px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Responder encuesta</a>
    </p>
    <p style="font-size:13px;color:#6b6280;">Si el botón no funciona, copia este enlace en tu navegador:<br>
      <a href="${enlace}" style="color:#7c5cbf;">${enlace}</a></p>
    <p style="font-size:15px;margin-bottom:0;">Equipo Auto-Wealth</p>
  </div>
</div>`;

  const textoPlano = `Hola ${String(nombre).split(' ')[0]},\n\nGracias por registrarte en Auto-Wealth. ` +
    `Responde esta breve encuesta (menos de 3 minutos): ${config.surveyUrl}\n\nEquipo Auto-Wealth`;

  return { asunto, html, textoPlano };
}

async function enviarConBrevo({ para, nombre, asunto, html, textoPlano }) {
  const respuesta = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.correo.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: config.correo.remitenteNombre, email: config.correo.remitenteCorreo },
      to: [{ email: para, name: nombre }],
      subject: asunto,
      htmlContent: html,
      textContent: textoPlano,
    }),
    signal: AbortSignal.timeout(10_000), // no esperar más de 10 segundos
  });
  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    throw new Error(`Brevo respondió ${respuesta.status}: ${detalle.slice(0, 300)}`);
  }
}

// Envía desde TU cuenta de Gmail usando un Apps Script de Google.
// El servidor solo manda el destinatario y el nombre; el diseño del correo
// vive dentro del Apps Script. Así, aunque alguien conociera la clave secreta,
// solo podría enviar el correo de la encuesta y nada más.
async function enviarConGmail({ para, nombre }) {
  const respuesta = await fetch(config.correo.gmailScriptUrl, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secreto: config.correo.gmailScriptSecreto, para, nombre }),
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000), // Google puede tardar unos segundos
  });
  const texto = await respuesta.text();
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error(`Google respondió con una página en vez de datos (HTTP ${respuesta.status}). ` +
      'Revisa que el Apps Script esté implementado con acceso "Cualquier persona" y que la URL termine en /exec.');
  }
  if (!datos.ok) throw new Error('Apps Script: ' + (datos.error || 'error desconocido'));
}

// Función principal: la usa la ruta de registro
async function enviarCorreoEncuesta(para, nombre) {
  if (config.correo.proveedor === 'gmail') {
    return enviarConGmail({ para, nombre });
  }

  const { asunto, html, textoPlano } = plantillaEncuesta(nombre);

  if (config.correo.proveedor === 'brevo') {
    return enviarConBrevo({ para, nombre, asunto, html, textoPlano });
  }

  // Modo "consola": solo mostrarlo
  console.log('\n📧 [modo consola] Correo que se enviaría:');
  console.log(`   Para:   ${para}`);
  console.log(`   Asunto: ${asunto}`);
  console.log(`   Texto:  ${textoPlano.replace(/\n+/g, ' ')}\n`);
}

module.exports = { enviarCorreoEncuesta, plantillaEncuesta };
