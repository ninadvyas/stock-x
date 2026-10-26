"use client";

import { useCallback, useState } from "react";
import { supabase, useLive, useToast, ghost, input, today } from "../shared";

type Row = { name: string; opening: number; ready: number; closing: number; pending: number; in_progress: number };
const PER_PAGE = 5;

export default function Admin() {
  const [day, setDay] = useState(today);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [toast, show] = useToast();
  const isToday = day === today();

  // One row per item: stock for the day, plus what's still in production (today only).
  const load = useCallback(async () => {
    const [s, w] = await Promise.all([
      supabase.rpc("stock_on", { d: day, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      supabase.from("entries").select("name,pending,in_progress").or("pending.gt.0,in_progress.gt.0"),
    ]);
    const error = s.error ?? w.error;
    if (error) return show(error.message);
    const by: Record<string, Row> = {};
    const row = (name: string) =>
      (by[name] ??= { name, opening: 0, ready: 0, closing: 0, pending: 0, in_progress: 0 });
    for (const r of s.data) Object.assign(row(r.name), r);
    if (day === today())
      for (const r of w.data ?? []) {
        const t = row(r.name);
        t.pending += r.pending;
        t.in_progress += r.in_progress;
      }
    setRows(Object.values(by).sort((a, b) => a.name.localeCompare(b.name)));
  }, [day, show]);
  useLive(load);

  const found = rows.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(found.length / PER_PAGE));
  const p = Math.min(page, pages - 1);
  const shown = found.slice(p * PER_PAGE, (p + 1) * PER_PAGE);
  const total = (k: keyof Omit<Row, "name">) => rows.reduce((a, r) => a + r[k], 0);
  const goDay = (d: string) => {
    setDay(d || today());
    setPage(0);
  };

  const stat = (label: string, value: number, tone = "text-zinc-900") => (
    <div className="rounded-xl bg-zinc-50 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
  const pager = "h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium disabled:opacity-30";

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Stock</h2>
          <p className="text-sm text-zinc-400">
            {isToday ? "Today, " : ""}
            {new Date(`${day}T00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
          </p>
          {!isToday && (
            <button onClick={() => goDay(today())} className={`${ghost} mt-2 border-zinc-200 text-zinc-700`}>
              ← Back to today
            </button>
          )}
        </div>
        <input
          type="date"
          aria-label="Day"
          value={day}
          max={today()}
          onChange={(e) => goDay(e.target.value)}
          className={`${input} shrink-0`}
        />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {stat("Opening", total("opening"))}
        {stat("Ready", total("ready"), "text-emerald-600")}
        {stat("Closing", total("closing"))}
      </div>
      {isToday && total("pending") + total("in_progress") > 0 && (
        <p className="mt-2 text-sm text-zinc-500 tabular-nums">
          In production: <span className="text-amber-600">{total("in_progress")} in progress</span> ·{" "}
          {total("pending")} pending
        </p>
      )}

      <input
        type="search"
        placeholder="Search item"
        aria-label="Search item"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(0);
        }}
        className={`${input} mt-6 w-full`}
      />

      {shown.length === 0 ? (
        <p className="py-8 text-center text-zinc-400">{q.trim() ? `No item matches “${q.trim()}”` : "Nothing for this day."}</p>
      ) : (
        <ul className="mt-2 divide-y divide-zinc-100">
          {shown.map((r) => (
            <li key={r.name} className="py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-medium">{r.name}</span>
                <span className="shrink-0 text-xl font-semibold tabular-nums">{r.closing}</span>
              </div>
              <div className="mt-0.5 flex justify-between gap-3 text-sm text-zinc-500 tabular-nums">
                <span>
                  Opening {r.opening} ·{" "}
                  <span className={r.ready > 0 ? "text-emerald-600" : ""}>
                    {r.ready > 0 ? "+" : ""}
                    {r.ready} ready
                  </span>
                </span>
                <span className="shrink-0 text-xs text-zinc-400">closing</span>
              </div>
              {r.pending + r.in_progress > 0 && (
                <p className="mt-1 text-sm text-zinc-500 tabular-nums">
                  <span className="text-amber-600">{r.in_progress} in progress</span> · {r.pending} pending
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {found.length > 0 && (
        <div className="mt-2 flex items-center justify-between border-t border-zinc-100 pt-4">
          <button disabled={p === 0} onClick={() => setPage(p - 1)} className={pager}>
            ← Prev
          </button>
          <span className="text-sm text-zinc-500 tabular-nums">
            {p * PER_PAGE + 1}–{p * PER_PAGE + shown.length} of {found.length}
          </span>
          <button disabled={p >= pages - 1} onClick={() => setPage(p + 1)} className={pager}>
            Next →
          </button>
        </div>
      )}

      <p className="mt-8 text-xs text-zinc-400">Opening = previous day’s closing. Closing carries to the next day.</p>
      {toast}
    </>
  );
}
