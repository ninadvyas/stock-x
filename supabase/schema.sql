-- Run once in Supabase → SQL Editor.

-- One row per item added. pending + in_progress + done always equals qty.
-- planned = today's production out of qty; in_progress and done come out of it.
create table public.entries (
  id bigint generated always as identity primary key,
  name text not null check (btrim(name) <> ''),
  qty int not null check (qty > 0),
  pending int not null check (pending >= 0),
  in_progress int not null default 0 check (in_progress >= 0),
  done int not null default 0 check (done >= 0),
  planned int not null default 0,
  created_at timestamptz not null default now(),
  check (pending + in_progress + done = qty),
  check (in_progress + done <= planned and planned <= qty)
);

-- Every change to "done" is logged here with a timestamp. Stock for any day is
-- summed from this, so closing stock of one day is the opening of the next.
create table public.stock_moves (
  id bigint generated always as identity primary key,
  name text not null,
  qty int not null,
  created_at timestamptz not null default now()
);

create function public.log_done() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  -- new is null on delete, old is null on insert; deleting takes its ready material back out of stock
  d int := coalesce(new.done, 0) - coalesce(old.done, 0);
begin
  if d <> 0 then
    insert into public.stock_moves (name, qty) values (coalesce(new.name, old.name), d);
  end if;
  return null;
end $$;

create trigger log_done after insert or update of done or delete on public.entries
for each row execute function public.log_done();

-- Opening / ready / closing per item for day d in timezone tz.
create function public.stock_on(d date, tz text)
returns table (name text, opening int, ready int, closing int)
language sql stable as $$
  select m.name,
    coalesce(sum(m.qty) filter (where (m.created_at at time zone tz)::date < d), 0)::int,
    coalesce(sum(m.qty) filter (where (m.created_at at time zone tz)::date = d), 0)::int,
    coalesce(sum(m.qty) filter (where (m.created_at at time zone tz)::date <= d), 0)::int
  from public.stock_moves m
  group by m.name
  having bool_or((m.created_at at time zone tz)::date <= d)
  order by m.name
$$;

-- Only signed-in users. Staff can change status counts, never name/qty/date.
-- Admin is view-only.
alter table public.entries enable row level security;
alter table public.stock_moves enable row level security;
create policy "read" on public.entries for select to authenticated using (true);
create policy "add" on public.entries for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin');
create policy "update" on public.entries for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin');
create policy "delete" on public.entries for delete to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin');
create policy "read" on public.stock_moves for select to authenticated using (true);
revoke all on public.entries, public.stock_moves from anon;
revoke update on public.entries from authenticated;
grant update (pending, in_progress, done, planned) on public.entries to authenticated;

-- Live updates on both screens.
alter publication supabase_realtime add table public.entries;
