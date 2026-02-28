-- Drive health monitoring snapshots
create table if not exists public.drive_health_checks (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    source text not null default 'manual-ui',
    summary jsonb not null default '{}'::jsonb,
    samples jsonb not null default '[]'::jsonb
);

create index if not exists drive_health_checks_created_at_idx
    on public.drive_health_checks (created_at desc);
