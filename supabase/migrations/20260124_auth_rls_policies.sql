-- RLS POLICIES MIGRATION

-- 1. PROFILES POLICIES
-- Everyone can read their own profile
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

-- Owner can view/edit all profiles
CREATE POLICY "Owner can manage all profiles" ON public.profiles USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'owner'
);

-- 2. OPERATIONAL TABLES (Pacientes, Caja, etc.)
-- First, ensure RLS is enabled on all target tables
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caja_recepcion_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caja_admin_movimientos ENABLE ROW LEVEL SECURITY;
-- Add others as needed: tarifario_versiones, tarifario_items, etc.

-- POLICY: Owner has full access to everything
CREATE POLICY "Owner full access on pacientes" ON public.pacientes FOR ALL USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'owner'
);
CREATE POLICY "Owner full access on caja_recepcion" ON public.caja_recepcion_movimientos FOR ALL USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'owner'
);
CREATE POLICY "Owner full access on caja_admin" ON public.caja_admin_movimientos FOR ALL USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'owner'
);

-- POLICY: Partner Viewer (Read Only)
CREATE POLICY "Partner Viewer read only pacientes" ON public.pacientes FOR SELECT USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'partner_viewer'
);
CREATE POLICY "Partner Viewer read only caja_recepcion" ON public.caja_recepcion_movimientos FOR SELECT USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'partner_viewer'
);
CREATE POLICY "Partner Viewer read only caja_admin" ON public.caja_admin_movimientos FOR SELECT USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'partner_viewer'
);

-- POLICY: Reception (Pacientes, Tunros, Caja Recepción)
CREATE POLICY "Reception manage pacientes" ON public.pacientes USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('reception', 'admin')
);
CREATE POLICY "Reception manage caja_recepcion" ON public.caja_recepcion_movimientos USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('reception', 'admin')
);

-- POLICY: Admin (Everything except User Management, which is handled via profiles)
CREATE POLICY "Admin full access on caja_admin" ON public.caja_admin_movimientos USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);
-- Admin inherits Reception permissions via the IN clause above


-- 3. AUDIT LOGS TRIGGER ASSOCIATION
-- Attach audit trigger to tables (after creating the trigger function previously)
DROP TRIGGER IF EXISTS audit_pacientes ON public.pacientes;
CREATE TRIGGER audit_pacientes
AFTER INSERT OR UPDATE OR DELETE ON public.pacientes
FOR EACH ROW EXECUTE PROCEDURE public.log_audit_event();

DROP TRIGGER IF EXISTS audit_caja_recepcion ON public.caja_recepcion_movimientos;
CREATE TRIGGER audit_caja_recepcion
AFTER INSERT OR UPDATE OR DELETE ON public.caja_recepcion_movimientos
FOR EACH ROW EXECUTE PROCEDURE public.log_audit_event();

DROP TRIGGER IF EXISTS audit_caja_admin ON public.caja_admin_movimientos;
CREATE TRIGGER audit_caja_admin
AFTER INSERT OR UPDATE OR DELETE ON public.caja_admin_movimientos
FOR EACH ROW EXECUTE PROCEDURE public.log_audit_event();
