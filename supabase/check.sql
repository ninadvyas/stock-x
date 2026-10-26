-- Paste in SQL Editor after schema.sql. Everything rolls back; no data is kept.
begin;
do $$
declare
  eid bigint;
  n int;
  r record;
  tz text := 'Asia/Kolkata';
  d date := (now() at time zone 'Asia/Kolkata')::date;
begin
  -- 50 were ready yesterday
  insert into public.stock_moves (name, qty, created_at) values ('__check', 50, now() - interval '1 day');

  -- 100 added today, 30 done
  insert into public.entries (name, qty, pending) values ('__check', 100, 100) returning id into eid;
  update public.entries set pending = 40, in_progress = 30, done = 30 where id = eid;
  select * into r from public.stock_on(d, tz) where name = '__check';
  assert r.opening = 50 and r.ready = 30 and r.closing = 80, format('today: %s', r);

  -- correction: only 20 actually done
  update public.entries set pending = 50, done = 20 where id = eid;
  select * into r from public.stock_on(d, tz) where name = '__check';
  assert r.ready = 20 and r.closing = 70, format('after fix: %s', r);

  -- today's closing is tomorrow's opening
  select * into r from public.stock_on(d + 1, tz) where name = '__check';
  assert r.opening = 70 and r.ready = 0 and r.closing = 70, format('tomorrow: %s', r);

  -- counts must add up to qty
  begin
    update public.entries set done = 99 where id = eid;
    raise exception 'sum check missing';
  exception when check_violation then null;
  end;

  -- admin is view-only
  perform set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"admin"}}', true);
  set local role authenticated;
  begin
    insert into public.entries (name, qty, pending) values ('__check', 1, 1);
    raise exception 'admin could add';
  exception when insufficient_privilege then null;
  end;
  update public.entries set pending = 100, in_progress = 0, done = 0 where id = eid;
  get diagnostics n = row_count;
  assert n = 0, 'admin could update';
  assert (select count(*) from public.entries where id = eid) = 1, 'admin cannot read';

  -- staff can add and update
  perform set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{}}', true);
  insert into public.entries (name, qty, pending) values ('__check', 1, 1);
  update public.entries set pending = 100, in_progress = 0, done = 0 where id = eid;
  get diagnostics n = row_count;
  assert n = 1, 'staff could not update';
  reset role;

  raise notice 'all checks passed';
end $$;
rollback;
