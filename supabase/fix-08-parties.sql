-- Named parties: the DM groups the campaign's characters into parties ("Main party", "Away team"...).
-- The DM Suite's initiative tracker can then add or remove a whole party at once.
-- Only the DM can see or change parties. A character is in at most one party (the app keeps it that way).
-- Safe to run more than once.

create table if not exists parties (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  name text not null default 'Party',
  character_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists parties_campaign on parties(campaign_id);

alter table parties enable row level security;
drop policy if exists pt_dm on parties;
create policy pt_dm on parties for all using (is_dm(campaign_id)) with check (is_dm(campaign_id));

do $$ begin
  begin alter publication supabase_realtime add table parties; exception when duplicate_object then null; end;
end $$;
alter table parties replica identity full;
