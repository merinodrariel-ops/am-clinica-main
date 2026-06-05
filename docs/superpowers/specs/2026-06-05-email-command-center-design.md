# Diseno: Modulo Emails y trazabilidad de envios

**Fecha:** 2026-06-05
**Estado:** Pendiente de revision del usuario
**Decision aprobada:** construir una tabla unificada nueva desde el inicio.

## Problema

AM Clinica envia emails desde varios flujos: agenda, encuestas, invitaciones de
portal, restablecimiento de contrasena, workflows clinicos, pruebas internas y
mensajes programados. Hoy esos envios no tienen una bandeja unica. Algunas rutas
registran datos en `notification_logs`, otras usan `workflow_notifications_log`,
otras pasan por `scheduled_messages`, y varias piezas llaman a `EmailService`
sin dejar un historial completo para administracion.

El resultado practico es que una pregunta simple como "Tomas vino ayer, era
primera vez, le mandamos email?" puede requerir reconstruir datos entre agenda,
pacientes, encuestas, logs parciales y proveedor. La app necesita una fuente
central de verdad para envios de email.

## Objetivo

Crear un modulo interno `Emails` que permita ver, filtrar y auditar los emails
salientes de AM:

- a quien se envio
- que asunto y tipo de email fue
- que plantilla se uso
- que paciente y turno estaban asociados
- que proveedor lo envio
- si fue aceptado, fallo, quedo programado, reboto o fue entregado
- que error devolvio el sistema o proveedor

El primer corte se enfoca en bandeja de salida y plantillas. La bandeja de
entrada real queda para una fase posterior porque requiere conectar una casilla
o proveedor inbound.

## Capacidad

- Owner/admin/reception/developer: revisa la bandeja de salida, busca por
  paciente, email, fecha, tipo, estado o proveedor, y abre un detalle del envio.
- Owner/admin/developer: revisa plantillas existentes y envia pruebas.
- Sistema: todo envio hecho por `EmailService` queda registrado en una tabla
  unificada antes y despues de contactar al proveedor.
- Resultado: la clinica puede responder si se intento mandar un email, con que
  contenido, por que flujo y con que resultado tecnico.

## Superficies

- Sidebar: renombrar `Templates Email` a `Emails`.
- Ruta base: conservar `/admin/email-templates` solo si se decide mantener
  compatibilidad, pero la experiencia debe pasar a una superficie `Emails`.
  Opcion preferida: nueva ruta `/admin/emails`.
- UI interna:
  - `Salida`
  - `Programados`
  - `Plantillas`
  - `Proveedores`
- API/actions internas para listar y consultar detalle de emails.
- `EmailService` y `sendResendEmail` como punto central de envio.
- Supabase tabla nueva `email_messages`.
- Webhooks de proveedor en fase posterior para delivery/bounce/open/click.

## Arquitectura

La tabla `email_messages` es la fuente principal de trazabilidad. Cada intento
de envio crea un registro `queued` o `sending`, luego el proveedor actualiza el
registro a `sent` o `failed`. Cuando haya webhooks, los eventos posteriores
actualizan el estado a `delivered`, `bounced`, `opened`, `clicked` u otro estado
soportado.

Las plantillas no deben depender del proveedor. El proveedor se modela como un
adaptador. Resend es el adaptador activo inicial. Brevo puede agregarse despues
como adaptador transaccional si se decide usarlo para envio, pero hoy en el repo
solo aparece conectado para sincronizacion de contactos.

Los logs existentes (`notification_logs`, `workflow_notifications_log` y
`scheduled_messages`) se pueden mostrar como historico parcial o migrar con
campos incompletos, pero no deben seguir siendo la fuente principal para nuevos
envios.

## Datos

Tabla `email_messages`:

- `id uuid primary key`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `direction text not null default 'outbound'`
- `status text not null`
- `provider text not null default 'resend'`
- `provider_message_id text`
- `provider_event_id text`
- `from_email text`
- `from_name text`
- `to_email text not null`
- `to_name text`
- `cc jsonb not null default '[]'::jsonb`
- `bcc jsonb not null default '[]'::jsonb`
- `reply_to text`
- `subject text not null`
- `template_key text`
- `template_label text`
- `message_type text not null`
- `source_module text not null`
- `patient_id uuid`
- `appointment_id uuid`
- `workflow_id uuid`
- `treatment_id uuid`
- `scheduled_message_id uuid`
- `idempotency_key text`
- `html_snapshot text`
- `text_snapshot text`
- `payload jsonb not null default '{}'::jsonb`
- `metadata jsonb not null default '{}'::jsonb`
- `error_message text`
- `queued_at timestamptz`
- `sent_at timestamptz`
- `delivered_at timestamptz`
- `bounced_at timestamptz`
- `opened_at timestamptz`
- `clicked_at timestamptz`
- `created_by uuid`

Estados iniciales:

- `queued`
- `sending`
- `sent`
- `failed`
- `delivered`
- `bounced`
- `opened`
- `clicked`
- `cancelled`

Tipos iniciales:

- `appointment_reminder`
- `appointment_confirmation`
- `appointment_cancellation`
- `survey_first_visit`
- `survey_post_appointment`
- `portal_invitation`
- `password_reset`
- `workflow_notification`
- `treatment_followup`
- `budget`
- `payment_confirmation`
- `test`
- `other`

## Seguridad y privacidad

