-- Allow users to be connected to multiple dev teams
ALTER TABLE user_dev_team_preference DROP CONSTRAINT user_dev_team_preference_pkey;
ALTER TABLE user_dev_team_preference ADD PRIMARY KEY (nav_ident, dev_team_id);
