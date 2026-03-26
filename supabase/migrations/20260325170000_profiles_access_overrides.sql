-- Migration: Add per-user module access overrides to profiles table.
-- Values per key: 'inherit' | 'read' | 'edit' | 'none'
-- NULL means "inherit everything from categoria" (the default).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS access_overrides JSONB DEFAULT NULL;

COMMENT ON COLUMN profiles.access_overrides IS
  'Per-user module access overrides. Keys: module key (agenda, patients, caja_recepcion, etc). Values: inherit|read|edit|none. NULL = inherit all from categoria.';
