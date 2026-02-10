-- Enable RLS just in case
ALTER TABLE "public"."caja_admin_arqueos" ENABLE ROW LEVEL SECURITY;

-- Policy for Owner
CREATE POLICY "Owner full access on admin_arqueos"
ON "public"."caja_admin_arqueos"
FOR ALL
TO public
USING (get_my_role() = 'owner')
WITH CHECK (get_my_role() = 'owner');

-- Policy for Admin
CREATE POLICY "Admin full access on admin_arqueos"
ON "public"."caja_admin_arqueos"
FOR ALL
TO public
USING (get_my_role() = 'admin')
WITH CHECK (get_my_role() = 'admin');

-- Policy for Partner Viewer (Read Only)
CREATE POLICY "Partner Viewer read only admin_arqueos"
ON "public"."caja_admin_arqueos"
FOR SELECT
TO public
USING (get_my_role() = 'partner_viewer');
