import { apiUser } from "@/lib/api-auth";
import { BUILDERS } from "@/lib/report/build";
import { reportContext } from "@/lib/report/context";
import { renderReportPdf } from "@/lib/report/pdf";
import { isReportSlug } from "@/lib/report/types";
import { renderXlsx } from "@/lib/report/xlsx";

export const runtime = "nodejs";

// Ekspor laporan: /api/laporan/{penjualan|piutang|kas|margin|termin|ppn}?format=xlsx|pdf&dari=&sampai=&pt=
export async function GET(request: Request, ctx: { params: Promise<{ jenis: string }> }) {
  const { jenis } = await ctx.params;
  if (!isReportSlug(jenis)) return Response.json({ error: "Laporan tidak dikenal." }, { status: 404 });
  const auth = await apiUser("laporan", "view");
  if (auth.error) return auth.error;

  const sp = new URL(request.url).searchParams;
  const format = sp.get("format");
  if (format !== "xlsx" && format !== "pdf") return Response.json({ error: "Format harus xlsx atau pdf." }, { status: 400 });
  const context = await reportContext(auth.user, { dari: sp.get("dari") ?? undefined, sampai: sp.get("sampai") ?? undefined, pt: sp.get("pt") ?? undefined });
  if (context.scope.selected.length === 0) return Response.json({ error: "Tidak ada perusahaan yang bisa dilaporkan." }, { status: 404 });

  const data = await BUILDERS[jenis](context);
  const stamp = `${context.scope.value || "GABUNGAN"}-${context.period.fromStr}_${context.period.toStr}`;
  const filename = `laporan-${jenis}-${stamp}.${format}`;
  const body = format === "xlsx" ? await renderXlsx(data) : await renderReportPdf(data);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
