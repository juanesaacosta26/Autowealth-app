# Seguridad y cumplimiento

> **Responsable:** Samu, con revisión de todo el equipo. Auto-Wealth maneja **información financiera de personas**: un error aquí no es un detalle estético.

## Medidas de seguridad implementadas

| Riesgo | Cómo se protege | Dónde |
|---|---|---|
| Robo de contraseñas | Hash *scrypt* (N=32768) con sal aleatoria, comparación en tiempo constante | `src/seguridad.js` |
| Adivinar contraseñas | Límite de intentos por cuenta (8 en 15 min) y por red | `src/rutas.js` |
| Saber qué correos existen | Mismo mensaje y mismo tiempo de respuesta si el correo no existe | `src/rutas.js`, `compararConHashFalso` |
| Robo o alteración de la sesión | Cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción, firmada con HMAC y válida 12 horas | `src/seguridad.js` |
| Peticiones desde otros sitios (CSRF) | Revisión de `Origin` en todo `POST`, `PATCH` y `DELETE`, más `SameSite` | `server.js`, `src/http.js` |
| Inyección SQL | Solo consultas parametrizadas (`$1, $2…`) | `src/db.js`, `src/finanzas/db.js` |
| Ver datos de otra persona | Toda consulta filtra por `usuario_id` de la sesión. Si no es tuyo, responde 404 | `src/finanzas/db.js` |
| Robo de la base de datos | Descripciones de movimientos y tokens bancarios cifrados con AES-256-GCM. Contraseñas con hash. Solo los últimos 4 dígitos de las cuentas | `src/cifrado.js` |
| XSS (código inyectado en la página) | Todo texto del usuario pasa por `esc()` antes de ir al HTML, más cabecera *Content-Security-Policy* | `public/assets/panel.js`, `src/http.js` |
| Clickjacking | `X-Frame-Options: DENY`, `frame-ancestors 'none'` | `src/http.js` |
| Fórmulas maliciosas en Excel | Las celdas que empiezan con `= + - @` se neutralizan en los CSV | `src/admin.js` |
| Archivos del servidor expuestos | `/assets/` solo acepta nombres simples (sin `../`) y extensiones conocidas | `server.js` |
| Abuso de la API | Cuerpos de máximo 10 KB (1 MB para importar) y límites de intentos | `src/http.js` y rutas |
| Acciones irreversibles por error | Borrar datos o eliminar la cuenta pide la contraseña otra vez | `src/finanzas/rutas.js` |
| Mover dinero sin permiso | Auto-Wealth nunca mueve dinero solo: cada pago es único, lo autoriza la persona en su banco y su regreso usa un `state` de un solo uso (15 min) atado a la sesión | `src/openfinance/pagos.js` |
| Dejar a alguien sin colchón | La API rechaza cualquier pago que toque el fondo de emergencia (3 meses de gastos) o que supere el saldo de la cuenta o de la deuda. Sin historia de gastos no hay dinero ocioso | `src/finanzas/analisis.js`, `src/openfinance/pagos.js` |
| Pedir dos veces el mismo dinero | Las solicitudes pendientes se descuentan del dinero ocioso; máximo 10 solicitudes cada 15 min | `src/openfinance/pagos.js` |
| Claves en el código | Todo secreto va en variables de entorno, `.env` está en `.gitignore` y el servidor no arranca si falta alguno | `src/config.js` |

### Pendientes conocidos (trabajo de este mes)
- [ ] Quitar `'unsafe-inline'` de la *Content-Security-Policy* (mover los últimos scripts en línea a archivos). → Samu
- [ ] Recuperación de contraseña segura (token de un solo uso con huella). → Juanes + Garavito + Samu
- [ ] Cerrar todas las sesiones al cambiar la contraseña (`version_sesion`). → Juanes + Garavito
- [ ] Monitoreo: alerta si `/api/salud` falla. → Samu
- [ ] Prueba manual de seguridad con la lista OWASP (ver abajo). → Samu, Semana 3

## Lista de revisión rápida para cada Pull Request
- [ ] ¿Las consultas nuevas usan `$1, $2…` y filtran por `usuario_id`?
- [ ] ¿Las rutas nuevas llaman a `exigirUsuario()` si son privadas?
- [ ] ¿El servidor valida **todo** lo que llega, aunque la página ya lo valide?
- [ ] ¿Los textos del usuario pasan por `esc()` antes de insertarse en el HTML?
- [ ] ¿Los datos sensibles nuevos se cifran?
- [ ] ¿Los mensajes de error **no** revelan detalles internos (nombres de tablas, rutas de archivos)?
- [ ] ¿Nada sensible en `console.log` (contraseñas, tokens, cédulas completas)?
- [ ] ¿Las acciones importantes quedan en `auditoria`?

