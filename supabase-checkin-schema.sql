-- Supabase SQL Editor 里执行一次即可。
-- 这张表只保存每个用户的一份完整打卡进度 JSON。

create table if not exists public.checkin_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.checkin_states enable row level security;

create or replace function public.set_checkin_states_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_checkin_states_updated_at on public.checkin_states;
create trigger set_checkin_states_updated_at
before update on public.checkin_states
for each row
execute function public.set_checkin_states_updated_at();

drop policy if exists "Users can read own checkin state" on public.checkin_states;
create policy "Users can read own checkin state"
on public.checkin_states
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own checkin state" on public.checkin_states;
create policy "Users can insert own checkin state"
on public.checkin_states
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own checkin state" on public.checkin_states;
create policy "Users can update own checkin state"
on public.checkin_states
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own checkin state" on public.checkin_states;
create policy "Users can delete own checkin state"
on public.checkin_states
for delete
to authenticated
using (auth.uid() = user_id);

-- 公开最新快照：游客只能读取这一份，登录用户同步时更新它。
create table if not exists public.public_checkin_snapshots (
  id text primary key default 'latest',
  user_id uuid references auth.users(id) on delete set null,
  state_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.public_checkin_snapshots enable row level security;

drop trigger if exists set_public_checkin_snapshots_updated_at on public.public_checkin_snapshots;
create trigger set_public_checkin_snapshots_updated_at
before update on public.public_checkin_snapshots
for each row
execute function public.set_checkin_states_updated_at();

drop policy if exists "Anyone can read latest public checkin snapshot" on public.public_checkin_snapshots;
create policy "Anyone can read latest public checkin snapshot"
on public.public_checkin_snapshots
for select
to anon, authenticated
using (id = 'latest');

drop policy if exists "Signed in users can create latest public checkin snapshot" on public.public_checkin_snapshots;
create policy "Signed in users can create latest public checkin snapshot"
on public.public_checkin_snapshots
for insert
to authenticated
with check (id = 'latest' and auth.uid() = user_id);

drop policy if exists "Snapshot owner can update latest public checkin snapshot" on public.public_checkin_snapshots;
create policy "Snapshot owner can update latest public checkin snapshot"
on public.public_checkin_snapshots
for update
to authenticated
using (id = 'latest' and auth.uid() = user_id)
with check (id = 'latest' and auth.uid() = user_id);
