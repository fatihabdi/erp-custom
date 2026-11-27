import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // PDFKit membaca berkas font bawaan dari disk saat berjalan, jadi tidak boleh di-bundle.
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/dokumen/[jenis]/[id]": ["./node_modules/pdfkit/js/standard-fonts/**", "./node_modules/pdfkit/js/data/**"],
  },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
