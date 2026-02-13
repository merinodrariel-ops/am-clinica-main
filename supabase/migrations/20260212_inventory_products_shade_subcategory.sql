-- Inventory products: optional dental shade subcategory (A1, A2, etc)

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS shade TEXT;

CREATE INDEX IF NOT EXISTS idx_products_shade
ON public.products(LOWER(shade));
