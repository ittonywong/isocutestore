-- Members Shop schema (run in Supabase SQL editor when leaving DEMO_MODE)
-- Project: jdycdlbhmihtafxgfade (Singapore) — 總經理 applies this himself.
-- Frontend uses anon/publishable key ONLY. Never put service_role in the site.

create extension if not exists "pgcrypto";

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'member' check (role in ('member','admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own_nonrole"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = (select role from public.profiles p where p.id = auth.uid()));

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'member')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Products (CMS)
create table if not exists public.products (
  id text primary key,
  slug text unique,
  name_en text not null,
  name_zh text,
  desc_en text,
  desc_zh text,
  price_hkd numeric(10,2) not null default 0,
  price_nzd numeric(10,2) not null default 0,
  image text,
  image_alt text,
  stock_note_en text,
  stock_note_zh text,
  warnings text[] not null default '{}',
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "products_public_read_active"
  on public.products for select
  using (active = true or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

create policy "products_admin_write"
  on public.products for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Orders (scaffold — no payment capture yet)
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','pending_payment','paid','cancelled')),
  currency text not null default 'HKD',
  total numeric(12,2) not null default 0,
  pay_method text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text references public.products(id),
  qty int not null check (qty > 0),
  unit_price numeric(10,2) not null,
  title text
);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "orders_own"
  on public.orders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "order_items_own"
  on public.order_items for all
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()))
  with check (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- Promote 總經理: after first signup, in SQL editor (as project owner):
-- update public.profiles set role = 'admin' where email = 'YOUR@EMAIL';
