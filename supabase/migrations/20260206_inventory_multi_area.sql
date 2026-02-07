-- Add area column to inventario_items
ALTER TABLE public.inventario_items 
    ADD COLUMN IF NOT EXISTS area TEXT DEFAULT 'CLINICA' 
    CHECK (area IN ('CLINICA', 'LABORATORIO'));

-- Update existing items if needed (they default to CLINICA already)
-- Optional: if some items are known to be laboratory, we could try to guess, 
-- but better let the user categorize them or use categories.

-- Add index for area
CREATE INDEX IF NOT EXISTS idx_inventario_items_area ON public.inventario_items(area);
