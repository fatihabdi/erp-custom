// Data masukan untuk PDF. Semua nilai sudah dihitung (lib/billing.ts); renderer hanya menata.

export type PdfCompany = {
  code: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
  logo: Buffer | null;
};

export type PdfParty = { name: string; attn: string | null; address: string | null };

export type PdfItem = { description: string; spec: string | null; qty: number; unit: string; unitPrice: number; amount: number };
export type PdfTotals = { subtotal: number; ppnRate: number; ppn: number; total: number };
export type PdfTerm = { label: string; trigger: string; percent: number; amount: number };

export type QuotationPdf = {
  company: PdfCompany; number: string; date: Date; to: PdfParty; subject: string;
  items: PdfItem[]; totals: PdfTotals; terms: PdfTerm[]; notes: string[]; voided?: boolean;
};

export type OrderPdf = {
  company: PdfCompany; number: string; date: Date; quotationNumber: string | null; customer: PdfParty;
  dueDate: Date | null; workDays: number | null; deliveryLocation: string | null;
  items: PdfItem[]; totals: PdfTotals; terms: PdfTerm[]; notes: string[]; cancelled?: boolean;
};

export type InvoicePdf = {
  company: PdfCompany; number: string; date: Date; dueDate: Date; orderNumber: string | null; customer: PdfParty;
  description: string; detail: string | null; orderValue: number; percent: number;
  totals: PdfTotals; paid: number;
  /** Posisi seluruh termin order; `current` menandai termin invoice ini. */
  terms: (PdfTerm & { current: boolean; note: string })[];
  voided?: boolean;
};

export type ReceiptPdf = {
  company: PdfCompany; number: string; date: Date; receivedFrom: string; amount: number;
  purpose: string; methodLabel: string; balanceAfter: number; voided?: boolean;
};
