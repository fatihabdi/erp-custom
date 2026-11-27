// Terbilang (angka menjadi kata) bahasa Indonesia untuk nilai rupiah bulat.

const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];

/** 0-999 tanpa satuan besar. `seribu` ditangani pemanggil (satu ribu → seribu). */
function ratusan(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h === 1) parts.push("seratus");
  else if (h > 1) parts.push(`${SATUAN[h]} ratus`);
  if (rest > 0) {
    if (rest < 12) parts.push(SATUAN[rest]);
    else if (rest < 20) parts.push(`${SATUAN[rest - 10]} belas`);
    else {
      const t = Math.floor(rest / 10);
      const u = rest % 10;
      parts.push(`${SATUAN[t]} puluh${u ? ` ${SATUAN[u]}` : ""}`);
    }
  }
  return parts.join(" ");
}

const SKALA = ["", "ribu", "juta", "miliar", "triliun", "kuadriliun"];

/** Angka bulat tak negatif menjadi kata, mis. 1100 → "seribu seratus". */
export function terbilangAngka(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError("terbilang hanya untuk bilangan bulat tak negatif");
  if (n === 0) return "nol";
  const groups: number[] = [];
  for (let x = n; x > 0; x = Math.floor(x / 1000)) groups.push(x % 1000);
  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    if (i === 1 && g === 1) words.push("seribu");
    else words.push(i === 0 ? ratusan(g) : `${ratusan(g)} ${SKALA[i]}`);
  }
  return words.join(" ");
}

/** Terbilang rupiah dengan huruf awal kapital: "Tiga puluh juta tiga ratus tiga ribu rupiah". Sen dibulatkan. */
export function terbilangRupiah(amount: number): string {
  const n = Math.round(amount);
  if (n < 0) throw new RangeError("jumlah uang tidak boleh negatif");
  const s = `${terbilangAngka(n)} rupiah`;
  return s[0].toUpperCase() + s.slice(1);
}
