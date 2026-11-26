import { describe, expect, it } from "vitest";
import {
  aggregateStages, createModuleFor, currentStage, emptyStageDone, isProjectComplete, orderTotals, overallPercent,
  projectCode, projectMargin, ProjectRuleError, stageBounds, stageStatus, stagesFor, validateDeliveryPlan,
  validateShipment, validateStageDone,
} from "../production";

const d = (o: Partial<ReturnType<typeof emptyStageDone>>) => ({ ...emptyStageDone(), ...o });

describe("tahap produksi", () => {
  it("pesanan memakai 7 tahap, produksi stok berhenti di QC", () => {
    expect(stagesFor("ORDER")).toHaveLength(7);
    expect(stagesFor("STOK").at(-1)).toBe("QC");
  });

  it("status tahap", () => {
    expect(stageStatus(0, 12)).toBe("BELUM");
    expect(stageStatus(7, 12)).toBe("BERJALAN");
    expect(stageStatus(12, 12)).toBe("SELESAI");
    expect(stageStatus(1, 3, true)).toBe("TERTAHAN");
    expect(stageStatus(3, 3, true)).toBe("SELESAI");
  });

  it("rangka besi dan potong kayu dibatasi bahan yang dikeluarkan", () => {
    expect(stageBounds("RANGKA_BESI", d({}), 10, 4)).toEqual({ min: 0, max: 4 });
    expect(() => validateStageDone("RANGKA_BESI", 5, d({}), 10, 4)).toThrow(ProjectRuleError);
    expect(() => validateStageDone("POTONG_KAYU", 4, d({}), 10, 4)).not.toThrow();
  });

  it("rakit hanya sebanyak min(rangka besi, potong kayu) dan finishing dibatasi rakit", () => {
    const done = d({ RANGKA_BESI: 8, POTONG_KAYU: 5 });
    expect(stageBounds("RAKIT", done, 10, 10).max).toBe(5);
    expect(() => validateStageDone("RAKIT", 6, done, 10, 10)).toThrow(/sebelumnya baru selesai 5/);
    expect(() => validateStageDone("FINISHING", 1, done, 10, 10)).toThrow(ProjectRuleError);
  });

  it("tidak boleh mundur di bawah yang sudah diambil tahap berikutnya", () => {
    const done = d({ RANGKA_BESI: 10, POTONG_KAYU: 10, RAKIT: 6, FINISHING: 3 });
    expect(() => validateStageDone("RAKIT", 2, done, 10, 10)).toThrow(/di bawah 3/);
    expect(() => validateStageDone("RAKIT", 3, done, 10, 10)).not.toThrow();
  });

  it("jumlah harus bilangan bulat tak negatif", () => {
    expect(() => validateStageDone("RAKIT", -1, d({}), 10, 10)).toThrow(ProjectRuleError);
    expect(() => validateStageDone("RAKIT", 1.5, d({}), 10, 10)).toThrow(ProjectRuleError);
  });

  it("progres dan tahap berjalan", () => {
    const lines = [
      { qty: 12, done: d({ RANGKA_BESI: 12, POTONG_KAYU: 12, RAKIT: 12, FINISHING: 7, QC: 4 }) },
      { qty: 3, done: d({ RANGKA_BESI: 3, POTONG_KAYU: 1, RAKIT: 1 }) },
    ];
    expect(aggregateStages(lines).total).toBe(15);
    expect(currentStage(lines, stagesFor("ORDER"))).toBe("QC");
    expect(overallPercent(lines, stagesFor("ORDER"))).toBe(Math.round(((15 + 13 + 13 + 7 + 4) / (15 * 7)) * 100));
    expect(isProjectComplete(lines, stagesFor("ORDER"))).toBe(false);
    const all = [{ qty: 2, done: d({ RANGKA_BESI: 2, POTONG_KAYU: 2, RAKIT: 2, FINISHING: 2, QC: 2 }) }];
    expect(isProjectComplete(all, stagesFor("STOK"))).toBe(true);
    expect(isProjectComplete(all, stagesFor("ORDER"))).toBe(false);
  });
});

describe("nilai, PPN, biaya, margin", () => {
  it("GTF tanpa PPN, SBA 11%", () => {
    const lines = [{ qty: 12, unitPrice: 1_500_000 }, { qty: 3, unitPrice: 3_100_000 }];
    expect(orderTotals(lines, 0)).toEqual({ subtotal: 27_300_000, ppn: 0, total: 27_300_000 });
    expect(orderTotals(lines, 11)).toEqual({ subtotal: 27_300_000, ppn: 3_003_000, total: 30_303_000 });
  });

  it("margin dihitung tanpa PPN", () => {
    const m = projectMargin(27_300_000, [
      { category: "BAHAN", amount: 14_200_000 }, { category: "TENAGA", amount: 5_100_000 }, { category: "LAIN", amount: 1_300_000 },
    ]);
    expect(m.totalCost).toBe(20_600_000);
    expect(m.margin).toBe(6_700_000);
    expect(m.percent).toBe(24.5);
  });

  it("tanpa nilai, persen margin kosong", () => {
    expect(projectMargin(0, [{ category: "LAIN", amount: 10 }]).percent).toBeNull();
  });
});

describe("pengiriman bertahap", () => {
  const lines = [{ id: "a", qty: 12 }, { id: "b", qty: 3 }];
  it("rencana tidak boleh melebihi sisa pesanan", () => {
    expect(() => validateDeliveryPlan(lines, new Map([["a", 6]]), [{ lineId: "a", qty: 6 }])).not.toThrow();
    expect(() => validateDeliveryPlan(lines, new Map([["a", 6]]), [{ lineId: "a", qty: 7 }])).toThrow(/sisa pesanan \(6/);
    expect(() => validateDeliveryPlan(lines, new Map(), [])).toThrow(ProjectRuleError);
    expect(() => validateDeliveryPlan(lines, new Map(), [{ lineId: "x", qty: 1 }])).toThrow(ProjectRuleError);
  });
  it("kirim hanya yang sudah dipacking", () => {
    const packed = new Map([["a", 8]]);
    expect(() => validateShipment([{ lineId: "a", qty: 6 }], packed, new Map())).not.toThrow();
    expect(() => validateShipment([{ lineId: "a", qty: 6 }], packed, new Map([["a", 4]]))).toThrow(/Baru 4 unit/);
    expect(() => validateShipment([{ lineId: "b", qty: 1 }], packed, new Map())).toThrow(ProjectRuleError);
  });
});

describe("kode dan hak akses", () => {
  it("kode proyek", () => {
    expect(projectCode("ORDER", 2026, 7)).toBe("PRY-2026-007");
    expect(projectCode("STOK", 2026, 12)).toBe("STK-2026-012");
  });
  it("pesanan lewat modul order, produksi stok lewat proyek", () => {
    expect(createModuleFor("ORDER")).toBe("order");
    expect(createModuleFor("STOK")).toBe("proyek");
  });
});
