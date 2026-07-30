# AM Clínica — Instrucciones para Claude Code

Estas instrucciones aplican únicamente a `am-clinica-main`.

## Objetivo

Mantener la aplicación clínica de producción con cambios pequeños, verificables y sin regresiones. El código y los datos actuales son la fuente de verdad; este archivo no debe almacenar cifras, campañas, feriados ni estados operativos que puedan quedar viejos.

## Forma de trabajo

- Leer el flujo real y los archivos involucrados antes de editar.
- Revisar `git status`, la rama actual y los cambios recientes del módulo afectado.
- Preservar cambios ajenos o no relacionados. No revertirlos ni incluirlos en el commit.
- Si `origin/main` avanzó, comparar los cambios antes de integrar. No sobrescribir trabajo reciente.
- Implementar el cambio coherente más pequeño que resuelva el comportamiento visible.
- No imponer arquitecturas nuevas, event sourcing, TDD mock-first, swarms ni límites arbitrarios de líneas si el proyecto no los usa.
- Delegar o paralelizar sólo cuando existan subtareas independientes y el beneficio sea concreto.
- No crear documentación, archivos auxiliares o dependencias salvo que la tarea los necesite.

## Producción

- Los cambios visibles para usuarios deben terminar publicados, salvo que el usuario pida explícitamente trabajo local.
- Antes de informar que algo quedó listo: ejecutar las pruebas relevantes, compilar, revisar el diff, hacer commit y push, esperar Vercel `Ready` y comprobar la ruta real cuando sea posible.
- Distinguir claramente entre: verificado localmente, publicado y verificado visualmente en producción.
- No anunciar éxito si la comprobación final no reprodujo el flujo exacto informado por el usuario.

## Seguridad y datos clínicos

- Tratar pacientes, agenda, personal, pagos, liquidaciones y accesos como información sensible.
- Nunca registrar, copiar a documentación ni commitear secretos, credenciales, tokens o archivos `.env`.
- Validar entradas en los límites del sistema y respetar las políticas RLS/autorización existentes.
- No borrar, reemplazar o migrar información clínica sin confirmar el alcance exacto y realizar primero comprobaciones de sólo lectura.

## Reglas técnicas

- Seguir la arquitectura y las convenciones existentes del módulo afectado.
- Usar interfaces tipadas en contratos públicos y validar errores de acciones/API.
- Para fechas operativas usar `America/Argentina/Buenos_Aires`.
- Para nómina y recargos, usar `lib/payroll-rules.ts` como fuente de verdad; no duplicar tarifas, multiplicadores o calendarios en este archivo.
- Para fotos y Drive, preservar originales y documentos editables; una exportación JPG/PNG no sustituye el proyecto editable.

## Verificación

Elegir controles proporcionales al riesgo:

```bash
npm run build
npm test
npx eslint <archivo-modificado>
```

Para cambios visuales, además comprobar la ruta afectada en producción. Para Supabase, agenda, permisos o datos, validar también la consulta o acción real y sus supuestos de autorización.

## Flujos especializados

Las instrucciones específicas están en `.agents/skills/`:

- `am-production-change`
- `am-product-capability`
- `am-verification-loop`
- `am-agenda-rules`
- `am-supabase-safety`

Usar solamente las que correspondan a la tarea actual.
