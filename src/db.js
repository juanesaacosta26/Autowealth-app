// =====================================================================
//  db.js — Todo lo que habla con la base de datos PostgreSQL.
//  Las consultas usan $1, $2... (consultas parametrizadas): los datos del
//  usuario nunca se mezclan con el SQL, lo que evita "inyección SQL".
// =====================================================================
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 5,                        // conexiones simultáneas (suficiente para el plan gratis)
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000, // Neon puede tardar unos segundos en "despertar"
});

pool.on('error', (err) => console.error('Error inesperado en la conexión a la base de datos:', err.message));

// Crea las tablas si no existen (se llama al arrancar el servidor)
async function inicializar() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

// ----------------------------- USUARIOS -----------------------------

async function crearUsuario({ nombre, email, telefono, cedula, passwordHash }) {
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nombre, email, telefono, cedula, password_hash, acepta_datos, acepta_datos_en)
     VALUES ($1, $2, $3, $4, $5, true, now())
     RETURNING id, nombre, email`,
    [nombre, email, telefono, cedula, passwordHash]
  );
  return rows[0];
}

async function buscarUsuarioPorEmail(email) {
  const { rows } = await pool.query(
    'SELECT id, nombre, email, password_hash FROM usuarios WHERE email = $1',
    [email]
  );
  return rows[0] || null;
}

async function buscarUsuarioPorId(id) {
  const { rows } = await pool.query('SELECT id, nombre, email FROM usuarios WHERE id = $1', [id]);
  return rows[0] || null;
}

async function marcarCorreoEnviado(usuarioId) {
  await pool.query(
    'UPDATE usuarios SET correo_encuesta_enviado_en = now(), correo_encuesta_error = NULL WHERE id = $1',
    [usuarioId]
  );
}

async function marcarCorreoFallido(usuarioId, mensaje) {
  await pool.query('UPDATE usuarios SET correo_encuesta_error = $2 WHERE id = $1', [usuarioId, String(mensaje).slice(0, 500)]);
}

// ----------------------------- INGRESOS -----------------------------

async function registrarIngreso({ usuarioId, email, exitoso }) {
  await pool.query(
    'INSERT INTO ingresos (usuario_id, email, exitoso) VALUES ($1, $2, $3)',
    [usuarioId, email, exitoso]
  );
  if (exitoso) {
    await pool.query(
      'UPDATE usuarios SET ultimo_ingreso_en = now(), num_ingresos = num_ingresos + 1 WHERE id = $1',
      [usuarioId]
    );
  }
}

// ------------------------- REPORTES (admin) -------------------------

async function listarUsuarios() {
  const { rows } = await pool.query(
    `SELECT id, creado_en, nombre, email, telefono, cedula, acepta_datos,
            correo_encuesta_enviado_en, correo_encuesta_error, ultimo_ingreso_en, num_ingresos
       FROM usuarios ORDER BY creado_en DESC`
  );
  return rows;
}

async function listarIngresos() {
  const { rows } = await pool.query(
    `SELECT i.creado_en, i.email, u.nombre, i.exitoso
       FROM ingresos i LEFT JOIN usuarios u ON u.id = i.usuario_id
      ORDER BY i.creado_en DESC LIMIT 5000`
  );
  return rows;
}

async function verificarConexion() {
  await pool.query('SELECT 1');
}

async function cerrar() {
  await pool.end();
}

async function buscarUsuarioCompleto(id) {
  const { rows } = await pool.query(
    'SELECT id, nombre, email, telefono, cedula, password_hash, creado_en, acepta_datos_en FROM usuarios WHERE id = $1', [id]);
  return rows[0] || null;
}

async function eliminarUsuario(id) {
  await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
}

module.exports = {
  pool, buscarUsuarioCompleto, eliminarUsuario,
  inicializar, crearUsuario, buscarUsuarioPorEmail, buscarUsuarioPorId,
  marcarCorreoEnviado, marcarCorreoFallido, registrarIngreso,
  listarUsuarios, listarIngresos, verificarConexion, cerrar,
};
