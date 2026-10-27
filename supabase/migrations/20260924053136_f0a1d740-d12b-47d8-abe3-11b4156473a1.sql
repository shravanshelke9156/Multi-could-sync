
CREATE TYPE public.cloud_provider AS ENUM ('aws_s3','google_drive','azure_blob');
CREATE TYPE public.sync_status AS ENUM ('PENDING','SYNCING','SYNCHRONIZED','PARTIAL','FAILED','CONFLICT');
CREATE TYPE public.provider_sim_state AS ENUM ('AVAILABLE','UNAVAILABLE','SLOW','UPLOAD_FAILURE');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT NOT NULL DEFAULT 0,
  current_hash TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  overall_status public.sync_status NOT NULL DEFAULT 'PENDING',
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.files TO authenticated;
GRANT ALL ON public.files TO service_role;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own files" ON public.files FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX files_user_idx ON public.files(user_id);

CREATE TABLE public.file_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES public.files ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  hash TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (file_id, version_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_versions TO authenticated;
GRANT ALL ON public.file_versions TO service_role;
ALTER TABLE public.file_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own versions" ON public.file_versions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.cloud_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES public.files ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  provider public.cloud_provider NOT NULL,
  cloud_file_id TEXT,
  hash TEXT,
  status public.sync_status NOT NULL DEFAULT 'PENDING',
  last_synced TIMESTAMPTZ,
  UNIQUE (file_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cloud_files TO authenticated;
GRANT ALL ON public.cloud_files TO service_role;
ALTER TABLE public.cloud_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cloud files" ON public.cloud_files FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  file_id UUID REFERENCES public.files ON DELETE CASCADE,
  filename TEXT,
  provider public.cloud_provider,
  operation TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_logs TO authenticated;
GRANT ALL ON public.sync_logs TO service_role;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own logs" ON public.sync_logs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX sync_logs_user_idx ON public.sync_logs(user_id, created_at DESC);

CREATE TABLE public.cloud_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  provider public.cloud_provider NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  sim_state public.provider_sim_state NOT NULL DEFAULT 'AVAILABLE',
  last_checked TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cloud_config TO authenticated;
GRANT ALL ON public.cloud_config TO service_role;
ALTER TABLE public.cloud_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cloud config" ON public.cloud_config FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER files_updated_at BEFORE UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.cloud_config (user_id, provider)
  VALUES (NEW.id,'aws_s3'), (NEW.id,'google_drive'), (NEW.id,'azure_blob')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "own file objects" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'user-files' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'user-files' AND auth.uid()::text = (storage.foldername(name))[1]);
