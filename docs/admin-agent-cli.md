# AM Admin Agent CLI

CLI read-only para consultas administrativas amplias de AM Clinica.

## Uso

```bash
AM_AGENT_OPERATOR_EMAIL=owner@clinica.com npm run agent:admin -- overview
AM_AGENT_OPERATOR_EMAIL=owner@clinica.com npm run agent:admin -- patient "Apellido Nombre"
AM_AGENT_OPERATOR_EMAIL=owner@clinica.com npm run agent:admin -- agenda today
AM_AGENT_OPERATOR_EMAIL=owner@clinica.com npm run agent:admin -- agenda week
AM_AGENT_OPERATOR_EMAIL=owner@clinica.com npm run agent:admin -- cash 2026-07
AM_AGENT_OPERATOR_EMAIL=owner@clinica.com npm run agent:admin -- emails 30
```

## Variables requeridas

```env
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
AM_AGENT_OPERATOR_EMAIL=owner@clinica.com
```

`SUPABASE_SERVICE_ROLE_KEY` queda solo en el proceso local/server. No se pega en chats, UI ni configuración de usuarios.

## Permisos

El CLI valida `AM_AGENT_OPERATOR_EMAIL` contra `profiles.categoria`.

Roles permitidos:

- `owner`
- `admin`
- `developer`

Otros roles quedan bloqueados aunque tengan acceso al repositorio.

## Alcance inicial

- Read-only.
- Sin SQL libre.
- Sin mutaciones.
- Contactos de pacientes redactados en búsquedas.
- Emails usa `email_messages` si existe y cae a `notification_logs` si la tabla no está disponible.
