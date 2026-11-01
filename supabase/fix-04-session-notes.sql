-- Player session notes: players write notes on the current or a past session in the Companion,
-- and the DM Suite copies them into the campaign file.
-- Run once in the Supabase SQL Editor. Safe to run more than once.

-- The sessions players can attach notes to. The DM Suite publishes these (played sessions and the one being played now).
create table if not exists game_sessions (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  id text not null,                          -- the DM Suite's own session id
  title text not null default '',
  played_on text not null default '',        -- yyyy-mm-dd, or blank
  live boolean not null default false,       -- being played right now
  ord int not null default 0,
  ended_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (campaign_id, id)
);

-- One row per note. Players can edit their own notes; deleting one marks it deleted so the DM Suite
-- can drop its copy too, even if it was closed at the time.
create table if not exists session_notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  session_id text not null,
  author uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null default '',
  character_id uuid references characters(id) on delete set null,
  character_name text not null default '',
  body text not null check (char_length(body) between 1 and 8000),
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists session_notes_campaign on session_notes(campaign_id);

alter table game_sessions enable row level security;
alter table session_notes enable row level security;

-- Sessions: everyone in the campaign can see them; only the DM's devices change them.
drop policy if exists gs_read on game_sessions;
create policy gs_read on game_sessions for select using (is_member(campaign_id));
drop policy if exists gs_dm on game_sessions;
create policy gs_dm on game_sessions for all using (is_dm(campaign_id)) with check (is_dm(campaign_id));

-- Notes: a player sees and edits only their own; the DM sees all of them. Other players don't see them.
drop policy if exists sn_read on session_notes;
create policy sn_read on session_notes for select using (author = auth.uid() or is_dm(campaign_id));
drop policy if exists sn_insert on session_notes;
create policy sn_insert on session_notes for insert with check (
  author = auth.uid() and is_member(campaign_id)
  and exists(select 1 from game_sessions s where s.campaign_id = session_notes.campaign_id and s.id = session_notes.session_id)
  and (character_id is null or exists(select 1 from characters c where c.id = character_id and c.owner = auth.uid())));
drop policy if exists sn_update on session_notes;
create policy sn_update on session_notes for update using (author = auth.uid()) with check (author = auth.uid() and is_member(campaign_id));
drop policy if exists sn_delete on session_notes;
create policy sn_delete on session_notes for delete using (is_dm(campaign_id));

-- Moving a character to a player's new device takes that character's notes along.
create or replace function reassign_character(p_id uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ch characters;
begin
  select * into ch from characters where id = p_id;
  if ch.id is null then raise exception 'That character no longer exists.'; end if;
  if not is_dm(ch.campaign_id) then raise exception 'Only the DM can move characters.'; end if;
  if not exists(select 1 from members where campaign_id = ch.campaign_id and user_id = p_user) then raise exception 'That player isn''t in this campaign.'; end if;
  update characters set owner = p_user, version = version + 1, updated_at = now() where id = p_id;
  update session_notes set author = p_user where character_id = p_id;
end $$;

-- Live updates.
do $$ begin
  begin alter publication supabase_realtime add table game_sessions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table session_notes; exception when duplicate_object then null; end;
end $$;
alter table game_sessions replica identity full;
alter table session_notes replica identity full;
