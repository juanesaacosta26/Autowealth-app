// =====================================================================
//  cifrado.js — Cifra los datos sensibles antes de guardarlos.
//
//  Se usa AES-256-GCM (el estándar que usan bancos y gobiernos).
//  Aunque alguien robara una copia de la base de datos, sin la clave
//  DATA_ENCRYPTION_KEY solo vería texto ilegible.
//
//  Formato guardado:  v1:<iv>:<etiqueta>:<texto cifrado>   (en base64)
// =====================================================================
const crypto = require('node:crypto');
const config = require('./config');

const CLAVE = Buffer.from(config.claveCifrado, 'hex'); // 32 bytes = 256 bits

function cifrar(texto) {
  const iv = crypto.randomBytes(12); // número aleatorio distinto cada vez
  const cifrador = crypto.createCipheriv('aes-256-gcm', CLAVE, iv);
  const datos = Buffer.concat([cifrador.update(String(texto), 'utf8'), cifrador.final()]);
  const etiqueta = cifrador.getAuthTag(); // detecta si alguien alteró el dato
  return ['v1', iv.toString('base64'), etiqueta.toString('base64'), datos.toString('base64')].join(':');
}

function descifrar(guardado) {
  const [version, ivB64, etiquetaB64, datosB64] = String(guardado).split(':');
  if (version !== 'v1') throw new Error('Formato de cifrado desconocido');
  const descifrador = crypto.createDecipheriv('aes-256-gcm', CLAVE, Buffer.from(ivB64, 'base64'));
  descifrador.setAuthTag(Buffer.from(etiquetaB64, 'base64'));
  return Buffer.concat([descifrador.update(Buffer.from(datosB64, 'base64')), descifrador.final()]).toString('utf8');
}

// Huella irreversible (para comparar valores sin guardarlos, ej. el "state" del banco)
function huella(texto) {
  return crypto.createHmac('sha256', CLAVE).update(String(texto)).digest('hex');
}

module.exports = { cifrar, descifrar, huella };
