import { describe, expect, it } from "vitest";
import { renderInvoice, renderOrder, renderQuotation, renderReceipt } from "../pdf/render";
import type { PdfCompany, PdfItem } from "../pdf/types";

const company: PdfCompany = {
  code: "SBA", name: "CV Singgasana Benderang Abadi", address: null, city: null, phone: null, email: null,
  bankName: null, bankAccount: null, bankHolder: null, signatoryName: null, signatoryTitle: null, logo: null,
};
const customer = { name: "SD Contoh Harapan", attn: null, address: null };
const item = (i: number): PdfItem => ({ description: `Barang ${i}`, spec: "Rangka besi", qty: 2, unit: "Unit", unitPrice: 1_000_000, amount: 2_000_000 });
const totals = { subtotal: 2_000_000, ppnRate: 11, ppn: 220_000, total: 2_220_000 };
const terms = [{ label: "DP", trigger: "Saat KO", percent: 30, amount: 666_000 }, { label: "Pelunasan", trigger: "Saat kirim", percent: 70, amount: 1_554_000 }];
const date = new Date("2026-11-26T05:00:00Z");

// compress: false supaya struktur halaman terbaca di tes.
const pages = (b: Buffer) => (b.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
const isPdf = (b: Buffer) => b.subarray(0, 5).toString() === "%PDF-" && b.toString("latin1").includes("%%EOF");

describe("PDF", () => {
  it("keempat dokumen terbentuk walau data perusahaan masih kosong", async () => {
    const q = await renderQuotation({ company, number: "SBA.026/SPH/XI/2026", date, to: customer, subject: "Meja", items: [item(1)], totals, terms, notes: [] }, { compress: false });
    const o = await renderOrder({ company, number: "SBA-001/KO/XI/2026", date, quotationNumber: null, customer, dueDate: null, workDays: null, deliveryLocation: null, items: [item(1)], totals, terms, notes: [] }, { compress: false });
    const i = await renderInvoice({
      company, number: "SBA-001/INV/XI/2026", date, dueDate: date, orderNumber: null, customer, description: "DP 30%", detail: null, orderValue: 2_000_000, percent: 30,
      totals: { subtotal: 600_000, ppnRate: 11, ppn: 66_000, total: 666_000 }, paid: 0, terms: terms.map((t, n) => ({ ...t, current: n === 0, note: t.trigger })),
    }, { compress: false });
    const k = await renderReceipt({ company, number: "SBA-001/KW/XI/2026", date, receivedFrom: "SD Contoh Harapan", amount: 666_000, purpose: "DP 30%", methodLabel: "Transfer bank", balanceAfter: 0 }, { compress: false });
    for (const b of [q, o, i, k]) { expect(isPdf(b)).toBe(true); expect(pages(b)).toBe(1); }
  });

  it("banyak barang membuat halaman bertambah dan tidak melempar", async () => {
    const items = Array.from({ length: 60 }, (_, n) => item(n + 1));
    const b = await renderQuotation({ company, number: "SBA.001/SPH/I/2026", date, to: customer, subject: "Banyak", items, totals, terms, notes: ["a", "b"] }, { compress: false });
    expect(pages(b)).toBeGreaterThan(1);
    expect(isPdf(b)).toBe(true);
  });

  it("dokumen batal dan logo PNG valid", async () => {
    // PNG 1×1 hitam.
    const logo = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==", "base64");
    const b = await renderReceipt({ company: { ...company, logo }, number: "X", date, receivedFrom: "A", amount: 1000, purpose: "p", methodLabel: "Tunai", balanceAfter: 0, voided: true }, { compress: false });
    expect(isPdf(b)).toBe(true);
    expect(b.toString("latin1")).toContain("/Subtype /Image");
  });
});