- La tabla contiene datos personales y contenido potencialmente clinico.
- Lectura solo para roles internos autorizados: owner, admin, reception,
  developer. Si RLS se apoya en `profiles`, debe usar la convencion vigente del
  repo y no asumir columnas inexistentes.
- Escritura desde server-side helpers autorizados. El cliente no debe insertar
  emails directamente.
- No loguear HTML ni payloads en consola.
- Evitar guardar secretos, tokens de auth, magic links completos o links de
  recuperacion con credenciales sensibles si el snapshot puede quedar visible.
- Si un email contiene un link sensible, guardar el snapshot con cuidado: o se
  guarda el HTML real solo para roles altos, o se guarda una version redactada y
  metadata suficiente para auditar.
- Los filtros por paciente y turno deben usar selects estrechos.
- Service role solo en rutas server-side/scheduler, nunca en cliente.

## Proveedores

Proveedor activo actual: Resend, via `EmailService` y `sendResendEmail`.

El diseno debe permitir adaptadores:

- `resend`
- `brevo`
- `sendgrid`
- `mailgun`
- `smtp`

Cada adaptador debe devolver una forma comun:

- `success`
- `provider`
- `providerMessageId`
- `error`
- `raw`

El modulo `Proveedores` debe mostrar como minimo:

- proveedor activo
- remitente configurado
- si falta API key o remitente
- ultimo error conocido

Las cuotas gratuitas cambian con el tiempo y no deben codificarse como regla de
negocio. La app puede mostrar proveedor activo y permitir futuro cambio, pero no
debe depender de un numero fijo de emails gratuitos.

## UI

### Salida

Tabla densa para uso operativo:

- fecha
- estado
- destinatario
- paciente
- tipo
- plantilla
- asunto
- proveedor
- modulo origen

Filtros:

- busqueda libre por paciente/email/asunto
- estado
- tipo
- proveedor
- fecha desde/hasta
- modulo origen

Detalle:

- asunto
- destinatario
- estado y timestamps
- paciente/turno si existen
- provider id
- error
- plantilla
- preview HTML en iframe seguro o panel de solo lectura

### Programados

Primer corte: leer `scheduled_messages` y mostrar los emails pendientes. Si se
envian desde el nuevo servicio, deben crear o vincular `email_messages`.

### Plantillas

Reusar la pantalla actual de previews. Debe vivir dentro de `Emails`, no como
modulo aislado. Mantener envio de prueba, registrandolo como `message_type =
'test'`.

### Proveedores

Pantalla informativa inicial. No hace falta construir cambio dinamico de
proveedor en el primer corte, pero el modelo debe dejarlo preparado.

## Fases

### Fase 1: bandeja de salida real

- Crear `email_messages`.
- Agregar helper de trazabilidad alrededor de `EmailService.send`.
- Registrar nuevos envios salientes.
- Crear `Emails > Salida`.
- Mover/embutir `Plantillas`.
- Registrar envios de prueba.
- Mostrar historico parcial desde logs viejos si aporta valor, marcado como
  parcial.

### Fase 2: cobertura completa de origenes

- Adaptar agenda, encuestas, workflows, invitaciones, reset, presupuestos y
  pagos para pasar por el wrapper central.
- Vincular `patient_id`, `appointment_id`, `workflow_id`, `treatment_id` cuando
  existan.
- Incorporar `scheduled_messages` al flujo nuevo.

### Fase 3: delivery real

- Agregar webhook de Resend.
- Guardar eventos de delivery/bounce/open/click.
- Diferenciar claramente `sent` de `delivered`.

### Fase 4: inbound

- Conectar casilla o proveedor inbound.
- Crear `email_threads` o `email_conversations` si hace falta agrupar respuestas.
- Asociar respuestas con paciente por remitente y contexto.

## No objetivos

- No construir inbox real en el primer corte.
- No cambiar de proveedor automaticamente.
- No confirmar como `delivered` algo que solo fue aceptado por Resend.
- No migrar todos los historicos con precision perfecta si los datos viejos no
  existen.
- No enviar emails nuevos de campanas masivas.
- No reemplazar WhatsApp ni Twilio en esta fase.
- No exponer snapshots sensibles a usuarios sin rol alto.

## Verificacion

- Typecheck/lint de archivos tocados.
- Tests unitarios para normalizacion de estados/tipos y registro de mensajes.
- Verificar que `EmailService.send` siga enviando por Resend.
- Test de envio de prueba registrando `email_messages`.
- Verificar que la bandeja muestra el nuevo envio.
- Verificar que un fallo de proveedor se registra como `failed`.
- Verificar RLS o rutas server-side para que roles no autorizados no puedan leer
  datos sensibles.
- Si se despliega, verificar la ruta real de produccion y enviar un email de
  prueba controlado solo si el usuario lo pide.

## Riesgos

- Guardar HTML completo puede exponer links sensibles. Mitigacion: redactar o
  restringir detalle por rol.
- Si algunos flujos siguen llamando a un sender viejo, la bandeja queda
  incompleta. Mitigacion: adaptar `EmailService` como punto central y buscar
  llamadas directas.
- Si se interpreta `sent` como entregado, administracion puede sacar una
  conclusion falsa. Mitigacion: labels claros: "Enviado al proveedor" versus
  "Entregado".
- Si se hace solo lectura de logs viejos, se perpetua la fragmentacion.
  Mitigacion: tabla nueva obligatoria para envios futuros.

## Handoff

Listo para plan de implementacion despues de revision del usuario. El primer
plan debe cubrir Fase 1 completa y dejar Fase 2/3 preparadas sin construirlas
todavia.
