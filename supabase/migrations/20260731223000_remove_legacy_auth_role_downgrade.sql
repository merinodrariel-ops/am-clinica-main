-- The legacy robust auth sync trigger remained active alongside the newer
-- metadata sync trigger. Its role allowlist predates `marketing`, so every
-- Marketing login downgraded profiles.categoria to `reception`.

BEGIN;

DROP TRIGGER IF EXISTS on_auth_user_sync_robust ON auth.users;

COMMIT;
