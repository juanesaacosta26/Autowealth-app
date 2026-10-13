# Plan de trabajo · 4 semanas

**Inicio:** martes 13 de octubre de 2026 · **Entrega final:** jueves 12 de noviembre de 2026

## Qué vamos a entregar

Partimos de una app que ya funciona: registro, panel financiero, Open Finance con banco de prueba, extractos CSV y privacidad. En este mes la convertimos en un **producto completo y presentable**:

| # | Entregable | Áreas que participan |
|---|---|---|
| 1 | **Presupuestos por categoría**: límite mensual por categoría, con aviso al 80 % y al pasarse | API · Base de datos · Panel |
| 2 | **Metas de ahorro**: objetivo, fecha límite, aportes y cuánto ahorrar por mes | API · Base de datos · Panel |
| 3 | **Recuperar contraseña** por correo, de forma segura | API · Base de datos · Infra (correo) · Página de inicio |
| 4 | **Página de inicio y páginas legales** revisadas: textos reales, términos y condiciones, política completa, accesible y móvil | Página de inicio |
| 5 | **Calidad y seguridad**: pruebas automáticas, revisión OWASP, monitoreo, despliegue estable | Infra · todos |
| 6 | **Datos de demostración** y **presentación final** con demo en vivo | Todos |

## Equipo y responsabilidades

| Persona | Área | Archivos principales | Plan detallado |
|---|---|---|---|
| **Juanes** | **APIs** (lógica del servidor) | `src/rutas.js`, `src/finanzas/rutas.js`, `src/openfinance/`, `src/finanzas/analisis.js`, `docs/api.md` | [juanes.md](juanes.md) |
| **Garavito** | **Base de datos** | `src/schema.sql`, `src/db.js`, `src/finanzas/db.js`, `src/auditoria.js`, `scripts/`, `docs/base-de-datos.md` | [garavito.md](garavito.md) |
| **Aleja** | **Página de inicio, contenido y legal** | `public/index.html`, `public/assets/inicio.*`, `public/privacidad.html`, páginas nuevas, `docs/encuesta.md` | [aleja.md](aleja.md) |
| **David** | **Panel financiero** (interfaz) | `public/app.html`, `public/assets/panel.*` | [david.md](david.md) |
| **Samu** | **Infraestructura, seguridad y calidad** | `.github/`, `tests/`, `src/seguridad.js`, `src/http.js`, `src/correo.js`, `apps-script/`, Render | [samu.md](samu.md) |

Cada persona tiene **3 sesiones de trabajo por semana** (de unas 2 horas), en total **12 sesiones**. La carga es equivalente: todos construyen una parte de cada función nueva y todos presentan.

## Calendario

```
           Lun   Mar   Mié   Jue   Vie
Semana 1   12*   13    14    15    16 ← Hito 1      (12 oct: festivo)
Semana 2   19    20    21    22    23 ← Hito 2
Semana 3   26    27    28    29    30 ← Hito 3
Semana 4    2*    3     4     5     6 ← Hito 4 · congelamiento de código   (2 nov: festivo)
Cierre      9    10    11    12        ← 10: ensayo general · 12: ENTREGA
```

| Hito | Fecha | Qué debe estar listo (todos lo revisan juntos en la reunión del viernes) |
|---|---|---|
| **Hito 1 · Arranque** | vie 16 oct | Repositorio en GitHub con `main` protegida y revisión automática en verde. **Los 5** corren la app en su computador con su rama de Neon. Contratos aprobados: rutas nuevas (`docs/api.md` §6) y tablas nuevas (`docs/base-de-datos.md`). Issues creados en el tablero |
| **Hito 2 · Construcción** | vie 23 oct | Tablas y consultas nuevas fusionadas. API de presupuestos y metas funcionando. Pantallas de presupuestos y metas con datos de ejemplo. Términos y condiciones publicados |
| **Hito 3 · Integración** | vie 30 oct | Pantallas conectadas a la API real. Recuperar contraseña funcionando de punta a punta. Pruebas automáticas de lo nuevo. Revisión OWASP hecha. Todo publicado en Render |
| **Hito 4 · Cierre** | vie 6 nov | **Congelamiento de código:** después de esta fecha solo se corrigen errores. Datos de demostración cargados, documentación al día, versión `v1.0` publicada, presentación lista en borrador |
| **Entrega** | jue 12 nov | Ensayo general el martes 10. Entrega de app + repositorio + presentación |

