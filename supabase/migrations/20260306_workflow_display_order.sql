-- Add display_order to clinical_workflows for sidebar reordering
ALTER TABLE clinical_workflows
    ADD COLUMN IF NOT EXISTS display_order INTEGER;

-- Populate display_order based on current DB order (treatment first, then recurrent)
WITH ordered AS (
    SELECT id,
           ROW_NUMBER() OVER (
               ORDER BY
                   CASE type WHEN 'treatment' THEN 0 ELSE 1 END,
                   created_at
           ) AS rn
    FROM clinical_workflows
)
UPDATE clinical_workflows
SET display_order = ordered.rn
FROM ordered
WHERE clinical_workflows.id = ordered.id;

-- Make it not-null after populating
ALTER TABLE clinical_workflows
    ALTER COLUMN display_order SET NOT NULL,
    ALTER COLUMN display_order SET DEFAULT 0;
