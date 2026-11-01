-- Party notes and private notes. A note is either shared with the whole campaign ('shared')
-- or only for its writer and the DM ('private', what every earlier note was). Each player also gets
-- a private recap per session, written by the DM Suite's Summarize from their private notes.
-- Needs fix-04 and fix-05 first. Safe to run more than once.

alter table session_notes add column if not exists visibility text not null default 'private';
do $$ begin
  alter table session_notes add constraint session_notes_visibility check (visibility in ('shared', 'private'));
exception when duplicate_object then null; end $$;

-- Players see their own notes and everyone's party notes; the DM sees all of them.
drop policy if exists sn_read on session_notes;
create policy sn_read on session_notes for select using (
  author = auth.uid() or is_dm(campaign_id) or (visibility = 'shared' and not deleted and is_member(campaign_id)));

-- Private recaps: one per player per session. Only that player and the DM see it; only the DM writes it.
create table if not exists session_private_recaps (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  session_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  recap text not null default '',
  updated_at timestamptz not null default now(),
  primary key (campaign_id, session_id, user_id)
);
alter table session_private_recaps enable row level security;
drop policy if exists spr_read on session_private_recaps;
create policy spr_read on session_private_recaps for select using (user_id = auth.uid() or is_dm(campaign_id));
drop policy if exists spr_dm on session_private_recaps;
create policy spr_dm on session_private_recaps for all using (is_dm(campaign_id)) with check (is_dm(campaign_id));

-- Moving a character to a player's new device takes its notes and the old device's private recaps along.
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
  update session_private_recaps set user_id = p_user
    where campaign_id = ch.campaign_id and user_id = ch.owner
      and not exists(select 1 from session_private_recaps x where x.campaign_id = ch.campaign_id and x.user_id = p_user and x.session_id = session_private_recaps.session_id);
end $$;

do $$ begin
  begin alter publication supabase_realtime add table session_private_recaps; exception when duplicate_object then null; end;
end $$;
alter table session_private_recaps replica identity full;
