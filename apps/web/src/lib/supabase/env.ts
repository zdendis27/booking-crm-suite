export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;

export const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) as string;
