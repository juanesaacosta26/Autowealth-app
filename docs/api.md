# API de Auto-Wealth

> **Responsable:** Juanes. Cualquier cambio en la API se refleja primero aquí, y después en el código.

La API es la "ventanilla" por la que las páginas (`public/`) le piden cosas al servidor. Todas las rutas empiezan por `/api/` y trabajan con **JSON**.

## Reglas generales

| Tema | Regla |
|---|---|
| **Formato** | Peticiones con cuerpo: `Content-Type: application/json`. Todas las respuestas son JSON. |
| **Respuesta exitosa** | `{ "ok": true, ...datos }` |
| **Respuesta con error** | `{ "ok": false, "error": "Mensaje en español para mostrarle al usuario" }` |
| **Sesión** | Cookie `aw_sesion` (HttpOnly, firmada, dura 12 horas). La crean `/api/registro` y `/api/ingreso`. Desde el navegador se envía sola; con `fetch` usa `credentials: 'same-origin'`. |
| **Rutas privadas** | Sin sesión responden **401** con `{ "ok": false, "sesion": false }`. El panel redirige al inicio cuando recibe eso. |
| **Protección entre sitios** | `POST`, `PATCH` y `DELETE` deben venir de la misma página (cabecera `Origin`). Si no, **403**. |
| **Límites de intentos** | Algunas rutas responden **429** si se abusa (ver cada ruta). |
| **Dinero** | Siempre en pesos colombianos (COP), como número. **Positivo = ingreso, negativo = gasto.** |
| **Fechas** | `YYYY-MM-DD` (ej. `2026-10-12`). Los meses: `YYYY-MM`. Las fechas con hora vienen en ISO 8601 (UTC). |

### Códigos de estado

| Código | Significado |
|---|---|
| 200 / 201 | Bien (201 = se creó algo) |
| 303 | Redirección (solo en las rutas que no son `/api`, como el regreso del banco) |
| 400 | Datos inválidos: el mensaje dice qué corregir |
| 401 | Sin sesión, o contraseña incorrecta |
| 403 | Petición desde otro sitio web |
| 404 | No existe, o **no es tuyo** (por seguridad no se distingue) |
| 405 | La ruta existe, pero no con ese método |
| 409 | Conflicto (ej. correo ya registrado) |
| 413 / 415 | Cuerpo demasiado grande / no es JSON |
| 429 | Demasiados intentos, espera |
| 500 | Error interno: revisar los logs del servidor |

### Cómo probar la API

