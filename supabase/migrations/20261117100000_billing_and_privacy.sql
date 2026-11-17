-- NEXUS billing (prepaid credits) and privacy support.
-- Credits are only ever granted by trusted server code (service role) or by the signup trigger,
-- and only ever spent through nexus_charge(), which can only take credits from the caller's own wallet.

-- ---------- Wallets ----------
create table public.billing_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0,
  lifetime_purchased integer not null default 0,
  lifetime_spent integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------- Ledger (append-only) ----------
create table public.billing_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  balance_after integer not null,
  kind text not null check (kind in ('signup_bonus','purchase','usage','refund','adjustment')),
  operation text,
  project_id uuid,
  ref text,
  cost_inr numeric(12,4),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.billing_ledger(user_id, created_at desc);

-- ---------- Orders (kept for tax records; user link nulled on account deletion) ----------
create table public.billing_orders (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  pack_id text not null,
  credits integer not null check (credits > 0),
  amount_inr numeric(12,2) not null check (amount_inr > 0),
  currency text not null default 'INR',
  status text not null default 'created' check (status in ('created','paid','failed','refunded')),
  gateway text not null default 'cashfree',
  gateway_ref text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index on public.billing_orders(user_id, created_at desc);

-- ---------- Cost tracking on AI runs ----------
alter table public.ai_runs add column if not exists cost_inr numeric(12,4);
alter table public.ai_runs add column if not exists credits integer;

-- ---------- RLS: users can read their own billing data; nobody writes directly ----------
alter table public.billing_wallets enable row level security;
alter table public.billing_ledger enable row level security;
alter table public.billing_orders enable row level security;
create policy "own wallet read" on public.billing_wallets for select to authenticated using (user_id = (select auth.uid()));
create policy "own ledger read" on public.billing_ledger for select to authenticated using (user_id = (select auth.uid()));
create policy "own orders read" on public.billing_orders for select to authenticated using (user_id = (select auth.uid()));

-- ---------- Signup bonus ----------
create or replace function public.nexus_on_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare bonus integer := 75;
begin
  insert into public.billing_wallets(user_id, balance) values (new.id, bonus) on conflict do nothing;
  insert into public.billing_ledger(user_id, delta, balance_after, kind, ref) values (new.id, bonus, bonus, 'signup_bonus', 'welcome');
  return new;
end; $$;
revoke all on function public.nexus_on_signup() from public, anon, authenticated;
create trigger nexus_on_signup after insert on auth.users for each row execute function public.nexus_on_signup();

-- Existing accounts get the same welcome credits.
insert into public.billing_wallets(user_id, balance)
  select id, 75 from auth.users on conflict do nothing;
insert into public.billing_ledger(user_id, delta, balance_after, kind, ref)
  select w.user_id, 75, 75, 'signup_bonus', 'welcome' from public.billing_wallets w
  where not exists (select 1 from public.billing_ledger l where l.user_id = w.user_id);

-- ---------- Spend: server (service role) only; the API route charges the verified caller ----------
create or replace function public.nexus_charge(p_user uuid, p_credits integer, p_operation text, p_project uuid, p_cost_inr numeric, p_meta jsonb default '{}'::jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare bal integer;
begin
  if p_user is null then raise exception 'no user'; end if;
  if p_credits is null or p_credits < 1 or p_credits > 5000 then raise exception 'invalid charge'; end if;
  insert into public.billing_wallets(user_id, balance) values (p_user, 0) on conflict do nothing;
  update public.billing_wallets set balance = balance - p_credits, lifetime_spent = lifetime_spent + p_credits, updated_at = now()
    where user_id = p_user returning balance into bal;
  insert into public.billing_ledger(user_id, delta, balance_after, kind, operation, project_id, cost_inr, meta)
    values (p_user, -p_credits, bal, 'usage', left(p_operation, 40), p_project, p_cost_inr, coalesce(p_meta, '{}'::jsonb));
  return bal;
end; $$;
revoke all on function public.nexus_charge(uuid, integer, text, uuid, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.nexus_charge(uuid, integer, text, uuid, numeric, jsonb) to service_role;

-- ---------- Grant purchased credits: server (service role) only, idempotent per order ----------
create or replace function public.nexus_complete_order(p_order_id text, p_gateway_ref text, p_amount numeric)
returns text language plpgsql security definer set search_path = '' as $$
declare o public.billing_orders%rowtype; bal integer;
begin
  select * into o from public.billing_orders where id = p_order_id for update;
  if not found then return 'unknown_order'; end if;
  if o.status = 'paid' then return 'already_paid'; end if;
  if p_amount is null or abs(p_amount - o.amount_inr) > 0.009 then
    update public.billing_orders set status = 'failed', gateway_ref = p_gateway_ref where id = p_order_id;
    return 'amount_mismatch';
  end if;
  update public.billing_orders set status = 'paid', gateway_ref = p_gateway_ref, paid_at = now() where id = p_order_id;
  if o.user_id is null then return 'paid_no_user'; end if;
  insert into public.billing_wallets(user_id, balance) values (o.user_id, 0) on conflict do nothing;
  update public.billing_wallets set balance = balance + o.credits, lifetime_purchased = lifetime_purchased + o.credits, updated_at = now()
    where user_id = o.user_id returning balance into bal;
  insert into public.billing_ledger(user_id, delta, balance_after, kind, ref, meta)
    values (o.user_id, o.credits, bal, 'purchase', o.id, jsonb_build_object('pack', o.pack_id, 'amount_inr', o.amount_inr));
  return 'paid';
end; $$;
revoke all on function public.nexus_complete_order(text, text, numeric) from public, anon, authenticated;
grant execute on function public.nexus_complete_order(text, text, numeric) to service_role;

-- ---------- Erasure helper for account deletion (service role only) ----------
create or replace function public.nexus_erase_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.projects where owner_id = p_user;       -- cascades nodes, edges, artifacts, tasks, versions, audit events
  delete from public.audit_events where owner_id = p_user;
  delete from public.ai_runs where owner_id = p_user;
  -- billing_orders keep amounts for statutory tax records; the user link is nulled when the auth user is deleted.
end; $$;
revoke all on function public.nexus_erase_user(uuid) from public, anon, authenticated;
grant execute on function public.nexus_erase_user(uuid) to service_role;
