// =====================================================================
//  categorias.js — Clasifica cada movimiento automáticamente según su
//  descripción (ej. "RAPPI*PEDIDO" → Restaurantes y domicilios).
//  El usuario siempre puede cambiar la categoría desde el panel.
// =====================================================================

const INGRESOS = ['Salario', 'Otros ingresos'];
const GASTOS = [
  'Vivienda', 'Mercado', 'Restaurantes y domicilios', 'Transporte', 'Servicios públicos',
  'Telefonía e internet', 'Suscripciones', 'Salud', 'Educación', 'Compras',
  'Entretenimiento', 'Deudas y créditos', 'Impuestos y comisiones', 'Otros gastos',
];
// Pasar plata de una cuenta propia a otra (ej. pagar la tarjeta) no es ni ingreso ni gasto
const NEUTRA = 'Movimiento entre cuentas';
const TODAS = [...INGRESOS, ...GASTOS, NEUTRA];

// Reglas en orden: la primera que coincide gana
const REGLAS = [
  [NEUTRA, /pago (de )?tarjeta|pago tc|abono (a )?tarjeta|pago recibido|traslado entre cuentas|transferencia (entre cuentas )?propia/],
  ['Salario', /nomina|salario|sueldo|pago de nomina/],
  ['Impuestos y comisiones', /4x1000|gmf|cuota de manejo|comision|impuesto|\bdian\b|predial|iva /],
  ['Suscripciones', /netflix|spotify|disney|hbo|\bmax\b|prime video|amazon prime|youtube premium|apple\.com|icloud|google one|deezer|crunchyroll|paramount|smart ?fit|bodytech|gimnasio|chatgpt|openai|canva|microsoft 365/],
  ['Vivienda', /arriendo|arrendamiento|administracion (edificio|conjunto|ph)|inmobiliaria|cuota (de )?vivienda/],
  ['Mercado', /\bexito\b|carulla|jumbo|olimpica|\bd1\b|tiendas ara|\bara\b|justo y bueno|alkosto|makro|supermercado|minimercado|fruver/],
  ['Restaurantes y domicilios', /almuerzo|desayuno|corrientazo|comida|rappi|ifood|domicilio|restaurante|frisby|kfc|mcdonald|burger|juan valdez|tostao|starbucks|\boma\b|el corral|pizza|cafe|panaderia|crepes/],
  ['Transporte', /uber|didi|cabify|indriver|taxi|terpel|primax|texaco|gasolina|\besso\b|biomax|peaje|transmilenio|tullave|sitp|parqueadero|metro de medellin/],
  ['Servicios públicos', /\bepm\b|enel|codensa|vanti|gas natural|acueducto|aguas de|celsia|air-e|afinia|emcali|\bessa\b/],
  ['Telefonía e internet', /claro|movistar|\btigo\b|\bwom\b|\betb\b|\bune\b/],
  ['Salud', /farmacia|drogueria|cruz verde|colsubsidio|\beps\b|sura|sanitas|compensar|clinica|odontolog|laboratorio|medic/],
  ['Educación', /universidad|colegio|matricula|platzi|coursera|udemy|libreria|panamericana/],
  ['Entretenimiento', /cine|cinemark|procinal|tuboleta|eticket|steam|playstation|xbox|concierto/],
  ['Compras', /falabella|\bzara\b|h&m|mercado ?libre|amazon|temu|shein|arturo calle|adidas|nike|homecenter|ktronix/],
  ['Deudas y créditos', /credito|prestamo|cuota |leasing|icetex|libranza/],
];

// Quita tildes y pasa a minúsculas para comparar sin errores
function normalizar(texto) {
  return String(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function categorizar(descripcion, monto) {
  const d = normalizar(descripcion);
  for (const [categoria, regla] of REGLAS) {
    if (!regla.test(d)) continue;
    // Una regla de gasto no aplica a un ingreso y viceversa (salvo la neutra)
    if (categoria === NEUTRA) return categoria;
    if (monto > 0 && INGRESOS.includes(categoria)) return categoria;
    if (monto < 0 && GASTOS.includes(categoria)) return categoria;
  }
  return monto >= 0 ? 'Otros ingresos' : 'Otros gastos';
}

module.exports = { INGRESOS, GASTOS, NEUTRA, TODAS, categorizar, normalizar };
