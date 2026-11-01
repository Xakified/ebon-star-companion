-- Fix: Supabase keeps gen_random_bytes outside the public schema, so create the join code without it.
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
