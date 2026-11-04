-- Battle maps: the DM Suite's virtual tabletop.
-- The DM uploads maps, sets the grid, places tokens and paints fog of war in the DM Suite's Battle Map tab.
-- Players see the map the DM is showing in the Companion's Map tab, move their own character's token,
-- measure, and drop spell templates. Everything updates live on the big screen.
-- Run this once in the Supabase SQL Editor. Safe to run more than once.

-- A map: its picture (in the battle-maps storage bucket), grid, fog of war, and whether players can see it.
create table if not exists battle_maps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  name text not null default 'Map',
  image_path text not null default '',          -- <campaign id>/<file> in the battle-maps bucket
  width int not null default 0,                 -- picture size in pixels
  height int not null default 0,
  grid jsonb not null default '{}'::jsonb,      -- { size, ox, oy, show, color, opacity, ft, diag }
  fog jsonb not null default '{}'::jsonb,       -- { on, ops: [areas revealed or hidden again] }
  shown boolean not null default false,         -- the map players see (one at a time)
  locked boolean not null default false,        -- players can't move their tokens right now
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists battle_maps_campaign on battle_maps(campaign_id);

-- Tokens on a map. x and y are grid cells (the token's top-left cell); size is how many cells across.
-- A player character's token points at its character, so that player can move it.
create table if not exists map_tokens (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  map_id uuid not null references battle_maps(id) on delete cascade,
  character_id uuid references characters(id) on delete cascade,
  name text not null default '',
  kind text not null default 'monster' check (kind in ('pc','npc','monster')),
  x real not null default 0,
  y real not null default 0,
  size real not null default 1,
  color text not null default '',
  image text not null default '',               -- small picture as a data URL (a PC's portrait is copied here)
  hidden boolean not null default false,        -- only the DM sees it
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists map_tokens_map on map_tokens(map_id);
create index if not exists map_tokens_campaign on map_tokens(campaign_id);

-- Spell templates on a map (Fireball's sphere, Cone of Cold's cone...). Anyone in the campaign can place
-- their own; the DM can remove any. x and y are in grid cells, size and width in feet, angle in degrees.
create table if not exists map_effects (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  map_id uuid not null references battle_maps(id) on delete cascade,
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  shape text not null check (shape in ('circle','cone','line','cube')),
  x real not null default 0,
  y real not null default 0,
  angle real not null default 0,
  size real not null default 20,
  width real not null default 5,
  color text not null default '#e8572a',
  label text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists map_effects_map on map_effects(map_id);

alter table battle_maps enable row level security;
alter table map_tokens enable row level security;
alter table map_effects enable row level security;

-- Maps: the DM sees and changes all of them; players see only the one being shown.
drop policy if exists bm_read on battle_maps;
create policy bm_read on battle_maps for select using (is_dm(campaign_id) or (shown and is_member(campaign_id)));
drop policy if exists bm_dm on battle_maps;
create policy bm_dm on battle_maps for all using (is_dm(campaign_id)) with check (is_dm(campaign_id));

-- Tokens: the DM does everything; players see the tokens that aren't hidden on the shown map.
-- Players move their own token with move_token() below, never by writing the table.
drop policy if exists tk_read on map_tokens;
create policy tk_read on map_tokens for select using (
  is_dm(campaign_id) or (not hidden and is_member(campaign_id) and exists(select 1 from battle_maps m where m.id = map_id and m.shown)));
drop policy if exists tk_dm on map_tokens;
create policy tk_dm on map_tokens for all using (is_dm(campaign_id)) with check (is_dm(campaign_id));

-- Templates: everyone in the campaign sees them; you add your own; you or the DM remove them.
drop policy if exists fx_read on map_effects;
create policy fx_read on map_effects for select using (is_member(campaign_id));
drop policy if exists fx_insert on map_effects;
create policy fx_insert on map_effects for insert with check (owner = auth.uid() and is_member(campaign_id));
drop policy if exists fx_update on map_effects;
create policy fx_update on map_effects for update using (owner = auth.uid() or is_dm(campaign_id));
drop policy if exists fx_delete on map_effects;
create policy fx_delete on map_effects for delete using (owner = auth.uid() or is_dm(campaign_id));

-- A player moves their own character's token (the DM can move any). Refused while the DM has movement paused.
create or replace function move_token(p_id uuid, p_x real, p_y real) returns boolean
language plpgsql security definer set search_path = public as $$
declare t map_tokens; m battle_maps;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into t from map_tokens where id = p_id;
  if t.id is null then raise exception 'That token is no longer on the map.'; end if;
  if not is_dm(t.campaign_id) then
    select * into m from battle_maps where id = t.map_id;
    if t.character_id is null or not exists(select 1 from characters c where c.id = t.character_id and c.owner = auth.uid()) then
      raise exception 'You can only move your own character.';
    end if;
    if t.hidden or not m.shown then raise exception 'That map isn''t being shown right now.'; end if;
    if m.locked then raise exception 'The DM has paused movement.'; end if;
    if p_x < -1 or p_y < -1 or p_x > 2000 or p_y > 2000 then raise exception 'That''s off the map.'; end if;
  end if;
  update map_tokens set x = p_x, y = p_y, updated_at = now() where id = p_id;
  return true;
end $$;

-- Live updates.
do $$ begin
  begin alter publication supabase_realtime add table battle_maps; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table map_tokens; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table map_effects; exception when duplicate_object then null; end;
end $$;
alter table battle_maps replica identity full;
alter table map_tokens replica identity full;
alter table map_effects replica identity full;

-- Map pictures: a private storage bucket, one folder per campaign. Campaign members can view them; the DM uploads and deletes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('battle-maps', 'battle-maps', false, 52428800, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The campaign a file belongs to (its folder name), or null for anything that isn't <uuid>/...
create or replace function map_file_campaign(p_name text) returns uuid language sql immutable set search_path = public as $$
  select case when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid end $$;

drop policy if exists "battle maps read" on storage.objects;
create policy "battle maps read" on storage.objects for select to authenticated
  using (bucket_id = 'battle-maps' and public.is_member(public.map_file_campaign(name)));
drop policy if exists "battle maps upload" on storage.objects;
create policy "battle maps upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'battle-maps' and public.is_dm(public.map_file_campaign(name)));
drop policy if exists "battle maps change" on storage.objects;
create policy "battle maps change" on storage.objects for update to authenticated
  using (bucket_id = 'battle-maps' and public.is_dm(public.map_file_campaign(name)));
drop policy if exists "battle maps delete" on storage.objects;
create policy "battle maps delete" on storage.objects for delete to authenticated
  using (bucket_id = 'battle-maps' and public.is_dm(public.map_file_campaign(name)));
