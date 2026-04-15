-- ─────────────────────────────────────────────────────────────────────────────
-- Agrega soporte de moneda por ítem en tarifario_items.
-- Consultas y prestaciones en pesos pueden cargarse en ARS.
-- El campo precio_base_usd se mantiene para compatibilidad.
-- Creado: 2026-04-07
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tarifario_items
    ADD COLUMN IF NOT EXISTS moneda        TEXT NOT NULL DEFAULT 'USD' CHECK (moneda IN ('USD', 'ARS')),
    ADD COLUMN IF NOT EXISTS precio_base_ars NUMERIC(12, 2);

-- Los ítems existentes ya tienen precio_base_usd → se quedan en USD
-- (No hace falta UPDATE, el DEFAULT 'USD' los cubre)
