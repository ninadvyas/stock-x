"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import {
  DayHeader,
  supabase,
  useLive,
  usePaged,
  useToast,
  today,
  button,
  ghost,
  input,
  type Entry,
} from "./shared";

type Row = { name: string; qty: string };
const blank = (): Row => ({ name: "", qty: "" });

// e.g. "26 Oct, 11:27 PM"
const when = (iso: string) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${date}, ${time}`;
};

export default function Production() {
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, show] = useToast();
  // Staff keep the date the page opened with; only admin follows the clock past midnight.
  const [now] = useState(today);
  const [picked, setPicked] = useState("");
  const day = picked || now;
  const { shown, search, pager, empty, toFirstPage } = usePaged(entries);

  // Today: anything not finished, plus everything added today. Past day: what was added that day.
  const load = useCallback(async () => {
    const start = new Date(`${day}T00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    let query = supabase.from("entries").select("*");
    query = picked
      ? query.gte("created_at", start.toISOString()).lt("created_at", end.toISOString())
      : query.or(`pending.gt.0,in_progress.gt.0,created_at.gte."${start.toISOString()}"`);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) show(error.message);
    else setEntries(data);
  }, [day, picked, show]);
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
    // Jump back to today so the new items show; changing the day reloads by itself.
    if (picked) setPicked("");
    else load();
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
                  className="h-11 w-11 shrink-0 rounded-lg border border-zinc-200 text-xl text-zinc-500 active:scale-[0.98]"
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
        <DayHeader
          title="Production"
          now={now}
          picked={picked}
          onPick={(d) => {
            setPicked(d);
            toFirstPage();
          }}
        />
        <div className="mt-4">{search}</div>
        {shown.length === 0 ? (
          <p className="py-8 text-center text-zinc-400">
            {empty(picked ? "Nothing added this day." : "Nothing in production.")}
          </p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {shown.map((e) => (
              <Card key={`${e.id}-${e.planned}-${e.in_progress}-${e.done}`} e={e} show={show} reload={load} />
            ))}
          </ul>
        )}
        {pager}
      </section>
      {toast}
    </>
  );
}

// Keyed on saved counts, so a change from another device resets the inputs.
function Card({ e, show, reload }: { e: Entry; show: (m: string) => void; reload: () => void }) {
  const [planned, setPlanned] = useState(String(e.planned));
  const [ip, setIp] = useState(String(e.in_progress));
  const [done, setDone] = useState(String(e.done));
  const [busy, setBusy] = useState(false);

  // Today production is out of qty; in progress + ready come out of today production.
  const [pl, i, d] = [planned, ip, done].map(Number);
  const problem = ![pl, i, d].every((v) => Number.isInteger(v) && v >= 0)
    ? "Enter whole numbers."
    : pl > e.qty
      ? `Today production can’t be more than ${e.qty}.`
      : i + d > pl
        ? `In progress + ready material can’t be more than today production (${pl}).`
        : "";
  const dirty = pl !== e.planned || i !== e.in_progress || d !== e.done;

  async function save() {
    setBusy(true);
    const { error } = await supabase
      .from("entries")
      .update({ planned: pl, pending: e.qty - i - d, in_progress: i, done: d })
      .eq("id", e.id);
    setBusy(false);
    show(error ? error.message : `✓ ${e.name} updated`);
    if (!error) reload();
  }

  // Runs only from the confirm dialog's Delete button.
  const confirmDlg = useRef<HTMLDialogElement>(null);
  async function remove() {
    setBusy(true);
    const { error } = await supabase.from("entries").delete().eq("id", e.id);
    setBusy(false);
    confirmDlg.current?.close();
    show(error ? error.message : `✓ ${e.name} deleted`);
    if (!error) reload();
  }

  const pct = (n: number) => `${(n / e.qty) * 100}%`;
  const field = (label: string, value: string, onChange: (v: string) => void) => (
    <label className="flex flex-col justify-end gap-1 text-xs text-zinc-500">
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
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{e.name}</div>
          <div className="mt-1 inline-block rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 tabular-nums">
            {when(e.created_at)}
          </div>
        </div>
        <button
          onClick={() => confirmDlg.current?.showModal()}
          disabled={busy}
          className={`${ghost} border-red-200 text-red-600`}
        >
          Delete
        </button>
      </div>
      <div className="mt-4 text-right text-sm tabular-nums text-zinc-500">
        <b className="font-semibold text-zinc-900">
          {e.done}/{e.qty}
        </b>{" "}
        ready
      </div>
      <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div className="bg-emerald-500" style={{ width: pct(e.done) }} />
        <div className="bg-amber-400" style={{ width: pct(e.in_progress) }} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="flex flex-col justify-end gap-1 text-xs text-zinc-500">
          Quantity
          <div className="flex h-11 items-center rounded-lg bg-zinc-100 px-3 text-base font-semibold tabular-nums text-zinc-900">
            {e.qty}
          </div>
        </div>
        {field("Today production", planned, setPlanned)}
        {field("In progress", ip, setIp)}
        {field("Ready material", done, setDone)}
      </div>
      {problem ? (
        <p className="mt-2 text-sm text-red-600">{problem}</p>
      ) : (
        pl - i - d > 0 && (
          <p className="mt-2 text-xs text-zinc-500 tabular-nums">
            {pl - i - d} of today’s {pl} not started yet
          </p>
        )
      )}
      {dirty && (
        <button onClick={save} disabled={!!problem || busy} className={`${button} mt-3 w-full`}>
          {busy ? "Saving…" : "Save"}
        </button>
      )}

      <dialog
        ref={confirmDlg}
        className="m-auto w-[min(90vw,360px)] rounded-2xl bg-white p-5 text-zinc-900 shadow-xl backdrop:bg-black/40"
      >
        <h3 className="text-lg font-semibold">Delete “{e.name}”?</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Quantity {e.qty}.
          {e.done > 0 && ` Its ${e.done} ready material will be removed from stock.`} This can’t be undone.
        </p>
        <form method="dialog" className="mt-5 flex gap-2">
          <button className="h-11 flex-1 rounded-lg border border-zinc-200 font-medium">Cancel</button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="h-11 flex-1 rounded-lg bg-red-600 font-medium text-white disabled:opacity-40"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </form>
      </dialog>
    </li>
  );
}