## Lista OWASP para la Semana 3 (prueba manual)
Basada en el [OWASP Top 10](https://owasp.org/Top10/):
1. **Control de acceso:** con dos usuarios, intentar ver, editar o borrar los datos del otro cambiando los `id` de las URLs.
2. **Fallas criptográficas:** revisar en Neon que las descripciones y los tokens se vean como `v1:...` y que no haya claves en GitHub.
3. **Inyección:** escribir `' OR 1=1 --` y `<script>alert(1)</script>` en todos los campos del formulario.
4. **Diseño inseguro:** intentar reutilizar el enlace de regreso del banco y completar la autorización de otra persona.
5. **Configuración:** revisar las cabeceras con [securityheaders.com](https://securityheaders.com) sobre la URL de Render.
6. **Componentes vulnerables:** `npm audit`.
7. **Autenticación:** probar el límite de intentos y que la sesión venza.
8. **Integridad:** confirmar que `main` está protegida y que solo se fusiona con revisión.
9. **Registro y monitoreo:** confirmar que las acciones quedan en `auditoria` y que los errores aparecen en los logs de Render.
10. **SSRF:** el servidor solo llama a URLs fijas (Apps Script, Brevo), nunca a URLs que mande el usuario.

---

## Marco legal (Colombia)

> Auto-Wealth es un **prototipo académico**. Esto **no** es asesoría legal: antes de recibir usuarios reales con su dinero, el proyecto debe revisarse con un abogado.

| Norma | Qué exige | Cómo lo atiende Auto-Wealth |
|---|---|---|
| **Ley 1581 de 2012 y Decreto 1377 de 2013** (protección de datos personales) | Autorización previa, expresa e informada; política de tratamiento; derechos del titular (conocer, actualizar, rectificar, suprimir, revocar) | Casilla de autorización en el registro, página `/privacidad` (borrador), descargar datos, borrar datos y eliminar cuenta |
| **Ley 1266 de 2008** (habeas data financiero) | Tratamiento responsable de la información financiera | Finalidad limitada, solo lectura, cifrado y revocación |
| **Decreto 0368 de 2026** (finanzas abiertas obligatorias) | El consentimiento debe decir quién recibe los datos, cuáles, para qué y por cuánto tiempo | Pantalla de autorización y tabla `consentimientos` con versión del texto |
| **Superintendencia Financiera (SFC)** | Estándares técnicos y directorio de participantes de finanzas abiertas | Pendiente: no aplica mientras se usen bancos de prueba |
| **Superintendencia de Industria y Comercio (SIC)** | Registro Nacional de Bases de Datos (si la empresa está obligada) y reporte de incidentes de seguridad | Pendiente para producción |
| **Decreto 661 de 2018** (asesoría en el mercado de valores) | Recomendar inversiones a la medida de cada persona es "asesoría" y solo la pueden dar entidades vigiladas por la SFC, con profesionales inscritos | El plan es **educación financiera**: tipos genéricos (CDT, fondo de renta fija), sin entidades, productos ni rentabilidades. Ver [redireccion-de-dinero.md](redireccion-de-dinero.md) |
| **Mover dinero de terceros** (pagos, captación, administración de recursos) | Iniciar pagos desde la cuenta de una persona, o recibir su dinero para pagar o invertir, requiere licencia o alianza con una entidad vigilada | Solo **simulado** con el banco de prueba. Pendiente para producción |

### Antes de tener usuarios reales
- [ ] Constituir una empresa (por ejemplo una SAS).
- [ ] Completar `/privacidad` (los campos `[entre corchetes]`) y escribir términos y condiciones.
- [ ] Revisar si aplica el Registro Nacional de Bases de Datos de la SIC.
- [ ] Contrato con un proveedor de datos bancarios que cubra Colombia, o integración con las APIs estándar de la SFC.
- [ ] Contratos de transmisión de datos con los proveedores en el exterior (Render, Neon, Google).
- [ ] Planes pagos con copias de seguridad, gestor de secretos para `DATA_ENCRYPTION_KEY`, verificación en dos pasos y una prueba de penetración externa.
- [ ] Mantener las recomendaciones como **educación financiera**: recomendar productos de inversión específicos a cada persona puede ser una actividad regulada.
- [ ] **Antes de mover dinero real:** concepto de un abogado en derecho financiero sobre iniciación de pagos y asesoría, y un aliado vigilado por la SFC (banco, SEDPE, sociedad fiduciaria o comisionista). Ver [redireccion-de-dinero.md](redireccion-de-dinero.md).
