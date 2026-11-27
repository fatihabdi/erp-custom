import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // PDFKit membaca berkas font bawaan dari disk saat berjalan, jadi tidak boleh di-bundle.
  serverExternalPackages: ["pdfkit", "exceljs"],
  outputFileTracingIncludes: {
    "/api/dokumen/[jenis]/[id]": ["./node_modules/pdfkit/js/standard-fonts/**", "./node_modules/pdfkit/js/data/**"],
    "/api/laporan/[jenis]": ["./node_modules/pdfkit/js/standard-fonts/**", "./node_modules/pdfkit/js/data/**"],
  },
  // Gambar acuan Sales Order (maks. 2 MB) dikirim lewat server action.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
