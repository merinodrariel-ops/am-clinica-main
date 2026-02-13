-- Inventory Products MVP
-- PR1: products + stock movements + storage bucket + RLS

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'stock_movement_type'
    ) THEN
        CREATE TYPE public.stock_movement_type AS ENUM ('IN', 'OUT', 'ADJUST');
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    brand TEXT,
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    barcode TEXT UNIQUE,
    qr_code TEXT UNIQUE,
    image_thumb_url TEXT,
    image_full_url TEXT,
    notes TEXT,
    stock_current NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (stock_current >= 0),
    threshold_min NUMERIC(12,2),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    type public.stock_movement_type NOT NULL,
    qty NUMERIC(12,2) NOT NULL CHECK (qty > 0),
    note TEXT,
    device_info JSONB DEFAULT '{}'::jsonb,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_qr_code ON public.products(qr_code);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_date ON public.stock_movements(product_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.products_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    NEW.updated_by := auth.uid();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_products_set_updated_at ON public.products;
CREATE TRIGGER trg_products_set_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.products_set_updated_at();

CREATE OR REPLACE FUNCTION public.apply_stock_movement_to_product()
RETURNS TRIGGER AS $$
DECLARE
    current_stock NUMERIC(12,2);
BEGIN
    SELECT stock_current
    INTO current_stock
    FROM public.products
    WHERE id = NEW.product_id
    FOR UPDATE;

    IF current_stock IS NULL THEN
        RAISE EXCEPTION 'Producto no encontrado para movimiento %', NEW.product_id;
    END IF;

    IF NEW.type = 'IN' THEN
        UPDATE public.products
        SET stock_current = current_stock + NEW.qty
        WHERE id = NEW.product_id;
    ELSIF NEW.type = 'OUT' THEN
        IF current_stock - NEW.qty < 0 THEN
            RAISE EXCEPTION 'Stock insuficiente. Actual: %, solicitado: %', current_stock, NEW.qty;
        END IF;

        UPDATE public.products
        SET stock_current = current_stock - NEW.qty
        WHERE id = NEW.product_id;
    ELSE
        -- ADJUST = conteo fisico final
        UPDATE public.products
        SET stock_current = NEW.qty
        WHERE id = NEW.product_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_apply_stock_movement_to_product ON public.stock_movements;
CREATE TRIGGER trg_apply_stock_movement_to_product
    AFTER INSERT ON public.stock_movements
    FOR EACH ROW
    EXECUTE FUNCTION public.apply_stock_movement_to_product();

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select_authenticated" ON public.products;
CREATE POLICY "products_select_authenticated"
ON public.products
FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "products_insert_admin_owner" ON public.products;
CREATE POLICY "products_insert_admin_owner"
ON public.products
FOR INSERT
WITH CHECK (public.get_my_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "products_update_admin_owner" ON public.products;
CREATE POLICY "products_update_admin_owner"
ON public.products
FOR UPDATE
USING (public.get_my_role() IN ('owner', 'admin'))
WITH CHECK (public.get_my_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "stock_movements_select_authenticated" ON public.stock_movements;
CREATE POLICY "stock_movements_select_authenticated"
ON public.stock_movements
FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "stock_movements_insert_staff_admin" ON public.stock_movements;
CREATE POLICY "stock_movements_insert_staff_admin"
ON public.stock_movements
FOR INSERT
WITH CHECK (
    created_by = auth.uid()
    AND public.get_my_role() IN ('owner', 'admin', 'reception', 'laboratorio', 'developer')
    AND EXISTS (
        SELECT 1
        FROM public.products p
        WHERE p.id = product_id
          AND p.is_active = true
    )
);

-- No UPDATE/DELETE policies on stock_movements = append-only

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'inventory-products',
    'inventory-products',
    true,
    5242880,
    ARRAY['image/webp', 'image/avif', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "inventory_products_read_public" ON storage.objects;
CREATE POLICY "inventory_products_read_public"
ON storage.objects
FOR SELECT
USING (bucket_id = 'inventory-products');

DROP POLICY IF EXISTS "inventory_products_write_admin_owner" ON storage.objects;
CREATE POLICY "inventory_products_write_admin_owner"
ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'inventory-products'
    AND public.get_my_role() IN ('owner', 'admin')
);

DROP POLICY IF EXISTS "inventory_products_update_admin_owner" ON storage.objects;
CREATE POLICY "inventory_products_update_admin_owner"
ON storage.objects
FOR UPDATE
USING (
    bucket_id = 'inventory-products'
    AND public.get_my_role() IN ('owner', 'admin')
)
WITH CHECK (
    bucket_id = 'inventory-products'
    AND public.get_my_role() IN ('owner', 'admin')
);

DROP POLICY IF EXISTS "inventory_products_delete_admin_owner" ON storage.objects;
CREATE POLICY "inventory_products_delete_admin_owner"
ON storage.objects
FOR DELETE
USING (
    bucket_id = 'inventory-products'
    AND public.get_my_role() IN ('owner', 'admin')
);
