# Plan de Juanes · APIs

**Tu área:** la lógica del servidor, es decir, todo lo que pasa cuando una página llama a `/api/...`.
**Tus archivos:** `src/rutas.js`, `src/finanzas/rutas.js`, `src/finanzas/analisis.js`, `src/finanzas/categorias.js`, `src/openfinance/`, `src/validacion.js`, la tabla `API` de `server.js` y `docs/api.md`.
**Trabajas de cerca con:** Garavito (te da las consultas a la base de datos), David y Aleja (usan tus rutas), Samu (correo y pruebas).

> Regla de tu área: **el contrato manda**. Antes de programar una ruta, su formato está en `docs/api.md` y el equipo lo conoce. Si cambias un formato, avisa a David y a Aleja.

---

## Semana 1 · Entender y definir el contrato (13–16 oct)

### Sesión 1 · Preparar el entorno y leer la API
- [ ] Sigue la Parte 1 de [instalacion-y-despliegue.md](../instalacion-y-despliegue.md) hasta ver la app corriendo con tu rama de Neon.
- [ ] Lee [arquitectura.md](../arquitectura.md) y [api.md](../api.md).
- [ ] Recorre el código en este orden: `server.js` (tabla `API` y función `atender`) → `src/rutas.js` → `src/finanzas/rutas.js` → `src/openfinance/index.js`.
- [ ] Con F12 → Red, mira qué rutas se llaman cuando te registras, entras al panel y conectas Banco Ceiba.

**Listo cuando:** puedes explicar en voz alta qué pasa desde que alguien hace clic en "Registrarse" hasta que queda guardado.
**Pídele a Claude:** *"Explícame paso a paso qué hace `POST /api/registro`, archivo por archivo, y qué validaciones tiene."*

### Sesión 2 · Probar todas las rutas
- [ ] Instala **Thunder Client** en VS Code.
- [ ] Crea una colección `Auto-Wealth` con **todas** las rutas de `docs/api.md` §1–§4. Recuerda la cabecera `Origin: http://localhost:3000` en `POST`, `PATCH` y `DELETE`.
- [ ] Prueba también los errores: sin sesión (401), datos malos (400), el movimiento de otro usuario (404).
- [ ] Exporta la colección a `docs/api/thunder-coleccion.json` (sin contraseñas reales) y súbela en un PR.

**Listo cuando:** la colección está en el repositorio y cualquiera del equipo puede importarla.
**Pídele a Claude:** *"Revisa docs/api.md contra el código y dime si alguna ruta, campo o código de error no coincide."*

