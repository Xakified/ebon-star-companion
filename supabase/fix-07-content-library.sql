-- Content library: rules content the DM adds from their own books (species, backgrounds, feats,
-- classes, subclasses, spells), shared with the players' character builder.
-- Only members of the campaign can read it, and only the DM can add, change or remove it.
-- Book content lives only here, never in the app's code. Safe to run more than once.

create table if not exists content_packs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  name text not null,
  abbr text not null default '',
  enabled boolean not null default true,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists content_packs_campaign on content_packs(campaign_id);

alter table content_packs enable row level security;
drop policy if exists cp_read on content_packs;
create policy cp_read on content_packs for select using (is_member(campaign_id));
drop policy if exists cp_dm on content_packs;
create policy cp_dm on content_packs for all using (is_dm(campaign_id)) with check (is_dm(campaign_id));

do $$ begin
  begin alter publication supabase_realtime add table content_packs; exception when duplicate_object then null; end;
end $$;
alter table content_packs replica identity full;
