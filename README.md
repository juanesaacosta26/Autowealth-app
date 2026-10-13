# Auto-Wealth 💰

**Aplicación web de finanzas personales con Open Finance.** Cada persona ve en qué se le va el dinero, detecta suscripciones y "gastos hormiga", entiende cuánto ahorra y recibe recomendaciones. Puede traer sus datos de tres formas: conectando su banco (Open Finance), subiendo el extracto CSV o registrando a mano.

> Proyecto académico **DEFI JUANES** · Equipo: Juanes, Garavito, Aleja, David y Samu · Entrega: 12 de noviembre de 2026

**App publicada:** `https://<nombre-del-servicio>.onrender.com` *(Samu: actualiza este enlace)*

---

## Qué hace

| Función | Estado |
|---|---|
| Registro e inicio de sesión (contraseñas con *scrypt*, sesiones seguras) | ✅ |
| Correo de bienvenida con la encuesta (Gmail vía Apps Script) | ✅ |
| Panel: resumen del mes, ingresos vs. gastos, gastos por categoría, pagos recurrentes, gastos hormiga, recomendaciones | ✅ |
| **Open Finance** con banco de prueba: consentimiento → autorización en el banco → cuentas y movimientos | ✅ (bancos ficticios) |
| Importar extractos CSV y registrar movimientos a mano | ✅ |
| Centro de privacidad: autorizaciones, historial, descargar, borrar y eliminar cuenta | ✅ |
| Presupuestos por categoría | 🛠️ Semanas 2–3 |
| Metas de ahorro | 🛠️ Semanas 2–3 |
| Recuperar contraseña por correo | 🛠️ Semana 3 |

## Inicio rápido

Necesitas **Node.js 20.12 o más reciente** y una base de datos PostgreSQL (rama de Neon: pídela a Garavito).

```bash
git clone https://github.com/<organizacion>/autowealth.git
cd autowealth
npm install
cp .env.example .env        # en Windows: copy .env.example .env
# Llena en .env: DATABASE_URL, SESSION_SECRET y DATA_ENCRYPTION_KEY
npm run dev
```

Abre <http://localhost:3000>, regístrate, entra a **Mi panel** y conecta **Banco Ceiba** (de prueba).

Guía completa, paso a paso para Windows: **[docs/instalacion-y-despliegue.md](docs/instalacion-y-despliegue.md)**.

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Arranca en modo desarrollo (se reinicia solo al guardar cambios en `src/`) |
| `npm start` | Arranca normal (lo usa Render) |
| `npm test` | Pruebas automáticas. Necesita `TEST_DATABASE_URL` (rama `pruebas` de Neon) |

## Estructura

```
autowealth/
├── server.js                 ← Arranque y tabla de rutas (empieza a leer aquí)
├── src/
│   ├── rutas.js              ← API de cuenta: registro, ingreso, sesión
│   ├── finanzas/             ← API del panel, privacidad, análisis y consultas
│   ├── openfinance/          ← Flujo de Open Finance y banco de prueba
│   ├── schema.sql            ← Estructura de la base de datos
│   ├── db.js                 ← Consultas de usuarios
│   ├── seguridad.js · sesion.js · cifrado.js · http.js · config.js
│   ├── correo.js · auditoria.js · admin.js · validacion.js
├── public/
│   ├── index.html · app.html · privacidad.html
│   └── assets/               ← CSS y JavaScript de las páginas
├── apps-script/              ← Script de Google para enviar los correos
├── tests/                    ← Pruebas automáticas (node:test)
├── docs/                     ← Documentación y plan de trabajo
├── legado/                   ← Versiones anteriores (solo como referencia)
├── .github/                  ← Revisión automática y plantillas
├── CLAUDE.md                 ← Instrucciones para Claude
└── CONTRIBUTING.md           ← Cómo trabajamos con Git
```

## Documentación

| Documento | Para qué |
|---|---|
| [docs/contexto-del-proyecto.md](docs/contexto-del-proyecto.md) | **Empieza aquí:** historia, decisiones y glosario |
| [docs/arquitectura.md](docs/arquitectura.md) | Cómo encajan las piezas y quién es responsable de cada archivo |
| [docs/api.md](docs/api.md) | Todas las rutas de la API, con ejemplos, y las planeadas |
| [docs/base-de-datos.md](docs/base-de-datos.md) | Tablas, diagrama, reglas de consultas y entornos |
| [docs/open-finance.md](docs/open-finance.md) | Regulación, flujo de consentimiento y cómo conectar un proveedor real |
| [docs/seguridad-y-cumplimiento.md](docs/seguridad-y-cumplimiento.md) | Medidas de seguridad, lista OWASP y marco legal colombiano |
| [docs/instalacion-y-despliegue.md](docs/instalacion-y-despliegue.md) | Instalar, Neon, correos, Render y variables de configuración |
| [docs/encuesta.md](docs/encuesta.md) | Preguntas del formulario de bienvenida |
| [docs/plan-de-trabajo/](docs/plan-de-trabajo/README.md) | **Plan de 4 semanas** y tareas de cada integrante |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Ramas, commits, Pull Requests y revisiones |
| [CLAUDE.md](CLAUDE.md) | Reglas del proyecto para trabajar con Claude |

## Equipo

| Integrante | Área | Plan |
|---|---|---|
| Juanes | APIs | [juanes.md](docs/plan-de-trabajo/juanes.md) |
| Garavito | Base de datos | [garavito.md](docs/plan-de-trabajo/garavito.md) |
| Aleja | Página de inicio, contenido y legal | [aleja.md](docs/plan-de-trabajo/aleja.md) |
| David | Panel financiero | [david.md](docs/plan-de-trabajo/david.md) |
| Samu | Infraestructura, seguridad y calidad | [samu.md](docs/plan-de-trabajo/samu.md) |

## Aviso

Auto-Wealth es un **prototipo académico**. Los bancos de Open Finance son **de prueba** y sus datos son ficticios. Las recomendaciones son educación financiera, no asesoría de inversión. Antes de manejar datos financieros reales, ver [seguridad-y-cumplimiento.md](docs/seguridad-y-cumplimiento.md#antes-de-tener-usuarios-reales).
