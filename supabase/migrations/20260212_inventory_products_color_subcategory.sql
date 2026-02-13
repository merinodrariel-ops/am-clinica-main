-- Inventory products: optional color subcategory

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS color TEXT;

CREATE INDEX IF NOT EXISTS idx_products_color
ON public.products(LOWER(color));
