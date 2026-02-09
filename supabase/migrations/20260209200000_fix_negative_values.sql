-- Flip negative values to positive in lines
UPDATE caja_admin_movimiento_lineas
SET 
  importe = ABS(importe),
  usd_equivalente = ABS(usd_equivalente)
WHERE importe < 0;

-- Recalculate usd_equivalente_total for affected movements
-- We can just run this for ALL movements to be safe and consistent, or just affected ones.
-- Let's specificially target ones where sum of lines != header total, or just all.
-- Safer to just update the ones we touched? Or better, update all references.

WITH computed_totals AS (
  SELECT admin_movimiento_id, SUM(usd_equivalente) as true_total
  FROM caja_admin_movimiento_lineas
  GROUP BY admin_movimiento_id
)
UPDATE caja_admin_movimientos m
SET usd_equivalente_total = ct.true_total
FROM computed_totals ct
WHERE m.id = ct.admin_movimiento_id
AND m.usd_equivalente_total != ct.true_total;
