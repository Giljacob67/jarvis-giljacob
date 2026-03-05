
CREATE TABLE public.operational_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);

ALTER TABLE public.operational_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own context" ON public.operational_context FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own context" ON public.operational_context FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own context" ON public.operational_context FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own context" ON public.operational_context FOR DELETE USING (auth.uid() = user_id);

-- Also add a category column to jarvis_memories for better organization if not already meaningful
-- The existing category column is already there, just ensure it's useful
