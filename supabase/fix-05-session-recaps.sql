-- Session recaps: the DM Suite's player recap for each session, and the notes that don't line up,
-- shown to players in the Companion. Needs fix-04-session-notes.sql first. Safe to run more than once.
alter table game_sessions add column if not exists recap text not null default '';
alter table game_sessions add column if not exists contradictions text not null default '';
