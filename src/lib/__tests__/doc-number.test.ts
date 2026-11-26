import { describe, expect, it } from "vitest";
import { formatDocNumber, romanMonth, withCollisionSuffix } from "../doc-number";

describe("nomor dokumen", () => {
  it("bulan romawi", () => {
    expect(romanMonth(1)).toBe("I");
    expect(romanMonth(10)).toBe("X");
    expect(romanMonth(11)).toBe("XI");
    expect(() => romanMonth(13)).toThrow();
  });
  it("SPH berawalan tanggal terbit", () => {
    expect(formatDocNumber({ companyCode: "GTF", docType: "SPH", date: new Date(2026, 10, 18) })).toBe("GTF.018/SPH/XI/2026");
    expect(formatDocNumber({ companyCode: "SBA", docType: "SPH", date: new Date(2026, 0, 5) })).toBe("SBA.005/SPH/I/2026");
  });
  it("invoice berurutan", () => {
    expect(formatDocNumber({ companyCode: "GTF", docType: "INV", date: new Date(2026, 9, 3), sequence: 24 })).toBe("GTF-024/INV/X/2026");
  });
  it("jenis berurutan wajib punya sequence", () => {
    expect(() => formatDocNumber({ companyCode: "GTF", docType: "KO", date: new Date(2026, 9, 3) })).toThrow();
  });
  it("akhiran -2 bila bentrok di hari yang sama", () => {
    const base = "GTF.018/SPH/XI/2026";
    expect(withCollisionSuffix(base, new Set())).toBe(base);
    expect(withCollisionSuffix(base, new Set([base]))).toBe(`${base}-2`);
    expect(withCollisionSuffix(base, new Set([base, `${base}-2`]))).toBe(`${base}-3`);
  });
});
