-- ============================================================
-- Integridad de financiacion: un unico plan activo por paciente
-- ============================================================
-- Regla de negocio (docs/financing-data-integrity.md):
-- AM Clinica no ofrece doble plan de financiacion activo para un mismo
-- paciente. La combinacion (paciente_id, estado = 'En curso') debe existir
-- como maximo una vez. Los duplicados inflan la deuda mensual y total del
-- dashboard del dueno (caso Mugetti: deuda duplicada de USD 5.000).
--
-- Esta migracion agrega DOS guardas a nivel de base de datos:
--   1. Un trigger que rechaza cualquier insert/update que deje a un paciente
--      con mas de un plan 'En curso'. Es deployable siempre, incluso si hoy
--      existen duplicados (solo bloquea NUEVOS duplicados).
--   2. Un indice unico parcial como garantia definitiva. Solo se crea si los
--      datos actuales ya estan limpios; si hay duplicados, avisa por WARNING
--      y no rompe el deploy (la politica del negocio prohibe borrar planes
--      o cobros en silencio: los duplicados existentes se reconcilian a mano).
-- ============================================================

-- Indice de apoyo para la verificacion (idempotente)
CREATE INDEX IF NOT EXISTS planes_financiacion_paciente_estado_idx
    ON public.planes_financiacion (paciente_id, estado);

-- ------------------------------------------------------------
-- 1. Trigger: impedir un segundo plan 'En curso' por paciente
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_financing()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.paciente_id IS NOT NULL AND NEW.estado = 'En curso' THEN
        IF EXISTS (
            SELECT 1
            FROM public.planes_financiacion p
            WHERE p.paciente_id = NEW.paciente_id
              AND p.estado = 'En curso'
              AND p.id <> NEW.id
        ) THEN
            RAISE EXCEPTION
                'El paciente % ya tiene un plan de financiacion activo (En curso). No se permiten planes activos duplicados.',
                NEW.paciente_id
                USING ERRCODE = 'unique_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_active_financing ON public.planes_financiacion;
CREATE TRIGGER trg_prevent_duplicate_active_financing
    BEFORE INSERT OR UPDATE OF paciente_id, estado
    ON public.planes_financiacion
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_duplicate_active_financing();

-- ------------------------------------------------------------
-- 2. Indice unico parcial (best-effort: no rompe si hay duplicados)
-- ------------------------------------------------------------
DO $$
DECLARE
    duplicados INTEGER;
BEGIN
    SELECT COUNT(*) INTO duplicados
    FROM (
        SELECT paciente_id
        FROM public.planes_financiacion
        WHERE estado = 'En curso' AND paciente_id IS NOT NULL
        GROUP BY paciente_id
        HAVING COUNT(*) > 1
    ) d;

    IF duplicados > 0 THEN
        RAISE WARNING
            'Existen % paciente(s) con planes activos duplicados. El TRIGGER quedo activo para bloquear nuevos duplicados, pero el indice unico NO se creo. Reconcilia los existentes (docs/financing-data-integrity.md) y re-ejecuta esta migracion.',
            duplicados;
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS planes_financiacion_unico_activo_por_paciente
            ON public.planes_financiacion (paciente_id)
            WHERE estado = 'En curso' AND paciente_id IS NOT NULL;
    END IF;
END;
$$;

-- ------------------------------------------------------------
-- Diagnostico: encontrar duplicados a reconciliar
-- ------------------------------------------------------------
-- SELECT paciente_id, COUNT(*) AS planes_activos,
--        array_agg(id) AS plan_ids,
--        array_agg(saldo_restante_usd) AS saldos
-- FROM public.planes_financiacion
-- WHERE estado = 'En curso' AND paciente_id IS NOT NULL
-- GROUP BY paciente_id
-- HAVING COUNT(*) > 1;
