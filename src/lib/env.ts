function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Hiányzó környezeti változó: ${name}. Lásd: .env.example`);
  }
  return value;
}

export const supabaseUrl = () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabaseAnonKey = () =>
  required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
