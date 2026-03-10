# Diseño: Edición inline en contrato + simplificación financiera

**Fecha:** 2026-03-10
**Archivo objetivo:** `components/caja/ContratosFinanciacionTab.tsx`

---

## Problema

1. El formulario de contrato pide anticipo en % Y monto ya pagado → redundante. Si sabés el monto total y el monto ya pagado, el % se calcula solo.
2. El campo "fecha del pago previo" genera riesgo legal: el paciente podría usar esa fecha para reclamar pagos anteriores no registrados.
3. No se pueden corregir datos incorrectos directamente en la vista previa del contrato ni en la ventana de impresión — hay que volver al formulario, encontrar el campo, corregir, y volver a la vista previa.

---

## Regla de negocio crítica (legal)

> El contrato NUNCA debe decir que el anticipo fue recibido "en el acto de la firma" ni incluir una fecha específica de pago anterior.
> Siempre usar: *"LA CLÍNICA deja constancia de haber recibido la suma de $X con anterioridad a la presente firma"*

Motivo: los pacientes suelen adelantar en múltiples pagos antes de firmar. Si el contrato indica fecha o "en este acto", el paciente puede reclamar ese recibo + los pagos anteriores como doble pago.

---

## Cambio 1: Formulario financiero simplificado

### Antes
- Slider anticipo % (30/40/50)
- Toggle "pago previo" + monto + fecha

### Después
```
Monto total del tratamiento:   [ $2.000 USD ]
Total ya recibido:             [ $1.000 USD ]   ← input libre
                               → Muestra: "50% recibido · $1.000 a financiar"
Plan de cuotas:                [ select: 6 cuotas de $xxx ]
```

- Se elimina: slider anticipo %, toggle pago previo, campo fecha
- El % se calcula como: `(totalRecibido / montoTotal) * 100` — solo para mostrar info
- Si `totalRecibido` = 0 o vacío, el contrato muestra "Anticipo pendiente de pago" con el campo de línea vacía

### Texto del contrato actualizado
```
CLÁUSULA SEGUNDA: PRESUPUESTO Y FORMA DE PAGO

Costo total del tratamiento: $2.000 USD
Recibido con anterioridad a la firma: $1.000 USD
Saldo a financiar: $1.000 USD — [N cuotas de $xxx]

LA CLÍNICA deja constancia de haber recibido la suma de $1.000 USD
con anterioridad a la presente firma. El saldo restante de $1.000 USD
será abonado en [N] cuotas mensuales de $xxx USD.
```

---

## Cambio 2: Edición inline en vista previa

### Comportamiento
- Los campos de datos en el panel blanco (nombre, DNI, dirección, CUIT, email, tratamiento, maxilar, plazo, materiales, montos) tienen un borde punteado sutil al hover
- Un ícono `✏️` aparece al hover junto al valor
- Al hacer clic: el texto se reemplaza por un `<input>` inline con el valor actual
- Al confirmar (Enter o blur): actualiza `patientData` en el estado → preview y formulario izquierdo se sincronizan
- CSS: en modo `@media print` los bordes punteados y el ícono desaparecen

### Implementación técnica
Componente `InlineEditField`:
```tsx
<InlineEditField
  value={patientData.direccion}
  placeholder="___________________________"
  onSave={(val) => setPatientData(prev => ({ ...prev, direccion: val }))}
/>
```
- Estado interno: `editing: boolean`, `draft: string`
- Render: si `editing` → `<input autoFocus>`, si no → `<span>` con borde hover + ícono lápiz
- Ícono y borde solo visibles fuera de print (clase `print:hidden`)

---

## Cambio 3: Edición en ventana de impresión

### Comportamiento
- Al hacer clic en "Imprimir Contrato", antes de abrir la ventana, el HTML se procesa para marcar los valores como `contentEditable="true"`
- La ventana de impresión muestra un banner amarillo al tope:
  ```
  ✏️ Podés editar cualquier campo antes de imprimir. Hacé clic sobre el texto.
  ```
- El banner tiene `@media print { display: none }` — desaparece al imprimir
- El diálogo de impresión NO se abre automáticamente — el usuario edita primero y luego presiona un botón "Imprimir ahora" en esa ventana
- Los elementos `contentEditable` tienen estilo: `border-bottom: 1px dashed #999; cursor: text;`

### Implementación técnica
En `handlePrintContract()`:
1. Tomar el innerHTML de `#printable-contract`
2. Procesar: envolver los `.value` spans con `contentEditable="true"` y clase editable
3. Inyectar CSS de edición + banner + botón de imprimir en la nueva ventana
4. NO llamar a `window.print()` automáticamente — esperar el botón

---

## Campos editables inline (lista completa)

| Campo en preview | Clave en `patientData` |
|---|---|
| Nombre del paciente | `nombre` |
| DNI | `dni` |
| Dirección | `direccion` |
| CUIT/CUIL | `cuitCuil` |
| Email | `email` |
| Descripción del tratamiento | `tratamiento` |
| Maxilar | `maxilar` |
| Plazo estimado | `plazo` |
| Materiales | `materiales` |
| Monto total | `totalAmount` (state separado) |
| Total recibido | `totalRecibido` (nuevo state) |

---

## Archivos a modificar

- `components/caja/ContratosFinanciacionTab.tsx` — único archivo afectado

## Archivos a crear

- Ninguno — el componente `InlineEditField` se define dentro del mismo archivo como función local

---

## DoD (Definition of Done)

- [ ] Formulario financiero muestra solo: monto total, total recibido (input), cuotas
- [ ] El % se calcula y muestra automáticamente bajo el input de "total recibido"
- [ ] El texto del contrato nunca dice "en este acto" ni incluye fecha de pago
- [ ] Todos los campos de datos en la vista previa son editables al hacer clic
- [ ] Editar en preview actualiza el formulario izquierdo
- [ ] Ventana de impresión abre con banner de edición y botón manual de imprimir
- [ ] Los indicadores de edición no aparecen en el PDF final impreso
