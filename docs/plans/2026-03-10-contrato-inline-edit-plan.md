# Contrato: Edición Inline + Simplificación Financiera — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permitir edición inline de campos en la vista previa del contrato y en la ventana de impresión, y simplificar el formulario financiero eliminando la redundancia de anticipo % + monto previo.

**Architecture:** Todo el cambio vive en un único componente React (`ContratosFinanciacionTab.tsx`). Se agrega un sub-componente local `InlineEditField` para edición inline en la preview. La lógica financiera se simplifica: `totalRecibido` (monto en $) reemplaza `downPaymentPct` + `pagoPrevio` + `montoPagoPrevio` + `fechaPagoPrevio`. La ventana de impresión recibe `contentEditable` en los campos y un botón manual de imprimir.

**Tech Stack:** React 19, TypeScript 5, Tailwind CSS 4. Sin librerías nuevas.

**Design doc:** `docs/plans/2026-03-10-contrato-inline-edit-financial-simplify.md`

---

## Regla legal crítica (leer antes de tocar el contrato)

El texto del contrato NUNCA debe decir "abonado en este acto" ni incluir fecha de pago previo. Siempre: **"recibido con anterioridad a la presente firma"**. Esto evita que pacientes que pagaron en múltiples cuotas previas reclamen doble contabilidad.

---

## Task 1: Limpiar estados financieros obsoletos

**Files:**
- Modify: `components/caja/ContratosFinanciacionTab.tsx` (líneas ~37-63)

**Step 1: Identificar y eliminar los estados a borrar**

Buscar y eliminar estas líneas del archivo:
```tsx
// ELIMINAR estos 4 estados:
const [downPaymentPct, setDownPaymentPct] = useState<number>(30);
const [pagoPrevio, setPagoPrevio] = useState(false);
const [montoPagoPrevio, setMontoPagoPrevio] = useState('');
const [fechaPagoPrevio, setFechaPagoPrevio] = useState('');
```

**Step 2: Agregar el nuevo estado `totalRecibido`**

Después de `const [totalAmount, setTotalAmount] = useState<string>('');`, agregar:
```tsx
const [totalRecibido, setTotalRecibido] = useState<string>('');
```

**Step 3: Verificar que el archivo compila**

```bash
cd "/Users/ariel/Downloads/antigravity apps/am-clinica-main"
npx tsc --noEmit 2>&1 | head -40
```
Esperado: errores de TypeScript sobre las referencias a los estados eliminados (eso está bien, los vamos a arreglar en las tareas siguientes).

---

## Task 2: Actualizar `calculations` useMemo

**Files:**
- Modify: `components/caja/ContratosFinanciacionTab.tsx` (bloque `useMemo` ~líneas 274-307)

**Step 1: Reemplazar el useMemo completo**

Encontrar el bloque:
```tsx
const calculations = useMemo(() => {
  const amount = parseFloat(totalAmount.replace(/\./g, ''));
  if (isNaN(amount) || amount <= 0) return null;

  const downPayment = amount * (downPaymentPct / 100);
  const amountToFinance = amount - downPayment;
  ...
}, [totalAmount, downPaymentPct]);
```

