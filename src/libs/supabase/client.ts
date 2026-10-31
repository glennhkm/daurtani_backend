import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(
  process.env.SUPABASE_PROJECT_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export const createScopedSupabaseClient = () =>
  createClient(
    process.env.SUPABASE_PROJECT_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );

export default supabase;
