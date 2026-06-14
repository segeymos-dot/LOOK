export function isDemoMode(): boolean {
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true") return true;
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === "false") return false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return !url || !key || url.includes("your-project");
}