Reemplazarlo con:
```tsx
const calculations = useMemo(() => {
  const amount = parseFloat(totalAmount.replace(/\./g, ''));
  if (isNaN(amount) || amount <= 0) return null;

  const recibido = parseFloat(totalRecibido.replace(/\./g, '')) || 0;
  const amountToFinance = Math.max(amount - recibido, 0);
  const pctRecibido = amount > 0 ? Math.round((recibido / amount) * 100) : 0;

  const plans: PlanOption[] = [
    {
      id: '3m',
      months: 3,
      installmentValue: (amountToFinance * (1 + (annualRate * (3 / 12)))) / 3,
      totalCredit: amountToFinance * (1 + (annualRate * (3 / 12))),
      color: 'from-blue-400 to-indigo-500'
    },
    {
      id: '6m',
      months: 6,
      installmentValue: (amountToFinance * (1 + (annualRate * (6 / 12)))) / 6,
      totalCredit: amountToFinance * (1 + (annualRate * (6 / 12))),
      tag: 'Más Popular',
      color: 'from-emerald-400 to-teal-500'
    },
    {
      id: '12m',
      months: 12,
      installmentValue: (amountToFinance * (1 + (annualRate * (12 / 12)))) / 12,
      totalCredit: amountToFinance * (1 + (annualRate * (12 / 12))),
      color: 'from-orange-400 to-red-500'
    }
  ];

  return { amount, recibido, amountToFinance, pctRecibido, plans };
}, [totalAmount, totalRecibido]);
```

**Step 2: Verificar compilación**

```bash
npx tsc --noEmit 2>&1 | head -40
```
Esperado: menos errores que antes (calculations ya no usa los estados eliminados).

---

## Task 3: Actualizar la sección financiera del formulario izquierdo (Tab "Gestión interna")

**Files:**
- Modify: `components/caja/ContratosFinanciacionTab.tsx` (sección "Datos Financieros" del formulario, ~líneas 805-862)

**Step 1: Reemplazar toda la sección "Datos Financieros"**

Encontrar el bloque que comienza con:
```tsx
<h3 className="text-xs font-bold uppercase tracking-widest text-emerald-400 border-b border-white/10 pb-4 pt-4 mb-4">Datos Financieros</h3>
```

Y reemplazar todo hasta el botón "Imprimir Contrato" con:
```tsx
<h3 className="text-xs font-bold uppercase tracking-widest text-emerald-400 border-b border-white/10 pb-4 pt-4 mb-4">Datos Financieros</h3>

<div className="space-y-4">
  <div className="space-y-2">
    <label className="text-[10px] uppercase text-gray-500 font-bold">Monto Total (USD)</label>
    <input
      type="text"
      value={totalAmount}
      onChange={(e) => setTotalAmount(formatInput(e.target.value))}
      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
      placeholder="Ej: 2.000"
    />
  </div>

  <div className="space-y-2">
    <label className="text-[10px] uppercase text-gray-500 font-bold">Total ya recibido (USD)</label>
    <input
      type="text"
      value={totalRecibido}
      onChange={(e) => setTotalRecibido(formatInput(e.target.value))}
      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
      placeholder="Ej: 1.000"
    />
    {calculations && calculations.recibido > 0 && (
      <p className="text-[10px] text-emerald-400 font-medium">
        {calculations.pctRecibido}% recibido · {formatCurrency(calculations.amountToFinance)} a financiar
      </p>
    )}
    {calculations && calculations.recibido === 0 && (
      <p className="text-[10px] text-gray-500 italic">
        Si el paciente no adelantó nada, dejá en blanco.
      </p>
    )}
  </div>

  <div className="space-y-2">
    <label className="text-[10px] uppercase text-gray-500 font-bold">Plan de Cuotas</label>
    <select
      value={selectedPlanForContract?.months || ''}
      onChange={(e) => {
        const months = Number(e.target.value);
        if (months && calculations) {
          const plan = calculations.plans.find(p => p.months === months);
          if (plan) setSelectedPlanForContract(plan);
        } else {
          setSelectedPlanForContract(null);
        }
      }}
      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500 text-white"
    >
      <option value="" className="bg-zinc-900">Seleccionar plan...</option>
      {calculations?.plans.map(plan => (
        <option key={plan.id} value={plan.months} className="bg-zinc-900">
          {plan.months} cuotas de {formatCurrency(plan.installmentValue)}
        </option>
      ))}
    </select>
  </div>
</div>
```

**Step 2: Eliminar también la sección "Pago Previo" del formulario**

