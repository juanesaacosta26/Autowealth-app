# Plan de Samu · Infraestructura, seguridad y calidad

**Tu área:** que el proyecto funcione y sea seguro: GitHub, Render, revisión automática, pruebas, correos, seguridad y la versión final.
**Tus archivos:** `.github/`, `tests/`, `src/seguridad.js`, `src/sesion.js`, `src/http.js`, `src/cifrado.js`, `src/config.js`, `src/correo.js`, `apps-script/` y `docs/instalacion-y-despliegue.md`, `docs/seguridad-y-cumplimiento.md`.
**Trabajas con todos:** eres quien desbloquea a los demás cuando algo de entorno falla.

> Regla de tu área: **`main` siempre funciona.** Lo que llega a `main` se publica solo en Render, así que nada entra sin revisión de otra persona ni con la revisión automática en rojo.

---

## Semana 1 · GitHub, Render y que todos arranquen (13–16 oct)

### Sesión 1 · Configurar GitHub
Juanes crea el repositorio y sube el código; tú quedas como **administrador**.
- [ ] Pídele a Juanes el rol de **Admin** del repositorio (o crea una organización gratuita en GitHub, ej. `autowealth-defi`, y transfieran el repositorio allí).
- [ ] **Settings → Collaborators:** invita a los 5 con rol *Write*.
- [ ] **Ojo con la protección de `main`:** en GitHub gratis solo funciona en repositorios **públicos**. Elijan una opción:
  - **Público:** el código no tiene claves (están en `.env` y en Render), así que es seguro. Es la opción más simple.
  - **Privado + GitHub Pro gratis para estudiantes:** el dueño del repositorio pide el [GitHub Student Developer Pack](https://education.github.com/pack) con su correo de la universidad.
  - **Privado sin protección:** funciona, pero depende de que nadie haga `push` directo a `main`.
- [ ] **Settings → Branches → Add rule** (o **Rules → Rulesets**) para `main`:
  - Require a pull request before merging (1 aprobación).
  - Require status checks to pass → **Revisión automática / pruebas**.
  - Do not allow bypassing.
- [ ] **Issues → Labels:** crea `api`, `base-de-datos`, `inicio`, `panel`, `infra`, `seguridad`, `contenido`, `error` y `tarea`.
- [ ] **Projects → New project → Board** con las columnas *Por hacer · En progreso · En revisión · Hecho*.

**Listo cuando:** la regla de `main` está activa y el primer PR de prueba muestra la revisión automática.

### Sesión 2 · Render y secretos
- [ ] En Render, conecta el servicio al repositorio nuevo (**Settings → Build & Deploy → Repository**) o crea uno nuevo siguiendo [instalacion-y-despliegue.md §4](../instalacion-y-despliegue.md#4-publicar-en-render).
- [ ] Revisa las variables de entorno contra la tabla de la [§5](../instalacion-y-despliegue.md#5-variables-de-configuración) y configura **Health Check Path** en `/api/salud`.
- [ ] Crea un gestor de contraseñas compartido (Bitwarden gratuito: *Organizations*). Guarda allí las claves de producción, **en especial `DATA_ENCRYPTION_KEY`**.
- [ ] Verifica que la app publicada funciona: registro, panel y Banco Ceiba.

### Sesión 3 · Día de instalación del equipo
- [ ] Reúnete (o haz llamada) con quien no haya logrado correr la app y resuélvanlo juntos.
- [ ] Con un PR pequeño de cada persona (por ejemplo, agregar su nombre a la tabla del README), comprueba que todos saben hacer rama → commit → PR → revisión → fusionar.
- [ ] Haz `npm install`, sube el `package-lock.json` que se genera (así todos instalan exactamente las mismas versiones) y revisa que la revisión automática siga en verde.

**Listo cuando:** los 5 corren la app y fusionaron su primer PR. ← **Hito 1**

---

## Semana 2 · Correo de recuperación y pruebas (19–23 oct)

### Sesión 1 · Plantilla del correo de recuperación
- [ ] Rama `feature/samu-correo-recuperacion`.
- [ ] En `apps-script/Envio-Gmail.gs`, agrega un segundo tipo de correo: si llega `tipo: 'recuperacion'` con `enlace`, envía "Crea una contraseña nueva" con el botón al enlace y el aviso *"Si no fuiste tú, ignora este correo. El enlace vence en 30 minutos."*
- [ ] **Seguridad:** el script solo acepta enlaces que empiecen por la URL de la app (constante `URL_APP`). Así, aunque alguien robara el `SECRETO`, no podría usar el correo para enviar enlaces a otros sitios.
- [ ] Publica una **versión nueva** del Apps Script (la URL no cambia).

### Sesión 2 · `enviarCorreoRecuperacion` en el servidor
- [ ] En `src/correo.js` agrega `enviarCorreoRecuperacion(para, nombre, enlace)` para los 3 proveedores (`consola` muestra el enlace en la terminal, `gmail` llama al Apps Script con `tipo: 'recuperacion'`, `brevo` usa una plantilla HTML).
- [ ] Pásale la función a Juanes y explícale cómo llamarla.

**Pídele a Claude:** *"Agrega enviarCorreoRecuperacion a src/correo.js para los proveedores consola, gmail y brevo, siguiendo el estilo de enviarCorreoEncuesta. Para gmail, envía tipo 'recuperacion' al Apps Script."*

### Sesión 3 · Más pruebas automáticas
- [ ] Lee `tests/api.test.js` y córrelo con la rama `pruebas` de Neon.
- [ ] Agrega pruebas de lo que aún no está cubierto: límite de intentos de ingreso (429 al noveno intento), `/admin` sin contraseña (404), sesión vencida o alterada, CSV de importación con filas inválidas.
- [ ] Ayuda a Juanes a escribir las pruebas de presupuestos y metas.

**Listo cuando:** pruebas nuevas en `main` y la revisión automática en verde. ← **Hito 2**

---

## Semana 3 · Seguridad (26–30 oct)

### Sesión 1 · Revisión OWASP
- [ ] Haz la prueba manual de la [lista OWASP](../seguridad-y-cumplimiento.md#lista-owasp-para-la-semana-3-prueba-manual) contra tu entorno local con dos usuarios.
- [ ] Crea un issue por cada hallazgo (etiqueta `seguridad`) y asígnalo a quien corresponda.
- [ ] Revisa las cabeceras de la URL de Render en [securityheaders.com](https://securityheaders.com) y guarda la captura para la presentación.

### Sesión 2 · Política de seguridad sin `'unsafe-inline'`
- [ ] Con Aleja y David: mueve los scripts que quedan en línea (el del tema en el `<head>` de `index.html`, `app.html` y `privacidad.html`) a `public/assets/tema.js`.
- [ ] En `src/http.js` quita `'unsafe-inline'` de `script-src`. Recorre todas las páginas con F12 → Consola: no debe aparecer ningún error "Content Security Policy".
- [ ] Corre `npm audit` y resuelve lo que aparezca.

**Pídele a Claude:** *"Revisa todas las páginas de public/ y dime qué scripts o atributos en línea (onclick, style con javascript) impedirían quitar 'unsafe-inline' de script-src."*

### Sesión 3 · Monitoreo
- [ ] Crea un monitor gratuito (por ejemplo UptimeRobot) que revise `https://<tu-app>/api/salud` cada 5 minutos y avise por correo si falla. Ojo: el plan gratis de Render se duerme; un monitor cada 5 minutos lo mantiene despierto, pero gasta horas gratis. Revisa que no se pasen de 750 horas al mes con un solo servicio.
- [ ] Documenta en `docs/instalacion-y-despliegue.md` cómo revisar los logs de Render y qué hacer si la app se cae.

**Listo cuando:** hallazgos OWASP resueltos o asignados y monitoreo activo. ← **Hito 3**

---

## Semana 4 · Versión final (3–6 nov)

### Sesión 1 · Prueba completa en producción
- [ ] Recorre en la URL de Render **toda** la app: registro, correo, panel, banco de prueba, CSV, presupuestos, metas, recuperar contraseña, privacidad y eliminar cuenta. Hazlo con celular y computador.
- [ ] Anota los errores en issues y persigue que se corrijan antes del viernes.

### Sesión 2 · Publicar la versión `v1.0`
- [ ] Viernes 6, congelamiento de código: tras fusionar lo último, en GitHub ve a **Releases → Draft a new release** → etiqueta `v1.0` y escribe las notas de la versión (qué incluye, con la ayuda de todos).
- [ ] Confirma que Render publicó exactamente esa versión.
- [ ] Revisa que `README.md` y `docs/` estén al día.

### Sesión 3 · Tu parte de la presentación
- [ ] 2–3 diapositivas: arquitectura (servidor, base de datos, correo, Render) y "Cómo protegemos los datos" (cifrado, sesiones, OWASP, captura de las cabeceras, regulación).
- [ ] Plan B de la demo: el video de respaldo de Aleja y una sesión ya iniciada en otro navegador.

**Listo cuando:** `v1.0` publicada. ← **Hito 4**

---

## Cierre (9–12 nov)
- [ ] Antes del ensayo general (martes 10), despierta el servidor de Render 10 minutos antes y verifica `/api/salud`.
- [ ] Entrega (jueves 12): haz lo mismo antes de presentar.
