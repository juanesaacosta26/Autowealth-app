// =====================================================================
//  validacion.js — Revisa y limpia los datos que llegan del formulario.
//  La página también valida, pero el servidor SIEMPRE vuelve a revisar:
//  cualquiera podría saltarse la página y enviar datos directamente.
// =====================================================================

const texto = (v) => (typeof v === 'string' ? v.trim() : '');
const soloDigitos = (v) => texto(v).replace(/[\s.\-()]/g, '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Devuelve { datos } si todo está bien, o { error } con un mensaje para mostrar
function validarRegistro(body) {
  const nombre = texto(body.nombre).replace(/\s+/g, ' ');
  const email = texto(body.email).toLowerCase();
  const telefonoOriginal = texto(body.telefono);
  const telefono = soloDigitos(body.telefono).replace(/^\+/, '');
  const cedula = soloDigitos(body.cedula);
  const password = typeof body.password === 'string' ? body.password : '';

  if (nombre.length < 3 || nombre.length > 120) return { error: 'Escribe tu nombre completo.' };
  if (!/^[\p{L}\s'.-]+$/u.test(nombre)) return { error: 'El nombre solo puede tener letras.' };
  if (!EMAIL_RE.test(email) || email.length > 254) return { error: 'Escribe un correo válido.' };
  if (!/^\+?[\d\s.\-()]+$/.test(telefonoOriginal) || telefono.length < 7 || telefono.length > 15) {
    return { error: 'Escribe un teléfono válido (solo números).' };
  }
  if (!/^\d{5,12}$/.test(cedula)) return { error: 'La cédula debe tener entre 5 y 12 números.' };
  if (password.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres.' };
  if (password.length > 128) return { error: 'La contraseña es demasiado larga.' };
  if (body.acepta_datos !== true) return { error: 'Debes autorizar el tratamiento de tus datos para registrarte.' };

  return { datos: { nombre, email, telefono, cedula, password } };
}

function validarIngreso(body) {
  const email = texto(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  if (!EMAIL_RE.test(email) || !password || password.length > 128) {
    return { error: 'Escribe tu correo y tu contraseña.' };
  }
  return { datos: { email, password } };
}

module.exports = { validarRegistro, validarIngreso };
