// =====================================================================
//  auditoria.js — Deja constancia de cada acción sobre datos financieros:
//  autorizaciones, conexiones, sincronizaciones, exportaciones y borrados.
//  Sirve para demostrar cumplimiento ("responsabilidad demostrada") y
//  para que el usuario vea qué se ha hecho con su información.
// =====================================================================
const { pool } = require('./db');

const ACCIONES = {
  consentimiento_otorgado: 'Autorizaste el acceso a tu información',
  consentimiento_rechazado: 'Rechazaste la autorización en el banco',
  consentimiento_revocado: 'Revocaste una autorización',
  consentimiento_vencido: 'Una autorización llegó a su fecha de vencimiento',
  conexion_creada: 'Se conectó un banco',
  sincronizacion: 'Se actualizaron tus datos desde el banco',
  cuenta_manual_creada: 'Creaste una cuenta manual',
  cuenta_manual_eliminada: 'Eliminaste una cuenta manual',
  movimiento_manual: 'Registraste un movimiento',
  extracto_importado: 'Importaste un extracto',
  datos_exportados: 'Descargaste una copia de tus datos',
  finanzas_borradas: 'Borraste toda tu información financiera',
};

async function registrar(usuarioId, accion, detalle = '') {
  try {
    await pool.query('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES ($1, $2, $3)',
      [usuarioId, accion, String(detalle).slice(0, 500)]);
  } catch (err) {
    console.error('No se pudo registrar en auditoría:', err.message);
  }
}

async function listar(usuarioId, limite = 50) {
  const { rows } = await pool.query(
    `SELECT accion, detalle, creado_en FROM auditoria WHERE usuario_id = $1 ORDER BY creado_en DESC, id DESC LIMIT $2`,
    [usuarioId, limite]
  );
  return rows.map((r) => ({ ...r, descripcion: ACCIONES[r.accion] || r.accion }));
}

module.exports = { registrar, listar, ACCIONES };
