"use client";

import { useCallback, useState, type FormEvent } from "react";
import { supabase, useLive, useToast, button, input, type Entry } from "./shared";

type Row = { name: string; qty: string };
const blank = (): Row => ({ name: "", qty: "" });

export default function Production() {
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, show] = useToast();

  // Anything not finished, plus everything added today.
  const load = useCallback(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from("entries")
      .select("*")
      .or(`pending.gt.0,in_progress.gt.0,created_at.gte."${start.toISOString()}"`)
      .order("created_at", { ascending: false });
    if (error) show(error.message);
    else setEntries(data);
  }, [show]);
  useLive(load);

  const set = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase
      .from("entries")
      .insert(rows.map((r) => ({ name: r.name.trim(), qty: Number(r.qty), pending: Number(r.qty) })));
    setBusy(false);
    if (error) return show(error.message);
    show(`✓ ${rows.length} item${rows.length > 1 ? "s" : ""} added`);
    setRows([blank()]);
    load();
  }

  const names = [...new Set(entries.map((e) => e.name))];

  return (
    <>
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Add items</h2>
          <span className="text-sm text-zinc-400">
            {new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
          </span>
        </div>
        <form onSubmit={add} className="grid gap-2">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2">
              <input
                aria-label="Item name"
                placeholder="Item name"
                required
                pattern=".*\S.*"
                list="names"
                value={r.name}
                onChange={(e) => set(i, { name: e.target.value })}
                className={`${input} min-w-0 flex-1`}
              />
              <input
                aria-label="Quantity"
                placeholder="Qty"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                required
                value={r.qty}
                onChange={(e) => set(i, { qty: e.target.value })}
                className={`${input} w-24 shrink-0 tabular-nums`}
              />
              {rows.length > 1 && (
                <button
                  type="button"
                  aria-label="Remove row"
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  className="h-11 w-8 shrink-0 text-xl text-zinc-400"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <datalist id="names">
            {names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => setRows([...rows, blank()])}
              className="h-11 flex-1 rounded-lg border border-zinc-200 font-medium"
            >
              + Row
            </button>
            <button disabled={busy} className={`${button} flex-1`}>
              {busy ? "Adding…" : `Add ${rows.length}`}
            </button>
          </div>
        </form>
      </section>

      <section className="mt-12">
        <h2 className="mb-3 text-lg font-semibold">In production</h2>
        {entries.length === 0 && <p className="text-zinc-400">Nothing in production.</p>}
        <ul className="grid gap-3">
          {entries.map((e) => (
            <Card key={`${e.id}-${e.in_progress}-${e.done}`} e={e} show={show} reload={load} />
          ))}
        </ul>
      </section>
      {toast}
    </>
  );
}

// Keyed on saved counts, so a change from another device resets the inputs.
function Card({ e, show, reload }: { e: Entry; show: (m: string) => void; reload: () => void }) {
  const [ip, setIp] = useState(String(e.in_progress));
  const [done, setDone] = useState(String(e.done));
  const [busy, setBusy] = useState(false);

  const pending = e.qty - Number(ip) - Number(done);
  const valid = [ip, done].every((v) => Number.isInteger(Number(v)) && Number(v) >= 0) && pending >= 0;
  const dirty = Number(ip) !== e.in_progress || Number(done) !== e.done;

  async function save() {
    setBusy(true);
    const { error } = await supabase
      .from("entries")
      .update({ pending, in_progress: Number(ip), done: Number(done) })
      .eq("id", e.id);
    setBusy(false);
    show(error ? error.message : `✓ ${e.name} updated`);
    if (!error) reload();
  }

  const pct = (n: number) => `${(n / e.qty) * 100}%`;
  const field = (label: string, value: string, onChange: (v: string) => void) => (
    <label className="grid gap-1 text-xs text-zinc-500">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={e.qty}
        step={1}
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        className={`${input} w-full tabular-nums text-zinc-900`}
      />
    </label>
  );

  return (
    <li className="rounded-xl border border-zinc-200 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate font-medium">{e.name}</span>
        <span className="shrink-0 text-sm tabular-nums text-zinc-500">
          {e.done}/{e.qty} ready
        </span>
      </div>
      <p className="mt-0.5 text-xs text-zinc-400">
        {new Date(e.created_at).toLocaleString(undefined, {
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        })}
      </p>
      <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div className="bg-emerald-500" style={{ width: pct(e.done) }} />
        <div className="bg-amber-400" style={{ width: pct(e.in_progress) }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="grid gap-1 text-xs text-zinc-500">
          Pending
          <div className={`flex h-11 items-center rounded-lg bg-zinc-50 px-3 text-base tabular-nums ${pending < 0 ? "text-red-600" : "text-zinc-900"}`}>
            {pending}
          </div>
        </div>
        {field("In progress", ip, setIp)}
        {field("Done", done, setDone)}
      </div>
      {!valid && <p className="mt-2 text-sm text-red-600">In progress + done can’t be more than {e.qty}.</p>}
      {dirty && (
        <button onClick={save} disabled={!valid || busy} className={`${button} mt-3 w-full`}>
          {busy ? "Saving…" : "Save"}
        </button>
      )}
    </li>
  );
}