Encontrar el bloque que comienza con:
```tsx
<h3 className="text-xs font-bold uppercase tracking-widest text-amber-400 border-b border-white/10 pb-4 pt-4 mb-4">Pago Previo</h3>
```
Y eliminar todo ese bloque hasta que termina (cierra el `</div>` de `space-y-3 mb-4`).

**Step 3: Verificar compilación**

```bash
npx tsc --noEmit 2>&1 | head -40
```

---

## Task 4: Agregar el componente `InlineEditField`

**Files:**
- Modify: `components/caja/ContratosFinanciacionTab.tsx` (antes del `export default`)

**Step 1: Agregar el componente local antes del export**

Insertar este código justo ANTES de la línea `export default function ContratosFinanciacionTab`:

```tsx
interface InlineEditFieldProps {
  value: string;
  placeholder?: string;
  onSave: (val: string) => void;
  multiline?: boolean;
  className?: string;
}

function InlineEditField({ value, placeholder = '___________________________', onSave, multiline = false, className = '' }: InlineEditFieldProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  const handleSave = () => {
    setEditing(false);
    onSave(draft);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setDraft(value);
      setEditing(false);
    }
  };

  if (editing) {
    if (multiline) {
      return (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className={`inline-block w-full border-b-2 border-blue-500 outline-none bg-blue-50 text-black px-1 text-sm resize-none ${className}`}
          rows={2}
        />
      );
    }
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`inline-block border-b-2 border-blue-500 outline-none bg-blue-50 text-black px-1 text-sm ${className}`}
        style={{ minWidth: '120px', width: Math.max(draft.length * 8, 120) + 'px' }}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={`group/inline relative cursor-text ${className}`}
      title="Clic para editar"
    >
      <span className={`border-b border-dashed border-gray-400 hover:border-blue-400 transition-colors ${!value ? 'text-gray-400 italic' : ''}`}>
        {value || placeholder}
      </span>
      <span className="print:hidden ml-1 opacity-0 group-hover/inline:opacity-60 transition-opacity text-blue-500 text-[10px] select-none">✏</span>
    </span>
  );
}
```

**Step 2: Verificar que TypeScript acepta el componente**

```bash
npx tsc --noEmit 2>&1 | head -40
```
Esperado: sin errores nuevos relacionados a `InlineEditField`.

---

## Task 5: Reemplazar campos estáticos en la vista previa del contrato

**Files:**
- Modify: `components/caja/ContratosFinanciacionTab.tsx` (sección `#printable-contract`, ~líneas 876-950)

**Step 1: Reemplazar los datos del paciente en "PARTES INTERVINIENTES"**

Encontrar:
```tsx
<p><strong>EL PACIENTE:</strong> {patientData.nombre || '___________________________'}, DNI N.º {patientData.dni || '___________'}, domicilio en {patientData.direccion || '___________________________'}, CUIT/CUIL N.º {patientData.cuitCuil || '_______________'}, correo {patientData.email || '___________________________'}.</p>
```

Reemplazar con:
```tsx
<p>
  <strong>EL PACIENTE:</strong>{' '}
  <InlineEditField
    value={patientData.nombre}
    placeholder="Nombre y Apellido"
    onSave={(v) => setPatientData(prev => ({ ...prev, nombre: v }))}
  />{', '}
  DNI N.º{' '}
  <InlineEditField
    value={patientData.dni}
    placeholder="___________"
    onSave={(v) => setPatientData(prev => ({ ...prev, dni: v }))}
  />{', domicilio en '}
  <InlineEditField
    value={patientData.direccion}
    placeholder="___________________________"
    onSave={(v) => setPatientData(prev => ({ ...prev, direccion: v }))}
  />{', CUIT/CUIL N.º '}
  <InlineEditField
    value={patientData.cuitCuil}
    placeholder="_______________"
    onSave={(v) => setPatientData(prev => ({ ...prev, cuitCuil: v }))}
  />{', correo '}
  <InlineEditField
    value={patientData.email}
    placeholder="___________________________"
    onSave={(v) => setPatientData(prev => ({ ...prev, email: v }))}
  />.
</p>
```

