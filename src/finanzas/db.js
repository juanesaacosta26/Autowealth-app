// =====================================================================
//  finanzas/db.js — Consultas de la información financiera.
//  Todas filtran por usuario_id: nadie puede ver datos de otra persona.
// =====================================================================
const { pool } = require('../db');

const num = (v) => (v === null || v === undefined ? null : Number(v));

// ------------------------------ CONSENTIMIENTOS ------------------------------

async function crearConsentimiento(c) {
  const { rows } = await pool.query(
    `INSERT INTO consentimientos (usuario_id, proveedor, institucion, alcance, finalidad, version_texto, estado, expira_en, state_hash)
     VALUES ($1, $2, $3, $4, $5, $6, 'pendiente', now() + ($7 || ' months')::interval, $8)
     RETURNING id`,
    [c.usuarioId, c.proveedor, c.institucion, c.alcance, c.finalidad, c.version, String(c.meses), c.stateHash]
  );
  return rows[0].id;
}

async function buscarConsentimientoPorState(stateHash) {
  const { rows } = await pool.query(
    `SELECT id, usuario_id, proveedor, institucion, alcance, estado, otorgado_en, expira_en,
            (otorgado_en > now() - interval '15 minutes') AS reciente
       FROM consentimientos WHERE state_hash = $1`, [stateHash]);
  return rows[0] || null;
}

async function cambiarEstadoConsentimiento(id, estado) {
  // $2 se usa dos veces: como VARCHAR (columna estado) y comparado con texto.
  // Sin el ::text, PostgreSQL responde "inconsistent types deduced for parameter $2".
  await pool.query(
    `UPDATE consentimientos SET estado = $2::text, state_hash = NULL,
            revocado_en = CASE WHEN $2::text = 'revocado' THEN now() ELSE revocado_en END
      WHERE id = $1`, [id, estado]);
}

async function listarConsentimientos(usuarioId) {
  const { rows } = await pool.query(
    `SELECT c.id, c.proveedor, c.institucion, c.alcance, c.finalidad, c.version_texto, c.estado,
            c.otorgado_en, c.expira_en, c.revocado_en, x.id AS conexion_id
       FROM consentimientos c LEFT JOIN conexiones x ON x.consentimiento_id = c.id
      WHERE c.usuario_id = $1 AND c.estado <> 'pendiente'
      ORDER BY c.otorgado_en DESC`, [usuarioId]);
  return rows;
}

// -------------------------------- CONEXIONES ---------------------------------

