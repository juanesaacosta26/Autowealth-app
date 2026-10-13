# CLAUDE.md — Instrucciones para Claude en el proyecto Auto-Wealth

## Qué es este proyecto
Auto-Wealth es una aplicación web de finanzas personales (proyecto académico "DEFI JUANES", Colombia). Tiene registro e inicio de sesión, un panel financiero (`/app`), Open Finance con un **banco de prueba**, importación de extractos CSV, registro manual de movimientos y un centro de privacidad. La hace un equipo de 5 estudiantes que están aprendiendo: **explica lo que haces en español sencillo** y deja comentarios útiles en el código.

Lee primero: `docs/contexto-del-proyecto.md` (decisiones y por qué), `docs/arquitectura.md` (mapa del código) y el plan de la persona con la que trabajas en `docs/plan-de-trabajo/`.

## Comandos
- `npm install` instala la única dependencia (`pg`).
- `npm run dev` arranca en http://localhost:3000 y se reinicia al guardar `src/`. Necesita `.env` (ver `.env.example`).
- `npm test` corre las pruebas de `tests/`. Necesita `TEST_DATABASE_URL` apuntando a una base de datos **de pruebas** (nunca producción). Sin esa variable las pruebas se saltan.
- Revisar sintaxis: `node --check <archivo.js>`.
- El equipo usa **Windows y PowerShell**: da los comandos en esa forma (`copy`, `$env:VAR="..."`) además de la de Mac/Linux.

## Stack y arquitectura
- Node.js ≥ 20.12, **CommonJS**, servidor con `node:http` (sin Express) y PostgreSQL (Neon) vía `pg`. Despliegue en Render (auto-deploy desde `main`).
- Frontend: HTML + CSS + JavaScript **sin frameworks ni paso de compilación**. Páginas en `public/`; su CSS y JS en `public/assets/`.
- Rutas de la API: tabla `API` en `server.js` → manejadores en `src/rutas.js`, `src/finanzas/rutas.js` y `src/openfinance/index.js`. Consultas: `src/db.js` y `src/finanzas/db.js`. Estructura: `src/schema.sql` (se ejecuta al arrancar).
- Correo: `src/correo.js` con los proveedores `consola`, `gmail` (Apps Script en `apps-script/Envio-Gmail.gs`) y `brevo`. **Render gratis bloquea SMTP: no uses nodemailer ni SMTP.**
- Open Finance: proveedor intercambiable (`src/openfinance/simulado.js`). La interfaz que debe cumplir un proveedor está en `docs/open-finance.md`.

## Reglas obligatorias (seguridad: datos financieros de personas)
1. **SQL siempre parametrizado** (`$1, $2…`). Nunca interpoles texto en el SQL.
2. **Toda consulta de datos de un usuario filtra por `usuario_id`** de la sesión, aunque ya tengas el `id` del registro. Si no es suyo, responde 404.
3. **Rutas privadas:** empiezan con `const usuario = await exigirUsuario(req, res); if (!usuario) return;`.
4. **Valida en el servidor** todo lo que llega (tipos, rangos, longitudes), aunque la página ya valide. Mensajes de error en español, claros y sin detalles internos.
5. **Frontend:** todo texto que venga del usuario o de la API pasa por `esc()` antes de ir a `innerHTML`.
6. **Datos sensibles nuevos** (descripciones, notas, tokens) se guardan con `cifrar()` de `src/cifrado.js`. Los tokens que solo se comparan (recuperación de contraseña, `state`) se guardan como `huella()`, nunca en claro.
7. **Nunca** registres en logs contraseñas, tokens, cookies, cédulas completas ni la `DATA_ENCRYPTION_KEY`.
8. **Nunca** leas, muestres ni subas `.env` ni claves reales. Si el usuario te pega una, avísale que debe cambiarla.
9. **`src/schema.sql` solo agrega:** `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`. Nunca `DROP` ni renombrar: Render lo ejecuta contra los datos reales al arrancar.
10. **No cambies cómo se usa `DATA_ENCRYPTION_KEY`** ni el formato `v1:` de `cifrado.js` sin un plan de migración: se perderían los datos cifrados.
11. Acciones importantes sobre datos financieros → `auditoria.registrar(usuarioId, accion, detalle)`, con la acción declarada en `src/auditoria.js`.
12. Si cambias el texto del consentimiento de Open Finance (`textoConsentimiento()`), sube `VERSION_TEXTO`.
13. El banco de prueba usa **nombres ficticios** y **no tiene campo de clave**. Nunca uses nombres, logos ni colores de bancos reales.
14. **Contenido honesto:** no inventes testimonios, cifras de usuarios ni rendimientos. Las recomendaciones son educación financiera, no asesoría de inversión.
15. **No agregues dependencias** (`npm install …`) sin que el usuario confirme que el equipo lo aprobó. Prefiere los módulos de Node (`crypto`, `fetch`, `node:test`).

