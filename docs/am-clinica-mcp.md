# AM Clinica MCP

MCP server for controlled access to AM Clinica patients and agenda from agents such as Hermes.

## Run

```bash
npm run mcp:am-clinica
```

Required environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Use the service role only inside the MCP process. Do not give it to Hermes or any other agent.

## Tools

- `am_search_patients`: searches active patients by name, document, email, or WhatsApp.
- `am_get_patient_summary`: returns operational patient data and upcoming appointments.
- `am_get_patient_appointments`: lists patient appointments.
- `am_list_doctors`: lists active doctors/professionals.
- `am_get_agenda`: reads agenda in an ISO datetime range.
- `am_find_available_slots`: checks `doctor_schedules`, appointments, and blocks.
- `am_create_appointment`: creates a real appointment immediately after validation.

`am_create_appointment` writes to `agenda_appointments` with `source = 'mcp'` and rejects conflicts with active appointments or agenda blocks.

## Hermes configuration

Add this MCP server as a stdio command from the project directory:

```json
{
  "mcpServers": {
    "am-clinica": {
      "command": "npm",
      "args": ["run", "--silent", "mcp:am-clinica"],
      "cwd": "/path/to/am-clinica-main"
    }
  }
}
```

For the VPS/Hermes install, use the real deployed path and ensure the same environment variables are available to the process.
