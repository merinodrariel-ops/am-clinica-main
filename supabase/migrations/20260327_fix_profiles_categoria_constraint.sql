-- Fix profiles_role_check constraint to include all valid categories
-- MISSING: odontologo, asistente, developer, partner_viewer, recaptacion

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (categoria IN (
    'owner',
    'admin',
    'reception',
    'recaptacion',
    'odontologo',
    'asistente',
    'laboratorio',
    'developer',
    'partner_viewer'
  ));

-- Fix profiles_estado_check to include 'invitado' and allow soft-delete state
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_estado_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_estado_check
  CHECK (estado IN ('activo', 'invitado', 'inactivo'));

-- Sync profiles.categoria from personal for desynchronized users
-- Added more mappings for flexible inputs
UPDATE profiles p
SET categoria = CASE
  WHEN LOWER(per.categoria) IN ('dentist', 'odontóloga', 'odontologo', 'odontólogo', 'dentista') THEN 'odontologo'
  WHEN LOWER(per.categoria) IN ('asistente', 'asistente dental', 'asistente clínico') THEN 'asistente'
  WHEN LOWER(per.categoria) IN ('laboratorio', 'técnico', 'tecnico') THEN 'laboratorio'
  WHEN LOWER(per.categoria) IN ('reception', 'recepcion', 'recepción', 'admin-recepcion') THEN 'reception'
  WHEN LOWER(per.categoria) IN ('admin', 'administrador', 'administradora', 'administracion', 'gestión') THEN 'admin'
  ELSE p.categoria
END
FROM personal per
WHERE per.user_id = p.id
  AND LOWER(per.categoria) != LOWER(p.categoria)
  AND per.user_id IS NOT NULL;

-- Verify results
SELECT p.full_name, p.categoria as profiles_cat, per.categoria as personal_cat
FROM profiles p
JOIN personal per ON per.user_id = p.id
WHERE LOWER(per.categoria) != LOWER(p.categoria);