async function crearConexion(c) {
  const { rows } = await pool.query(
    `INSERT INTO conexiones (usuario_id, consentimiento_id, proveedor, institucion, token_cifrado)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [c.usuarioId, c.consentimientoId, c.proveedor, c.institucion, c.tokenCifrado]);
  return rows[0].id;
}

async function obtenerConexion(usuarioId, id) {
  const { rows } = await pool.query(
    `SELECT x.id, x.usuario_id, x.consentimiento_id, x.proveedor, x.institucion, x.token_cifrado, x.estado,
            x.ultima_sincronizacion, c.expira_en, (c.expira_en < now()) AS vencida
       FROM conexiones x JOIN consentimientos c ON c.id = x.consentimiento_id
      WHERE x.usuario_id = $1 AND x.id = $2`, [usuarioId, id]);
  return rows[0] || null;
}

async function listarConexiones(usuarioId) {
  const { rows } = await pool.query(
    `SELECT x.id, x.proveedor, x.institucion, x.estado, x.creado_en, x.ultima_sincronizacion, c.expira_en
       FROM conexiones x JOIN consentimientos c ON c.id = x.consentimiento_id
      WHERE x.usuario_id = $1 ORDER BY x.creado_en`, [usuarioId]);
  return rows;
}

async function marcarSincronizada(id) {
  await pool.query('UPDATE conexiones SET ultima_sincronizacion = now() WHERE id = $1', [id]);
}

// Borra la conexión; sus cuentas y movimientos se borran en cascada
async function eliminarConexion(usuarioId, id) {
  await pool.query('DELETE FROM conexiones WHERE usuario_id = $1 AND id = $2', [usuarioId, id]);
}

// --------------------------------- CUENTAS -----------------------------------

async function guardarCuentaExterna(c) {
  const { rows } = await pool.query(
    `INSERT INTO cuentas (usuario_id, conexion_id, origen, id_externo, nombre, tipo, numero_ultimos4, saldo)
     VALUES ($1, $2, 'openfinance', $3, $4, $5, $6, $7)
     ON CONFLICT (conexion_id, id_externo)
     DO UPDATE SET saldo = EXCLUDED.saldo, nombre = EXCLUDED.nombre, actualizado_en = now()
     RETURNING id`,
    [c.usuarioId, c.conexionId, c.idExterno, c.nombre, c.tipo, c.ultimos4, c.saldo]);
  return rows[0].id;
}

async function crearCuentaManual(c) {
  const { rows } = await pool.query(
    `INSERT INTO cuentas (usuario_id, origen, nombre, tipo, saldo) VALUES ($1, 'manual', $2, $3, $4) RETURNING id`,
    [c.usuarioId, c.nombre, c.tipo, c.saldoInicial]);
  return rows[0].id;
}

// Para cuentas manuales, el saldo = saldo inicial + todos sus movimientos
async function listarCuentas(usuarioId) {
  const { rows } = await pool.query(
    `SELECT k.id, k.origen, k.nombre, k.tipo, k.numero_ultimos4, k.moneda, k.actualizado_en, k.conexion_id,
            x.institucion,
            (CASE WHEN k.origen = 'manual'
                  THEN k.saldo + COALESCE((SELECT SUM(m.monto) FROM movimientos m WHERE m.cuenta_id = k.id), 0)
                  ELSE k.saldo END)::float8 AS saldo,
            (SELECT COUNT(*) FROM movimientos m WHERE m.cuenta_id = k.id)::int AS num_movimientos
       FROM cuentas k LEFT JOIN conexiones x ON x.id = k.conexion_id
      WHERE k.usuario_id = $1 ORDER BY k.origen DESC, k.id`, [usuarioId]);
  return rows.map((r) => ({ ...r, saldo: num(r.saldo) }));
}

async function obtenerCuenta(usuarioId, id) {
  const { rows } = await pool.query('SELECT id, origen, nombre, tipo FROM cuentas WHERE usuario_id = $1 AND id = $2', [usuarioId, id]);
  return rows[0] || null;
}

async function eliminarCuentaManual(usuarioId, id) {
  const { rows } = await pool.query(
    `DELETE FROM cuentas WHERE usuario_id = $1 AND id = $2 AND origen = 'manual' RETURNING id`, [usuarioId, id]);
  return rows.length > 0;
}

// ------------------------------- MOVIMIENTOS ---------------------------------

// Inserta muchos movimientos en una sola consulta. Los repetidos (mismo id_externo
// en la misma cuenta) se ignoran, así sincronizar o importar dos veces no duplica.
async function insertarMovimientos(usuarioId, cuentaId, origen, filas) {
  if (!filas.length) return 0;
  const { rows } = await pool.query(
    `INSERT INTO movimientos (usuario_id, cuenta_id, origen, id_externo, fecha, descripcion_cifrada, monto, categoria)
     SELECT $1, $2, $3, f.id_externo, f.fecha::date, f.descripcion_cifrada, f.monto, f.categoria
       FROM json_to_recordset($4::json) AS f(id_externo text, fecha text, descripcion_cifrada text, monto numeric, categoria text)
     ON CONFLICT (cuenta_id, id_externo) DO NOTHING
     RETURNING id`,
    [usuarioId, cuentaId, origen, JSON.stringify(filas)]);
  return rows.length;
}

async function listarMovimientos(usuarioId, { desde, hasta, cuentaId } = {}) {
  const { rows } = await pool.query(
    `SELECT m.id, m.cuenta_id, m.origen, to_char(m.fecha, 'YYYY-MM-DD') AS fecha, m.descripcion_cifrada,
            m.monto::float8 AS monto, m.categoria, k.nombre AS cuenta, k.tipo AS cuenta_tipo
       FROM movimientos m JOIN cuentas k ON k.id = m.cuenta_id
      WHERE m.usuario_id = $1
        AND ($2::date IS NULL OR m.fecha >= $2::date)
        AND ($3::date IS NULL OR m.fecha <= $3::date)
        AND ($4::int IS NULL OR m.cuenta_id = $4::int)
      ORDER BY m.fecha DESC, m.id DESC
      LIMIT 5000`,
    [usuarioId, desde || null, hasta || null, cuentaId || null]);
  return rows.map((r) => ({ ...r, monto: num(r.monto) }));
}

async function cambiarCategoria(usuarioId, id, categoria) {
  const { rows } = await pool.query(
    'UPDATE movimientos SET categoria = $3 WHERE usuario_id = $1 AND id = $2 RETURNING id', [usuarioId, id, categoria]);
  return rows.length > 0;
}

// Solo se pueden borrar movimientos manuales o importados (los del banco vienen del banco)
async function eliminarMovimiento(usuarioId, id) {
  const { rows } = await pool.query(
    `DELETE FROM movimientos WHERE usuario_id = $1 AND id = $2 AND origen <> 'openfinance' RETURNING id`, [usuarioId, id]);
  return rows.length > 0;
}

async function mesesConDatos(usuarioId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT to_char(fecha, 'YYYY-MM') AS mes FROM movimientos WHERE usuario_id = $1 ORDER BY mes DESC`, [usuarioId]);
  return rows.map((r) => r.mes);
}

// Borra cuentas, movimientos y conexiones (los consentimientos quedan como historial, revocados)
async function borrarFinanzas(usuarioId) {
  await pool.query('DELETE FROM cuentas WHERE usuario_id = $1', [usuarioId]);
  await pool.query('DELETE FROM conexiones WHERE usuario_id = $1', [usuarioId]);
  await pool.query(
    `UPDATE consentimientos SET estado = 'revocado', revocado_en = now(), state_hash = NULL
      WHERE usuario_id = $1 AND estado IN ('activo', 'pendiente')`, [usuarioId]);
}

module.exports = {
  crearConsentimiento, buscarConsentimientoPorState, cambiarEstadoConsentimiento, listarConsentimientos,
  crearConexion, obtenerConexion, listarConexiones, marcarSincronizada, eliminarConexion,
  guardarCuentaExterna, crearCuentaManual, listarCuentas, obtenerCuenta, eliminarCuentaManual,
  insertarMovimientos, listarMovimientos, cambiarCategoria, eliminarMovimiento, mesesConDatos, borrarFinanzas,
};
