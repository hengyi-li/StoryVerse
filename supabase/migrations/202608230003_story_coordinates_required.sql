begin;

-- Drafts may remain incomplete, but every story entering the analysis pipeline
-- must carry a real city coordinate pair for recommendation and lobby layout.
-- NOT VALID avoids blocking deployment on any legacy non-public row; PostgreSQL
-- still enforces the constraint for every new insert and update.
alter table public.stories
  drop constraint if exists stories_coordinates_required;

alter table public.stories
  add constraint stories_coordinates_required
  check (latitude is not null and longitude is not null)
  not valid;

comment on constraint stories_coordinates_required on public.stories is
  'All new stories require both city latitude and longitude; incomplete drafts remain in story_drafts.';

commit;
