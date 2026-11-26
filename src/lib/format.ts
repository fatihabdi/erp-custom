const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });
export const fmtQty = (n: number) => nf.format(n);
export const fmtSigned = (n: number) => (n > 0 ? `+${nf.format(n)}` : nf.format(n).replace("-", "−"));
const df = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
const dtf = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
export const fmtDate = (d: Date) => df.format(d);
export const fmtDateTime = (d: Date) => dtf.format(d);
