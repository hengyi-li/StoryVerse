-- StoryVerse post-study questionnaire. Eligibility is derived from a completed
-- pretest_v1 response, so legacy, administrator and seed accounts remain out.

create type public.posttest_response_status as enum ('not_started', 'in_progress', 'completed');

create or replace function private.valid_posttest_answers(p_answers jsonb, p_require_all boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with allowed(item_id) as (
    select unnest(array[
      'engagement_01','engagement_02','engagement_03','engagement_04',
      'engagement_05','engagement_06','engagement_07','engagement_08',
      'publicness_01','publicness_02','publicness_03','publicness_04','publicness_05',
      'publicness_06','publicness_07','publicness_08','publicness_09','publicness_10',
      'diversity_01','diversity_02','diversity_03','diversity_04',
      'diversity_05','diversity_06','diversity_07',
      'recommendation_01','recommendation_02','recommendation_03','recommendation_04','recommendation_05',
      'recommendation_06','recommendation_07','recommendation_08','recommendation_09','recommendation_10',
      'authorship_ai_01','authorship_ai_02','authorship_ai_03',
      'authorship_ai_04','authorship_ai_05','authorship_ai_06'
    ]::text[])
  ), entries as (
    select key, value
    from jsonb_each(coalesce(p_answers, '{}'::jsonb))
  )
  select
    jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) = 'object'
    and not exists (select 1 from entries where key not in (select item_id from allowed))
    and not exists (
      select 1 from entries
      where jsonb_typeof(value) <> 'number'
        or (value #>> '{}')::numeric < 1
        or (value #>> '{}')::numeric > 5
        or mod((value #>> '{}')::numeric, 1) <> 0
    )
    and (
      not p_require_all
      or (
        (select count(*) from entries) = 41
        and not exists (select 1 from allowed where not (coalesce(p_answers, '{}'::jsonb) ? item_id))
      )
    );
$$;

create table public.posttest_responses (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status public.posttest_response_status not null default 'not_started',
  questionnaire_version text not null default 'posttest_v1',
  current_step smallint not null default 1 check (current_step between 1 and 5),
  answers jsonb not null default '{}'::jsonb,
  reminder_dismissed_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posttest_questionnaire_version check (questionnaire_version = 'posttest_v1'),
  constraint posttest_answers_shape check (private.valid_posttest_answers(answers, status = 'completed')),
  constraint posttest_completion_state check (
    (status = 'completed' and submitted_at is not null)
    or (status <> 'completed' and submitted_at is null)
  )
);

create trigger posttest_responses_set_updated_at
before update on public.posttest_responses
for each row execute function public.set_updated_at();

create or replace function private.lock_completed_posttest_response()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'completed' and new is distinct from old then
    raise exception 'POSTTEST_RESPONSE_LOCKED' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger zz_posttest_responses_lock_completed
before update on public.posttest_responses
for each row execute function private.lock_completed_posttest_response();

alter table public.posttest_responses enable row level security;

create policy posttest_responses_owner_read on public.posttest_responses
for select to authenticated
using (
  (user_id = (select auth.uid()) and (select private.is_active_user()))
  or (select private.is_admin())
);

revoke all on public.posttest_responses from anon, authenticated;
grant select on public.posttest_responses to authenticated;
grant all on public.posttest_responses to service_role;

create index posttest_responses_status_updated_idx
  on public.posttest_responses (status, updated_at desc);
create index posttest_responses_submitted_idx
  on public.posttest_responses (submitted_at desc) where submitted_at is not null;

comment on table public.posttest_responses is
  'One immutable-on-completion post-study questionnaire response per eligible participant.';
comment on column public.posttest_responses.answers is
  'Stable posttest_v1 item IDs mapped to integer Likert scores from 1 through 5.';