### Orden de dependencias (para no bloquearse)
```
Semana 1:  Juanes publica el contrato de la API ─┐
           Garavito publica las tablas ──────────┼─► Semana 2: David y Aleja construyen pantallas con datos de ejemplo
                                                 └─► Semana 2: Juanes programa las rutas sobre las tablas de Garavito
Semana 2:  Samu prepara el correo de recuperación ─► Semana 3: Juanes conecta "recuperar contraseña"
Semana 3:  Todo se conecta con la API real ─► Semana 4: pulido, demo y presentación
```
**Regla de oro:** si dependes de alguien que aún no termina, **no te detengas**: trabaja con datos de ejemplo (mocks) siguiendo el contrato de `docs/api.md`, y avisa en el grupo.

## Rutinas del equipo

| Cuándo | Qué | Duración |
|---|---|---|
| **Martes** (inicio de semana) | Reunión de planeación: cada uno dice qué hará en sus 3 sesiones y qué necesita de otros | 20–30 min |
| **Todos los días que trabajes** | Mensaje en el grupo: *"Hice… / Voy a hacer… / Me bloquea…"* | 1 min |
| **Viernes** | Revisión del hito: cada uno muestra en pantalla lo que hizo (demo de 3 minutos) y se fusionan los PR pendientes | 30–45 min |

Ajusten la hora a sus horarios, pero mantengan los dos encuentros semanales.

## Cómo se trabaja cada sesión
1. **Antes:** abre tu archivo del plan, lee la sesión y actualiza tu rama (`git pull origin main` y luego `git merge main` en tu rama). Ver [CONTRIBUTING.md](../../CONTRIBUTING.md).
2. **Durante:** sigue los pasos. Haz *commits* pequeños con mensajes claros.
3. **Al terminar:** abre o actualiza tu **Pull Request**, mueve tu tarjeta en el tablero y escribe tu mensaje en el grupo.
4. **Si te trabas más de 30 minutos:** pregunta en el grupo o usa Claude (abajo). No te quedes solo con el problema.

### Usar Claude en el proyecto
El archivo [`CLAUDE.md`](../../CLAUDE.md) le explica a Claude cómo es el proyecto y sus reglas. Con **Claude Code** abierto en la carpeta del repositorio, Claude lo lee solo. Cada plan individual trae ejemplos de qué pedirle. Tres reglas:
1. **Entiende lo que Claude escribe antes de hacer commit.** Si no puedes explicarlo en la demo del viernes, no está listo.
2. **Pídele que corra las pruebas** (`npm test`) y que revise contra la lista de seguridad.
3. **Nunca le pegues claves reales** (`.env`, contraseñas de Neon o Render).

## Lista de entrega final (jueves 12 de noviembre)
- [ ] App publicada en Render, funcionando, con datos de demostración
- [ ] Repositorio con `README.md`, `docs/` actualizados y revisión automática en verde
- [ ] Versión `v1.0` publicada en GitHub (*Releases*) con notas de la versión
- [ ] Presentación (≈ 15 min): problema, solución, demo en vivo, arquitectura, seguridad y regulación, aprendizajes. **Cada integrante presenta su parte**
- [ ] Video de respaldo de la demo (por si falla internet)
- [ ] Resultados de la encuesta (Aleja) y métricas de uso (Garavito)

## Seguimiento
Marca las sesiones terminadas en tu archivo (cambia `- [ ]` por `- [x]`) y en el tablero de GitHub (**Projects**).

| Semana | Juanes | Garavito | Aleja | David | Samu |
|---|---|---|---|---|---|
| 1 | ☐☐☐ | ☐☐☐ | ☐☐☐ | ☐☐☐ | ☐☐☐ |
| 2 | ☐☐☐ | ☐☐☐ | ☐☐☐ | ☐☐☐ | ☐☐☐ |
| 3 | ☐☐☐ | ☐☐☐ | ☐☐☐ | ☐☐☐ | ☐☐☐ |
| 4 | ☐☐☐ | ☐☐☐ | ☐☐☐ | ☐☐☐ | ☐☐☐ |
