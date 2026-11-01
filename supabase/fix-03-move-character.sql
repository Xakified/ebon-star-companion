-- Lets the DM move a character to another player in the campaign,
-- e.g. when a player gets a new phone and joins again as a new person.
-- Safe to run more than once.
create or replace function reassign_character(p_id uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ch characters;
begin
  select * into ch from characters where id = p_id;
  if ch.id is null then raise exception 'That character no longer exists.'; end if;
  if not is_dm(ch.campaign_id) then raise exception 'Only the DM can move characters.'; end if;
  if not exists(select 1 from members where campaign_id = ch.campaign_id and user_id = p_user) then raise exception 'That player isn''t in this campaign.'; end if;
  update characters set owner = p_user, version = version + 1, updated_at = now() where id = p_id;
end $$;
