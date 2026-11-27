import { describe, expect, it } from "vitest";
import { checkSoImage, SO_IMAGE_MAX_BYTES, soNumber, specLines } from "../sales-order";

describe("sales order", () => {
  it("nomor SO mengikuti nomor KO", () => {
    expect(soNumber("GTF-024/KO/X/2026")).toBe("GTF-024/SO/X/2026");
    expect(soNumber("SBA-001/KO/XI/2026")).toBe("SBA-001/SO/XI/2026");
    expect(soNumber("ABC")).toBe("ABC/SO");
  });
  it("spesifikasi dipecah per baris, baris kosong dibuang", () => {
    expect(specLines("P. 120 x L.60\r\n\n  HPL, Edging \n")).toEqual(["P. 120 x L.60", "HPL, Edging"]);
    expect(specLines(null)).toEqual([]);
  });
  it("gambar: hanya PNG/JPEG sungguhan dan maksimal 2 MB", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    expect(checkSoImage(png)).toEqual({ ok: true, mime: "image/png" });
    expect(checkSoImage(jpg)).toEqual({ ok: true, mime: "image/jpeg" });
    expect(checkSoImage(new Uint8Array(0)).ok).toBe(false);
    expect(checkSoImage(new TextEncoder().encode("<svg onload=alert(1)>")).ok).toBe(false);
    const big = new Uint8Array(SO_IMAGE_MAX_BYTES + 1); big.set(png);
    expect(checkSoImage(big)).toEqual({ ok: false, error: "Gambar terlalu besar (maksimal 2 MB)." });
  });
});
