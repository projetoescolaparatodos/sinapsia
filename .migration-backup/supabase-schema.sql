-- Sinapsia - Supabase schema
-- Execute no Supabase Dashboard > SQL Editor.

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  document_state jsonb default null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists boards_set_updated_at on public.boards;
create trigger boards_set_updated_at
before update on public.boards
for each row
execute function public.set_updated_at();

alter table public.boards enable row level security;

drop policy if exists boards_select_public on public.boards;
create policy boards_select_public
  on public.boards
  for select
  using (true);

drop policy if exists boards_insert_public on public.boards;
create policy boards_insert_public
  on public.boards
  for insert
  with check (true);

drop policy if exists boards_update_public on public.boards;
create policy boards_update_public
  on public.boards
  for update
  using (true)
  with check (true);

-- Depois de executar este schema, habilite Realtime para public.boards:
-- Dashboard > Database > Replication > boards > Enable.
-- Se o comando abaixo falhar porque a tabela ja esta na publication, pode ignorar.
alter publication supabase_realtime add table public.boards;
