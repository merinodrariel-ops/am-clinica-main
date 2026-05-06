# Reglas de Liquidación y Pago de Personal

Este documento detalla las reglas de negocio aplicadas al sistema de liquidación de haberes para el personal administrativo, asistentes y recepción.

## 1. Valores de Referencia
- **Valor Hora Base**: $7,160 ARS (Estandarizado para Administrativos, Asistentes y Recepción).

## 2. Multiplicadores por Jornada
Para incentivar la cobertura en días especiales, se aplican los siguientes multiplicadores automáticos:

| Día / Condición | Multiplicador | Descripción |
| :--- | :--- | :--- |
| **Día Hábil (Lun-Vie)** | 1.0x | Tarifa estándar. |
| **Sábados** | 1.5x | 50% de recargo sobre la hora base. |
| **Domingos** | 2.0x | 100% de recargo (pago doble). |
| **Feriados Nacionales** | 2.0x | 100% de recargo (pago doble). |

## 3. Excepciones
- **Personal de Laboratorio**: Queda excluido de estos multiplicadores automáticos. Siempre se liquida a tarifa 1.0x (arreglo aparte).
- **Odontólogos / Profesionales**: Se liquidan por prestación realizada (modelo USD), no por horas.

## 4. Calendario de Feriados (2026)
El sistema reconoce automáticamente los siguientes días como feriados (pago doble):
- 1 de enero (Año Nuevo)
- 1 de mayo (Día del Trabajador)
- 25 de mayo (Revolución de Mayo)
- 17 de junio (Paso a la Inmortalidad de Güemes)
- 20 de junio (Paso a la Inmortalidad de Belgrano)
- 9 de julio (Día de la Independencia)
- 17 de agosto (San Martín)
- 12 de octubre (Diversidad Cultural)
- 20 de noviembre (Soberanía Nacional)
- 8 de diciembre (Inmaculada Concepción)
- 25 de diciembre (Navidad)

## 5. Implementación Técnica
Las reglas están centralizadas en `lib/payroll-rules.ts`. Cualquier cambio en los valores o fechas debe realizarse en ese archivo para que se refleje en:
- Dashboard administrativo (Caja Admin).
- Vista Comandante (Proyecciones).
- Portal del Trabajador (Monto estimado).
- Reportes PDF y Excel/CSV.

---
*Última actualización: 5 de mayo de 2026*
