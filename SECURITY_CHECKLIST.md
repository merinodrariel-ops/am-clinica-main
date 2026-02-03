
# Checklist de Verificación de Seguridad y Roles

## 1. Verificación de Roles
- [ ] **Owner**: Acceso total a todo el sistema.
- [ ] **Admin**: Acceso a Dashboard, Pacientes, Caja Recepción, Caja Admin (Gestión). Sin acceso a Configuración de Usuarios (solo Owner).
- [ ] **Reception**: Acceso a Dashboard, Pacientes, Caja Recepción. **Sin acceso** a Caja Admin (ni lectura).
- [ ] **Pricing Manager**: Acceso a Tarifario (si implementado) y Dashboard.
- [ ] **Partner Viewer**: Acceso de SOLO LECTURA a Dashboard, Pacientes, Cajas. No debe poder editar/crear.

## 2. Pruebas de Seguridad (Incógnito)
1. Intentar entrar a `/dashboard` sin login -> Debe redirigir a `/login`.
2. Intentar entrar a `/caja-admin` sin login -> Debe redirigir a `/login`.
3. Loguear con usuario "Recepción":
    - Intentar entrar a `/caja-admin` -> Debe redirigir a `/no-access` o `/dashboard`. (Nota: actualmente el middleware protege autenticación, la protección por rol es Client-Side en `RoleGuard` o Server-Side en Page).
    - Verificar que no ve el botón de "Caja Admin" en el sidebar.

## 3. RLS (Row Level Security)
- Si un usuario "Partner Viewer" intenta hacer una petición POST/UPDATE via API/Console -> Debe recibir 403 Forbidden.
- Los datos de "Caja Admin" solo deben ser visibles para Owner/Admin/Partner.

## 4. Estado de Cuenta
- Si `is_active` se pone en `false` en la DB -> El usuario debe ser deslogueado automáticamente al refrescar.

## Notas Técnicas
- **Middleware**: Gestiona la sesión y protege rutas privadas.
- **RLS**: Protege los datos a nivel base de datos.
- **AuthContext**: Gestiona el estado de la UI y permisos de componentes.
