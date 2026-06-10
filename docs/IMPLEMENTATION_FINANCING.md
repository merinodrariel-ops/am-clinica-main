# Implementación de Funcionalidad de Financiación de Pacientes

Se ha completado la implementación del módulo de financiación, abarcando desde la base de datos hasta la interfaz de usuario.

## Resumen de Cambios

### 1. Gestión de Pacientes (`components/patients/PatientDashboard.tsx`)
- **Nueva Pestaña "Financiación"**:
  - Permite configurar un plan de financiación activo para el paciente.
  - Campos editables: Estado (Activo/Inactivo/Finalizado), Monto Total a Financiar (USD) y Cantidad de Cuotas.
  - Muestra una barra de progreso que se llena automáticamente según los pagos realizados.
  - Calcula el saldo restante.
- **Lista de Pagos de Cuotas**:
  - Filtra y muestra solo los pagos identificados explícitamente como "cuota".

### 2. Caja y Recepción (`app/caja-recepcion/page.tsx` y `components/caja/NuevoIngresoForm.tsx`)
- **Lista de Ingresos**:
  - Los nombres de los pacientes ahora son enlaces clicables que llevan directamente a la pestaña de financiación de su perfil.
  - Indicador visual "Financiación Activa" junto al nombre si corresponde.
- **Nuevo Ingreso**:
  - Se agregó un "switch" para marcar un pago como **"Es pago de financiación / cuota"**.
  - Al activarlo, permite ingresar el número de cuota (ej: 1) y el total (ej: 12).
  - Estos datos se guardan en la base de datos (`caja_recepcion_movimientos`).

### 3. Base de Datos (Supabase)
- Se verificó la existencia y uso de las columnas:
  - `pacientes`: `financ_estado`, `financ_monto_total`, `financ_cuotas_total`.
  - `caja_recepcion_movimientos`: `cuota_nro`, `cuotas_total`.

## Cómo Probar

1. **Configurar un Plan**: Ir al perfil de un paciente, pestaña "Financiación", hacer click en "Configurar Plan", definir un monto y cuotas, y guardar.
2. **Registrar un Pago**: Ir a Caja Recepción, "Nuevo Ingreso". Seleccionar el paciente. Marcar "Es pago de financiación". Ingresar monto y nro de cuota. Guardar.
3. **Verificar Progreso**: Volver al perfil del paciente. La barra de progreso debería haber avanzado y el pago aparecer en la lista inferior.
