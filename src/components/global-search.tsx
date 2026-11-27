"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Hit = { id: string; title: string; subtitle: string; href: string };
type Group = { kind: string; label: string; hits: Hit[] };

const MIN = 2;

/** Kotak cari di topbar: mengetik mencari ke /api/cari, panah + Enter membuka hasil, "/" atau Ctrl+K memfokuskan. */
export function GlobalSearch() {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const flat = useMemo(() => (groups ?? []).flatMap((g) => g.hits), [groups]);
  const trimmed = q.replace(/\s+/g, " ").trim();
  const ready = trimmed.length >= MIN;

  useEffect(() => {
    if (!ready) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/cari?q=${encodeURIComponent(trimmed)}`, { signal: ctl.signal });
        if (!r.ok) throw new Error(String(r.status));
        setGroups(((await r.json()) as { groups: Group[] }).groups);
        setFailed(false);
        setActive(0);
      } catch (e) {
        if ((e as Error).name !== "AbortError") { setFailed(true); setGroups(null); }
      }
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [trimmed, ready]);

  // Tutup saat klik di luar; pintasan papan ketik.
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) { e.preventDefault(); input.current?.focus(); setOpen(true); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, []);

  const go = (h: Hit) => { setOpen(false); setQ(""); setGroups(null); router.push(h.href); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && flat[active]) { e.preventDefault(); go(flat[active]); }
  };

  const shown = ready ? groups : null;
  let index = -1;
  return (
    <div ref={box} className="relative w-80 max-w-full">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        ref={input} type="search" value={q} role="combobox" aria-expanded={open && ready} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={open && flat[active] ? `${listId}-${active}` : undefined}
        aria-label="Cari pelanggan, proyek, penawaran, invoice, produk, SO" autoComplete="off"
        placeholder="Cari pelanggan, proyek, nomor dokumen..."
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
        className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-9 text-sm placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 text-[10px] text-muted-foreground sm:block">/</kbd>
      {open && (
        <div id={listId} role="listbox" aria-label="Hasil pencarian" className="absolute right-0 top-11 z-50 max-h-[28rem] w-[26rem] max-w-[90vw] overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-lg">
          {!ready && <p className="px-3 py-4 text-sm text-muted-foreground">Ketik minimal {MIN} huruf.</p>}
          {ready && failed && <p className="px-3 py-4 text-sm text-destructive">Pencarian gagal. Coba lagi.</p>}
          {ready && !failed && shown === null && <p className="px-3 py-4 text-sm text-muted-foreground">Mencari…</p>}
          {ready && !failed && shown?.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">Tidak ada hasil untuk “{trimmed}”.</p>}
          {ready && !failed && shown?.map((g) => (
            <div key={g.kind} role="group" aria-label={g.label} className="py-1">
              <div className="px-3 pb-1 pt-1.5 text-xs text-muted-foreground">{g.label}</div>
              {g.hits.map((h) => {
                const i = ++index;
                return (
                  <div
                    key={h.href} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                    onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); go(h); }}
                    className={cn("cursor-pointer rounded-md px-3 py-2", i === active && "bg-accent")}
                  >
                    <div className="truncate text-sm font-medium">{h.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{h.subtitle}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
