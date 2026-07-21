# Admin Agent CLI Design

## Capability

Create a read-only administrative CLI for AM Clinica so owner/admin operators can ask broad operational questions without exposing the Supabase service role to chat, browser code, or regular staff accounts.

## Surfaces

- `scripts/am-admin-agent.ts`: local CLI entrypoint.
- `lib/admin-agent/`: reusable command router, formatter, authorization, and Supabase-backed tools.
- `package.json`: npm script for the CLI.

## Access Model

- Allowed operator categories: `owner`, `admin`, `developer`.
- The CLI requires an explicit `AM_AGENT_OPERATOR_EMAIL` environment variable.
- The CLI verifies that email against `profiles.categoria` before returning sensitive data.
- The CLI uses `SUPABASE_SERVICE_ROLE_KEY` only inside the local/server process.

## Initial Commands

- `overview`: high-level read-only business snapshot.
- `patient <query>`: patient search with limited identifiers.
- `agenda [today|week]`: appointment snapshot.
- `cash [YYYY-MM]`: reception/admin cash movement summary.
- `emails [days]`: outbound email/log summary.

## Invariants

- No direct SQL prompt or arbitrary table query in the first version.
- No writes or mutations.
- No service-role key in UI, logs, chat output, or docs.
- Output must summarize sensitive rows instead of dumping entire records.

## Non-goals

- Replacing the existing MCP immediately.
- Giving all staff a global assistant.
- Creating a browser chat UI in this pass.
- Letting the model execute unrestricted SQL.

## Verification

- Unit tests for command parsing, role authorization, date windows, formatting, and aggregation.
- Type/lint checks for new files.
- Optional live read-only smoke test only when local Supabase env is configured.
