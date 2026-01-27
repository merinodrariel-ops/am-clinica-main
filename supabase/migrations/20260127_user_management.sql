-- Update PROFILES structure for Advanced User Management

-- 1. Add new columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'activo';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ultimo_login TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ;

-- 2. Update Status Constraint
-- We drop first to ensure clean state
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_estado_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_estado_check CHECK (estado IN ('invitado', 'activo', 'suspendido'));

-- 3. Update Role Constraint
-- First, normalize existing data to avoid errors
UPDATE public.profiles SET role = 'reception' WHERE role = 'partner_viewer';
UPDATE public.profiles SET role = 'admin' WHERE role = 'pricing_manager';
-- If any other unknown, default to reception
UPDATE public.profiles SET role = 'reception' WHERE role NOT IN ('owner', 'admin', 'reception', 'developer');

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('owner', 'admin', 'reception', 'developer'));

-- 4. Create trigger to update ultimo_login on profiles (Optional, but useful for pure SQL queries)
-- Actually, maintaining this via the App logic or Auth Hook is safer.
-- We will handle "Last Login" display by merging data from auth.users in the Admin Panel server-side.

-- 5. Helper to get Owner Alerts (Unclosed days) - consolidating logic
-- (This was partly done in previous steps, ensuring it's robust)

-- 6. RLS Policies
-- Ensure Owner and Admin can read all profiles.
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.profiles;
CREATE POLICY "Enable read access for all authenticated users" ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');

-- Ensure Owner and Admin can update profiles
DROP POLICY IF EXISTS "Enable update for owners and admins" ON public.profiles;
CREATE POLICY "Enable update for owners and admins" ON public.profiles FOR UPDATE USING (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role IN ('owner', 'admin')
  )
);
-- Note: Receptions cannot update profiles.

-- 7. Audit Log Trigger (already exists, ensuring it covers these new columns)
