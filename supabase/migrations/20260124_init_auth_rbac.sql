-- Enable UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create PROFILES table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    full_name TEXT,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'pricing_manager', 'reception', 'partner_viewer', 'developer')) DEFAULT 'partner_viewer',
    branch_id UUID, -- For future use
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Internal notes:
-- Owner: full access
-- Admin: operational access
-- Partner Viewer: read only

-- RLS for profiles (security barrier)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Create AUDIT_LOGS table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    role TEXT,
    action TEXT NOT NULL, -- INSERT, UPDATE, DELETE, SOFT_DELETE
    table_name TEXT NOT NULL,
    record_id TEXT,
    old_data JSONB,
    new_data JSONB,
    metadata JSONB
);

-- RLS for audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. Trigger to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    COALESCE(new.raw_user_meta_data->>'role', 'partner_viewer') -- Default role
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger execution
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. Helper Function: Get Current Role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
DECLARE
  _role TEXT;
BEGIN
  SELECT role INTO _role FROM public.profiles WHERE id = auth.uid();
  RETURN _role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Helper Function: Audit Log
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS TRIGGER AS $$
DECLARE
  _user_id UUID;
  _role TEXT;
  _email TEXT;
  _old_data JSONB;
  _new_data JSONB;
BEGIN
  _user_id := auth.uid();
  
  -- Attempt to get user info, fail gracefully if system action
  BEGIN
    SELECT role, email INTO _role, _email FROM public.profiles WHERE id = _user_id;
  EXCEPTION WHEN OTHERS THEN
    _role := 'system';
    _email := 'system';
  END;

  IF (TG_OP = 'DELETE') THEN
    _old_data := to_jsonb(OLD);
    _new_data := null;
  ELSIF (TG_OP = 'INSERT') THEN
    _old_data := null;
    _new_data := to_jsonb(NEW);
  ELSE -- UPDATE
    _old_data := to_jsonb(OLD);
    _new_data := to_jsonb(NEW);
  END IF;

  INSERT INTO public.audit_logs (
    user_id, user_email, role, action, table_name, record_id, old_data, new_data
  )
  VALUES (
    _user_id,
    _email,
    _role,
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id::text, OLD.id::text), -- Assuming 'id' column exists
    _old_data,
    _new_data
  );
  
  RETURN NULL; -- Trigger result mostly ignored for AFTER triggers
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Add Soft Delete Columns to existing tables (Idempotent)
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('pacientes', 'caja_recepcion_movimientos', 'caja_admin_movimientos') 
    LOOP
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false', t);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', t);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_by UUID', t);
    END LOOP;
END $$;
