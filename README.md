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

## Modul Proyek — isi
- Pelanggan (`/pelanggan`): dikelola lewat hak akses modul Order (Marketing, Admin, Direktur); dipakai bersama GTF dan SBA.
- Proyek (`Project`): dua jenis. **Pesanan** (`PRY-2026-001`) wajib punya perusahaan dan pelanggan; PPN diambil dari perusahaan saat dibuat (GTF 0, SBA 11) lalu dibekukan. **Produksi stok** (`STK-2026-001`) adalah order produksi internal tanpa pelanggan. Setiap proyek berisi baris barang jadi (jumlah bulat, harga satuan tanpa PPN). Pesanan dibuat dengan hak `order: create`, produksi stok dengan `proyek: create`.
- Tahapan per baris (`ProjectStage`): rangka besi dan potong kayu paralel → rakit → finishing → QC → packing → kirim, dengan status Belum mulai / Dikerjakan / Selesai / Tertahan (alasan wajib). Satu tahap tidak boleh lebih maju dari tahap sebelumnya dan tidak boleh mundur di bawah yang sudah diambil tahap berikutnya (`src/lib/production.ts`). Produksi stok berhenti di QC.
- Pemakaian bahan: tombol "Keluarkan bahan" memanggil `issueMaterialsForProduction` (semua-atau-tidak-sama-sekali); rangka besi dan potong kayu baru bisa jalan sebanyak unit yang bahannya sudah dikeluarkan. Nilai bahan = jumlah × harga pokok barang (`Item.unitCost`, diisi di master barang) dan otomatis menjadi biaya proyek.
- QC lulus memanggil `receiveFinishedGoodsAtQc`: barang jadi masuk stok saat itu juga (satu catatan QC = satu mutasi, aman diulang).
- Pengiriman bertahap: rencana pengiriman per proyek, hanya untuk unit yang sudah dipacking; tombol "Kirim" memanggil `shipFinishedGoods` dan menambah tahap Kirim. Proyek otomatis Selesai saat semua tahap penuh.
- Biaya dan margin: biaya bahan (otomatis dari stok atau pembelian langsung), tenaga kerja, lain-lain; margin = nilai tanpa PPN dikurangi biaya.
- Semua perubahan satu proyek dikunci per proyek (advisory lock) sehingga dua permintaan bersamaan tidak melewati batas jumlah.
- UI: `/proyek` (daftar berjalan / produksi stok / selesai, filter perusahaan, posisi tahapan semua proyek), `/proyek/baru`, `/proyek/[id]` (tab Produksi, Pengiriman, Biaya). Pembatalan proyek (hak `delete`, Direktur) hanya bila belum ada bahan, QC, atau kiriman.
- Dokumen penagihan ada di modul Dokumen (di bawah); halaman proyek menampilkan KO, invoice, dan status pembayarannya.

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

## Modul Dokumen — isi
- Alur: **Penawaran (SPH)** → **Konfirmasi Order (KO)** → **Invoice** (satu per termin) → **Pembayaran** → **Kwitansi** (terbit otomatis per pembayaran). KO bisa dibuat dari penawaran (proyek produksinya dibuat otomatis) atau dari proyek pesanan yang sudah ada.
- Nomor memakai `issueDocNumber` (Tahap 0): SPH `SBA.026/SPH/XI/2026` (tanggal terbit, akhiran `-2` bila bentrok), KO/INV/KW berurutan per tahun `GTF-024/INV/X/2026`. Tanggal dan bulan mengikuti kalender WIB.
- PPN mengikuti perusahaan (GTF 0%, SBA 11%) dan dibekukan di penawaran/proyek. Termin dihitung dalam sen: DPP dan PPN dibagi per persen, termin terakhir menyerap selisih, sehingga jumlah semua invoice selalu sama dengan nilai order (`src/lib/billing.ts`).
- Skema pembayaran fleksibel: DP, termin, atau lunas (persen harus 100%, jatuh tempo per termin). Termin terkunci selama ada invoice terbit. Pembayaran boleh sebagian; kelebihan bayar ditolak (dikunci per invoice). Pembatalan invoice/kwitansi wajib beralasan dan nomornya tetap tercatat. Invoice bisa menagih satu pengiriman (rincian barang pengiriman tercetak).
- Terbilang otomatis: `src/lib/terbilang.ts` (seribu, seratus, sebelas, dst.).
- PDF dibuat di server dengan PDFKit (`src/lib/pdf/`), mengikuti desain acuan: `/api/dokumen/{penawaran|konfirmasi-order|invoice|kwitansi}/{id}` (`?unduh=1` untuk mengunduh). Pengguna yang dibatasi perusahaan hanya bisa membuka dokumen perusahaannya.
- Data perusahaan per PT dapat diisi di `/pengaturan`: logo (PNG/JPEG ≤ 512 KB), alamat, kota, telepon, email, rekening, penandatangan. Yang masih kosong tercetak sebagai `[placeholder]` dan halaman dokumen menampilkan peringatan.
- Hak akses: Marketing dan Admin menangani penawaran/KO; Keuangan dan Admin menangani invoice dan pembayaran; Direktur semuanya; Gudang tidak punya akses.
- Build Docker: font bawaan PDFKit disertakan lewat `outputFileTracingIncludes` di `next.config.ts`.

## Berikutnya
Dashboard (angka dari semua modul), laporan, dan aset.
