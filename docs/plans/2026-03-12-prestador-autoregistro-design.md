# Diseño: Auto-registro de Prestadores

**Fecha:** 2026-03-12
**Estado:** Aprobado por usuario

## Problema

Cuando un nuevo prestador viene a trabajar (incluso por reemplazo corto), el admin
pierde tiempo cargando todos sus datos personales. El prestador ya tiene esa información
y podría cargarla solo.

## Solución

Formulario público en `/registro-prestador` con estética premium (igual a `/admision`)
donde el prestador carga sus propios datos. El admin solo revisa y activa.

## Flujo completo

1. Admin copia el link `/registro-prestador` desde el panel de Prestadores
2. Le manda el link al prestador por WhatsApp
3. Prestador abre el link (sin login), completa 4 pasos
4. Registro queda en `personal` con `activo = false`, `fuente_registro = 'autoregistro'`
5. Admin ve badge naranja "X pendientes" en tab Prestadores
6. Admin abre el pendiente → mini-modal: confirma área + modelo de pago → activa

## Pasos del formulario

| Paso | Campos |
|------|--------|
| 1. Datos personales | Nombre, Apellido, DNI, Fecha de nacimiento |
| 2. Contacto | Email, WhatsApp (+54 prefix), Dirección, Barrio/Localidad |
| 3. Perfil profesional | Tipo de trabajo (dropdown con áreas), Condición AFIP |
| 4. Datos bancarios | CBU, Alias CBU, CUIT/CUIL |

## Cambios en base de datos

- Nueva migración: `20260312_prestador_autoregistro.sql`
  - `ALTER TABLE personal ADD COLUMN IF NOT EXISTS cbu TEXT`
  - `ALTER TABLE personal ADD COLUMN IF NOT EXISTS cbu_alias TEXT`
  - `ALTER TABLE personal ADD COLUMN IF NOT EXISTS cuit TEXT`
  - `ALTER TABLE personal ADD COLUMN IF NOT EXISTS fuente_registro TEXT DEFAULT 'admin'`
  - RLS: INSERT anónimo permitido solo con `activo = false`

## Nuevos archivos

- `app/registro-prestador/page.tsx` — página pública
- `components/prestador/RegistroPrestadorForm.tsx` — formulario multi-step
- `app/actions/prestador-registro.ts` — server action pública (usa adminClient)

## Cambios en archivos existentes

- `components/caja-admin/PersonalTab.tsx`
  - Botón "Copiar link de registro" en header
  - Badge "X pendientes" en tab
  - Modal de activación para pendientes

## Estética

Mismo patrón que `PremiumAdmissionForm`:
- Fondo negro `#050505`
- Cards con glassmorphism y bordes sutiles
- Animaciones `motion/react` entre pasos (fadeInBlur)
- Progress bar superior
- Botones con gradiente blanco