### Sesión 3 · Contrato de las funciones nuevas (con Garavito, David y Aleja)
- [ ] Revisa la propuesta de [api.md §6](../api.md#6-rutas-planeadas-para-este-mes-propuesta): presupuestos, metas y recuperar contraseña.
- [ ] Reúnete 30 minutos con **Garavito** para alinear las tablas ([base-de-datos.md](../base-de-datos.md#tablas-planeadas-para-este-mes)) con tus rutas.
- [ ] Muéstrale a **David** (presupuestos y metas) y a **Aleja** (recuperar contraseña) los formatos de respuesta. Ajusta lo que pidan.
- [ ] Quita la marca "PROPUESTA" de `docs/api.md` §6 y fusiona el PR **antes del viernes**.
- [ ] Crea en GitHub los issues de tus tareas de las semanas 2 y 3 (plantilla "Tarea del plan").

**Listo cuando:** el contrato está en `main` y David y Aleja confirmaron que les sirve. ← **Hito 1**

---

## Semana 2 · Presupuestos y metas (19–23 oct)

> Garavito entrega las funciones de base de datos a mitad de semana. Mientras tanto, escribe la validación y la forma de las respuestas.

### Sesión 1 · Rutas de presupuestos
- [ ] Crea la rama `feature/juanes-presupuestos`.
- [ ] En `src/finanzas/rutas.js` agrega `listarPresupuestos`, `crearPresupuesto`, `actualizarPresupuesto` y `eliminarPresupuesto`. Sigue el estilo de `crearCuenta`: `exigirUsuario` → validar → llamar a `fdb` → `enviarJson`.
- [ ] Validaciones: la categoría debe estar en `GASTOS` (`categorias.js`), y el límite debe ser mayor que 0 y menor que 10.000 millones.
- [ ] Calcula `gastado`, `porcentaje` y `estado` (`bien` hasta 79 %, `cerca` de 80 % a 100 %, `excedido` más de 100 %) con los movimientos del mes.
- [ ] Registra las rutas en la tabla `API` de `server.js`.

**Listo cuando:** las 4 rutas responden en Thunder Client con el formato del contrato.
**Pídele a Claude:** *"Implementa las rutas de presupuestos de docs/api.md §6 en src/finanzas/rutas.js siguiendo el estilo de crearCuenta. Usa las funciones de src/finanzas/db.js que hizo Garavito. No cambies otras rutas."*

### Sesión 2 · Rutas de metas de ahorro
- [ ] Rama `feature/juanes-metas`.
- [ ] Rutas `GET/POST /api/finanzas/metas`, `POST /api/finanzas/metas/:id/aportes` y `DELETE /api/finanzas/metas/:id`.
- [ ] `aporteMensualSugerido` = (objetivo − ahorrado) ÷ meses que faltan hasta `fechaLimite` (mínimo 1 mes). Si no hay fecha, `null`.
- [ ] Un aporte negativo (retiro) no puede dejar `ahorrado` por debajo de 0.
- [ ] Cada aporte queda en `auditoria` (acción nueva: pídele a Garavito que la agregue en `src/auditoria.js`).

**Listo cuando:** puedes crear una meta, aportar, retirar y ver el progreso.

### Sesión 3 · Presupuestos en el resumen y pruebas
- [ ] En `src/finanzas/analisis.js`, si algún presupuesto está `excedido` o `cerca`, agrega una recomendación (tipo `alerta` o `atencion`).
- [ ] Escribe pruebas en `tests/api.test.js` (o en un archivo nuevo `tests/finanzas.test.js`): crear un presupuesto, intentar uno repetido (409), un límite inválido (400), y que otro usuario no pueda borrarlo (404). Mira cómo están hechas las pruebas existentes.
- [ ] Corre `npm test` con tu rama `pruebas` de Neon.
- [ ] Abre el PR y pide revisión a **Garavito**.

**Listo cuando:** el PR tiene la revisión automática en verde y está aprobado. ← **Hito 2**
**Pídele a Claude:** *"Escribe pruebas para las rutas de presupuestos en tests/finanzas.test.js usando las ayudas cliente() y registrar() de tests/api.test.js."*

---

## Semana 3 · Recuperar contraseña e integración (26–30 oct)

### Sesión 1 · Recuperar contraseña
- [ ] Rama `feature/juanes-recuperar`. Necesitas: la tabla `tokens_recuperacion` (Garavito) y `enviarCorreoRecuperacion(email, nombre, enlace)` (Samu).
- [ ] `POST /api/recuperar`: **siempre** responde `{ ok: true }`. Si el correo existe, crea un token con `crypto.randomBytes(32).toString('base64url')`, guarda solo `huella(token)` con vencimiento a 30 minutos y envía el enlace `https://<tu-app>/recuperar?token=...`.
- [ ] `POST /api/recuperar/confirmar`: busca por `huella(token)`, revisa que no esté usado ni vencido, valida la contraseña nueva (mínimo 8), guarda el hash nuevo y marca el token como usado.
- [ ] Límite: 3 solicitudes por correo cada hora (`crearLimitador`). Todo queda en `auditoria`.

**Listo cuando:** el correo llega (en modo `consola` se ve en la terminal), el enlace funciona una sola vez y a los 30 minutos vence.
**Pídele a Claude:** *"Implementa la recuperación de contraseña de docs/api.md §6 con las reglas de seguridad indicadas. Muéstrame cómo evita revelar si un correo existe."*

### Sesión 2 · Cerrar sesiones al cambiar la contraseña
- [ ] Con Garavito: la columna `usuarios.version_sesion`.
- [ ] En `src/seguridad.js` (avísale a Samu, es su archivo): incluye `version` en el token de sesión, y en `src/sesion.js` rechaza los tokens con una versión vieja.
- [ ] Al confirmar la contraseña nueva, suma 1 a `version_sesion`. Así se cierran las sesiones abiertas en otros dispositivos.
- [ ] Prueba: abre sesión en dos navegadores, cambia la contraseña en uno y comprueba que el otro pide entrar de nuevo.

### Sesión 3 · Integración con las pantallas
- [ ] Siéntate (o haz *Live Share*) con **David** para conectar presupuestos y metas, y con **Aleja** para la página de recuperar contraseña.
- [ ] Corrige lo que aparezca. Si cambia algún formato, actualiza `docs/api.md` en el mismo PR.
- [ ] Revisa que todo lo nuevo esté en `main` y publicado en Render.

**Listo cuando:** las tres funciones nuevas funcionan en Render de punta a punta. ← **Hito 3**

---

## Semana 4 · Calidad, documentación y presentación (3–6 nov)

### Sesión 1 · Revisión de calidad
- [ ] Recorre todas tus rutas con la [lista de seguridad](../seguridad-y-cumplimiento.md#lista-de-revisión-rápida-para-cada-pull-request).
- [ ] Revisa los mensajes de error: claros, en español y sin detalles internos.
- [ ] Corrige los errores que reporten en los issues con la etiqueta `error`.

### Sesión 2 · Documentación final de la API
- [ ] `docs/api.md` completo y fiel al código, incluidas las rutas nuevas con ejemplos reales.
- [ ] Actualiza la colección de Thunder Client.
- [ ] Ayuda a Samu con las notas de la versión `v1.0`.

### Sesión 3 · Tu parte de la presentación
- [ ] Prepara 2–3 diapositivas: "Cómo funciona la API" (el recorrido de una petición) y "Open Finance: consentimiento → banco → datos".
- [ ] Ensaya la demo de conectar un banco y crear un presupuesto (3 minutos).

**Listo cuando:** congelamiento de código el viernes 6. ← **Hito 4**

---

## Cierre (9–12 nov)
- [ ] Ensayo general (martes 10): presentas tu parte y la demo de la API.
- [ ] Entrega (jueves 12).
