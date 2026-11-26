import { getCurrentUser } from "@/lib/auth";
import { can, type Action, type ModuleName } from "@/lib/permissions";

/** Untuk route handler: kembalikan pengguna, atau Response 401/403 (tanpa redirect). */
export async function apiUser(module: ModuleName, action: Action) {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "Belum masuk." }, { status: 401 }) };
  if (!can(user.role, module, action)) return { error: Response.json({ error: "Tidak punya akses." }, { status: 403 }) };
  return { user };
}
