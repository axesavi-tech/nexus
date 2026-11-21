-- Billing (plans, credits, payments) and the professionals directory.
-- Users can READ their own billing rows but never write them: grants happen only through the server
-- (service role, after a verified payment) and credits are consumed only through unlock_project().

-- ---------------------------------------------------------------- billing
create table public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text check (plan in ('founder','pro')),
  plan_until timestamptz,
  plan_credits int not null default 0 check (plan_credits >= 0),
  credits int not null default 0 check (credits >= 0),
  updated_at timestamptz not null default now()
);
create table public.project_unlocks (
  project_id uuid primary key references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('plan','credit','grant')),
  created_at timestamptz not null default now()
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null,
  amount int not null check (amount > 0),                  -- smallest currency unit (paise)
  currency text not null default 'INR',
  provider text not null default 'razorpay',
  provider_order_id text unique,
  provider_payment_id text,
  status text not null default 'created' check (status in ('created','paid','failed','refunded')),
  listing_id uuid,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index on public.payments(user_id, created_at desc);

alter table public.entitlements enable row level security;
alter table public.project_unlocks enable row level security;
alter table public.payments enable row level security;
create policy "own entitlements read" on public.entitlements for select to authenticated using (user_id = (select auth.uid()));
create policy "own unlocks read" on public.project_unlocks for select to authenticated using (user_id = (select auth.uid()));
create policy "own payments read" on public.payments for select to authenticated using (user_id = (select auth.uid()));

-- Atomically spend one credit to unlock a project the caller owns. Plan credits (which expire) go first.
create or replace function public.unlock_project(p_project uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); e public.entitlements%rowtype; src text;
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  if not exists (select 1 from public.projects p where p.id = p_project and p.owner_id = uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_owner'); end if;
  if exists (select 1 from public.project_unlocks u where u.project_id = p_project) then
    return jsonb_build_object('ok', true, 'already', true); end if;
  select * into e from public.entitlements where user_id = uid for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_credits'); end if;
  if e.plan_until is not null and e.plan_until > now() and e.plan_credits > 0 then
    update public.entitlements set plan_credits = plan_credits - 1, updated_at = now() where user_id = uid; src := 'plan';
  elsif e.credits > 0 then
    update public.entitlements set credits = credits - 1, updated_at = now() where user_id = uid; src := 'credit';
  else
    return jsonb_build_object('ok', false, 'reason', 'no_credits');
  end if;
  insert into public.project_unlocks(project_id, user_id, source) values (p_project, uid, src);
  return jsonb_build_object('ok', true, 'source', src);
end; $$;
revoke all on function public.unlock_project(uuid) from public, anon;
grant execute on function public.unlock_project(uuid) to authenticated;

-- ---------------------------------------------------------------- directory
create table public.pros (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  firm text check (char_length(firm) <= 160),
  services text[] not null check (cardinality(services) between 1 and 8),
  country text not null check (char_length(country) = 2),
  city text check (char_length(city) <= 80),
  languages text[] not null default '{}',
  about text check (char_length(about) <= 1200),
  website text check (website is null or website ~* '^https://'),
  email text check (char_length(email) <= 200),
  phone text check (char_length(phone) <= 40),
  registration text check (char_length(registration) <= 200),   -- e.g. ICAI / ICSI / Bar Council number
  tier text not null default 'none' check (tier in ('none','verified','featured','premium')),
  status text not null default 'draft' check (status in ('draft','pending_review','active','rejected')),
  paid_until timestamptz,
  verified_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.pros(country, status, tier);
create trigger t_pros before update on public.pros for each row execute function public.touch_updated_at();
alter table public.pros enable row level security;
-- Anyone (signed in or not) sees live, paid listings. Owners see their own in any state.
create policy "public live listings" on public.pros for select to anon, authenticated
  using (status = 'active' and paid_until > now());
create policy "own listings read" on public.pros for select to authenticated using (owner_id = (select auth.uid()));
create policy "own listings insert" on public.pros for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "own listings update" on public.pros for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "own listings delete" on public.pros for delete to authenticated using (owner_id = (select auth.uid()));
-- Owners may only write their profile fields; tier, status, payment and verification are set by the server.
revoke insert, update on public.pros from anon, authenticated;
grant insert (name, firm, services, country, city, languages, about, website, email, phone, registration) on public.pros to authenticated;
grant update (name, firm, services, country, city, languages, about, website, email, phone, registration) on public.pros to authenticated;

create table public.pro_enquiries (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references public.pros(id) on delete cascade,
  from_user uuid not null default auth.uid() references auth.users(id) on delete cascade,
  from_email text not null check (char_length(from_email) <= 200),
  message text not null check (char_length(message) between 10 and 2000),
  created_at timestamptz not null default now()
);
alter table public.pro_enquiries enable row level security;
-- Founders can message premium listings; the professional reads enquiries for their own listings.
create policy "send enquiry" on public.pro_enquiries for insert to authenticated with check (
  from_user = (select auth.uid()) and exists (select 1 from public.pros p where p.id = pro_id and p.status = 'active' and p.tier = 'premium' and p.paid_until > now()));
create policy "read own enquiries" on public.pro_enquiries for select to authenticated using (
  from_user = (select auth.uid()) or exists (select 1 from public.pros p where p.id = pro_id and p.owner_id = (select auth.uid())));