**Step 2: Reemplazar campos de tratamiento en CLÁUSULA PRIMERA**

Encontrar los divs con className "value" que contienen:
- `{patientData.tratamiento || '_________________...'}`
- `{patientData.maxilar || '___...'}`
- `{patientData.materiales}`
- `{patientData.plazo || '___...'}`

Reemplazar cada uno:
```tsx
// Descripción del tratamiento:
<div className="value">
  <InlineEditField
    value={patientData.tratamiento}
    placeholder="_________________________________________________________________________________"
    onSave={(v) => setPatientData(prev => ({ ...prev, tratamiento: v }))}
    multiline
  />
</div>

// Maxilar:
<div className="value">
  <InlineEditField
    value={patientData.maxilar}
    placeholder="___________________________"
    onSave={(v) => setPatientData(prev => ({ ...prev, maxilar: v }))}
  />
</div>

// Materiales (dentro del conditional):
<div className="value">
  <InlineEditField
    value={patientData.materiales}
    placeholder="___________________________"
    onSave={(v) => setPatientData(prev => ({ ...prev, materiales: v }))}
  />
</div>

// Plazo:
<div className="value">
  <InlineEditField
    value={patientData.plazo}
    placeholder="___________________________"
    onSave={(v) => setPatientData(prev => ({ ...prev, plazo: v }))}
  />
</div>
```

**Step 3: Verificar compilación**

```bash
npx tsc --noEmit 2>&1 | head -40
```

---

## Task 6: Actualizar CLÁUSULA SEGUNDA en el contrato (texto financiero + lenguaje legal)

**Files:**
- Modify: `components/caja/ContratosFinanciacionTab.tsx` (bloque `financial-box`, ~líneas 912-948)

**Step 1: Reemplazar toda la sección `<h2>CLÁUSULA SEGUNDA` hasta el cierre del `financial-box`**

Encontrar el bloque completo desde `<h2>CLÁUSULA SEGUNDA: PRESUPUESTO Y FORMA DE PAGO</h2>` hasta el párrafo final de la cláusula y reemplazar con:

```tsx
<h2>CLÁUSULA SEGUNDA: PRESUPUESTO Y FORMA DE PAGO</h2>
<div className="financial-box">
  <div className="grid" style={{ marginBottom: 0 }}>
    <div className="field">
      <div className="label">Costo total del tratamiento</div>
      <div className="value" style={{ border: 'none', fontSize: '14px', fontWeight: 'bold' }}>
        {totalAmount ? formatCurrency(parseFloat(totalAmount.replace(/\./g, ''))) : '___________'} (USD)
      </div>
    </div>

    {calculations && calculations.recibido > 0 && (
      <div className="field">
        <div className="label">Recibido con anterioridad a la firma</div>
        <div className="value" style={{ border: 'none', fontSize: '14px', fontWeight: 'bold' }}>
          {formatCurrency(calculations.recibido)} (USD)
        </div>
      </div>
    )}

    <div className="field">
      <div className="label">Saldo a financiar</div>
      <div className="value" style={{ border: 'none', fontSize: '14px', fontWeight: 'bold' }}>
        {calculations ? formatCurrency(calculations.amountToFinance) : '___________'} (USD)
      </div>
    </div>

    {selectedPlanForContract && (
      <div className="field">
        <div className="label">Plan de financiación</div>
        <div className="value" style={{ border: 'none', fontSize: '13px', fontWeight: 'bold' }}>
          {selectedPlanForContract.months} cuotas mensuales de {formatCurrency(selectedPlanForContract.installmentValue)} (USD)
        </div>
      </div>
    )}
  </div>
</div>

{calculations && calculations.recibido > 0 && (
  <p style={{ fontSize: '11px', marginTop: '8px', fontStyle: 'italic', color: '#92400e' }}>
    LA CLÍNICA deja constancia de haber recibido la suma de {formatCurrency(calculations.recibido)} (USD) con anterioridad a la presente firma. El presente contrato regula exclusivamente la financiación del saldo restante de {formatCurrency(calculations.amountToFinance)} (USD).
  </p>
)}
```

