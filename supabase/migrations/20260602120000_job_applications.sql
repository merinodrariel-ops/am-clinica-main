create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  area text not null,
  other_area text,
  experience text not null,
  area_responsibilities text not null,
  instagram_url text not null,
  email text not null,
  location text not null,
  teamwork_answer text not null,
  learning_interest text not null,
  long_term_goals text not null,
  team_contribution text not null,
  why_choose_you text not null,
  cv_storage_path text not null,
  cv_original_filename text not null,
  cv_mime_type text not null,
  cv_size_bytes integer not null,
  status text not null default 'nuevo',
  review_notes text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  source text not null default 'web_public',
  ip_hash text,
  user_agent_hash text,
  constraint job_applications_status_check check (
    status in ('nuevo', 'preseleccionado', 'entrevista', 'descartado', 'contratado')
  ),
  constraint job_applications_cv_size_check check (
    cv_size_bytes > 0 and cv_size_bytes <= 10485760
  )
);

alter table public.job_applications enable row level security;

create index if not exists job_applications_created_at_idx
  on public.job_applications (created_at desc);

create index if not exists job_applications_status_idx
  on public.job_applications (status);

create index if not exists job_applications_area_idx
  on public.job_applications (area);

create index if not exists job_applications_email_idx
  on public.job_applications (lower(email));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-applications',
  'job-applications',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
