-- Ebon Star Companion: Supabase schema.
-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Also turn on: Authentication > Sign In / Providers > "Allow anonymous sign-ins".

create extension if not exists pgcrypto;

-- A campaign. The DM is whoever created it.
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique,
  dm_user uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Who belongs to which campaign.
create table if not exists members (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('dm','player')),
  display_name text not null default '',
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

-- One row per character. The whole sheet lives in `data` (JSON).
-- `version` goes up on every write so two people editing at once don't overwrite each other.
create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  version int not null default 1,
  updated_at timestamptz not null default now()
);
create index if not exists characters_campaign on characters(campaign_id);

-- Things the DM sends: items, features/skills, spells, gold, XP, level-ups.
-- The player accepts (it goes onto their sheet) or declines.
create table if not exists grants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  character_id uuid not null references characters(id) on delete cascade,
  kind text not null,
  payload jsonb not null,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now()
);
create index if not exists grants_character on grants(character_id);

-- The DM's homebrew library (items, features, spells). DM only.
create table if not exists homebrew (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  kind text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Helpers used by the security rules below.
create or replace function is_dm(c uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from members where campaign_id = c and user_id = auth.uid() and role = 'dm') $$;
create or replace function is_member(c uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from members where campaign_id = c and user_id = auth.uid()) $$;

alter table campaigns enable row level security;
alter table members enable row level security;
alter table characters enable row level security;
alter table grants enable row level security;
alter table homebrew enable row level security;

-- Campaigns: members can see their campaign. Creating goes through create_campaign().
drop policy if exists camp_read on campaigns;
create policy camp_read on campaigns for select using (is_member(id));
drop policy if exists camp_dm_update on campaigns;
create policy camp_dm_update on campaigns for update using (is_dm(id));

-- Members: everyone in a campaign can see who else is in it.
drop policy if exists mem_read on members;
create policy mem_read on members for select using (is_member(campaign_id));
drop policy if exists mem_dm_delete on members;
create policy mem_dm_delete on members for delete using (is_dm(campaign_id));

-- Characters: players see and edit only their own; the DM sees and edits all of them.
drop policy if exists ch_read on characters;
create policy ch_read on characters for select using (owner = auth.uid() or is_dm(campaign_id));
drop policy if exists ch_insert on characters;
create policy ch_insert on characters for insert with check (owner = auth.uid() and is_member(campaign_id));
drop policy if exists ch_update on characters;
create policy ch_update on characters for update using (owner = auth.uid() or is_dm(campaign_id));
drop policy if exists ch_delete on characters;
create policy ch_delete on characters for delete using (owner = auth.uid() or is_dm(campaign_id));

-- Grants: the DM creates them; the character's owner can read them and mark them accepted/declined.
drop policy if exists gr_read on grants;
create policy gr_read on grants for select using (is_dm(campaign_id) or exists(select 1 from characters c where c.id = character_id and c.owner = auth.uid()));
drop policy if exists gr_insert on grants;
create policy gr_insert on grants for insert with check (is_dm(campaign_id));
drop policy if exists gr_update on grants;
create policy gr_update on grants for update using (is_dm(campaign_id) or exists(select 1 from characters c where c.id = character_id and c.owner = auth.uid()));
drop policy if exists gr_delete on grants;
create policy gr_delete on grants for delete using (is_dm(campaign_id));

-- Homebrew library: DM only.
drop policy if exists hb_all on homebrew;
create policy hb_all on homebrew for all using (is_dm(campaign_id)) with check (is_dm(campaign_id));

-- Create a campaign (caller becomes DM). Returns the new campaign row.
create or replace function create_campaign(p_name text, p_display text) returns campaigns
language plpgsql security definer set search_path = public as $$
declare c campaigns; code text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists(select 1 from campaigns where join_code = code);
  end loop;
  insert into campaigns(name, join_code, dm_user) values (p_name, code, auth.uid()) returning * into c;
  insert into members(campaign_id, user_id, role, display_name) values (c.id, auth.uid(), 'dm', coalesce(p_display, 'DM'));
  return c;
end $$;

-- Join a campaign with its code. Returns the campaign row.
create or replace function join_campaign(p_code text, p_display text) returns campaigns
language plpgsql security definer set search_path = public as $$
declare c campaigns;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into c from campaigns where join_code = upper(trim(p_code));
  if c.id is null then raise exception 'No campaign with that code'; end if;
  insert into members(campaign_id, user_id, role, display_name) values (c.id, auth.uid(), 'player', coalesce(p_display, 'Player'))
    on conflict (campaign_id, user_id) do update set display_name = excluded.display_name;
  return c;
end $$;

-- Save a character only if nobody else saved it since we read it (returns the new version, or null on conflict).
create or replace function save_character(p_id uuid, p_version int, p_data jsonb) returns int
language plpgsql security invoker set search_path = public as $$
declare v int;
begin
  update characters set data = p_data, version = version + 1, updated_at = now()
    where id = p_id and version = p_version returning version into v;
  return v;
end $$;

-- DM devices: the DM Suite joins as a second DM with a one-time code from the Companion.
create table if not exists dm_invites (
  code text primary key,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
alter table dm_invites enable row level security; -- no policies: only the two functions below touch it

create or replace function create_dm_invite(p_campaign uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text := '';
begin
  if not is_dm(p_campaign) then raise exception 'Only the DM can do that'; end if;
  delete from dm_invites where expires_at < now();
  for i in 1..10 loop
    code := code || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1);
  end loop;
  insert into dm_invites(code, campaign_id, created_by, expires_at) values (code, p_campaign, auth.uid(), now() + interval '30 minutes');
  return code;
end $$;

create or replace function redeem_dm_invite(p_code text, p_display text) returns campaigns
language plpgsql security definer set search_path = public as $$
declare inv dm_invites; c campaigns;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into inv from dm_invites where code = upper(trim(p_code)) and expires_at > now();
  if inv.code is null then raise exception 'That code has expired or was already used. Make a new one in the Companion.'; end if;
  insert into members(campaign_id, user_id, role, display_name) values (inv.campaign_id, auth.uid(), 'dm', coalesce(p_display, 'DM Suite'))
    on conflict (campaign_id, user_id) do update set role = 'dm', display_name = excluded.display_name;
  delete from dm_invites where code = inv.code;
  select * into c from campaigns where id = inv.campaign_id;
  return c;
end $$;

-- Player session notes (see fix-04-session-notes.sql).
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

-- Move a character to another player (new phone, lost browser data).
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
  begin alter publication supabase_realtime add table characters; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table grants; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table game_sessions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table session_notes; exception when duplicate_object then null; end;
end $$;
alter table characters replica identity full;
alter table grants replica identity full;
alter table game_sessions replica identity full;
alter table session_notes replica identity full;