**Step 2: Verificar compilación**

```bash
npx tsc --noEmit 2>&1 | head -40
```
Esperado: 0 errores.

---

## Task 7: Actualizar `handlePrintContract` para ventana editable

**Files:**
- Modify: `components/caja/ContratosFinanciacionTab.tsx` (función `handlePrintContract`, ~líneas 229-272)

**Step 1: Reemplazar la función `handlePrintContract` completa**

```tsx
const handlePrintContract = () => {
  const printContent = document.getElementById('printable-contract');
  if (!printContent) return;

  // Clonar el HTML y hacer los .value editables
  const clone = printContent.cloneNode(true) as HTMLElement;

  // Quitar indicadores de edición inline (ícono lápiz) que son print:hidden en tailwind
  clone.querySelectorAll('[title="Clic para editar"]').forEach(el => {
    // Reemplazar el span interactivo por el texto plano + hacer el contenedor editable
    const span = el as HTMLElement;
    const textNode = span.querySelector('span:first-child');
    const text = textNode?.textContent || '';
    const editable = document.createElement('span');
    editable.contentEditable = 'true';
    editable.style.borderBottom = '1px dashed #999';
    editable.style.cursor = 'text';
    editable.style.outline = 'none';
    editable.style.minWidth = '80px';
    editable.style.display = 'inline-block';
    editable.textContent = text;
    span.replaceWith(editable);
  });

  // También hacer editables los .value divs en financial-box
  clone.querySelectorAll('.value').forEach(el => {
    (el as HTMLElement).contentEditable = 'true';
    (el as HTMLElement).style.cursor = 'text';
    (el as HTMLElement).style.outline = 'none';
  });

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.print();
    return;
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>Contrato de Prestación de Servicios Odontológicos</title>
        <style>
          body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #000; padding: 40px; max-width: 800px; margin: 0 auto; }
          h1 { text-align: center; font-size: 18px; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 30px; }
          h2 { font-size: 14px; text-transform: uppercase; margin-top: 30px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
          p { font-size: 12px; margin-bottom: 10px; text-align: justify; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
          .field { margin-bottom: 10px; }
          .label { font-weight: bold; font-size: 10px; text-transform: uppercase; color: #555; }
          .value { font-size: 12px; border-bottom: 1px solid #000; padding-bottom: 2px; min-height: 18px; }
          .signatures { margin-top: 80px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; }
          .signature-line { border-top: 1px solid #000; padding-top: 10px; font-size: 12px; }
          .financial-box { border: 1px solid #000; padding: 15px; margin-top: 20px; background-color: #f9f9f9; }
          [contenteditable] { outline: none; }
          [contenteditable]:hover { background-color: #fffbeb; border-bottom-color: #f59e0b !important; }
          [contenteditable]:focus { background-color: #eff6ff; border-bottom: 2px solid #3b82f6 !important; }
          #edit-banner { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 10px 16px; margin-bottom: 20px; font-size: 12px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
          #print-btn { background: #10b981; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer; }
          #print-btn:hover { background: #059669; }
          @media print {
            #edit-banner { display: none; }
            body { padding: 0; }
            [contenteditable] { border-bottom-style: solid !important; border-bottom-color: #000 !important; }
          }
        </style>
      </head>
      <body>
        <div id="edit-banner">
          <span>✏️ <strong>Podés editar cualquier campo antes de imprimir.</strong> Hacé clic sobre el texto subrayado para corregirlo.</span>
          <button id="print-btn" onclick="window.print()">Imprimir ahora</button>
        </div>
        ${clone.outerHTML}
      </body>
    </html>
  `);
  printWindow.document.close();
};
```

**Step 2: Verificar compilación final**

```bash
npx tsc --noEmit 2>&1 | head -60
```
Esperado: 0 errores.

---

## Task 8: Limpiar referencias obsoletas en el simulador

**Files:**
- Modify: `components/caja/ContratosFinanciacionTab.tsx` (sección simulador, ~líneas 380-444)

**Step 1: Eliminar el slider de anticipo del simulador**

En la sección del simulador (tab `simulator`), el slider de anticipo y los botones 30%/40%/50% también usan `downPaymentPct` que fue eliminado. Buscar y eliminar ese bloque completo (el div con label "ANTICIPO INICIAL").

Si el simulador necesita mostrar anticipo como referencia, se puede dejar como texto fijo o calcular desde `totalRecibido`. Si no hay monto recibido aún en ese momento, simplemente omitir la sección de anticipo del simulador — el usuario en esa etapa solo necesita ver los planes de cuotas.

**Step 2: Ajustar el texto del botón "Simular"**

El texto del simulador no requiere cambios, solo verificar que no haya referencias a `downPaymentPct`, `pagoPrevio`, `montoPagoPrevio`, `fechaPagoPrevio`.

```bash
grep -n "downPaymentPct\|pagoPrevio\|montoPagoPrevio\|fechaPagoPrevio" \
  "components/caja/ContratosFinanciacionTab.tsx"
