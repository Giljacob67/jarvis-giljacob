
-- execution_plans table
CREATE TABLE public.execution_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.execution_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plans" ON public.execution_plans FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own plans" ON public.execution_plans FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own plans" ON public.execution_plans FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own plans" ON public.execution_plans FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- execution_steps table
CREATE TABLE public.execution_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.execution_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  step_index integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  tool_name text,
  tool_args jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  result text,
  requires_confirmation boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.execution_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own steps" ON public.execution_steps FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own steps" ON public.execution_steps FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own steps" ON public.execution_steps FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own steps" ON public.execution_steps FOR DELETE TO authenticated USING (auth.uid() = user_id);
