import { apiUser } from "@/lib/api-auth";
import type { ModuleName } from "@/lib/permissions";
import { loadInvoicePdf, loadOrderPdf, loadQuotationPdf, loadReceiptPdf, type DocKind } from "@/lib/pdf/load";
import { renderInvoice, renderOrder, renderQuotation, renderReceipt } from "@/lib/pdf/render";

export const runtime = "nodejs";

const MODULE: Record<DocKind, ModuleName> = { penawaran: "penawaran", "konfirmasi-order": "order", invoice: "invoice", kwitansi: "kwitansi" };

// PDF dokumen: /api/dokumen/{penawaran|konfirmasi-order|invoice|kwitansi}/{id}. Tambahkan ?unduh=1 untuk mengunduh.
export async function GET(request: Request, ctx: { params: Promise<{ jenis: string; id: string }> }) {
  const { jenis, id } = await ctx.params;
  if (!(jenis in MODULE)) return Response.json({ error: "Jenis dokumen tidak dikenal." }, { status: 404 });
  const kind = jenis as DocKind;
  const auth = await apiUser(MODULE[kind], "view");
  if (auth.error) return auth.error;
  const scope = auth.user.companies;

  let result: { buffer: Buffer; filename: string } | null = null;
  if (kind === "penawaran") { const r = await loadQuotationPdf(id, scope); if (r) result = { buffer: await renderQuotation(r.data), filename: r.filename }; }
  if (kind === "konfirmasi-order") { const r = await loadOrderPdf(id, scope); if (r) result = { buffer: await renderOrder(r.data), filename: r.filename }; }
  if (kind === "invoice") { const r = await loadInvoicePdf(id, scope); if (r) result = { buffer: await renderInvoice(r.data), filename: r.filename }; }
  if (kind === "kwitansi") { const r = await loadReceiptPdf(id, scope); if (r) result = { buffer: await renderReceipt(r.data), filename: r.filename }; }
  if (!result) return Response.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });

  const disposition = new URL(request.url).searchParams.has("unduh") ? "attachment" : "inline";
  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${result.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
