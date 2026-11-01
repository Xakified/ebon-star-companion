-- Lets the desktop DM Suite join your campaign as a second DM device.
-- The Companion makes a one-time code (good for 30 minutes); the DM Suite redeems it.
-- Safe to run more than once.

-- A campaign can now have more than one DM device: anyone with the 'dm' role counts.
create or replace function is_dm(c uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from members where campaign_id = c and user_id = auth.uid() and role = 'dm') $$;

drop policy if exists camp_dm_update on campaigns;
create policy camp_dm_update on campaigns for update using (is_dm(id));

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
