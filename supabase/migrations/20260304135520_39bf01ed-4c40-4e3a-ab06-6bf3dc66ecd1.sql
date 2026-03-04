
-- Profile type enum
CREATE TYPE public.profile_type AS ENUM ('personal', 'professional');

-- Jarvis profiles table (instructions + user info per profile type)
CREATE TABLE public.jarvis_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_type profile_type NOT NULL DEFAULT 'personal',
  is_active BOOLEAN NOT NULL DEFAULT false,
  instructions TEXT NOT NULL DEFAULT '',
  user_name TEXT DEFAULT '',
  user_profession TEXT DEFAULT '',
  user_preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, profile_type)
);

-- Jarvis memories table
CREATE TABLE public.jarvis_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.jarvis_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_memories ENABLE ROW LEVEL SECURITY;

-- RLS for jarvis_profiles
CREATE POLICY "Users can view own profiles" ON public.jarvis_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profiles" ON public.jarvis_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profiles" ON public.jarvis_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own profiles" ON public.jarvis_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS for jarvis_memories
CREATE POLICY "Users can view own memories" ON public.jarvis_memories FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own memories" ON public.jarvis_memories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own memories" ON public.jarvis_memories FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own memories" ON public.jarvis_memories FOR DELETE TO authenticated USING (auth.uid() = user_id);
