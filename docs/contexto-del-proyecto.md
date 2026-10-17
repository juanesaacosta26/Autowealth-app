# Contexto del proyecto

Este documento cuenta **cómo llegamos aquí y por qué** se tomaron las decisiones. Léelo antes de proponer cambios grandes: muchas preguntas ("¿por qué no usamos Express?", "¿por qué no Brevo?") ya tienen respuesta.

## La idea

**Auto-Wealth** es una aplicación web para que cada persona **controle sus finanzas**: ver en qué se le va el dinero, detectar suscripciones y "gastos hormiga", entender cuánto ahorra y recibir recomendaciones. El nombre del proyecto es **DEFI JUANES**. El objetivo a mediano plazo es conectarse con los bancos mediante **Open Finance**.

**Equipo:** Juanes, Garavito, Aleja, David y Samu.

## Línea de tiempo

| Fecha (2026) | Qué pasó | Decisión y por qué |
|---|---|---|
| Sep 23 | Existía una **página de inicio** (HTML) con registro simulado y una encuesta dentro de la página | Se quería guardar a cada persona que se registra y enviarle la encuesta por correo |
| Sep 23 | Primer intento: un servidor Node.js con `.env` y SMTP | Se cambió por algo más simple para empezar |
| Sep 23 | **Google Apps Script + Google Sheets:** la página guardaba registros en una hoja de cálculo y Gmail enviaba el enlace del **Google Form** | Funcionó, pero la hoja de cálculo no es segura ni eficiente para datos de usuarios. El código quedó en `legado/apps-script-google-sheets.gs` |
| Sep 23 | Publicación de la página en **Netlify** | Se reemplazó por Render, que sirve la página y la API juntas |
| Sep 30 | **Servidor Node.js + PostgreSQL (Neon) + Render** | Base de datos real, contraseñas con hash, validación en el servidor y límites de intentos. **Una sola dependencia (`pg`)**: en el entorno de desarrollo no había acceso a npm, y además menos dependencias es más seguro |
| Sep 30 | Correos con **Brevo** | Render gratis **bloquea SMTP**, así que se usó una API por HTTPS. Problema: con remitente `@gmail.com`, Brevo reescribe el remitente y Gmail lo manda a spam |
| Sep 30 | Correos con **Gmail vía Apps Script** (`apps-script/Envio-Gmail.gs`) | Sale del Gmail real y llega mejor a la bandeja principal. Límite: 100 al día. **El diseño del correo vive en el Apps Script**: si alguien robara la clave, solo podría enviar el correo de la encuesta |
| Oct 6 | **Open Finance** | Se investigó la regulación: el **Decreto 0368 de 2026** hizo obligatorias las finanzas abiertas, pero las APIs estándar aún no están disponibles. Belvo (agregador) hoy cubre Brasil y México, no Colombia. **Decisión:** construir el flujo completo con un **banco de prueba** y dejar el módulo listo para cambiar de proveedor |
| Oct 6 | **Panel financiero** (`/app`), extractos CSV, registro manual y centro de privacidad | Así la app sirve con datos reales hoy (CSV y manual) mientras llega Open Finance real |
| Oct 12 | **Repositorio del equipo** y plan de trabajo de 4 semanas | Ver [plan-de-trabajo/](plan-de-trabajo/README.md) |
| Oct 17 | **Deudas y dinero ocioso:** el equipo quiere llevar el dinero ocioso a pagar deudas o a renta fija | Mover dinero real exige licencias que no tenemos. **Decisión:** registro de deudas, plan educativo (deudas más caras primero, luego renta fija genérica) y **pagos simulados** con el banco de prueba, autorizados uno por uno en el banco. Ver [redireccion-de-dinero.md](redireccion-de-dinero.md) |

## Decisiones técnicas importantes

| Decisión | Por qué | Si quieres cambiarla |
|---|---|---|
| Servidor con `node:http`, sin Express | Una sola dependencia, código fácil de leer de arriba abajo, nada que actualizar | Se puede migrar a Express, pero hay que reescribir `server.js` y `src/http.js` y actualizar las pruebas. Háblalo con el equipo primero |
| Páginas en HTML/CSS/JS sin framework (sin React) | Cualquiera del equipo puede editarlas; no hay paso de compilación | No migrar este mes: no hay tiempo y no aporta a la entrega |
| Todo en español | Equipo hispanohablante, entrega académica | — |
| Sesiones en cookie firmada (no JWT en localStorage) | `HttpOnly` impide que un script robe la sesión | — |
| Cifrado de descripciones y tokens | La regulación y el sentido común: son datos sensibles | Nunca guardar datos financieros nuevos sin cifrar |
| Banco de prueba con nombres ficticios y sin campo de clave | No imitar bancos reales ni entrenar a la gente a escribir claves en páginas falsas | Nunca usar nombres ni logos de bancos reales en el simulador |
| `schema.sql` que solo agrega (`IF NOT EXISTS`) | Render lo ejecuta al arrancar; no puede romper datos existentes | Ver "Cambios a la estructura" en [base-de-datos.md](base-de-datos.md) |

## Servicios y cuentas

| Servicio | Para qué | Quién administra |
|---|---|---|
| GitHub (repositorio `autowealth`) | Código, issues, revisiones | Juanes (dueño) y Samu (administrador). Los 5 son colaboradores |
| Render | Servidor en internet | **Samu**, en su propia cuenta (el plan gratuito admite una sola persona). El servicio viejo de Juanes se suspende tras el traspaso |
| Neon | Base de datos | Cuenta de Juanes. **Garavito** invitado como colaborador del proyecto para administrar las ramas |
| Gmail del proyecto + Apps Script | Correos | Samu |
| Google Forms | Encuesta (ver [encuesta.md](encuesta.md)) | Aleja |

**Las claves nunca se comparten en el grupo ni se suben a GitHub.** Ver [instalacion-y-despliegue.md](instalacion-y-despliegue.md#5-variables-de-configuración).

## Glosario

| Término | Significado |
|---|---|
| **API** | Las direcciones (`/api/...`) que las páginas usan para pedirle cosas al servidor |
| **Endpoint / ruta** | Una de esas direcciones, ej. `POST /api/registro` |
| **Hash** | Transformación irreversible: sirve para comprobar una contraseña sin guardarla |
| **Cifrado** | Transformación reversible con una clave: sirve para guardar datos que luego hay que leer |
| **Consentimiento** | La autorización del usuario para consultar su banco |
| **State** | Código aleatorio que asegura que el regreso desde el banco corresponde a esta persona |
| **Rama (branch)** | Copia paralela del código (Git) o de la base de datos (Neon) para trabajar sin afectar lo principal |
| **Pull Request (PR)** | Solicitud para unir tu rama a `main`, con revisión de otra persona |
| **CI** | Revisión automática que GitHub corre en cada PR (`.github/workflows/ci.yml`) |
| **Deploy** | Publicar una versión nueva en Render |
