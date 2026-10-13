# Instalación y despliegue

> **Responsable del despliegue:** Samu. Todos deben completar la **Parte 1** en su computador durante la Semana 1.

| Parte | Quién | Tiempo |
|---|---|---|
| [1. Correr Auto-Wealth en tu computador](#1-correr-auto-wealth-en-tu-computador) | **Todos** | 30 min |
| [2. Base de datos en Neon](#2-base-de-datos-en-neon) | Garavito crea las ramas; cada uno copia la suya | 15 min |
| [3. Correos con Gmail (Apps Script)](#3-correos-con-gmail-apps-script) | Samu | 15 min |
| [4. Publicar en Render](#4-publicar-en-render) | Samu | 20 min |
| [5. Variables de configuración](#5-variables-de-configuración) | Referencia | — |

---

## 1. Correr Auto-Wealth en tu computador

### Lo que necesitas instalar (una sola vez)
1. **Node.js 22 LTS** desde [nodejs.org](https://nodejs.org). Comprueba con `node -v` en la terminal (debe decir `v20.12` o más).
2. **Git** desde [git-scm.com](https://git-scm.com), o **GitHub Desktop** si prefieres no usar comandos ([desktop.github.com](https://desktop.github.com)).
3. **Visual Studio Code** desde [code.visualstudio.com](https://code.visualstudio.com). Extensiones recomendadas: *Thunder Client* (probar la API) y *Live Share* (programar en pareja).

### Pasos
1. **Clona el repositorio** (descárgalo con Git):
   - GitHub Desktop: **File → Clone repository** → elige `autowealth`.
   - Terminal: `git clone https://github.com/<organizacion>/autowealth.git` y luego `cd autowealth`.
2. **Instala la dependencia:**
   ```
   npm install
   ```
3. **Crea tu archivo de configuración:**
   - Windows (PowerShell): `copy .env.example .env` y luego `notepad .env`
   - Mac/Linux: `cp .env.example .env` y luego ábrelo en VS Code
4. **Llena en `.env`:**
   - `DATABASE_URL`: la de **tu rama** de Neon (te la pasa Garavito por mensaje privado, **nunca** por el grupo ni en GitHub).
   - `SESSION_SECRET`: genera una con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
   - `DATA_ENCRYPTION_KEY`: genera una con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. En tu computador puede ser distinta a la de producción, porque usas otra base de datos.
   - Deja `EMAIL_PROVIDER=consola`. Los correos se muestran en la terminal en vez de enviarse.
5. **Arranca:**
   ```
   npm run dev
   ```
   `dev` reinicia el servidor solo cada vez que guardas un archivo de `src/`. Los cambios en `public/` se ven con solo recargar el navegador.
6. Abre **http://localhost:3000**, regístrate, entra al panel y conecta **Banco Ceiba** (de prueba).

Si ves `🚀 Auto-Wealth funcionando en http://localhost:3000`, quedó listo. Si sale un mensaje con ❌, el texto dice qué falta (ver [Problemas comunes](#problemas-comunes)).

---

## 2. Base de datos en Neon

La base de datos de producción **ya existe**, en la cuenta de Neon de Juanes.

**Juanes** (una vez): invita **solo a Garavito** (y, si quieren, a Samu como respaldo) al proyecto de Neon. Neon recomienda hacerlo desde la **organización** (*Organization → Members/Collaborators*) dando permiso **solo sobre este proyecto**. La opción antigua *Settings → Collaborators* del proyecto está siendo retirada. Los demás **no** necesitan cuenta de Neon: reciben solo la cadena de conexión de su rama.

> ¿Por qué no invitar a todos? Quien tiene acceso al proyecto ve también la rama `main`, con los datos reales de los usuarios. Menos personas con acceso significa menos riesgo.

**Garavito** (una vez):
1. En [neon.com](https://neon.com), entra al proyecto (aparece en tu organización o en "Shared with me"). Región: **AWS US East 2 – Ohio**.
2. **Branches → New branch**, a partir de `main`. Crea `dev-juanes`, `dev-garavito`, `dev-aleja`, `dev-david`, `dev-samu` y `pruebas`.
3. A cada persona le envía **en privado** la *Connection string* de su rama (botón **Connect** con la rama elegida).

**Cada integrante:** pega su cadena en `DATABASE_URL` de su `.env`. Las tablas se crean solas al arrancar el servidor.

> Copia **solo** la parte que empieza con `postgresql://`, sin `psql` ni comillas.

---

## 3. Correos con Gmail (Apps Script)

El servidor no envía correos directamente: le pide a un pequeño programa de Google (Apps Script) que los envíe desde la cuenta de Gmail del proyecto. Así llegan mejor a la bandeja principal. Límite: 100 correos al día.

1. Con la cuenta de Gmail **del proyecto** (no una personal), entra a [script.google.com](https://script.google.com) → **Nuevo proyecto** → nómbralo `Auto-Wealth correos`.
2. Pega todo el archivo `apps-script/Envio-Gmail.gs`.
3. Cambia `const SECRETO = 'CAMBIA-ESTO...'` por una clave inventada de 20 o más caracteres. Esa misma clave va en `GMAIL_SCRIPT_SECRET`.
4. **Guardar** → elige la función `probar` → **▶ Ejecutar** → acepta los permisos (Configuración avanzada → Ir al proyecto).
5. **Implementar → Nueva implementación** → ⚙️ **Aplicación web** → *Ejecutar como:* **Yo** · *Quién tiene acceso:* **Cualquier persona** → **Implementar**.
6. Copia la URL que termina en `/exec`. Esa va en `GMAIL_SCRIPT_URL`.

Si cambias el script, publícalo con **Implementar → Administrar implementaciones → ✏️ → Versión: Nueva versión**. La URL no cambia.

*Alternativa:* [Brevo](https://brevo.com) (300 correos al día, `EMAIL_PROVIDER=brevo`). Funciona bien con un dominio propio; con un remitente `@gmail.com` los correos suelen caer en spam.

---

## 4. Publicar en Render

> **Render es de Samu.** El plan gratuito (*Hobby*) admite **una sola persona** por espacio de trabajo, así que el servicio vive en la cuenta de Samu. El resto del equipo no necesita entrar: Render publica solo cada vez que algo llega a `main`. Si necesitas ver un error de Render, pídele a Samu los **Logs**.
>
> **Traspaso desde la cuenta de Juanes (Semana 1):** Samu crea un servicio nuevo con estos pasos y **las mismas variables** del servicio viejo (Juanes se las pasa por el gestor de contraseñas). Como usa la misma `DATABASE_URL` y la misma `DATA_ENCRYPTION_KEY`, los usuarios y sus datos siguen ahí. Cuando funcione, Juanes suspende su servicio. **La URL de la app cambia**: actualícenla en el `README.md` y en el Apps Script (`URL_APP`).

1. En [render.com](https://render.com) (entra con GitHub; necesitas ser Admin del repositorio): **New → Web Service** → elige el repositorio `autowealth`. Si no aparece, usa **Configure GitHub** para darle acceso a Render.
2. Configura:
   - **Branch:** `main`
   - **Region:** Ohio (US East)
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
3. **Environment**: agrega las variables de la [sección 5](#5-variables-de-configuración) con los valores de **producción**.
4. **Deploy Web Service**. En **Logs** debe aparecer `🚀 Auto-Wealth funcionando`.
5. **Auto-Deploy** queda activado: cada vez que algo se fusiona en `main`, Render publica solo en 2 o 3 minutos. Por eso **a `main` solo llega código revisado** (ver [CONTRIBUTING.md](../CONTRIBUTING.md)).
6. **Health Check Path** (en Settings): `/api/salud`. Render revisa con esa ruta que la app esté viva.
7. **Comprueba con un usuario que ya existía:** si entra y ve sus movimientos sin "(no se pudo leer)", la base de datos y la clave de cifrado quedaron bien.

> **Plan gratuito:** si nadie entra en 15 minutos, el servidor se "duerme". La siguiente visita tarda cerca de 1 minuto. Antes de una presentación, abre el enlace unos minutos antes.

### Si algo sale mal en el traspaso
Mientras el servicio viejo de Juanes esté solo **suspendido** (no borrado), se puede reactivar con **Resume Web Service** en un minuto. Por eso se borra una semana después.

---

## 5. Variables de configuración

| Variable | Obligatoria | Ejemplo / valor | Para qué |
|---|---|---|---|
| `PORT` | No | `3000` | Puerto local (Render pone el suyo) |
| `NODE_ENV` | En Render | `production` | Activa cookies seguras, HSTS y caché |
| `DATABASE_URL` | **Sí** | `postgresql://...neon.tech/neondb?sslmode=require` | Conexión a Neon |
| `SESSION_SECRET` | **Sí** | 96 caracteres aleatorios | Firma las sesiones. Cambiarla cierra todas las sesiones |
| `DATA_ENCRYPTION_KEY` | **Sí** | 64 caracteres hexadecimales | Cifra los datos financieros. ⚠️ **Si se pierde o se cambia, los datos cifrados no se pueden leer** |
| `SURVEY_URL` | No | `https://forms.gle/q7PYdBcBk3SMQzUPA` | Encuesta del correo de bienvenida |
| `EMAIL_PROVIDER` | No | `consola` / `gmail` / `brevo` | Cómo se envían los correos |
| `GMAIL_SCRIPT_URL` | Si `gmail` | `https://script.google.com/.../exec` | URL del Apps Script |
| `GMAIL_SCRIPT_SECRET` | Si `gmail` | 20+ caracteres | Igual al `SECRETO` del Apps Script |
| `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`, `BREVO_API_KEY` | Si `brevo` | — | Datos de Brevo |
| `OPEN_FINANCE_PROVIDER` | No | `simulado` | Proveedor de Open Finance |
| `CONSENT_MONTHS` | No | `12` | Duración de las autorizaciones (1 a 24) |
| `ADMIN_USER`, `ADMIN_PASSWORD` | No | `admin` / 10+ caracteres | Acceso a `/admin`. Sin contraseña, `/admin` queda desactivado |
| `TEST_DATABASE_URL` | Solo para `npm test` | Rama `pruebas` de Neon | Base de datos de las pruebas automáticas |

**Dónde se guardan las claves de producción:** en Render → Environment, y en un gestor de contraseñas compartido del equipo (por ejemplo Bitwarden, que es gratuito). **Nunca** en GitHub, WhatsApp ni en documentos compartidos.

---

## Problemas comunes

| Mensaje | Solución |
|---|---|
| `❌ Falta configuración ... DATABASE_URL` | Revisa que pegaste la cadena completa de Neon, sin `psql` ni comillas |
| `❌ ... DATA_ENCRYPTION_KEY` | Genérala con el comando del paso 4. Debe tener 64 caracteres |
| `❌ No se pudo conectar a la base de datos` | Cadena incompleta, contraseña cambiada o rama borrada en Neon |
| `Cannot find module 'pg'` | Te faltó `npm install` |
| `EADDRINUSE` | Ya hay un servidor abierto. Ciérralo con `Ctrl + C` o usa `PORT=3001` |
| `npm` dice que no encuentra `package.json` | No estás dentro de la carpeta del repositorio (`cd autowealth`) |
| Movimientos con "(no se pudo leer)" | Cambió la `DATA_ENCRYPTION_KEY`. Vuelve a poner la original |
| Al volver del banco: "La solicitud de conexión venció" | Pasaron más de 15 minutos. Empieza de nuevo |
| Render: `Exited with status 1` | En **Logs** busca la línea con ❌: dice qué variable falta |
| Los correos no llegan (modo `gmail`) | En Render → Logs busca `No se pudo enviar el correo`. Revisa que `GMAIL_SCRIPT_SECRET` sea idéntica al `SECRETO` y que el script tenga acceso "Cualquier persona" |
