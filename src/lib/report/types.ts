// Bentuk data laporan yang netral terhadap tampilan: layar, Excel, dan PDF membaca struktur yang sama.

export type ColType = "text" | "rp" | "int" | "date" | "pct";
export type Cell = string | number | Date | null;
export type Row = Record<string, Cell>;

export type ReportCol = { key: string; label: string; type?: ColType };
export type ReportSection = {
  title: string;
  note?: string;
  cols: ReportCol[];
  rows: Row[];
  /** Baris jumlah di bawah tabel (kunci kolom sama dengan `cols`). */
  totals?: Row;
  empty?: string;
};
export type ReportSummary = { label: string; value: number | string; type: ColType; hint?: string; tone?: "red" | "amber" };

export type ReportData = {
  slug: ReportSlug;
  title: string;
  description: string;
  scopeLabel: string;
  /** Kosong untuk laporan posisi hari ini (tidak memakai filter periode). */
  periodLabel: string | null;
  summary: ReportSummary[];
  sections: ReportSection[];
};

export const REPORTS = [
  { slug: "penjualan", title: "Penjualan", short: "Penjualan per periode", period: true, description: "Invoice terbit per bulan, per pelanggan, dan per kategori produk." },
  { slug: "piutang", title: "Piutang", short: "Piutang aging", period: false, description: "Umur piutang 0-30, 31-60, 61-90, dan lebih dari 90 hari, plus daftar invoice jatuh tempo." },
  { slug: "kas", title: "Penerimaan kas", short: "Penerimaan kas", period: true, description: "DP, termin, dan pelunasan yang diterima per periode, jenis, dan rekening." },
  { slug: "margin", title: "Margin proyek", short: "Margin per proyek", period: true, description: "Nilai kontrak dikurangi biaya bahan, biaya lain, dan harga pokok produk dagang." },
  { slug: "termin", title: "DP & termin", short: "Status DP dan termin", period: false, description: "DP dan termin yang belum ditagih, belum dibayar, atau tertunda." },
  { slug: "ppn", title: "PPN keluaran", short: "Rekap PPN keluaran", period: true, description: "DPP dan PPN dari invoice perusahaan kena PPN, per bulan." },
] as const;
export type ReportSlug = (typeof REPORTS)[number]["slug"];
export const isReportSlug = (s: string): s is ReportSlug => REPORTS.some((r) => r.slug === s);
