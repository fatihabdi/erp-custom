import { describe, expect, it } from "vitest";
import { terbilangAngka, terbilangRupiah } from "../terbilang";

describe("terbilang", () => {
  it.each([
    [0, "nol"], [1, "satu"], [10, "sepuluh"], [11, "sebelas"], [12, "dua belas"], [19, "sembilan belas"], [20, "dua puluh"],
    [21, "dua puluh satu"], [99, "sembilan puluh sembilan"], [100, "seratus"], [101, "seratus satu"], [110, "seratus sepuluh"],
    [111, "seratus sebelas"], [200, "dua ratus"], [999, "sembilan ratus sembilan puluh sembilan"],
    [1000, "seribu"], [1001, "seribu satu"], [1100, "seribu seratus"], [2000, "dua ribu"], [11000, "sebelas ribu"],
    [100000, "seratus ribu"], [101000, "seratus satu ribu"], [111000, "seratus sebelas ribu"],
    [1_000_000, "satu juta"], [1_001_000, "satu juta seribu"], [1_100_000, "satu juta seratus ribu"],
    [2_500_000, "dua juta lima ratus ribu"], [1_000_000_000, "satu miliar"], [1_000_001_000, "satu miliar seribu"],
    [1_000_000_000_000, "satu triliun"],
  ])("%i → %s", (n, words) => expect(terbilangAngka(n)).toBe(words));

  it("contoh dari dokumen", () => {
    expect(terbilangRupiah(30_303_000)).toBe("Tiga puluh juta tiga ratus tiga ribu rupiah");
    expect(terbilangRupiah(9_090_900)).toBe("Sembilan juta sembilan puluh ribu sembilan ratus rupiah");
    expect(terbilangRupiah(18_500_000)).toBe("Delapan belas juta lima ratus ribu rupiah");
    expect(terbilangRupiah(5_000_000)).toBe("Lima juta rupiah");
    expect(terbilangRupiah(4_090_900)).toBe("Empat juta sembilan puluh ribu sembilan ratus rupiah");
    expect(terbilangRupiah(21_212_100)).toBe("Dua puluh satu juta dua ratus dua belas ribu seratus rupiah");
  });
  it("sen dibulatkan, negatif ditolak", () => {
    expect(terbilangRupiah(1000.4)).toBe("Seribu rupiah");
    expect(terbilangRupiah(0)).toBe("Nol rupiah");
    expect(() => terbilangRupiah(-1)).toThrow();
    expect(() => terbilangAngka(1.5)).toThrow();
  });
});
