"use client";

import { useCallback, useState } from "react";
import { DayHeader, supabase, useLive, usePaged, useToast, useToday } from "../shared";

type Row = { name: string; opening: number; ready: number; closing: number; pending: number; in_progress: number };

export default function Admin() {
  const now = useToday();
  const [picked, setPicked] = useState("");
  const day = picked || now;
  const isToday = !picked;
  const [rows, setRows] = useState<Row[]>([]);
  const [toast, show] = useToast();
  const { shown, search, pager, empty, toFirstPage } = usePaged(rows);

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
    if (isToday)
      for (const r of w.data ?? []) {
        const t = row(r.name);
        t.pending += r.pending;
        t.in_progress += r.in_progress;
      }
    // Skip all-zero rows, e.g. an item deleted before anything was kept.
    const kept = Object.values(by).filter((r) => r.opening || r.ready || r.closing || r.pending || r.in_progress);
    setRows(kept.sort((a, b) => a.name.localeCompare(b.name)));
  }, [day, isToday, show]);
  useLive(load);

  const total = (k: keyof Omit<Row, "name">) => rows.reduce((a, r) => a + r[k], 0);
  // Closing shows only once ready material is saved that day; until then it's "—", not a guess.
  const closing = (ready: number, value: number) => (ready ? value : "—");
  const stat = (label: string, value: number | string, tone = "text-zinc-900") => (
    <div className="rounded-xl bg-zinc-50 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );

  return (
    <>
      <DayHeader
        title="Stock"
        now={now}
        picked={picked}
        onPick={(d) => {
          setPicked(d);
          toFirstPage();
        }}
      />

      <div className="mt-5 grid grid-cols-3 gap-2">
        {stat("Opening", total("opening"))}
        {stat("Ready", total("ready"), "text-emerald-600")}
        {stat("Closing", closing(total("ready"), total("closing")))}
      </div>
      {isToday && total("pending") + total("in_progress") > 0 && (
        <p className="mt-2 text-sm text-zinc-500 tabular-nums">
          In production: <span className="text-amber-600">{total("in_progress")} in progress</span> ·{" "}
          {total("pending")} pending
        </p>
      )}

      <div className="mt-6">{search}</div>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-zinc-400">{empty("Nothing for this day.")}</p>
      ) : (
        <ul className="mt-2 divide-y divide-zinc-100 border-b border-zinc-100">
          {shown.map((r) => (
            <li key={r.name} className="py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-medium">{r.name}</span>
                <span className="shrink-0 text-xl font-semibold tabular-nums">{closing(r.ready, r.closing)}</span>
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
      {pager}

      <p className="mt-8 text-xs text-zinc-400">Opening = previous day’s closing. Closing shows once ready material is saved that day.</p>
      {toast}
    </>
  );
}