- **Desde el navegador:** abre la página, presiona `F12` → pestaña **Red / Network** y mira las peticiones a `/api/...`.
- **Con Thunder Client** (extensión de VS Code) o **Postman**: primero haz `POST /api/ingreso` y la herramienta guarda la cookie. Agrega la cabecera `Origin: http://localhost:3000` en los `POST`, `PATCH` y `DELETE`.
- **Pruebas automáticas:** `tests/api.test.js` (ver [CONTRIBUTING.md](../CONTRIBUTING.md#pruebas-automáticas)).

---

## 1. Cuenta y sesión — `src/rutas.js`

### `POST /api/registro`
Crea la cuenta, inicia sesión y envía el correo con la encuesta.

```json
{ "nombre": "Ana Gómez", "email": "ana@gmail.com", "telefono": "3001234567",
  "cedula": "52123456", "password": "minimo8caracteres", "acepta_datos": true }
```
**201:** `{ "ok": true, "nombre": "Ana", "correoEnviado": true }` y la cookie de sesión.
- `correoEnviado: false` → la cuenta se creó, pero el correo falló (queda anotado en la base de datos).
- **400:** dato inválido. **409:** correo o cédula ya registrados. **429:** más de 30 registros en 15 min desde la misma red.

### `POST /api/ingreso`
```json
{ "email": "ana@gmail.com", "password": "minimo8caracteres" }
```
**200:** `{ "ok": true, "nombre": "Ana" }` y la cookie. **401:** `"Correo o contraseña incorrectos."` (mismo mensaje si el correo no existe). **429:** 8 intentos por cuenta o 100 por red en 15 min. Cada intento queda en la tabla `ingresos`.

### `POST /api/salir`
Cierra la sesión (borra la cookie). Cuerpo: `{}`. **200:** `{ "ok": true }`.

### `GET /api/yo`
**200:** `{ "ok": true, "sesion": true, "nombre": "Ana" }` o `{ "ok": true, "sesion": false }`.

### `GET /api/salud`
Comprueba el servidor y la base de datos. **200:** `{ "ok": true, "baseDeDatos": "conectada" }`. **503** si la base de datos no responde. Úsala para monitoreo.

---

## 2. Finanzas — `src/finanzas/rutas.js` *(requieren sesión)*

### `GET /api/finanzas/resumen?mes=YYYY-MM`
Todo lo que necesita la pestaña **Resumen**. Si no se envía `mes`, usa el mes en curso; durante los primeros 9 días del mes usa el mes anterior.

```json
{
  "ok": true,
  "usuario": { "nombre": "Ana" },
  "mesesDisponibles": ["2026-10", "2026-09"],
  "cuentas": [ { "id": 1, "origen": "openfinance", "nombre": "Cuenta de Ahorros", "tipo": "ahorros",
                 "numero_ultimos4": "1496", "institucion": "ceiba", "saldo": 2071455.0, "num_movimientos": 139 } ],
  "conexiones": [ { "id": 1, "institucion": "ceiba", "banco": "Banco Ceiba", "creado_en": "...", "ultima_sincronizacion": "...", "expira_en": "..." } ],
  "mes": "2026-09",
  "ingresos": 4600000, "gastos": 3377828, "ahorro": 1222172, "tasaAhorro": 27,
  "disponible": 2071455, "deudaTarjetas": 217500, "mesesFondo": 6.5,
  "serie": [ { "mes": "2026-04", "ingresos": 4600000, "gastos": 3950370 } ],
  "porCategoria": [ { "categoria": "Vivienda", "total": 1040000 } ],
  "suscripciones": [ { "nombre": "NETFLIX.COM", "categoria": "Suscripciones", "montoMensual": 44900, "ultimoCobro": "2026-09-03" } ],
  "hormiga": { "cantidad": 10, "total": 169800 },
  "recomendaciones": [ { "tipo": "bien | atencion | alerta | info", "texto": "..." } ]
}
```
Los cálculos están en `src/finanzas/analisis.js`. Los pasos entre cuentas propias (categoría `Movimiento entre cuentas`) **no** cuentan como ingreso ni como gasto.

### `GET /api/finanzas/movimientos?mes=YYYY-MM&cuenta=ID`
Ambos parámetros son opcionales. Sin `mes` devuelve todo (máximo 5.000). Las descripciones llegan **descifradas**.
```json
{ "ok": true,
  "movimientos": [ { "id": 510, "cuenta_id": 2, "origen": "openfinance | manual | extracto", "fecha": "2026-10-05",
                     "monto": -29300, "categoria": "Transporte", "cuenta": "Tarjeta de Crédito Visa",
                     "cuenta_tipo": "tarjeta_credito", "descripcion": "CABIFY" } ],
  "categorias": { "ingresos": ["Salario", "..."], "gastos": ["Vivienda", "..."], "neutra": "Movimiento entre cuentas" } }
```

### `POST /api/finanzas/movimientos`
Registra un movimiento a mano.
```json
{ "tipo": "gasto | ingreso", "fecha": "2026-10-04", "valor": 18500, "descripcion": "Almuerzo",
  "categoria": "(opcional; si no viene se calcula sola)", "cuentaId": "(opcional; debe ser una cuenta MANUAL)" }
```
Sin `cuentaId` se usa o se crea la cuenta "Efectivo y otros". **201:** `{ "ok": true, "categoria": "Restaurantes y domicilios" }`. **400:** fecha fuera de los últimos 5 años o futura, valor ≤ 0, o cuenta que no es manual.

### `PATCH /api/finanzas/movimientos/:id`
`{ "categoria": "Mercado" }`. La categoría debe estar en la lista oficial (`src/finanzas/categorias.js`). **404** si no existe o no es tuyo.

### `DELETE /api/finanzas/movimientos/:id`
Solo movimientos `manual` o `extracto`. Los del banco no se pueden borrar: para eso se revoca el banco.

### `GET /api/finanzas/cuentas`
`{ "ok": true, "cuentas": [...], "conexiones": [...], "tipos": ["ahorros", "corriente", "tarjeta_credito", "billetera", "efectivo", "otra"] }`.
Para las cuentas manuales, `saldo` = saldo inicial + suma de sus movimientos.

### `POST /api/finanzas/cuentas`
`{ "nombre": "Nequi", "tipo": "billetera", "saldoInicial": 150000 }` → **201** `{ "ok": true, "id": 7 }`.

### `DELETE /api/finanzas/cuentas/:id`
Borra una cuenta **manual** y sus movimientos.

### `POST /api/finanzas/importar`
La página lee el CSV en el navegador y envía solo las filas ya convertidas (máximo 3.000 filas y 1 MB).
```json
{ "filas": [ { "fecha": "2026-09-02", "descripcion": "NETFLIX.COM", "monto": -44900 } ],
  "cuentaId": 4,
  "nombreCuentaNueva": "Davivienda ahorros", "tipoCuentaNueva": "ahorros" }
```
Usa `cuentaId` (cuenta manual existente) **o** `nombreCuentaNueva`. **201:** `{ "ok": true, "cuentaId": 4, "importados": 3, "duplicados": 0, "invalidas": 2 }`. Importar el mismo archivo dos veces no duplica nada. **429:** más de 20 importaciones en 15 min.

---

## 3. Open Finance — `src/openfinance/index.js` *(requieren sesión)*

Ver el flujo completo en [open-finance.md](open-finance.md).

### `GET /api/openfinance/bancos`
`{ "ok": true, "proveedor": "simulado", "bancos": [ { "id": "ceiba", "nombre": "Banco Ceiba", "tipo": "banco", "demo": true } ], "consentimiento": { "version": "OF-2026-10-v2", "receptor": "Auto-Wealth", "datos": [...], "finalidad": "...", "duracionMeses": 12, "tipoAcceso": "...", "derechos": "..." } }`

El objeto `consentimiento` es el texto **oficial** que se muestra antes de autorizar. Si se cambia, hay que subir la `version`. La `v2` (17 oct 2026) aclara en `tipoAcceso` que esta autorización es de solo lectura y que cada pago necesita una autorización aparte (ver §7).

### `POST /api/openfinance/consentimientos`
`{ "institucion": "ceiba", "acepta": true }` → **201** `{ "ok": true, "url": "/banco-demo/autorizar?banco=ceiba&state=..." }`. La página debe llevar al usuario a esa `url`. **429:** 10 solicitudes en 15 min.

### `GET /openfinance/retorno?state=...&code=...` *(no es /api: es una página)*
Aquí regresa el usuario desde el banco. Redirige (303) a:
- `/app?of=conectado`: conexión creada y datos traídos.
- `/app?of=rechazado`: el usuario rechazó en el banco.
- `/app?of=invalido`: el `state` no existe, no es de este usuario, ya se usó o tiene más de 15 minutos.
- `/app?of=error`: falló el proveedor.

### `POST /api/openfinance/conexiones/:id/sincronizar`
Trae lo nuevo del banco. **200:** `{ "ok": true, "nuevos": 12, "cuentas": 2 }`. **409:** la autorización venció. **429:** máximo una vez por minuto.

### `DELETE /api/openfinance/conexiones/:id`
**Revoca** la autorización: avisa al proveedor, borra cuentas y movimientos de ese banco y marca el consentimiento como `revocado`.

### Páginas del banco de prueba *(solo con `OPEN_FINANCE_PROVIDER=simulado`)*
`GET /banco-demo/autorizar` (pantalla del banco) y `POST /banco-demo/autorizar` (formulario con `state`, `banco` y `decision=autorizar|rechazar`).
`GET /banco-demo/pagar?pago=...` (pantalla de un pago) y `POST /banco-demo/pagar` (formulario con `pago` y `decision=autorizar|rechazar`). Ver §7.

---

## 4. Privacidad — `src/finanzas/rutas.js` *(requieren sesión)*

| Ruta | Qué hace |
|---|---|
| `GET /api/privacidad` | `{ consentimientos: [...], historial: [...], textoConsentimiento }`. El historial son las últimas 60 acciones de la tabla `auditoria` |
| `GET /api/privacidad/exportar` | Descarga un JSON con **todos** los datos del usuario (derecho de acceso), incluidas `deudas` y `pagos_e_inversiones`. Nunca incluye `password_hash` |
| `POST /api/privacidad/borrar-finanzas` | `{ "password": "..." }`. Revoca todos los bancos y borra cuentas, movimientos, deudas y solicitudes de pago. **401** si la clave es incorrecta (5 intentos por 15 min) |
| `POST /api/privacidad/eliminar-cuenta` | `{ "password": "..." }`. Borra al usuario y todo lo relacionado, y cierra la sesión |

---

## 5. Administración — `src/admin.js`
Protegido con usuario y contraseña del navegador (`ADMIN_USER` / `ADMIN_PASSWORD`). Si `ADMIN_PASSWORD` está vacío, responde 404.
- `GET /admin`: página con botones de descarga.
- `GET /admin/usuarios.csv` y `GET /admin/ingresos.csv`: archivos para Excel (separados por `;`).

---

## 6. Rutas planeadas para este mes (propuesta)

> ✏️ **PROPUESTA para que Juanes la confirme o ajuste en la Semana 1** (ver [plan de trabajo](plan-de-trabajo/README.md)). Cuando esté acordada, David y Aleja construyen las pantallas con estos formatos aunque el código todavía no exista.

### Presupuestos por categoría
| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/finanzas/presupuestos?mes=YYYY-MM` | — | `{ ok, presupuestos: [ { id, categoria, limite, gastado, porcentaje, estado: "bien | cerca | excedido" } ] }` |
| `POST /api/finanzas/presupuestos` | `{ categoria, limite }` | **201** `{ ok, id }`. Una categoría de gasto por usuario; **409** si ya existe |
| `PATCH /api/finanzas/presupuestos/:id` | `{ limite }` | `{ ok }` |
| `DELETE /api/finanzas/presupuestos/:id` | — | `{ ok }` |

`estado`: `cerca` desde el 80 % del límite, `excedido` por encima del 100 %. El resumen (`/api/finanzas/resumen`) agrega una recomendación cuando un presupuesto se excede.

### Metas de ahorro
| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/finanzas/metas` | — | `{ ok, metas: [ { id, nombre, objetivo, ahorrado, porcentaje, fechaLimite, aporteMensualSugerido } ] }` |
| `POST /api/finanzas/metas` | `{ nombre, objetivo, fechaLimite }` | **201** `{ ok, id }` |
| `POST /api/finanzas/metas/:id/aportes` | `{ valor, fecha }` (`valor` negativo = retiro) | **201** `{ ok, ahorrado }` |
| `DELETE /api/finanzas/metas/:id` | — | `{ ok }` |

`aporteMensualSugerido` = lo que falta ÷ meses que quedan hasta `fechaLimite`.

### Recuperar contraseña
| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /api/recuperar` | `{ email }` | **Siempre** `{ ok: true }`, exista o no el correo (para no revelar quién está registrado). Si existe, envía un correo con un enlace de un solo uso que vence en 30 minutos |
| `POST /api/recuperar/confirmar` | `{ token, password }` | `{ ok: true }` y cierra las sesiones anteriores. **400** si el token es inválido o venció |

Reglas de seguridad: en la base de datos se guarda solo la **huella** del token (`huella()` de `src/cifrado.js`), no el token. Máximo 3 solicitudes por correo cada hora. Cada uso queda en `auditoria`.

---

## 7. Deudas, dinero ocioso y pagos simulados — `src/finanzas/deudas.js` y `src/openfinance/pagos.js` *(requieren sesión)*

> ⚠️ **Prototipo.** Los pagos solo funcionan con el banco de prueba y son **simulados**: no se mueve dinero real. El plan es **educación financiera, no asesoría de inversión**. Por qué y qué haría falta para hacerlo de verdad: [redireccion-de-dinero.md](redireccion-de-dinero.md).

### Deudas
| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/finanzas/deudas` | — | `{ ok, deudas: [ { id, nombre, tipo, tipoNombre, saldo, tasaEA, cuotaMinima, diaPago, actualizadoEn } ], total, tipos: [ { id, nombre } ] }`. Ordenadas de la tasa más alta a la más baja |
| `POST /api/finanzas/deudas` | `{ nombre, tipo, saldo, tasaEA, cuotaMinima?, diaPago? }` | **201** `{ ok, id }`. **400** si algo no es válido o ya hay 30 deudas |
| `PATCH /api/finanzas/deudas/:id` | Cualquiera de `{ nombre, saldo, tasaEA, cuotaMinima, diaPago }` | `{ ok }`. Lo que no se envía no cambia. `saldo: 0` = deuda pagada. `diaPago: null` lo borra. **404** si no existe o no es tuya |
| `DELETE /api/finanzas/deudas/:id` | — | `{ ok }`. **404** si no existe o no es tuya |

- `tipo`: `tarjeta_credito`, `consumo`, `libre_inversion`, `vehiculo`, `hipotecario`, `educativo`, `libranza` u `otro`.
- `tasaEA`: tasa **efectiva anual** en %, de 0 a 100 (ej. `28.5`). `saldo` y `cuotaMinima` en pesos. `diaPago` de 1 a 31.
- El `nombre` se guarda **cifrado** (revela con quién está endeudada la persona).

### `GET /api/finanzas/plan`
Calcula el dinero ocioso y el plan sugerido con los datos de hoy.
```json
{ "ok": true,
  "plan": {
    "mes": "2026-10", "disponible": 32724798, "gastoPromedio": 4861625, "mesesReserva": 3, "reserva": 14584875,
    "dineroOcioso": 18139923, "movible": 32724798, "deudaTotal": 7250000,
    "pasos": [
      { "tipo": "pago_deuda", "deudaId": 1, "nombre": "Tarjeta Visa", "deudaTipo": "tarjeta_credito", "tasaEA": 27.9,
        "monto": 850000, "liquida": true, "interesesEvitadosAnio": 237150 },
      { "tipo": "pago_deuda", "deudaId": 2, "nombre": "Crédito libre inversión", "deudaTipo": "libre_inversion", "tasaEA": 19.5,
        "monto": 6400000, "liquida": true, "interesesEvitadosAnio": 1248000 },
      { "tipo": "inversion", "destino": "renta_fija", "monto": 10889923 } ],
    "notas": [] },
  "cuentasOrigen": [ { "id": 3, "nombre": "Cuenta de Ahorros", "tipo": "ahorros", "ultimos4": "4129", "saldo": 32724798 } ],
  "destinos": [ { "id": "cdt", "nombre": "CDT (certificado de depósito a término)", "explicacion": "..." },
                { "id": "fondo_renta_fija", "nombre": "Fondo de inversión colectiva de renta fija", "explicacion": "..." } ],
  "autorizacionPago": { "version": "PG-2026-10-v1", "condiciones": ["Es un pago único...", "..."] },
  "aviso": "Esto es educación financiera, no asesoría de inversión...", "simulado": true }
```
Cómo se calcula (`planDineroOcioso` en `src/finanzas/analisis.js`):
- `disponible` = saldo de cuentas de ahorros, corrientes, billeteras y efectivo (igual que en el resumen).
- `gastoPromedio` = gasto promedio de los 3 meses completos anteriores. `reserva` = `gastoPromedio × 3` (**colchón de emergencia, nunca se toca**).
- `dineroOcioso` = `disponible − reserva − pagos pendientes de confirmar` (nunca negativo). **Sin historia de gastos es 0**, por prudencia.
- `pasos`: abonos a las deudas de la tasa más alta a la más baja (método avalancha) y, si sobra, `inversion` en renta fija. La suma de los pasos es `dineroOcioso`.
- `interesesEvitadosAnio` = `monto × tasaEA` (aproximación de un año, sin capitalización).
- `movible`: lo que está en cuentas de **bancos conectados**. El efectivo y las cuentas manuales cuentan como disponibles, pero ese dinero lo mueve la persona.
- `cuentasOrigen`: cuentas de bancos conectados (ahorros, corriente o billetera) con saldo positivo, desde las que se puede pedir un pago.

### `POST /api/finanzas/redirecciones`
Pide un pago único a partir de un paso del plan. **No mueve dinero**: devuelve la `url` de la pantalla del banco, donde la persona lo confirma.
```json
{ "tipo": "pago_deuda", "deudaId": 1, "cuentaId": 3, "monto": 850000, "acepta": true }
{ "tipo": "inversion", "destino": "cdt | fondo_renta_fija", "cuentaId": 3, "monto": 500000, "acepta": true }
```
**201** `{ "ok": true, "id": 7, "url": "/banco-demo/pagar?pago=..." }`. La página debe llevar a la persona a esa `url`.

| Código | Cuándo |
|---|---|
| 400 | `tipo` o `destino` inválidos, `monto` menor de $1.000, `acepta` distinto de `true`, la cuenta no es de un banco conectado (o es tarjeta), el valor supera el saldo de la cuenta o de la deuda, o **tocaría el colchón de emergencia** (el mensaje dice cuánto se puede mover) |
| 404 | La cuenta o la deuda no existe o no es tuya |
| 409 | La autorización de ese banco venció |
| 429 | Más de 10 solicitudes en 15 minutos |

Mientras una solicitud está pendiente (15 minutos), su valor se descuenta del dinero ocioso: no se puede pedir dos veces el mismo dinero.

### `GET /openfinance/retorno-pago?state=...&code=...` *(no es /api: es una página)*
Aquí regresa la persona desde el banco. Redirige (303) a:
- `/app?pago=ejecutado#plan`: el banco confirmó. Se descuenta de la deuda (si era un pago de deuda) y se sincroniza el banco: aparece el movimiento y baja el saldo.
- `/app?pago=rechazado#plan`: la persona rechazó en el banco. No se mueve nada.
- `/app?pago=sin-fondos#plan`: el banco no tenía saldo suficiente.
- `/app?pago=invalido#plan`: el `state` no existe, no es de esta persona, ya se usó o tiene más de 15 minutos.
- `/app?pago=error#plan`: no se pudo confirmar con el banco.

Los movimientos que crea el banco: `PAGO DEUDA <TIPO>` (categoría *Deudas y créditos*), `PAGO TARJETA DE CREDITO` e `INVERSION RENTA FIJA CDT|FONDO` (*Movimiento entre cuentas*: invertir no es gastar).

### `GET /api/finanzas/redirecciones`
`{ ok, redirecciones: [ { id, tipo, deuda_id, destino, destinoNombre, cuenta_nombre, monto, estado, simulado, creado_en, ejecutado_en } ], totales: { abonadoDeudas, invertido } }`. `estado`: `pendiente`, `ejecutada`, `rechazada` o `fallida`. Máximo las 200 más recientes.
