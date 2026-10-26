"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

export type Entry = {
  id: number;
  name: string;
  qty: number;
  pending: number;
  in_progress: number;
  done: number;
  planned: number;
  created_at: string;
};

// Local date as YYYY-MM-DD.
export const today = () => new Date().toLocaleDateString("en-CA");

export const input =
  "h-11 rounded-lg border border-zinc-200 bg-white px-3 text-base outline-none focus:border-zinc-900";
export const button =
  "h-11 rounded-lg bg-zinc-900 px-4 font-medium text-white active:scale-[0.98] disabled:opacity-40";
// Small outlined button; add a border + text colour at the call site.
export const ghost =
  "h-8 shrink-0 rounded-md border bg-white px-3 text-xs font-medium active:scale-[0.98] disabled:opacity-40";

// Runs load now, whenever any entry changes from any device, and when the app is reopened
// (a sleeping phone misses live updates).
export function useLive(load: () => void) {
  useEffect(() => {
    load();
    const ch = supabase
      .channel(`entries-${Math.random()}`) // crypto.randomUUID needs https; phones on LAN use http
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, load)
      .subscribe();
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      void supabase.removeChannel(ch);
    };
  }, [load]);
}

// Today's date, rolling over by itself at midnight.
export function useToday() {
  const [d, setD] = useState(today);
  useEffect(() => {
    const t = setInterval(() => setD(today()), 60_000);
    return () => clearInterval(t);
  }, []);
  return d;
}

// Title + date picker. picked "" means today, so the screen follows the clock past midnight.
export function DayHeader(props: { title: string; now: string; picked: string; onPick: (d: string) => void }) {
  const { title, now, picked, onPick } = props;
  const day = picked || now;
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-zinc-400">
          {picked ? "" : "Today, "}
          {new Date(`${day}T00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
        </p>
        {picked && (
          <button onClick={() => onPick("")} className={`${ghost} mt-2 border-zinc-200 text-zinc-700`}>
            ← Back to today
          </button>
        )}
      </div>
      <input
        type="date"
        aria-label="Day"
        value={day}
        max={now}
        onChange={(e) => onPick(e.target.value === now ? "" : e.target.value)}
        className={`${input} shrink-0`}
      />
    </div>
  );
}

const PER_PAGE = 5;
const pagerBtn = "h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium disabled:opacity-30";

// Name search + 5 per page with Prev / Next.
export function usePaged<T extends { name: string }>(items: T[]) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const term = q.trim().toLowerCase();
  const found = items.filter((r) => r.name.toLowerCase().includes(term));
  const pages = Math.max(1, Math.ceil(found.length / PER_PAGE));
  const p = Math.min(page, pages - 1);
  const shown = found.slice(p * PER_PAGE, (p + 1) * PER_PAGE);

  const search = (
    <input
      type="search"
      placeholder="Search item"
      aria-label="Search item"
      value={q}
      onChange={(e) => {
        setQ(e.target.value);
        setPage(0);
      }}
      className={`${input} w-full`}
    />
  );
  const pager = found.length > 0 && (
    <div className="mt-4 flex items-center justify-between">
      <button disabled={p === 0} onClick={() => setPage(p - 1)} className={pagerBtn}>
        ← Prev
      </button>
      <span className="text-sm text-zinc-500 tabular-nums">
        {p * PER_PAGE + 1}–{p * PER_PAGE + shown.length} of {found.length}
      </span>
      <button disabled={p >= pages - 1} onClick={() => setPage(p + 1)} className={pagerBtn}>
        Next →
      </button>
    </div>
  );
  const empty = (fallback: string) => (term ? `No item matches “${q.trim()}”` : fallback);
  return { shown, search, pager, empty, toFirstPage: () => setPage(0) };
}

export function useToast() {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 2500);
    return () => clearTimeout(t);
  }, [msg]);
  const node = (
    <div
      role="status"
      className={`fixed inset-x-0 bottom-6 mx-auto w-fit max-w-[90vw] rounded-full bg-zinc-900 px-5 py-3 text-sm text-white shadow-lg transition ${msg ? "" : "pointer-events-none translate-y-4 opacity-0"}`}
    >
      {msg}
    </div>
  );
  return [node, setMsg] as const;
}

// Each role gets one screen: admin → Stock, staff → Production.
export function Shell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>();
  const path = usePathname();
  const router = useRouter();
  const home = session?.user.app_metadata.role === "admin" ? "/admin" : "/";

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session && path !== home) router.replace(home);
  }, [session, path, home, router]);

  if (session === undefined) return null;
  if (!session) return <Login />;
  if (path !== home) return null;

  return (
    <>
      <header className="mb-8 flex items-center gap-3 text-sm text-zinc-400">
        <span className="truncate">{session.user.email}</span>
        <button onClick={() => supabase.auth.signOut()} className={`${ghost} ml-auto border-zinc-200 text-zinc-700`}>
          Sign out
        </button>
      </header>
      {children}
    </>
  );
}

function Login() {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(f.get("email")),
      password: String(f.get("password")),
    });
    setBusy(false);
    setErr(error?.message ?? "");
  }

  return (
    <form onSubmit={submit} className="mt-16 grid gap-3">
      <h1 className="mb-2 text-xl font-semibold">Sign in</h1>
      <input name="email" type="email" placeholder="Email" required autoComplete="email" className={`${input} w-full`} />
      <input name="password" type="password" placeholder="Password" required autoComplete="current-password" className={`${input} w-full`} />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button disabled={busy} className={button}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
