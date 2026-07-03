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
