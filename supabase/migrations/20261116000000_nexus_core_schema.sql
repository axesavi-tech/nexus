-- NEXUS core schema (applied to Supabase project "nexus", ref pnxuwejrdfgumtxmhxoi, on 2026-11-16)
-- Relational tables + a node/edge graph. Every table is tenant-isolated by owner via row-level security.
create extension if not exists pgcrypto;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  thought text not null,
  mode text not null default 'guided' check (mode in ('free','guided','strategic')),
  stage text not null default 'thought',
  interpretation jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nodes (
  id text not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  type text not null,
  title text not null,
  description text default '',
  status text default 'open',
  tags text[] default '{}',
  parent_id text,
  x double precision default 0,
  y double precision default 0,
  data jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, id)
);

create table public.edges (
  id text not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  source text not null,
  target text not null,
  kind text not null default 'child' check (kind in ('child','crosslink','supports','contradicts','depends_on','derived_from','implements')),
  label text,
  created_at timestamptz not null default now(),
  primary key (project_id, id)
);

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  kind text not null check (kind in ('ideas','evaluation','blueprint','roadmap','frameworks','assumptions','decision','narrative')),
  content jsonb not null,
  version int not null default 1,
  source_node_ids text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, kind)
);

create table public.tasks (
  id text not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  title text not null,
  description text default '',
  assignee text,
  due_date date,
  priority text default 'medium',
  status text default 'todo' check (status in ('todo','doing','blocked','done')),
  depends_on text[] default '{}',
  acceptance_criteria text[] default '{}',
  evidence_of_completion text,
  milestone_id text,
  related_node_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, id)
);

create table public.versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  label text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  project_id uuid references public.projects(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  actor text not null default 'user',
  event text not null,
  detail jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  project_id uuid,
  operation text not null,
  model text,
  input_tokens int,
  output_tokens int,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);

create index on public.projects(owner_id, updated_at desc);
create index on public.nodes(project_id);
create index on public.edges(project_id);
create index on public.tasks(project_id);
create index on public.versions(project_id, created_at desc);
create index on public.audit_events(project_id, created_at desc);
create index on public.ai_runs(owner_id, created_at desc);

alter table public.projects enable row level security;
alter table public.nodes enable row level security;
alter table public.edges enable row level security;
alter table public.artifacts enable row level security;
alter table public.tasks enable row level security;
alter table public.versions enable row level security;
alter table public.audit_events enable row level security;
alter table public.ai_runs enable row level security;

create policy "own projects" on public.projects for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "own nodes" on public.nodes for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "own edges" on public.edges for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "own artifacts" on public.artifacts for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "own tasks" on public.tasks for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "own versions" on public.versions for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "own audit read" on public.audit_events for select to authenticated using (owner_id = (select auth.uid()));
create policy "own audit insert" on public.audit_events for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "own ai runs read" on public.ai_runs for select to authenticated using (owner_id = (select auth.uid()));
create policy "own ai runs insert" on public.ai_runs for insert to authenticated with check (owner_id = (select auth.uid()));

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger t_projects before update on public.projects for each row execute function public.touch_updated_at();
create trigger t_nodes before update on public.nodes for each row execute function public.touch_updated_at();
create trigger t_artifacts before update on public.artifacts for each row execute function public.touch_updated_at();
create trigger t_tasks before update on public.tasks for each row execute function public.touch_updated_at();
