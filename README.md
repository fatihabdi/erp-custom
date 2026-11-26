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

## Modul Inventory — isi
- Master barang (`Item`): bahan baku (`BB-001`) dan barang jadi (`BJ-001`) dengan satuan dan stok minimum; kode otomatis. Satu gudang barang jadi untuk GTF dan SBA.
- Saldo stok hanya berubah lewat mutasi (`applyMovement` di `src/lib/inventory.ts`): stok masuk, stok keluar, penyesuaian (wajib beralasan), hasil produksi (QC lulus), pemakaian bahan, dan pengiriman. Setiap mutasi tercatat di `StockMovement` (jumlah, saldo sesudah, pencatat) dan tidak pernah diubah; saldo tidak bisa negatif (dijaga di aplikasi dan constraint database, aman untuk permintaan bersamaan).
- BOM per barang jadi (`BomLine`): bahan baku per 1 unit. Pemakaian bahan untuk produksi bersifat semua-atau-tidak-sama-sekali dan melaporkan seluruh kekurangan sekaligus.
- Barang jadi masuk stok saat QC lulus. Untuk modul Proyek (tahap produksi) tersedia fungsi dan endpoint idempoten (kunci `qcId` / `productionId` / `deliveryId`, jadi kiriman ganda tidak menggandakan stok); hak akses `proyek: edit`:
  - `POST /api/inventory/qc-pass` `{ productId, qty, qcId, projectId?, note? }`
  - `POST /api/inventory/material-issue` `{ productId, units, productionId }`
  - `POST /api/inventory/ship` `{ productId, qty, deliveryId, note? }`
- UI: `/inventory` (Barang jadi / Bahan baku, status Aman-Menipis-Habis, pergerakan terakhir), `/inventory/mutasi` (riwayat dengan filter), `/inventory/mutasi/baru`, `/inventory/barang/[id]` (data, BOM, riwayat). Gudang mengelola stok; Direktur dan Admin melihat dan mengelola semua; Marketing dan Keuangan hanya melihat.
- Tidak termasuk: PO dan penyusutan aset.

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
Modul Proyek (tahap produksi) yang memanggil fungsi/endpoint stok di atas.
