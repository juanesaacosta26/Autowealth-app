-- =====================================================================
--  schema.sql — Estructura de la base de datos.
--  El servidor la ejecuta solo al arrancar. "IF NOT EXISTS" hace que
--  sea seguro ejecutarla muchas veces: nunca borra datos.
-- =====================================================================

-- Una fila por cada persona registrada
CREATE TABLE IF NOT EXISTS usuarios (
    id                          SERIAL PRIMARY KEY,
    nombre                      VARCHAR(120) NOT NULL,
    email                       VARCHAR(254) NOT NULL,
    telefono                    VARCHAR(20)  NOT NULL,
    cedula                      VARCHAR(12)  NOT NULL,
    password_hash               TEXT         NOT NULL,   -- nunca la contraseña real
    acepta_datos                BOOLEAN      NOT NULL,   -- autorización Ley 1581 de 2012
    acepta_datos_en             TIMESTAMPTZ  NOT NULL,
    correo_encuesta_enviado_en  TIMESTAMPTZ,             -- cuándo se envió el correo
    correo_encuesta_error       TEXT,                    -- si falló, por qué
    creado_en                   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    ultimo_ingreso_en           TIMESTAMPTZ,
    num_ingresos                INTEGER      NOT NULL DEFAULT 0,
    CONSTRAINT usuarios_email_unico  UNIQUE (email),
    CONSTRAINT usuarios_cedula_unica UNIQUE (cedula)
);

-- Una fila por cada intento de inicio de sesión (exitoso o no)
CREATE TABLE IF NOT EXISTS ingresos (
    id          SERIAL PRIMARY KEY,
    usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    email       VARCHAR(254) NOT NULL,
    exitoso     BOOLEAN      NOT NULL,
    creado_en   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingresos_usuario_idx ON ingresos (usuario_id);
CREATE INDEX IF NOT EXISTS ingresos_fecha_idx   ON ingresos (creado_en DESC);

-- =====================================================================
--  FINANZAS (Open Finance + registro manual)
-- =====================================================================

-- Autorizaciones que el usuario da para acceder a su información financiera.
-- Guarda los elementos que exige el Decreto 0368 de 2026: quién recibe los datos,
-- qué datos, para qué finalidad y por cuánto tiempo. Nunca se borra (es la prueba
-- del consentimiento); al revocar se marca la fecha.
CREATE TABLE IF NOT EXISTS consentimientos (
    id               SERIAL PRIMARY KEY,
    usuario_id       INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    proveedor        VARCHAR(40)  NOT NULL,          -- ej. "simulado"
    institucion      VARCHAR(80)  NOT NULL,          -- banco elegido
    alcance          TEXT         NOT NULL,          -- datos autorizados (lista separada por comas)
    finalidad        TEXT         NOT NULL,
    version_texto    VARCHAR(20)  NOT NULL,          -- versión del texto que aceptó
    estado           VARCHAR(20)  NOT NULL,          -- pendiente | activo | rechazado | revocado | vencido
    otorgado_en      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expira_en        TIMESTAMPTZ  NOT NULL,
    revocado_en      TIMESTAMPTZ,
    state_hash       VARCHAR(64)                      -- protege el regreso desde el banco (anti-CSRF)
);
CREATE INDEX IF NOT EXISTS consentimientos_usuario_idx ON consentimientos (usuario_id);

-- Una conexión activa con un banco (vía proveedor de Open Finance)
CREATE TABLE IF NOT EXISTS conexiones (
    id                    SERIAL PRIMARY KEY,
    usuario_id            INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    consentimiento_id     INTEGER NOT NULL REFERENCES consentimientos(id),
    proveedor             VARCHAR(40)  NOT NULL,
    institucion           VARCHAR(80)  NOT NULL,
    token_cifrado         TEXT         NOT NULL,      -- credencial de acceso del proveedor, CIFRADA
    estado                VARCHAR(20)  NOT NULL DEFAULT 'activa',
    creado_en             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    ultima_sincronizacion TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS conexiones_usuario_idx ON conexiones (usuario_id);

-- Cuentas del usuario: conectadas por Open Finance o creadas a mano
CREATE TABLE IF NOT EXISTS cuentas (
    id                SERIAL PRIMARY KEY,
    usuario_id        INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    conexion_id       INTEGER REFERENCES conexiones(id) ON DELETE CASCADE,
    origen            VARCHAR(20)  NOT NULL,          -- openfinance | manual
    id_externo        VARCHAR(80),                     -- id de la cuenta en el proveedor
    nombre            VARCHAR(80)  NOT NULL,
    tipo              VARCHAR(30)  NOT NULL,          -- ahorros | corriente | tarjeta_credito | billetera | efectivo | otra
    numero_ultimos4   VARCHAR(4),                      -- solo los últimos 4 dígitos, nunca el número completo
    moneda            VARCHAR(3)   NOT NULL DEFAULT 'COP',
    saldo             NUMERIC(16,2) NOT NULL DEFAULT 0,
    actualizado_en    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT cuentas_externa_unica UNIQUE (conexion_id, id_externo)
);
CREATE INDEX IF NOT EXISTS cuentas_usuario_idx ON cuentas (usuario_id);

-- Movimientos (ingresos y gastos). La descripción va CIFRADA porque puede
-- revelar datos sensibles (a quién le pagas, dónde compras).
CREATE TABLE IF NOT EXISTS movimientos (
    id                    SERIAL PRIMARY KEY,
    usuario_id            INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    cuenta_id             INTEGER NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
    origen                VARCHAR(20)  NOT NULL,      -- openfinance | manual | extracto
    id_externo            VARCHAR(80),
    fecha                 DATE         NOT NULL,
    descripcion_cifrada   TEXT         NOT NULL,
    monto                 NUMERIC(16,2) NOT NULL,     -- positivo = ingreso, negativo = gasto
    categoria             VARCHAR(40)  NOT NULL,
    creado_en             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT movimientos_externo_unico UNIQUE (cuenta_id, id_externo)
);
CREATE INDEX IF NOT EXISTS movimientos_usuario_fecha_idx ON movimientos (usuario_id, fecha DESC);

-- Registro de auditoría: quién hizo qué con los datos financieros y cuándo.
-- El usuario puede ver su propio historial (transparencia).
CREATE TABLE IF NOT EXISTS auditoria (
    id          SERIAL PRIMARY KEY,
    usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    accion      VARCHAR(60)  NOT NULL,
    detalle     TEXT,
    creado_en   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auditoria_usuario_idx ON auditoria (usuario_id, creado_en DESC);
