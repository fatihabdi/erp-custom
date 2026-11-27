import { getCurrentUser } from "@/lib/auth";
import { searchAll } from "@/lib/search";

export const runtime = "nodejs";

// Pencarian global: /api/cari?q=kata
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Belum masuk." }, { status: 401 });
  const groups = await searchAll(user, new URL(request.url).searchParams.get("q") ?? "");
  return Response.json({ groups }, { headers: { "Cache-Control": "private, no-store" } });
}
