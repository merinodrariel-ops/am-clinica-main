-- Add operational role: recaptacion

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check CHECK (role IN (
        'owner',
        'admin',
        'reception',
        'developer',
        'pricing_manager',
        'partner_viewer',
        'laboratorio',
        'asistente',
        'odontologo',
        'recaptacion'
    ));
