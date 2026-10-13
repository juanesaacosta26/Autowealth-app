// =====================================================================
//  config.js — Lee la configuración del archivo .env (o de Render)
//  y revisa que no falte nada importante antes de arrancar.
// =====================================================================
const fs = require('node:fs');
const path = require('node:path');

// En tu computador los valores vienen del archivo .env.
// En Render vienen de la sección "Environment", así que el archivo no existe.
// Las pruebas automáticas (NODE_ENV=test) pasan su propia configuración y no leen .env.
const envPath = path.join(__dirname, '..', '.env');
if (process.env.NODE_ENV !== 'test' && fs.existsSync(envPath)) process.loadEnvFile(envPath);

const env = process.env;
const esProduccion = env.NODE_ENV === 'production';

const config = {
  puerto: Number(env.PORT) || 3000,
  esProduccion,
  // Render (y casi todos los hostings) ponen un "proxy" delante del servidor;
  // esto permite saber la IP real del visitante para limitar intentos.
  confiarEnProxy: esProduccion || env.TRUST_PROXY === '1',

  databaseUrl: env.DATABASE_URL,
  sessionSecret: env.SESSION_SECRET,
  surveyUrl: env.SURVEY_URL || 'https://forms.gle/q7PYdBcBk3SMQzUPA',

  correo: {
    proveedor: (env.EMAIL_PROVIDER || 'consola').toLowerCase(),
    remitenteNombre: env.EMAIL_FROM_NAME || 'Auto-Wealth',
    remitenteCorreo: env.EMAIL_FROM_ADDRESS,
    brevoApiKey: env.BREVO_API_KEY,
    gmailScriptUrl: (env.GMAIL_SCRIPT_URL || '').trim(),
    gmailScriptSecreto: (env.GMAIL_SCRIPT_SECRET || '').trim(),
  },

  admin: {
    usuario: env.ADMIN_USER || 'admin',
    contrasena: env.ADMIN_PASSWORD || '',
  },

  // Clave para cifrar los datos financieros guardados (64 caracteres hexadecimales).
  // ¡Si se pierde, los datos cifrados no se pueden recuperar! Guárdala en un lugar seguro.
  claveCifrado: (env.DATA_ENCRYPTION_KEY || '').trim(),

  openFinance: {
    // "simulado" = bancos de prueba con datos ficticios (prototipo).
    // Cuando exista un proveedor real (API estándar de la SFC o un agregador), se agrega aquí.
    proveedor: (env.OPEN_FINANCE_PROVIDER || 'simulado').toLowerCase(),
    // Por cuánto tiempo vale una autorización (el Decreto 0368 exige informar la duración)
    mesesConsentimiento: Number(env.CONSENT_MONTHS) || 12,
  },
};

// ----- Revisión: si falta algo, se detiene con un mensaje claro -----
const errores = [];
if (!config.databaseUrl || config.databaseUrl.includes('usuario:contraseña@ep-xxxx')) {
  errores.push('DATABASE_URL: pega la "Connection string" de Neon.');
}
if (!config.sessionSecret || config.sessionSecret.length < 32 || config.sessionSecret.startsWith('cambia-esto')) {
  errores.push('SESSION_SECRET: pon una clave aleatoria de al menos 32 caracteres.');
}
if (!['consola', 'gmail', 'brevo'].includes(config.correo.proveedor)) {
  errores.push('EMAIL_PROVIDER: debe ser "consola", "gmail" o "brevo".');
}
if (config.correo.proveedor === 'gmail') {
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(config.correo.gmailScriptUrl)) {
    errores.push('GMAIL_SCRIPT_URL: pega la "URL de la aplicación web" del Apps Script (empieza con https://script.google.com y termina en /exec).');
  }
  if (config.correo.gmailScriptSecreto.length < 20) {
    errores.push('GMAIL_SCRIPT_SECRET: pon la misma clave secreta que escribiste en el Apps Script (mínimo 20 caracteres).');
  }
}
if (config.correo.proveedor === 'brevo') {
  if (!config.correo.brevoApiKey) errores.push('BREVO_API_KEY: falta la clave de la API de Brevo.');
  if (!config.correo.remitenteCorreo) errores.push('EMAIL_FROM_ADDRESS: falta el correo remitente verificado en Brevo.');
}
if (!/^[0-9a-fA-F]{64}$/.test(config.claveCifrado)) {
  errores.push('DATA_ENCRYPTION_KEY: genera una con  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"  (64 caracteres).');
}
if (!['simulado'].includes(config.openFinance.proveedor)) {
  errores.push('OPEN_FINANCE_PROVIDER: por ahora solo existe "simulado".');
}
if (config.openFinance.mesesConsentimiento < 1 || config.openFinance.mesesConsentimiento > 24) {
  errores.push('CONSENT_MONTHS: debe estar entre 1 y 24.');
}
if (config.admin.contrasena && config.admin.contrasena.length < 10) {
  errores.push('ADMIN_PASSWORD: usa al menos 10 caracteres (o déjalo vacío para desactivar /admin).');
}

if (errores.length) {
  console.error('\n❌ Falta configuración en el archivo .env (o en "Environment" de Render):');
  errores.forEach((e) => console.error('   - ' + e));
  console.error('');
  process.exit(1);
}

module.exports = config;
