-- Fixed resonance conditions for the social experiment are derived exclusively
-- from the case-insensitive login account prefix. Public registration remains
-- open for these prefixes by product decision.

create or replace function public.resonance_experiment_condition(p_username text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when lower(btrim(p_username)) ~ '^aisa[0-9]+$' then 'all_similar'
    when lower(btrim(p_username)) ~ '^aisb[0-9]+$' then 'all_different'
    else null
  end
$$;

comment on function public.resonance_experiment_condition(text) is
  'Returns the fixed resonance condition derived from an AISA/AISB numeric account code.';

create or replace function private.enforce_resonance_experiment_preference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  experiment_condition text;
begin
  select public.resonance_experiment_condition(profile.username::text)
  into experiment_condition
  from public.profiles profile
  where profile.id = new.user_id;

  if experiment_condition = 'all_similar' then
    new.city_mode := 'similar';
    new.stage_mode := 'similar';
    new.theme_mode := 'similar';
  elsif experiment_condition = 'all_different' then
    new.city_mode := 'different';
    new.stage_mode := 'different';
    new.theme_mode := 'different';
  end if;

  return new;
end
$$;

drop trigger if exists resonance_preferences_enforce_experiment on public.resonance_preferences;
create trigger resonance_preferences_enforce_experiment
before insert or update on public.resonance_preferences
for each row execute function private.enforce_resonance_experiment_preference();

create or replace function private.sync_resonance_experiment_preference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  experiment_condition text := public.resonance_experiment_condition(new.username::text);
begin
  if experiment_condition = 'all_similar' then
    insert into public.resonance_preferences(user_id, city_mode, stage_mode, theme_mode)
    values (new.id, 'similar', 'similar', 'similar')
    on conflict (user_id) do update
    set city_mode = excluded.city_mode,
        stage_mode = excluded.stage_mode,
        theme_mode = excluded.theme_mode;
  elsif experiment_condition = 'all_different' then
    insert into public.resonance_preferences(user_id, city_mode, stage_mode, theme_mode)
    values (new.id, 'different', 'different', 'different')
    on conflict (user_id) do update
    set city_mode = excluded.city_mode,
        stage_mode = excluded.stage_mode,
        theme_mode = excluded.theme_mode;
  end if;

  return new;
end
$$;

drop trigger if exists profiles_sync_resonance_experiment on public.profiles;
create trigger profiles_sync_resonance_experiment
after insert or update of username on public.profiles
for each row execute function private.sync_resonance_experiment_preference();

-- Normalize any matching accounts that predate this migration.
insert into public.resonance_preferences(user_id, city_mode, stage_mode, theme_mode)
select
  profile.id,
  case public.resonance_experiment_condition(profile.username::text)
    when 'all_similar' then 'similar'::public.resonance_mode
    else 'different'::public.resonance_mode
  end,
  case public.resonance_experiment_condition(profile.username::text)
    when 'all_similar' then 'similar'::public.resonance_mode
    else 'different'::public.resonance_mode
  end,
  case public.resonance_experiment_condition(profile.username::text)
    when 'all_similar' then 'similar'::public.resonance_mode
    else 'different'::public.resonance_mode
  end
from public.profiles profile
where public.resonance_experiment_condition(profile.username::text) is not null
on conflict (user_id) do update
set city_mode = excluded.city_mode,
    stage_mode = excluded.stage_mode,
    theme_mode = excluded.theme_mode;

-- Fixed-condition participants may read their effective preference, but only
-- ordinary accounts may insert, update or delete it through the Data API.
drop policy if exists resonance_owner on public.resonance_preferences;
drop policy if exists resonance_owner_read on public.resonance_preferences;
drop policy if exists resonance_owner_insert on public.resonance_preferences;
drop policy if exists resonance_owner_update on public.resonance_preferences;
drop policy if exists resonance_owner_delete on public.resonance_preferences;

create policy resonance_owner_read on public.resonance_preferences
for select to authenticated
using (user_id = (select auth.uid()) and (select private.is_active_user()));

create policy resonance_owner_insert on public.resonance_preferences
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_active_user())
  and not exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and public.resonance_experiment_condition(profile.username::text) is not null
  )
);

create policy resonance_owner_update on public.resonance_preferences
for update to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_user())
  and not exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and public.resonance_experiment_condition(profile.username::text) is not null
  )
)
with check (
  user_id = (select auth.uid())
  and (select private.is_active_user())
  and not exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and public.resonance_experiment_condition(profile.username::text) is not null
  )
);

create policy resonance_owner_delete on public.resonance_preferences
for delete to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_user())
  and not exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and public.resonance_experiment_condition(profile.username::text) is not null
  )
);

grant execute on function public.resonance_experiment_condition(text) to anon, authenticated, service_role;
