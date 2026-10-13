# Plan de Aleja · Página de inicio, contenido y legal

**Tu área:** lo primero que ve la gente: la página de inicio, el registro y el inicio de sesión, las páginas legales, la recuperación de contraseña y la encuesta.
**Tus archivos:** `public/index.html`, `public/assets/inicio.css`, `public/assets/inicio.js`, `public/privacidad.html`, páginas nuevas (`terminos.html`, `recuperar.html`) y `docs/encuesta.md`.
**Trabajas de cerca con:** Juanes (rutas de registro, ingreso y recuperación), David (que la página de inicio y el panel se vean como el mismo producto) y Samu (seguridad de las páginas).

> Regla de tu área: **una app de finanzas vive de la confianza.** Nada de cifras, testimonios o promesas inventadas. Si no es verdad o no lo podemos demostrar, no va en la página.

---

## Semana 1 · Auditoría de la página (13–16 oct)

### Sesión 1 · Preparar el entorno y recorrer la página
- [ ] Sigue la Parte 1 de [instalacion-y-despliegue.md](../instalacion-y-despliegue.md) hasta ver la app corriendo.
- [ ] Recorre la página de inicio en computador y en celular (F12 → ícono de celular). Prueba registrarte, iniciar sesión y entrar al panel.
- [ ] Ubica en el código: el HTML en `public/index.html`, los estilos en `public/assets/inicio.css` y la lógica en `public/assets/inicio.js` (búscala por las funciones `openOverlay` y `api`).

**Pídele a Claude:** *"Explícame la estructura de public/index.html: qué secciones tiene y dónde está el código del formulario de registro."*

### Sesión 2 · Lista de problemas de contenido
Haz una lista (un issue por cada grupo de problemas) de todo lo que **no es verdad o no está terminado**. Ya sabemos de estos:
- [ ] La meta descripción dice *"Más de 50,000 usuarios confían"*: es falso.
- [ ] Los **testimonios** (Mariana G., Carlos R., Laura F., Javier M.) son inventados y se presentan como usuarios reales. Además están en dólares y hablan de ETF e IA.
- [ ] *"100% seguro"*: ninguna app puede prometer eso.
- [ ] *"retorno anual promedio"* y otras cifras animadas: ¿de dónde salen?
- [ ] Enlaces `autowealth.example.com` en las etiquetas `og:` y `canonical`.
- [ ] Enlaces del pie de página que no llevan a ningún lado ("Términos", "Cookies", "Accesibilidad").
- [ ] Busca más: ortografía, botones que no hacen nada, secciones que prometen funciones que la app no tiene.

**Listo cuando:** los issues están creados con la etiqueta `contenido`.

### Sesión 3 · Auditoría técnica (Lighthouse)
- [ ] En Chrome: F12 → **Lighthouse** → analiza *Rendimiento, Accesibilidad, Buenas prácticas y SEO*, en móvil y en escritorio. Guarda las capturas de las notas iniciales: las usarás en la presentación ("antes / después").
- [ ] Anota los 5 problemas de accesibilidad más importantes (contraste, textos alternativos, etiquetas de formularios, orden de los títulos).
- [ ] Coordina con David una paleta y una tipografía comunes (ya comparten las variables de color).

**Listo cuando:** auditoría documentada en un issue con capturas. ← **Hito 1**

---

## Semana 2 · Contenido honesto y páginas legales (19–23 oct)

### Sesión 1 · Corregir el contenido
- [ ] Rama `feature/aleja-contenido`.
- [ ] Reemplaza los testimonios inventados. Opciones honestas: (a) quitar la sección; (b) *"Lo que nos dijeron en la encuesta"*, con respuestas reales y anónimas (pide permiso o usa las que autorizaron fines de estudio); (c) "casos de ejemplo" claramente marcados como ilustrativos.
- [ ] Cambia las cifras falsas por hechos verificables (*"Datos cifrados con AES-256"*, *"Solo lectura: no movemos tu dinero"*, *"Revoca el acceso cuando quieras"*).
- [ ] Pesos colombianos en todos los ejemplos.
- [ ] Ajusta la sección de funciones a lo que la app **sí** hace (resumen, suscripciones, gastos hormiga, Open Finance de prueba, extractos, presupuestos y metas que vienen en camino).

**Pídele a Claude:** *"Revisa public/index.html y señálame cada afirmación que no podamos demostrar. Propón un texto honesto para cada una, en español colombiano."*

