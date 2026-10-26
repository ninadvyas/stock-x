# Stock

Staff add items and track production (pending / in progress / done). Admin sees daily opening, ready and closing stock. Updates show live on every open screen.

## Setup

1. Create a free project at [supabase.com](https://supabase.com).
2. SQL Editor → paste and run `supabase/schema.sql`. Then run `supabase/check.sql`; it should print `all checks passed`.
3. Authentication → Users → **Add user** for each staff member and for the boss (email + password). Turn off public sign-ups under Authentication → Sign In / Providers.
4. Make the boss an admin (SQL Editor):
   ```sql
   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
   where email = 'boss@example.com';
   ```
5. `cp .env.example .env.local` and fill in the URL and publishable key from Project Settings → API.
6. `npm install && npm run dev` → http://localhost:3000

Deploy: push to GitHub, import on Vercel, add the same two env vars.

## How stock works

Every time a "done" count changes, the database logs the difference with a timestamp (`stock_moves`). For any day:

- **Opening** = everything ready before that day (= previous day's closing)
- **Ready** = done that day
- **Closing** = opening + ready (= next day's opening)
