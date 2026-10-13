# Plan de Garavito · Base de datos

**Tu área:** dónde y cómo se guarda la información: estructura de las tablas, consultas, datos de demostración y copias de seguridad.
**Tus archivos:** `src/schema.sql`, `src/db.js`, `src/finanzas/db.js`, `src/auditoria.js`, `src/admin.js`, `scripts/` (nueva) y `docs/base-de-datos.md`.
**Trabajas de cerca con:** Juanes (sus rutas llaman a tus funciones) y Samu (copias de seguridad y entornos).

> Reglas de tu área: **siempre `$1, $2…`**, **siempre filtrar por `usuario_id`**, y `schema.sql` **solo agrega** (nunca borra ni renombra). Ver [base-de-datos.md](../base-de-datos.md#reglas-para-escribir-consultas).

---

## Semana 1 · Entornos y diseño (13–16 oct)

### Sesión 1 · Ramas de Neon para el equipo
- [ ] Entra al proyecto de Neon (pídele acceso a quien lo creó) y revisa la rama `main` (producción): tablas y cantidad de registros.
- [ ] Crea las ramas `dev-juanes`, `dev-garavito`, `dev-aleja`, `dev-david`, `dev-samu` y `pruebas` (ver [instalacion-y-despliegue.md §2](../instalacion-y-despliegue.md#2-base-de-datos-en-neon)).
- [ ] Envía a cada persona **por mensaje privado** su *Connection string*. Nunca por el grupo ni en GitHub.
- [ ] Corre la app con tu rama `dev-garavito`.

**Listo cuando:** los 5 confirmaron que su app arranca con su propia rama.

### Sesión 2 · Entender la estructura actual
- [ ] Lee `src/schema.sql` completo y [base-de-datos.md](../base-de-datos.md). Compara el diagrama con lo que ves en Neon → **Tables**.
- [ ] Conecta un banco de prueba en tu app y mira qué filas aparecen en cada tabla. Fíjate en que `descripcion_cifrada` y `token_cifrado` se ven como `v1:...`.
- [ ] Prueba las "consultas útiles" del documento en el **SQL Editor** de Neon (en tu rama).
- [ ] Lee `src/finanzas/db.js` y anota cualquier consulta que podría ser lenta con muchos datos.

**Pídele a Claude:** *"Explícame las relaciones entre las tablas de src/schema.sql y qué se borra en cascada cuando se elimina un usuario o una conexión."*

### Sesión 3 · Diseñar las tablas nuevas (con Juanes)
- [ ] Revisa la propuesta de tablas en [base-de-datos.md](../base-de-datos.md#tablas-planeadas-para-este-mes): `presupuestos`, `metas`, `aportes_meta`, `tokens_recuperacion` y `usuarios.version_sesion`.
- [ ] En la reunión con Juanes, confirma que cada campo de sus respuestas (`docs/api.md` §6) se puede calcular con estas tablas.
- [ ] Decide: ¿`aportes_meta` necesita índice por `meta_id`? (sí, si cada meta tendrá muchos aportes). Agrégalo a la propuesta.
- [ ] Quita "Propuesta" del documento y fusiona el PR antes del viernes.

**Listo cuando:** el diseño está aprobado por Juanes y en `main`. ← **Hito 1**

---

## Semana 2 · Construir (19–23 oct)

### Sesión 1 · Tablas nuevas
- [ ] Rama `feature/garavito-tablas`.
- [ ] Agrega las tablas al **final** de `src/schema.sql`, con comentarios como las demás.
- [ ] Reinicia la app con tu rama: las tablas deben crearse solas. Reinicia otra vez: no debe fallar (prueba de que es repetible).
- [ ] Actualiza el diagrama de `docs/base-de-datos.md` con las tablas nuevas.
- [ ] Abre el PR **el martes** y pide revisión a Juanes: él lo necesita para sus rutas.

### Sesión 2 · Consultas de presupuestos y metas
- [ ] En `src/finanzas/db.js` agrega: `listarPresupuestos`, `crearPresupuesto` (409 si se repite: deja que Postgres lance el error `23505`), `actualizarPresupuesto`, `eliminarPresupuesto`, `gastadoPorCategoria(usuarioId, mes)`, `listarMetas` (con `ahorrado` = suma de aportes), `crearMeta`, `agregarAporte` y `eliminarMeta`.
- [ ] **Todas** filtran por `usuario_id`.
- [ ] En `src/auditoria.js` agrega las acciones nuevas (`presupuesto_creado`, `meta_creada`, `aporte_meta`, `contrasena_recuperada`…) con su texto para el usuario.
- [ ] En `borrarFinanzas` (`src/finanzas/db.js`), borra también presupuestos y metas.

**Pídele a Claude:** *"Agrega a src/finanzas/db.js las funciones de presupuestos y metas siguiendo el estilo de las existentes: consultas parametrizadas, filtro por usuario_id, números con ::float8 y fechas con to_char."*

### Sesión 3 · Consultas de recuperación de contraseña y sesiones
- [ ] En `src/db.js`: `crearTokenRecuperacion(usuarioId, tokenHash, minutos)`, `buscarTokenRecuperacion(tokenHash)` (solo si no está usado ni vencido), `marcarTokenUsado(id)`, `cambiarContrasena(usuarioId, hash)` (que también suma 1 a `version_sesion`) y `versionSesion(usuarioId)`.
- [ ] Al crear un token nuevo, invalida los anteriores de ese usuario.
- [ ] Prueba cada función en el SQL Editor con datos de tu rama.

**Listo cuando:** tus PR están en `main` y Juanes ya usa tus funciones. ← **Hito 2**

---

## Semana 3 · Datos de demostración y rendimiento (26–30 oct)

### Sesión 1 · Script de datos de demostración
- [ ] Crea `scripts/datos-demo.js`: un programa que, contra la base de datos que digas, crea 3 usuarios de demostración (por ejemplo `demo1@autowealth.co` con contraseña conocida), con bancos de prueba conectados, presupuestos y metas.
- [ ] Puede reutilizar las funciones de `src/` (`crearUsuario`, `crearHashContrasena`, el generador de `simulado.js`, `cifrar`).
- [ ] Agrega el comando `"demo": "node scripts/datos-demo.js"` en `package.json`.
- [ ] **Protección:** el script debe negarse a correr si `NODE_ENV=production`, salvo con una confirmación explícita (por ejemplo `--si-estoy-seguro`).

**Pídele a Claude:** *"Crea scripts/datos-demo.js que genere usuarios de demostración usando las funciones existentes de src/ y que no corra en producción sin confirmación."*

### Sesión 2 · Rendimiento
- [ ] Con un usuario de demostración, corre en Neon `EXPLAIN ANALYZE` de las consultas del resumen (`listarMovimientos` con rango de fechas) y de presupuestos (`gastadoPorCategoria`).
- [ ] Si alguna hace *Seq Scan* sobre `movimientos`, propone un índice.
- [ ] Documenta los resultados en `docs/base-de-datos.md` (sección "Rendimiento").

### Sesión 3 · Limpieza y reportes
- [ ] **Retención:** función `borrarMovimientosAntiguos()` que elimina movimientos de Open Finance de más de 13 meses (la autorización cubre 12). Llámala al final de `sincronizarConexion` (pídele a Juanes que revise).
- [ ] **Panel `/admin`:** agrega `/admin/resumen.csv` con métricas agregadas **sin datos personales**: usuarios por semana, bancos conectados, uso de presupuestos y metas. Sirve para la presentación.

**Listo cuando:** demo, índices y reportes en `main`. ← **Hito 3**

---

## Semana 4 · Respaldo, documentación y presentación (3–6 nov)

### Sesión 1 · Simulacro de copia de seguridad
- [ ] En Neon, aprende a restaurar: crea una rama desde un punto anterior en el tiempo (*restore / branch from point in time*).
- [ ] Haz el simulacro: borra un usuario de prueba en tu rama, restáuralo desde una rama anterior y verifica que volvió.
- [ ] Escribe el procedimiento paso a paso en `docs/base-de-datos.md` (sección "Copias de seguridad").

### Sesión 2 · Carga de datos para la demo final
- [ ] Con Samu, carga los datos de demostración en producción (Render/Neon `main`) usando tu script con la confirmación.
- [ ] Verifica en la app publicada que los usuarios de demostración se ven bien.
- [ ] Descarga `/admin/resumen.csv` y prepara 2–3 cifras para la presentación.

### Sesión 3 · Tu parte de la presentación
- [ ] 2 diapositivas: el diagrama de la base de datos y "cómo protegemos los datos" (cifrado, `usuario_id`, cascadas, retención).
- [ ] Revisa que `docs/base-de-datos.md` esté completo y coincida con `schema.sql`.

**Listo cuando:** congelamiento de código el viernes 6. ← **Hito 4**

---

## Cierre (9–12 nov)
- [ ] Ensayo general (martes 10) · Entrega (jueves 12).
