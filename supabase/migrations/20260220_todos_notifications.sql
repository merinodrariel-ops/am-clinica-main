-- ─── 1. Add assigned_to_id to todos ─────────────────────────────────────────
ALTER TABLE todos
  ADD COLUMN IF NOT EXISTS assigned_to_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_todos_assigned_to_id ON todos(assigned_to_id);

-- ─── 2. push_subscriptions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Each user manages their own subscriptions only
CREATE POLICY "users_own_push_subs" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- Service role can read all (for sending notifications)
CREATE POLICY "service_role_read_push_subs" ON push_subscriptions
  FOR SELECT USING (auth.role() = 'service_role');
