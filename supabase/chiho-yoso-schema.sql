-- 地方競馬予想ボード（WEBアプリ版）の保存先。Supabase の SQL Editor に貼って1回だけ実行する。
-- 記録は1件ずつ docs に入る。ログインした本人の行だけ読み書きできる（Row Level Security）。

create table if not exists public.docs (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner, collection, id)
);

alter table public.docs enable row level security;

drop policy if exists "docs: read own" on public.docs;
drop policy if exists "docs: insert own" on public.docs;
drop policy if exists "docs: update own" on public.docs;
drop policy if exists "docs: delete own" on public.docs;
create policy "docs: read own" on public.docs for select using (auth.uid() = owner);
create policy "docs: insert own" on public.docs for insert with check (auth.uid() = owner);
create policy "docs: update own" on public.docs for update using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "docs: delete own" on public.docs for delete using (auth.uid() = owner);

-- スマホとPCで同時に開いている時に、もう片方へすぐ反映させる（Realtime）
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;