### Sesión 2 · Términos y condiciones
- [ ] Crea `public/terminos.html` con el mismo estilo de `privacidad.html`. Debe incluir: qué es el servicio (prototipo académico), uso aceptable, que las recomendaciones son **educación financiera y no asesoría**, limitación de responsabilidad, cómo eliminar la cuenta, ley aplicable (Colombia) y contacto.
- [ ] Para que el servidor la muestre, agrega `'/terminos': 'terminos.html'` a `PAGINAS` en `server.js` (avísale a Juanes en el PR).
- [ ] Enlázala desde el pie de página y desde el formulario de registro.

### Sesión 3 · Completar la política de privacidad
- [ ] En `public/privacidad.html`, completa los campos `[entre corchetes]` con los datos del proyecto académico (responsable: el equipo y la universidad o curso, correo de contacto del proyecto).
- [ ] Agrega que la información del Google Form se usa con fines de estudio.
- [ ] Revisa que coincida con lo que la app hace de verdad (pregúntale a Samu y a Garavito).

**Listo cuando:** contenido corregido, términos publicados y política completa en `main`. ← **Hito 2**

---

## Semana 3 · Recuperar contraseña (26–30 oct)

> Juanes publica las rutas `POST /api/recuperar` y `POST /api/recuperar/confirmar` ([api.md §6](../api.md#recuperar-contraseña)). Hasta que estén listas, prueba con datos de ejemplo.

### Sesión 1 · "¿Olvidaste tu contraseña?"
- [ ] Rama `feature/aleja-recuperar`.
- [ ] En el formulario de inicio de sesión, agrega el enlace **"¿Olvidaste tu contraseña?"**. Abre un paso donde se escribe el correo y se envía a `POST /api/recuperar`.
- [ ] El mensaje después de enviar es **siempre el mismo**: *"Si ese correo está registrado, te enviamos un enlace para crear una contraseña nueva. Revisa también spam."* (No digas si el correo existe.)

### Sesión 2 · Página para crear la contraseña nueva
- [ ] Crea `public/recuperar.html` (el enlace del correo lleva a `/recuperar?token=...`) y agrégala a `PAGINAS` en `server.js`.
- [ ] Formulario: contraseña nueva + confirmación (mínimo 8 caracteres, que coincidan). Envía `{ token, password }` a `POST /api/recuperar/confirmar`.
- [ ] Si sale bien: *"Listo, ya puedes iniciar sesión"* y un botón al inicio. Si el token venció: mensaje claro y enlace para pedir otro.
- [ ] El token **no** debe quedar en el historial: después de leerlo, límpialo de la URL con `history.replaceState`.

**Pídele a Claude:** *"Crea public/recuperar.html con el estilo de privacidad.html y un formulario que llame a /api/recuperar/confirmar. Pon el JavaScript en public/assets/recuperar.js (no en línea)."*

### Sesión 3 · Prueba completa con Juanes y Samu
- [ ] Prueba de punta a punta: pedir el enlace → correo (en modo `consola` sale en la terminal) → página → contraseña nueva → entrar.
- [ ] Casos raros: token usado dos veces, token vencido, contraseñas distintas, correo inexistente.
- [ ] Revisa en celular.

**Listo cuando:** funciona en Render. ← **Hito 3**

---

## Semana 4 · Pulido, accesibilidad y presentación (3–6 nov)

### Sesión 1 · Accesibilidad y móvil
- [ ] Corrige los 5 problemas de accesibilidad de tu auditoría.
- [ ] Vuelve a correr Lighthouse y guarda las capturas del "después".
- [ ] Con Samu: mueve el pequeño script de tema que está en el `<head>` de las páginas a un archivo, para poder quitar `'unsafe-inline'` de la política de seguridad.

### Sesión 2 · Encuesta y resultados
- [ ] Descarga las respuestas del Google Form y haz un resumen con 4–5 gráficas o cifras para la presentación. Con Garavito, compara "lo que la gente cree" (preguntas 5, 6 y 8) con lo que muestra el panel (ver [encuesta.md](../encuesta.md)).
- [ ] Actualiza `docs/encuesta.md` si cambió el formulario.

### Sesión 3 · Coordinar la presentación
- [ ] Arma la estructura de la presentación (≈ 15 min) con las diapositivas que cada uno te envíe: problema → solución → demo en vivo → arquitectura → seguridad y regulación → resultados de la encuesta → aprendizajes.
- [ ] Unifica el diseño con los colores de Auto-Wealth.
- [ ] Graba el **video de respaldo** de la demo (por si falla internet).

**Listo cuando:** congelamiento de código el viernes 6 y presentación completa en borrador. ← **Hito 4**

---

## Cierre (9–12 nov)
- [ ] Ensayo general (martes 10): diriges el ensayo y controlas los tiempos.
- [ ] Entrega (jueves 12).
