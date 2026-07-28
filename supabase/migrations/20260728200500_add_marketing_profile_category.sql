BEGIN;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_categoria_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_categoria_check
  CHECK (categoria IN (
    'owner',
    'admin',
    'reception',
    'recaptacion',
    'odontologo',
    'dentist',
    'asistente',
    'laboratorio',
    'marketing',
    'limpieza',
    'other',
    'developer',
    'partner_viewer',
    'pricing_manager',
    'socio',
    'contador',
    'contadores'
  ));

COMMIT;
