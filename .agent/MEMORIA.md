# Memoria del Proyecto - AM Clínica

## REGLA DE ORO DE TURNOS
**Si un turno ha pasado su horario de fin (`end_time < now`) y su estado NO es `cancelled` ni `no_show`, el turno se considera COMPLETADO automáticamente.**

### Implementación en el Código:
1. **Agenda (`app/actions/agenda.ts`)**: Se aplica un "Virtual Status" en el fetcher (`getAppointments`) para que la interfaz siempre refleje el estado real sin esperar actualizaciones de base de datos.
2. **Dashboard (`app/actions/dashboard.ts`)**: Se ejecuta un proceso JIT (Just-In-Time) llamando al RPC `sync_primera_consulta_dates` antes de calcular estadísticas. Esto garantiza que los nuevos pacientes figuren en los gráficos inmediatamente después de su turno.
3. **Cron Job (`app/api/cron/daily-retention/route.ts`)**: Realiza la limpieza en base de datos de forma periódica.

### Memoria de Agentes:
Esta regla es NO NEGOCIABLE. Cualquier cambio en la lógica de turnos, dashboards o reportes debe respetar este comportamiento de autocompletado por tiempo.
