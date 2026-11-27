"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboOption = {
  value: string;
  label: string;
  /** Teks kecil di kanan, mis. stok dan satuan. */
  hint?: string;
  /** Judul kelompok; opsi dengan kelompok sama ditampilkan berdampingan. */
  group?: string;
  /** Kata tambahan yang ikut dicari. */
  keywords?: string;
};

/**
 * Pilihan dengan pencarian (pengganti <select> bawaan browser yang tampil gelap dan
 * judul kelompoknya tidak bisa dibaca). Mengirim nilainya lewat <input type="hidden" name>.
 */
export function Combobox({
  id, name, options, value, onChange, placeholder = "Pilih…", searchPlaceholder = "Cari…",
  emptyText = "Tidak ada hasil.", clearable = false, disabled, required,
}: {
  id?: string;
  name?: string;
  options: ComboOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  clearable?: boolean;
  disabled?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const root = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();
  const selected = options.find((o) => o.value === value);

  const matches = React.useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return options;
    return options.filter((o) => `${o.label} ${o.keywords ?? ""}`.toLowerCase().includes(t));
  }, [options, q]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function openList() {
    if (disabled) return;
    setQ("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }
  function pick(o: ComboOption) {
    onChange(o.value);
    setOpen(false);
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (matches[active]) pick(matches[active]); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  }

  const headings = matches.map((o, i) => (o.group !== matches[i - 1]?.group ? o.group : undefined));
  return (
    <div ref={root} className="relative">
      {name && <input type="hidden" name={name} value={value} required={required} />}
      <button
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
          !selected && "text-muted-foreground",
        )}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-background text-foreground shadow-md">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={onKey}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-9 w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <ul id={listId} role="listbox" className="max-h-64 overflow-auto p-1">
            {clearable && value && (
              <li>
                <button type="button" className="w-full rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
                  onClick={() => { onChange(""); setOpen(false); }}>
                  Kosongkan pilihan
                </button>
              </li>
            )}
            {matches.length === 0 && <li className="px-2 py-3 text-center text-sm text-muted-foreground">{emptyText}</li>}
            {matches.map((o, i) => {
              const heading = headings[i];
              return (
                <React.Fragment key={o.value}>
                  {heading && (
                    <li role="presentation" className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {heading}
                    </li>
                  )}
                  <li
                    role="option"
                    aria-selected={o.value === value}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1.5 text-sm",
                      i === active && "bg-muted",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Check className={cn("size-4 shrink-0", o.value === value ? "opacity-100" : "opacity-0")} aria-hidden />
                      <span className="truncate">{o.label}</span>
                    </span>
                    {o.hint && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{o.hint}</span>}
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