```
Esperado: 0 resultados.

**Step 3: Verificar compilación final limpia**

```bash
npx tsc --noEmit 2>&1
```
Esperado: 0 errores.

---

## Task 9: Prueba manual y commit

**Step 1: Levantar dev server**

```bash
npm run dev
```

**Step 2: Checklist de prueba manual**

Ir a la sección de Caja → tab Contratos/Financiación → tab "Gestión interna":

- [ ] El formulario financiero ya NO tiene slider de anticipo ni toggle de pago previo
- [ ] Ingresar monto total `2000` y total recibido `1000` → aparece "50% recibido · USD 1.000 a financiar"
- [ ] La vista previa del contrato refleja los cambios en tiempo real
- [ ] Hacer clic sobre el nombre del paciente en la vista previa → aparece input editable
- [ ] Editar el nombre y presionar Enter → el cambio se refleja en la preview Y en el formulario izquierdo
- [ ] Hacer clic sobre la dirección y corregirla → mismo comportamiento
- [ ] El texto de CLÁUSULA SEGUNDA dice "recibido con anterioridad a la firma" (no "en este acto")
- [ ] Hacer clic en "Imprimir Contrato" → se abre nueva ventana con banner amarillo y botón "Imprimir ahora"
- [ ] En esa ventana, hacer clic sobre el nombre → se puede editar el texto
- [ ] Hacer clic en "Imprimir ahora" → se abre el diálogo de impresión normal
- [ ] En la vista previa de impresión, el banner amarillo NO aparece

**Step 3: Commit**

```bash
cd "/Users/ariel/Downloads/antigravity apps/am-clinica-main"
git add components/caja/ContratosFinanciacionTab.tsx docs/plans/
git commit -m "feat(contratos): inline edit en preview, simplificacion financiera y lenguaje legal correcto"
```

---

## DoD Final

- [ ] Sin referencias a `downPaymentPct`, `pagoPrevio`, `montoPagoPrevio`, `fechaPagoPrevio` en el archivo
- [ ] `totalRecibido` en $ → % se calcula solo
- [ ] Todos los campos en la preview son clickeables y editables
- [ ] Edición en preview sincroniza con formulario izquierdo
- [ ] Ventana de impresión: banner de edición + botón manual + campos contentEditable
- [ ] Contrato nunca dice "en este acto" ni incluye fecha de pago
- [ ] `npx tsc --noEmit` = 0 errores
