-- StoryVerse pre-study questionnaire. Existing accounts are grandfathered out;
-- profiles created after this migration must complete the questionnaire unless
-- they are administrators or explicitly marked as system/seed accounts.

alter table public.profiles add column pretest_required boolean;

update public.profiles set pretest_required = false where pretest_required is null;

alter table public.profiles
  alter column pretest_required set default true,
  alter column pretest_required set not null;

create type public.pretest_response_status as enum ('in_progress', 'completed', 'declined');

create table public.pretest_responses (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status public.pretest_response_status not null default 'in_progress',
  questionnaire_version text not null default 'pretest_v1',
  current_step smallint not null default 1 check (current_step between 1 and 4),
  consented boolean not null default false,
  birth_year smallint check (birth_year between 1900 and 2026),
  gender text check (gender is null or gender in ('male', 'female', 'other')),
  residence_region text check (
    residence_region is null or residence_region in ('china_mainland', 'hong_kong', 'macau', 'taiwan', 'overseas')
  ),
  country_region text,
  province text,
  city text,
  community_type text check (community_type is null or community_type in ('residents_committee', 'village_committee')),
  ethnicity text,
  education text check (
    education is null or education in (
      'less_than_primary', 'primary', 'junior_high', 'senior_high_vocational',
      'associate', 'bachelor', 'postgraduate', 'other'
    )
  ),
  education_other text,
  employment text check (
    employment is null or employment in (
      'full_time', 'internship_part_time', 'freelancer', 'unemployed', 'student_unpaid'
    )
  ),
  industry_primary text,
  industry_secondary text,
  discipline text,
  major text,
  consented_at timestamptz,
  submitted_at timestamptz,
  declined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pretest_questionnaire_version check (questionnaire_version = 'pretest_v1'),
  constraint pretest_country_branch check (
    (residence_region = 'overseas' and nullif(btrim(country_region), '') is not null
      and province is null and city is null and community_type is null)
    or (residence_region = 'china_mainland' and country_region is null)
    or (residence_region in ('hong_kong', 'macau', 'taiwan') and country_region is null and community_type is null
      and province = residence_region and city = residence_region)
    or residence_region is null
  ),
  constraint pretest_hidden_industry_fields check (
    employment in ('full_time', 'internship_part_time', 'freelancer')
    or (industry_primary is null and industry_secondary is null)
  ),
  constraint pretest_hidden_major_fields check (
    (education in ('associate', 'bachelor', 'postgraduate') and employment = 'student_unpaid')
    or (discipline is null and major is null)
  ),
  constraint pretest_other_education_field check (
    education = 'other' or education_other is null
  ),
  constraint pretest_declined_is_empty check (
    status <> 'declined' or (
      consented = false and birth_year is null and gender is null and residence_region is null
      and country_region is null and province is null and city is null and community_type is null
      and ethnicity is null and education is null and education_other is null and employment is null
      and industry_primary is null and industry_secondary is null and discipline is null and major is null
      and consented_at is null and submitted_at is null and declined_at is not null
    )
  ),
  constraint pretest_completed_is_complete check (
    status <> 'completed' or (
      consented = true and consented_at is not null and submitted_at is not null
      and birth_year is not null and gender is not null and residence_region is not null
      and ethnicity is not null and education is not null and employment is not null
      and (
        (residence_region = 'china_mainland' and province is not null and city is not null and community_type is not null)
        or (residence_region in ('hong_kong', 'macau', 'taiwan') and province = residence_region and city = residence_region)
        or (residence_region = 'overseas' and nullif(btrim(country_region), '') is not null)
      )
      and (education <> 'other' or nullif(btrim(education_other), '') is not null)
      and (
        employment not in ('full_time', 'internship_part_time', 'freelancer')
        or (industry_primary is not null and industry_secondary is not null)
      )
      and (
        not (education in ('associate', 'bachelor', 'postgraduate') and employment = 'student_unpaid')
        or (discipline is not null and major is not null)
      )
    )
  )
);

create trigger pretest_responses_set_updated_at
before update on public.pretest_responses
for each row execute function public.set_updated_at();

create or replace function private.lock_terminal_pretest_response()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('completed', 'declined') and new is distinct from old then
    raise exception 'PRETEST_RESPONSE_LOCKED' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger pretest_responses_lock_terminal
before update on public.pretest_responses
for each row execute function private.lock_terminal_pretest_response();

alter table public.pretest_responses enable row level security;

create policy pretest_responses_owner_read on public.pretest_responses
for select to authenticated
using (
  (user_id = (select auth.uid()) and (select private.is_active_user()))
  or (select private.is_admin())
);

revoke all on public.pretest_responses from anon, authenticated;
grant select on public.pretest_responses to authenticated;
grant all on public.pretest_responses to service_role;

create index pretest_responses_status_updated_idx
  on public.pretest_responses (status, updated_at desc);
create index pretest_responses_submitted_idx
  on public.pretest_responses (submitted_at desc) where submitted_at is not null;

comment on column public.profiles.pretest_required is
  'False for accounts created before pretest_v1 and trusted admin/system accounts; true for new participants.';
comment on table public.pretest_responses is
  'One immutable-on-completion pre-study questionnaire response per participant.';
