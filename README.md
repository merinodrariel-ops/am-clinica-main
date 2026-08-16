This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Project Guardrails

- **Seguridad**: [Checklist de Seguridad](SECURITY_CHECKLIST.md)
- **Finanzas**: [Reglas de Liquidación y Pago](docs/payroll_rules.md)
- **Implementación**: [Plan de Implementación Financiera](IMPLEMENTATION_FINANCING.md)
- Before making changes, read `docs/AGENT_GUARDRAILS.md`.
- Project memory file used by agents:
  - `/Users/am/.claude/projects/-Users-am-Downloads-antigravity-apps-am-clinica-main/memory/MEMORY.md`
- Critical rule: use `profiles.categoria` (never `profiles.role`).
- Critical rule: use the correct Supabase client per runtime (client/server/admin).

## Getting Started

Requires Node.js 22 or newer.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Quality checks

```bash
npm run test:unit
npm run test:mcp
npm run typecheck
npm run build
npm run lint:changed -- origin/main
npm run audit:dead-code
npm run audit:secrets
```

`npm run audit:secrets:history` performs the slower full-history audit. Historical findings require credential rotation before any coordinated history rewrite.

Pull requests and pushes to `main` run the same unit, MCP, typecheck, build, changed-file lint, dependency-report, and secret-scan stages in GitHub Actions.

## AI model configuration

Default models are selected per workload in `lib/ai-models.ts`. Each workload can be overridden without editing application code:

- `AI_MODEL_IMPLICIT_HOURS`
- `AI_MODEL_CONTRACT_ASSISTANT`
- `AI_MODEL_SCHEDULE_IMPORT`
- `AI_MODEL_PREDICTIVE_PULSE`
- `AI_MODEL_SMILE_ALIGNMENT`
- `AI_MODEL_SMILE_IMAGE`
- `AI_MODEL_SMILE_VIDEO`
- `AI_MODEL_CLINICAL_CASE_WRITER`
- `AI_MODEL_ADMIN_ASSISTANT`

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
