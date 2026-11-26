# ERP Furniture

ERP untuk produsen furniture (Garindotama Furniture / GTF dan CV Singgasana Benderang Abadi / SBA).
Next.js (TypeScript) + Tailwind + komponen gaya shadcn/ui hitam-putih, PostgreSQL via Prisma.

## Tahap 0 (fondasi) — isi
- Login (email + kata sandi, sesi cookie bertanda tangan) dan hak akses per peran: Direktur, Admin, Marketing, Gudang, Keuangan (`src/lib/permissions.ts`).
- Manajemen pengguna (`/pengguna`) untuk Direktur dan Admin.
- Skema multi-perusahaan: GTF (tanpa PPN) dan SBA (PPN 11%), PPN per perusahaan; pengguna dapat dibatasi ke perusahaan tertentu.
- Penomoran dokumen (`src/lib/doc-number.ts`):
  - SPH berawalan tanggal terbit, `GTF.018/SPH/XI/2026`; bila bentrok di hari yang sama diberi akhiran `-2`, `-3`.
  - KO, INV, KW berurutan per tahun, `GTF-024/INV/X/2026`.
- Audit log dasar, endpoint `/api/health`.
- Docker Compose (app + Postgres + Caddy HTTPS + backup harian), GitHub Actions (lint, tipe, migrasi, tes, build).

## Pengembangan lokal
```bash
cp .env.example .env            # isi AUTH_SECRET dan ADMIN_PASSWORD
docker compose -f docker-compose.dev.yml up -d   # Postgres lokal
npm install
npm run db:migrate && npm run db:seed
npm run dev
npm test
```

## Produksi (VPS)
```bash
cp .env.example .env   # isi POSTGRES_PASSWORD (karakter aman untuk URL), AUTH_SECRET, ADMIN_*, DOMAIN
docker compose up -d --build
```
- Caddy mengurus HTTPS otomatis untuk `DOMAIN` (arahkan DNS ke server, buka port 80/443).
- Migrasi dan akun Direktur awal dijalankan oleh service `migrate` setiap deploy.
- Backup: service `backup` menjalankan `pg_dump` setiap hari 02:00 ke `./backups` (simpan 14 harian, 8 mingguan, 12 bulanan). Salin juga ke luar server.
- Pulihkan: `./deploy/restore.sh backups/daily/<file>.sql.gz`.

## Keputusan yang berlaku
Barang jadi masuk stok saat QC lulus; satu gudang barang jadi; bahan baku juga dicatat; tanpa penyusutan aset dan tanpa PO untuk sekarang.

## Berikutnya
Modul Inventory (bahan, stok, BOM) sebagai PR terpisah.