## Convenciones
- **Español** en nombres de variables y funciones, comentarios, mensajes y documentación (español de Colombia, tuteo). Dinero en COP: positivo = ingreso, negativo = gasto. Fechas `YYYY-MM-DD`.
- Respuestas de la API: `{ ok: true, ... }` o `{ ok: false, error: '...' }` con el código HTTP correcto (ver `docs/api.md`).
- `NUMERIC` llega como texto desde `pg`: usa `::float8` o `Number()`. Fechas desde SQL con `to_char(fecha, 'YYYY-MM-DD')`.
- Estilo: 2 espacios, comillas simples, punto y coma, funciones pequeñas, comentarios que explican el porqué.
- Colores del frontend: variables CSS (`--accent`, `--bg`, `--text`…) con versión clara y oscura. Nada de colores sueltos.
- Accesibilidad: etiquetas en los formularios, foco visible, que se pueda usar con teclado y que el color no sea la única señal.

## Cuando cambies algo
- **API:** actualiza `docs/api.md` en el mismo cambio y agrega una prueba en `tests/`.
- **Base de datos:** actualiza el diagrama y las tablas de `docs/base-de-datos.md`.
- **Variables de entorno nuevas:** agrégalas a `src/config.js` (con validación y mensaje claro), a `.env.example` y a la tabla de `docs/instalacion-y-despliegue.md`.
- Antes de dar por terminado: `node --check` de los archivos tocados y `npm test` si hay `TEST_DATABASE_URL`. Si cambiaste una página, pide al usuario que la revise en el navegador (también en celular y en modo oscuro).
- Trabajo en ramas `feature/<persona>-<tema>`, nunca en `main`. Commits `<área>: <qué hiciste>`. Ver `CONTRIBUTING.md`.

## Áreas y responsables
Respeta el área de la persona con la que trabajas. Si necesitas tocar archivos de otra área, dilo para que lo mencione en el PR.

| Persona | Área | Archivos |
|---|---|---|
| Juanes | APIs | `src/rutas.js`, `src/finanzas/rutas.js`, `src/finanzas/analisis.js`, `src/finanzas/categorias.js`, `src/openfinance/`, `src/validacion.js`, tabla `API` de `server.js`, `docs/api.md` |
| Garavito | Base de datos | `src/schema.sql`, `src/db.js`, `src/finanzas/db.js`, `src/auditoria.js`, `src/admin.js`, `scripts/`, `docs/base-de-datos.md` |
| Aleja | Página de inicio y legal | `public/index.html`, `public/assets/inicio.*`, `public/privacidad.html`, `public/terminos.html`, `public/recuperar.html`, `docs/encuesta.md` |
| David | Panel | `public/app.html`, `public/assets/panel.*` |
| Samu | Infraestructura, seguridad y calidad | `.github/`, `tests/`, `src/seguridad.js`, `src/sesion.js`, `src/http.js`, `src/cifrado.js`, `src/config.js`, `src/correo.js`, `apps-script/`, `docs/instalacion-y-despliegue.md`, `docs/seguridad-y-cumplimiento.md` |

## Trabajo planeado este mes (octubre–noviembre de 2026)
Presupuestos por categoría, metas de ahorro y recuperación de contraseña: contrato en `docs/api.md` §6 y tablas en `docs/base-de-datos.md`. Además, quitar `'unsafe-inline'` de la CSP, monitoreo, datos de demostración y la versión `v1.0`. Fechas en `docs/plan-de-trabajo/README.md`.

## Cómo ayudar mejor a este equipo
- Antes de escribir código, resume en 2–3 líneas qué vas a hacer y en qué archivos.
- Haz cambios pequeños, que se puedan revisar en un PR, y explica cada uno.
- Si una petición va contra estas reglas (por ejemplo, guardar el número completo de una tarjeta o saltarse el filtro por `usuario_id`), explica el riesgo y propone la forma segura.
- Si algo del plan ya no tiene sentido, propón el ajuste en vez de seguirlo a ciegas.
