# Plan de David · Panel financiero

**Tu área:** el panel (`/app`), donde cada persona ve y organiza sus finanzas: resumen, movimientos, cuentas y bancos, privacidad, y las pantallas nuevas de **presupuestos** y **metas de ahorro**.
**Tus archivos:** `public/app.html` (estructura), `public/assets/panel.css` (estilos) y `public/assets/panel.js` (lógica).
**Trabajas de cerca con:** Juanes (todas las rutas que usas), Aleja (mismo estilo visual) y Samu (seguridad y pruebas).

> Reglas de tu área: **todo texto que venga del usuario o de la API pasa por `esc()`** antes de ir al HTML (evita inyección de código). Los colores salen de las variables de `panel.css` (`--accent`, `--bg`…), que tienen versión clara y oscura. La página también tiene que funcionar en celular.

---

## Semana 1 · Conocer el panel y diseñar (13–16 oct)

### Sesión 1 · Preparar el entorno y recorrer el panel
- [ ] Sigue la Parte 1 de [instalacion-y-despliegue.md](../instalacion-y-despliegue.md). Regístrate, conecta Banco Ceiba e importa un CSV.
- [ ] Recorre las 4 pestañas en computador, en celular y en modo oscuro.
- [ ] Lee `public/assets/panel.js` de arriba abajo. Está dividido por secciones: utilidades → `api()` → pestañas → Resumen → Movimientos → Cuentas → Privacidad → diálogos.

**Pídele a Claude:** *"Explícame cómo panel.js carga y dibuja la pestaña Resumen: qué ruta llama, cómo arma la gráfica de barras y cómo funciona el tooltip."*

### Sesión 2 · Lista de mejoras
- [ ] Prueba con el teclado: ¿puedes usar todo con Tab y Enter?
- [ ] Prueba con un usuario sin datos, con solo datos manuales y con un banco conectado.
- [ ] Crea issues (etiqueta `panel`) con lo que mejorarías. Prioriza 3 para la Semana 4.

### Sesión 3 · Diseñar presupuestos y metas
- [ ] Lee el contrato en [api.md §6](../api.md#6-rutas-planeadas-para-este-mes-propuesta) y dale tu opinión a Juanes antes del viernes: ¿te falta algún dato para mostrar?
- [ ] Dibuja (en papel, Figma o Excalidraw) una pestaña nueva **"Metas y presupuestos"**:
  - **Presupuestos:** lista de categorías con barra de progreso y estado (bien / cerca / excedido), más el formulario para crear uno.
  - **Metas:** tarjetas con nombre, barra de progreso, fecha límite y "ahorra X al mes", más los botones de aportar y retirar.
  - **En Resumen:** un aviso cuando un presupuesto está cerca o excedido.
- [ ] Muéstraselo al equipo en la reunión del viernes.

**Listo cuando:** diseño aprobado y contrato confirmado con Juanes. ← **Hito 1**

---

## Semana 2 · Construir las pantallas con datos de ejemplo (19–23 oct)

> La API real llega a finales de esta semana. No esperes: trabaja con **datos de ejemplo** que tengan exactamente el formato de `docs/api.md`.

### Sesión 1 · Pestaña "Metas y presupuestos" (estructura)
- [ ] Rama `feature/david-metas-presupuestos`.
- [ ] En `app.html`, agrega la pestaña nueva (botón en `.pestanas` y su `<section role="tabpanel">`). En `panel.js`, súmala a `PESTANAS` y a `cargarPestana`.
- [ ] Crea una función `datosEjemplo()` que devuelva presupuestos y metas falsos con el formato del contrato.

### Sesión 2 · Presupuestos
- [ ] Dibuja la lista de presupuestos con barra de progreso. El color va según el estado, pero **también** con un ícono y un texto ("Excedido"): el color nunca debe ser la única señal.
- [ ] Formulario para crear un presupuesto (categoría de gasto + límite) y para editar o borrar uno, en un `<dialog>` como los existentes.
- [ ] Usa `leerNumero()` para leer valores como "450.000".

**Pídele a Claude:** *"En panel.js, agrega el dibujo de presupuestos en la pestaña nueva usando el formato de docs/api.md §6. Sigue el estilo de dibujarCategorias y usa esc() para todo texto."*

### Sesión 3 · Metas de ahorro
- [ ] Tarjetas de metas con progreso, fecha límite y aporte mensual sugerido.
- [ ] Diálogo para crear una meta y otro para aportar o retirar.
- [ ] Estado vacío: *"Aún no tienes metas. Crea la primera: un viaje, un fondo de emergencia…"* con su botón.
- [ ] Revisa en celular y en modo oscuro.

**Listo cuando:** las pantallas funcionan con datos de ejemplo. PR abierto (puede quedar como borrador). ← **Hito 2**

---

## Semana 3 · Conectar con la API real (26–30 oct)

### Sesión 1 · Conectar presupuestos y metas
- [ ] Cambia `datosEjemplo()` por llamadas reales con `api('/api/finanzas/presupuestos')`, etc. Borra los datos de ejemplo.
- [ ] Maneja los errores: muestra el mensaje de la API con `aviso('bad', ...)` o dentro del diálogo.
- [ ] Haz *Live Share* con Juanes para resolver diferencias de formato.

### Sesión 2 · Avisos en el Resumen
- [ ] En la pestaña Resumen, si hay presupuestos `cerca` o `excedido`, muestra un bloque arriba de las recomendaciones (o usa la recomendación que agrega Juanes en `/api/finanzas/resumen`).
- [ ] Clic en un presupuesto excedido → pestaña Movimientos filtrada por esa categoría (reutiliza `estado.filtroCategoria`).

### Sesión 3 · Pruebas de la interfaz
- [ ] Prueba completa con dos usuarios distintos. Que ninguno vea lo del otro.
- [ ] Prueba lo raro: límites enormes, nombres largos, emojis, `<script>` en los nombres (debe verse como texto), meta sin fecha, aporte mayor que la meta.
- [ ] Fusiona el PR con la revisión de Juanes.

**Listo cuando:** presupuestos y metas funcionan en Render. ← **Hito 3**

---

## Semana 4 · Pulido y presentación (3–6 nov)

### Sesión 1 · Las 3 mejoras priorizadas
- [ ] Implementa las 3 mejoras que priorizaste en la Semana 1.
- [ ] Con Samu: quita el script en línea del `<head>` de `app.html` (muévelo a un archivo de `assets/`).

### Sesión 2 · Accesibilidad y revisión visual
- [ ] Lighthouse en el panel (con sesión iniciada): corrige lo de accesibilidad.
- [ ] Revisa todas las pantallas en celular (390 px), tablet y escritorio, en claro y oscuro. Que nunca haya scroll horizontal.
- [ ] Toma capturas limpias, con un usuario de demostración, para la presentación.

### Sesión 3 · Tu parte de la presentación
- [ ] Lidera la **demo en vivo** (4–5 minutos): entrar → resumen → conectar banco → presupuesto → meta → privacidad. Escribe el guion paso a paso.
- [ ] Ensáyala con los datos de demostración de Garavito.

**Listo cuando:** congelamiento de código el viernes 6. ← **Hito 4**

---

## Cierre (9–12 nov)
- [ ] Ensayo general (martes 10): haces la demo en vivo · Entrega (jueves 12).
