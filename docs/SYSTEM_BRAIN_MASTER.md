# 🧠 CEREBRO DEL SISTEMA: AM CLÍNICA DENTAL
**Versión:** 1.0 (Marzo 2026)
**Identidad:** Premium Tech, Minimalismo, Excelencia Estética.

## 1. Visión General
Este sistema es el "Sistema Operativo" de la clínica del Dr. Ariel Merino. Gestiona la admisión, la administración financiera, la documentación clínica y la comunicación con el paciente mediante un ecosistema interconectado de herramientas cloud.

---

## 2. Ecosistema Tecnológico
*   **Frontend/API:** Next.js 15 (App Router) en Vercel.
*   **Base de Datos:** Supabase (PostgreSQL) para persistencia en tiempo real.
*   **Gestión Clínica:** Notion (Bases de datos vinculadas por MCP).
*   **Almacenamiento/Docs:** Google Drive & Google Slides (Automatización vía OAuth2).
*   **Comunicación:** Resend / Nodemailer (Emails Premium).
*   **Sincronización:** Google Sheets.

---

## 3. Lógica de Negocio y Workflows

### A. Flujo de Admisión (The Gateway)
1.  **Captura de Leads:** El paciente inicia el formulario y el sistema guarda los datos básicos instantáneamente en Supabase (`upsertAdmissionLeadAction`).
2.  **Validación de Identidad:** Verifica DNI y Email para evitar duplicados.
3.  **Protocolo de Archivo:** Al completar la admisión (`submitAdmissionAction`):
    *   **Google Drive:** Crea carpeta `APELLIDO, Nombre` dentro de la carpeta raíz de Pacientes.
    *   **Google Slides:** Genera la "Ficha Técnica/Presentación" clonando un template premium y llenándolo con datos del paciente (Nombre, DNI, Motivo de Consulta).
    *   **Google Sheets:** Añade una fila al log histórico de ingresos.
    *   **Supabase:** Almacena los links directos a Drive y Slides en el registro del paciente.
4.  **Bienvenida:** Dispara un email premium automatizado con el portal del paciente.

### B. Gestión Financiera (Multi-Currency Logic)
*   **Pagos Divididos (Split Payments):** El sistema permite cobrar una sola deuda usando múltiples métodos (Efectivo ARS, Transferencia USD, Mercado Pago) simultáneamente.
*   **Recibos Inteligentes:** Genera recibos PDF que detallan cada componente del pago.
*   **Tasa de Cambio:** Fija el valor del USD al día de la transacción para mantener indicadores financieros precisos a final de mes.
*   **Caja:** Maneja dos cajas separadas (ARS y USD) con reportes consolidados.

### C. Estructura de Datos (Supabase)
*   `pacientes`: Perfil clínico, links de Drive, responsable, alertas de salud.
*   `personal`: Gestión de odontólogos y administrativos (Admin, Prestador).
*   `pagos`: Registro granular de cada movimiento de dinero.
*   `todos`: Tareas automáticas (ej: "Primer Diagnóstico" asignado al Dr. Merino tras un alta).

---

## 4. Estructura de Carpetas en Google Drive
El sistema organiza el contenido de la siguiente manera:
*   `RAIZ_PACIENTES/`
    *   `APELLIDO, Nombre/`
        *   `Ficha Presentación (Google Slides)`
        *   `[EXOCAD] APELLIDO, Nombre/`: Para diseños 3D.
            *   `HTML/`: Donde el diseñador sube el visualizador interactivo.
        *   `CONTRATOS/`: PDF de consentimientos firmados.

---

## 5. Configuración y Seguridad
*   **OAuth2 de Usuario:** El sistema usa un `Refresh Token` personal para evitar las cuotas limitadas de las Service Accounts de Google, permitiendo subir archivos pesados sin restricciones.
*   **Variables Críticas:**
    *   `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN`: Llave maestra de acceso.
    *   `GOOGLE_SLIDES_TEMPLATE_FICHA`: ID del diseño premium de 8 slides.
    *   `NEXT_PUBLIC_SITE_URL`: URL de producción para links en emails.

---

## 6. Integración con NotebookLM
Este documento es la "Constitución" del sistema. Al subirlo a NotebookLM junto con la database de pacientes (links de historias), NotebookLM podrá actuar como un consultor estratégico que entiende:
*   Por qué un paciente no tiene carpeta (Falta de variables).
*   Cómo se calcula la liquidación de un prestador.
*   En qué paso del flujo de admisión se encuentra un paciente.

---
*Documento generado por Antigravity para la clínica de Ariel Merino.*
