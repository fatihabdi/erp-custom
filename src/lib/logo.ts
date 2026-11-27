// Validasi logo perusahaan: hanya PNG atau JPEG, maksimal 512 KB (dicek dari isi berkas, bukan nama).
export const LOGO_MAX_BYTES = 512 * 1024;

export function detectImageType(b: Uint8Array): "image/png" | "image/jpeg" | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}

export function checkLogo(b: Uint8Array): { ok: true; mime: "image/png" | "image/jpeg" } | { ok: false; error: string } {
  if (b.length === 0) return { ok: false, error: "Berkas logo kosong." };
  if (b.length > LOGO_MAX_BYTES) return { ok: false, error: "Logo terlalu besar (maksimal 512 KB)." };
  const mime = detectImageType(b);
  if (!mime) return { ok: false, error: "Logo harus berupa gambar PNG atau JPEG." };
  return { ok: true, mime };
}
