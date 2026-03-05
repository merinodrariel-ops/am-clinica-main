-- Move Claudia Hernández to Staff General so she appears in the prestadores list.
-- The PersonalTab hides anyone whose area includes 'administracion' (heuristic).
-- Changing her area to 'Staff General' makes her visible as a prestadora.

UPDATE public.personal
SET
    area       = 'Staff General',
    updated_at = now()
WHERE email = 'claudiahernandezb21@gmail.com';
