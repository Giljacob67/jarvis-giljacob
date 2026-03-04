
CREATE TABLE public.automations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  webhook_url TEXT NOT NULL,
  last_triggered_at TIMESTAMP WITH TIME ZONE,
  last_status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own automations" ON public.automations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own automations" ON public.automations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own automations" ON public.automations FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own automations" ON public.automations FOR DELETE TO authenticated USING (auth.uid() = user_id);
