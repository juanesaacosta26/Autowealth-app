# Deudas y dinero ocioso

> **Qué es:** Auto-Wealth calcula cuánto dinero tiene una persona "quieto" por encima de su colchón de emergencia y le propone usarlo para **pagar sus deudas más caras** o, si no tiene deudas, para **invertir en renta fija**. Cada pago lo **autoriza la persona en su banco**, uno por uno.
>
> **Estado:** prototipo. Los pagos solo funcionan con el **banco de prueba** y son **simulados**: no se mueve dinero real.

## Por qué no movemos dinero real

El equipo quería que Auto-Wealth fuera quien redirige el dinero. Hoy eso **no se puede hacer solo con código**:

1. **Open Finance en Colombia es para compartir datos.** El Decreto 0368 de 2026 regula proveedores y receptores de *datos* financieros. En el análisis que revisamos no aparece un esquema para que una app como la nuestra *inicie pagos* desde la cuenta de una persona ([Holland & Knight, abril de 2026](https://www.hklaw.com/es/insights/publications/2026/04/nuevo-decreto-incorpora-el-sistema-de-finanzas-abiertas-en-colombia)). Por eso la autorización de Open Finance de Auto-Wealth es de **solo lectura**.
2. **Recomendar inversiones a la medida es "asesoría".** Según el Decreto 661 de 2018, la asesoría en el mercado de valores (perfilar a la persona y recomendarle productos) solo la pueden prestar entidades vigiladas por la Superintendencia Financiera, con profesionales inscritos ([Portafolio](https://www.portafolio.co/economia/finanzas/gobierno-reglamenta-asesorias-en-el-mercado-de-valores-516570)).
3. **Recibir o administrar dinero de otras personas** para luego pagar deudas o invertirlo es una actividad financiera vigilada.

> ⚠️ Esto **no** es un concepto jurídico. Antes de presentarlo como modelo de negocio, hay que confirmarlo con un abogado en derecho financiero.

### Lo que sí hace Auto-Wealth, sin cruzar esos límites

| Necesidad | Cómo la resolvemos |
|---|---|
| Saber qué deudas tiene la persona | La persona las **registra** (nombre, saldo, tasa EA, cuota y día de pago). El nombre se guarda cifrado |
| Detectar el dinero ocioso | Se calcula con sus cuentas y movimientos: `disponible − colchón de 3 meses de gastos` |
| Decidir a dónde va | Un **plan educativo**: primero las deudas con la tasa más alta, luego renta fija **genérica** (CDT o fondo de renta fija), sin nombrar entidades ni prometer rentabilidades |
| Mover el dinero | **Simulado:** Auto-Wealth pide el pago y la persona lo autoriza en la pantalla del banco de prueba, uno por uno. El banco lo anota en su libro y, al sincronizar, aparece como un movimiento |

## Conceptos que usa el plan (para explicarlos en la presentación)

- **Dinero ocioso:** plata que está quieta en la cuenta y que no necesitas para tus gastos ni para tu colchón. Si está en una cuenta de ahorros que casi no paga intereses mientras debes una tarjeta al 28 % EA, te está costando.
- **Colchón de emergencia:** lo que necesitarías para vivir unos meses sin ingresos. Usamos **3 meses de gastos** (constante `MESES_RESERVA` en `src/finanzas/analisis.js`). Ese dinero **nunca** se propone mover.
- **Método avalancha:** pagar primero la deuda con la tasa más alta. Matemáticamente es lo que más intereses ahorra. (La alternativa, "bola de nieve", paga primero la deuda más pequeña para motivarse.)
- **Intereses evitados:** si abonas $1.000.000 a una deuda al 28 % EA, dejas de pagar cerca de $280.000 en intereses en un año. Es una aproximación sencilla que no incluye la capitalización.
- **Renta fija:** inversiones que pagan según una tasa o un esquema conocido. El plan solo explica dos tipos:
  - **CDT:** dinero quieto a un plazo fijo, con una tasa que se conoce desde el inicio. Los CDT de bancos tienen el seguro de depósitos de Fogafín hasta un monto máximo.
  - **Fondo de inversión colectiva de renta fija:** se retira en pocos días, pero la rentabilidad cambia y puede ser negativa algunos días. No tiene seguro de depósitos.

## Cómo funciona por dentro

| Pieza | Archivo | Responsable |
|---|---|---|
| Tablas `deudas`, `redirecciones` y `banco_demo_pagos` | `src/schema.sql` | Garavito |
| Consultas (todas filtran por `usuario_id`) | `src/finanzas/db.js` | Garavito |
| Acciones de auditoría nuevas | `src/auditoria.js` | Garavito |
| Cálculo del plan (`planDineroOcioso`) | `src/finanzas/analisis.js` | Juanes |
| Rutas de deudas, plan e historial | `src/finanzas/deudas.js` | Juanes |
| Solicitud del pago y regreso del banco | `src/openfinance/pagos.js` | Juanes |
| Pantalla de pago y libro del banco de prueba | `src/openfinance/simulado.js` | Juanes |
| Categorías de los pagos | `src/finanzas/categorias.js` | Juanes |
| Pestaña **Deudas y plan** | `public/app.html`, `public/assets/panel.js`, `panel.css` | David |
| Texto de la política de privacidad | `public/privacidad.html` | Aleja |
| Pruebas | `tests/deudas.test.js` | Samu (revisión) |

Las rutas y sus respuestas están en [api.md §7](api.md#7-deudas-dinero-ocioso-y-pagos-simulados--srcfinanzasdeudasjs-y-srcopenfinancepagosjs-requieren-sesión). El flujo con el banco está en [open-finance.md](open-finance.md#iniciación-de-pagos-simulada).

### Reglas de seguridad del flujo de pagos
1. **Nada se mueve sin la persona:** cada solicitud es un **pago único** que se confirma en el banco. No hay pagos automáticos ni recurrentes.
2. **El colchón no se toca:** la API rechaza cualquier valor que supere el dinero ocioso. Sin historia de gastos, el dinero ocioso es 0.
3. **No se pide dos veces el mismo dinero:** las solicitudes pendientes (15 minutos) se descuentan.
4. **El regreso del banco es de un solo uso:** `state` aleatorio guardado como huella, atado a la sesión, que vence a los 15 minutos. Es el mismo esquema de la conexión con el banco.
5. **El banco revisa el saldo** al mostrar el pago y otra vez al confirmarlo.
6. **Prueba de cada autorización:** `redirecciones` guarda la versión del texto aceptado (`PG-2026-10-v1`). Si cambias el texto (`AUTORIZACION_PAGO` en `src/finanzas/deudas.js`), **sube la versión**.
7. **Invertir no es gastar:** los movimientos `INVERSION RENTA FIJA …` quedan como *Movimiento entre cuentas*, para no inflar los gastos ni bajar la tasa de ahorro.

### Cambio en el texto de consentimiento
El texto de Open Finance pasó a la versión **`OF-2026-10-v2`**. Ahora aclara que esa autorización es de solo lectura y que cada pago necesita una autorización aparte. Las autorizaciones ya dadas con la `v1` siguen siendo válidas: lo que permiten (consultar datos) no cambió.

## Qué haría falta para hacerlo real

En orden de lo más viable a lo menos viable para un emprendimiento:

1. **Aliarse con una entidad vigilada** (un banco, una SEDPE, una sociedad fiduciaria o una comisionista de bolsa) que ejecute los pagos y las inversiones. Auto-Wealth sería el proveedor tecnológico que calcula el plan y lleva a la persona a la plataforma de la entidad.
2. **Llevar a la persona al canal de su banco** con los datos del pago listos (por ejemplo, el valor y la referencia de su crédito), para que ella misma lo haga ahí. Es lo más parecido a lo que ya hace el prototipo, sin que Auto-Wealth mueva el dinero.
3. **Iniciación de pagos por Open Finance**, si en el futuro la regulación y los estándares de la SFC la habilitan para terceros.
4. **Convertirse en entidad vigilada.** Requiere capital, licencia y años de trámite: no es realista para este proyecto.

Para el código, el cambio sería pequeño: crear un proveedor real con `crearPago` y `confirmarPago` (ver [open-finance.md](open-finance.md#cómo-conectar-un-proveedor-real)) y poner `simulado = false` en las solicitudes.

## Limitaciones conocidas del prototipo
- Las deudas se registran a mano. Las **tarjetas de crédito conectadas** se muestran en una nota, pero no entran solas al plan porque el banco de prueba no entrega su tasa.
- Abonar a una tarjeta registrada no cambia el saldo de la tarjeta que llega del banco de prueba: son registros separados.
- El colchón es fijo, de 3 meses. Podría dejarse elegir entre 3 y 6.
- Las inversiones simuladas no tienen rentabilidad: Auto-Wealth no inventa rendimientos.
- Los pagos pendientes viven en la memoria del banco de prueba: si el servidor se reinicia, la solicitud vence y no se mueve nada.
