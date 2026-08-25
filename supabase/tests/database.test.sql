begin;

create extension if not exists pgtap with schema extensions;
select plan(103);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'stories', 'stories table exists');
select has_table('public', 'story_embeddings', 'story embeddings table exists');
select has_table('public', 'review_cases', 'human review table exists');
select has_table('public', 'recommendation_batches', 'recommendation batches table exists');
select has_table('public', 'recommendation_results', 'recommendation results table exists');
select has_table('public', 'admin_audit_logs', 'admin audit log exists');
select has_table('public', 'image_generation_attempts', 'image generation attempts table exists');
select has_table('public', 'story_translations', 'story translation cache exists');
select has_table('public', 'pretest_responses', 'pre-study response table exists');
select has_table('public', 'posttest_responses', 'post-study response table exists');
select has_column('public', 'profiles', 'pretest_required', 'profiles carry the pre-study requirement gate');
select has_function(
  'public',
  'resonance_experiment_condition',
  array['text'],
  'the database exposes one canonical account-prefix classifier'
);
select has_column(
  'public',
  'generated_images',
  'active_attempt_id',
  'generated images identify the only active background attempt'
);
select policies_are(
  'public',
  'pretest_responses',
  array['pretest_responses_owner_read'],
  'participants can only use the explicit read policy for pre-study responses'
);
select policies_are(
  'public',
  'posttest_responses',
  array['posttest_responses_owner_read'],
  'participants can only use the explicit read policy for post-study responses'
);
select is(
  (select indexdef like 'CREATE UNIQUE INDEX%' from pg_indexes
    where schemaname = 'public' and indexname = 'generated_images_one_per_story_idx'),
  true,
  'generated images have a database-level one-row-per-story constraint'
);
select is(
  (select count(*)::integer from pg_constraint where conname = 'account_credentials_security_question'),
  1,
  'security questions are constrained at the database layer'
);
select is(
  (select count(*)::integer from pg_constraint where conname = 'stories_gender_allowed'),
  1,
  'published story gender values are constrained at the database layer'
);
select is(
  (select count(*)::integer from pg_constraint where conname = 'story_drafts_gender_allowed'),
  1,
  'draft gender values allow empty drafts but reject forged values'
);
select is(
  (select count(*)::integer from pg_constraint where conname = 'stories_coordinates_required'),
  1,
  'stories require a latitude and longitude pair at the database layer'
);

select is((select count(*)::integer from public.story_types), 21, 'exactly 21 story types are seeded');
select is((select count(*)::integer from public.algorithm_configs where status = 'published'), 1, 'one default algorithm version is published');
select is(public.stage_index('学龄期'), 0::double precision, 'school age is the first life-stage index');
select is(public.stage_index('老年期'), 4::double precision, 'old age is the final life-stage index');
select ok(public.haversine_km(39.9042, 116.4074, 39.9042, 116.4074) < 0.001, 'same-city distance is zero');
select ok(public.haversine_km(39.9042, 116.4074, 31.2304, 121.4737) between 1000 and 1200, 'Beijing-Shanghai distance is plausible');

select policies_are('public', 'stories', array['stories_read'], 'stories expose only the explicit read policy');
select policies_are('public', 'account_credentials', array[]::text[], 'security answers have no user-facing policies');
select policies_are('public', 'admin_audit_logs', array['audit_admin'], 'audit records are admin-only');
select policies_are('public', 'story_translations', array['story_translations_read'], 'story translations have one read policy');
select policies_are(
  'public',
  'resonance_preferences',
  array['resonance_owner_delete', 'resonance_owner_insert', 'resonance_owner_read', 'resonance_owner_update'],
  'fixed participants can read preferences while ordinary owners retain explicit mutation policies'
);

select is(public.resonance_experiment_condition('AISA01'), 'all_similar', 'uppercase AISA numeric accounts are similar');
select is(public.resonance_experiment_condition('aisa21'), 'all_similar', 'lowercase AISA numeric accounts are similar');
select is(public.resonance_experiment_condition('AISB01'), 'all_different', 'uppercase AISB numeric accounts are different');
select is(public.resonance_experiment_condition('aisb100'), 'all_different', 'lowercase AISB numeric accounts are different');
select is(public.resonance_experiment_condition('AISA'), null::text, 'the bare AISA prefix is an ordinary account');
select is(public.resonance_experiment_condition('AISA_TEST'), null::text, 'non-numeric AISA suffixes remain ordinary');
select is(public.resonance_experiment_condition('MYAISA01'), null::text, 'embedded experiment prefixes remain ordinary');

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000998'),
  ('00000000-0000-0000-0000-000000000999'),
  ('00000000-0000-0000-0000-000000000997'),
  ('00000000-0000-0000-0000-000000000996'),
  ('00000000-0000-0000-0000-000000000995');

insert into public.profiles (id, username, display_name, anonymous_number) values
  ('00000000-0000-0000-0000-000000000999', 'reference_user', '参照用户', 999),
  ('00000000-0000-0000-0000-000000000998', 'candidate_user', '候选用户', 998),
  ('00000000-0000-0000-0000-000000000997', 'private_user', '私密用户', 997),
  ('00000000-0000-0000-0000-000000000996', 'AISA01', '相同实验用户', 996),
  ('00000000-0000-0000-0000-000000000995', 'aisb01', '相异实验用户', 995);

select is(
  (select count(*)::integer from public.resonance_preferences
    where user_id = '00000000-0000-0000-0000-000000000996'
      and city_mode = 'similar' and stage_mode = 'similar' and theme_mode = 'similar'),
  1,
  'creating an AISA profile immediately creates three similar preferences'
);
select is(
  (select count(*)::integer from public.resonance_preferences
    where user_id = '00000000-0000-0000-0000-000000000995'
      and city_mode = 'different' and stage_mode = 'different' and theme_mode = 'different'),
  1,
  'creating an AISB profile immediately creates three different preferences'
);
select is(
  (select count(*)::integer from public.resonance_preferences
    where user_id = '00000000-0000-0000-0000-000000000999'),
  0,
  'creating an ordinary profile does not force a preference row'
);

update public.resonance_preferences
set city_mode = 'different', stage_mode = 'different', theme_mode = 'different'
where user_id = '00000000-0000-0000-0000-000000000996';
select is(
  (select count(*)::integer from public.resonance_preferences
    where user_id = '00000000-0000-0000-0000-000000000996'
      and city_mode = 'similar' and stage_mode = 'similar' and theme_mode = 'similar'),
  1,
  'the database trigger restores forged AISA preference updates'
);

select is(
  (select pretest_required from public.profiles where id = '00000000-0000-0000-0000-000000000999'),
  true,
  'profiles created after the migration require the pre-study by default'
);

insert into public.pretest_responses (user_id, status, current_step, consented, birth_year, consented_at)
values ('00000000-0000-0000-0000-000000000999', 'in_progress', 2, true, 1900, now());
select is(
  (select birth_year::integer from public.pretest_responses where user_id = '00000000-0000-0000-0000-000000000999'),
  1900,
  'the lower birth-year boundary is accepted'
);
update public.pretest_responses set birth_year = 2026
where user_id = '00000000-0000-0000-0000-000000000999';
select is(
  (select birth_year::integer from public.pretest_responses where user_id = '00000000-0000-0000-0000-000000000999'),
  2026,
  'the upper birth-year boundary is accepted'
);
select throws_ok(
  $$update public.pretest_responses set birth_year = 1899
    where user_id = '00000000-0000-0000-0000-000000000999'$$,
  '23514',
  null,
  'a birth year below 1900 is rejected'
);
insert into public.pretest_responses (user_id, status, current_step, declined_at)
values ('00000000-0000-0000-0000-000000000998', 'declined', 1, now());
select is(
  (select count(*)::integer from public.pretest_responses
    where user_id = '00000000-0000-0000-0000-000000000998' and birth_year is null and consented = false),
  1,
  'declined responses retain no demographic answer'
);
select throws_ok(
  $$update public.pretest_responses set current_step = 2
    where user_id = '00000000-0000-0000-0000-000000000998'$$,
  '55000',
  'PRETEST_RESPONSE_LOCKED',
  'declined responses are immutable'
);

insert into public.posttest_responses (user_id, status, current_step, answers)
values (
  '00000000-0000-0000-0000-000000000999',
  'in_progress',
  1,
  '{"engagement_01": 1}'::jsonb
);
select is(
  (select (answers ->> 'engagement_01')::integer from public.posttest_responses
    where user_id = '00000000-0000-0000-0000-000000000999'),
  1,
  'post-study responses accept the lower Likert boundary'
);
update public.posttest_responses set answers = '{"engagement_01": 5}'::jsonb
where user_id = '00000000-0000-0000-0000-000000000999';
select is(
  (select (answers ->> 'engagement_01')::integer from public.posttest_responses
    where user_id = '00000000-0000-0000-0000-000000000999'),
  5,
  'post-study responses accept the upper Likert boundary'
);
select throws_ok(
  $$update public.posttest_responses set answers = '{"engagement_01": 0}'::jsonb
    where user_id = '00000000-0000-0000-0000-000000000999'$$,
  '23514', null, 'a post-study score below 1 is rejected'
);
select throws_ok(
  $$update public.posttest_responses set answers = '{"engagement_01": 6}'::jsonb
    where user_id = '00000000-0000-0000-0000-000000000999'$$,
  '23514', null, 'a post-study score above 5 is rejected'
);
select throws_ok(
  $$update public.posttest_responses set answers = '{"engagement_01": 2.5}'::jsonb
    where user_id = '00000000-0000-0000-0000-000000000999'$$,
  '23514', null, 'a fractional post-study score is rejected'
);
select throws_ok(
  $$update public.posttest_responses set answers = '{"unknown_item": 3}'::jsonb
    where user_id = '00000000-0000-0000-0000-000000000999'$$,
  '23514', null, 'an unknown post-study item is rejected'
);
select throws_ok(
  $$update public.posttest_responses
    set status = 'completed', submitted_at = now()
    where user_id = '00000000-0000-0000-0000-000000000999'$$,
  '23514', null, 'an incomplete post-study response cannot be completed'
);
update public.posttest_responses
set
  status = 'completed',
  current_step = 5,
  submitted_at = now(),
  answers = (
    select jsonb_object_agg(prefix || '_' || lpad(item_number::text, 2, '0'), 1)
    from (values
      ('engagement', 8),
      ('publicness', 10),
      ('diversity', 7),
      ('recommendation', 10),
      ('authorship_ai', 6)
    ) as sections(prefix, item_count)
    cross join lateral generate_series(1, item_count) as item_number
  )
where user_id = '00000000-0000-0000-0000-000000000999';
select is(
  (select status::text from public.posttest_responses
    where user_id = '00000000-0000-0000-0000-000000000999'),
  'completed',
  'all 41 post-study answers can be completed'
);
select throws_ok(
  $$update public.posttest_responses set current_step = 4
    where user_id = '00000000-0000-0000-0000-000000000999'$$,
  '55000', 'POSTTEST_RESPONSE_LOCKED', 'completed post-study responses are immutable'
);

insert into public.stories (
  id, user_id, author_display_name, title, body, mood, life_stage, age, gender, city,
  latitude, longitude, people, status, moderation_decision, final_type_id, final_themes,
  content_hash, published_at
) values (
  '10000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000999',
  '参照用户', '参照故事', repeat('字', 100), '平和自足', '成年早期', 30, '女', '原点城',
  0, 0, array['自己'], 'published', 'pass', 'career_achievement', array['职业成长', '自我肯定'],
  'reference-hash', now()
), (
  '20000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000997',
  '私密用户', '不公开故事', repeat('字', 100), '平和自足', '成年早期', 30, '女', '原点城',
  0, 0, array['自己'], 'private', 'pass', 'career_achievement', array['职业成长', '自我肯定'],
  'private-hash', null
);

select throws_ok(
  $$insert into public.stories (
      id, user_id, author_display_name, title, body, mood, life_stage, age, gender, city,
      people, status, content_hash
    ) values (
      '30000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000000998',
      '候选用户', '缺少坐标的故事', repeat('字', 100), '平和自足', '成年早期', 30, '女', '未知城市',
      array['自己'], 'analyzing', 'missing-coordinate-hash'
    )$$,
  '23514',
  null,
  'a story without coordinates is rejected by the database'
);

insert into public.story_translations (
  story_id, target_language, source_hash, title, excerpt, body, themes, mood, life_stage, people, model, prompt_version
) values (
  '10000000-0000-0000-0000-000000000000', 'zh', 'translation-source-hash', '参照故事', '中文摘要',
  repeat('中文译文', 25), array['职业成长', '自我肯定'], '平和自足', '成年早期', array['自己'],
  'test-model', 'test-prompt-v2'
);

select is(
  (select target_language from public.story_translations where story_id = '10000000-0000-0000-0000-000000000000'),
  'zh',
  'story translation cache accepts Simplified Chinese targets'
);

select throws_ok(
  $$insert into public.reactions (user_id, story_id, value) values (
    '00000000-0000-0000-0000-000000000999',
    '10000000-0000-0000-0000-000000000000',
    'like'
  )$$,
  '42501',
  'SELF_REACTION_NOT_ALLOWED',
  'database rejects reacting to your own story'
);
select throws_ok(
  $$insert into public.reports (reporter_id, story_id, reason) values (
    '00000000-0000-0000-0000-000000000999',
    '10000000-0000-0000-0000-000000000000',
    'other'
  )$$,
  '42501',
  'SELF_REPORT_NOT_ALLOWED',
  'database rejects reporting your own story'
);

insert into public.stories (
  id, user_id, author_display_name, title, body, mood, life_stage, age, gender, city,
  latitude, longitude, people, status, moderation_decision, final_type_id, final_themes,
  content_hash, published_at
)
select
  ('30000000-0000-0000-0000-' || lpad(series::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000998'::uuid,
  '候选用户', '候选故事 ' || series, repeat('字', 100), '平和自足', '成年早期', 30, '女', '候选城',
  0, series, array['自己'], 'published', 'pass', 'career_achievement', array['职业成长', '自我肯定'],
  'candidate-' || series, now()
from generate_series(1, 101) series;

insert into public.story_embeddings (
  story_id, story_embedding, theme_embedding, model, model_version, content_hash, theme_hash
)
select
  story.id,
  ('[' || array_to_string(array_fill(1.0, array[1024]), ',') || ']')::extensions.vector(1024),
  ('[' || array_to_string(array_fill(1.0, array[1024]), ',') || ']')::extensions.vector(1024),
  'test-embedding', 'v1', story.content_hash, 'same-theme'
from public.stories story
where story.status = 'published'
  and story.user_id in (
    '00000000-0000-0000-0000-000000000998'::uuid,
    '00000000-0000-0000-0000-000000000999'::uuid
  );

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000999', true);
select set_config('request.jwt.claim.role', 'service_role', true);
create temporary table test_batch as
select public.refresh_recommendations('00000000-0000-0000-0000-000000000999'::uuid, 100) as id;

select is(
  (select count(*)::integer from public.recommendation_results where batch_id = (select id from test_batch)),
  100,
  'recommendation batches are capped at Top 100'
);
select is(
  (select formula_version from public.recommendation_batches where id = (select id from test_batch)),
  'storyverse-recommendation-v1',
  'recommendation batches preserve the formula version'
);
select is(
  (select story_id from public.recommendation_results where batch_id = (select id from test_batch) and rank = 1),
  '30000000-0000-0000-0000-000000000001'::uuid,
  'fixed inputs produce the expected first-ranked story'
);
select is(
  (select semantic_score from public.recommendation_results where batch_id = (select id from test_batch) and rank = 1),
  1::double precision,
  'identical content vectors produce semantic score 1'
);
select ok(
  (select bool_and(final_score >= lead_score) from (
    select final_score, lead(final_score) over (order by rank) as lead_score
    from public.recommendation_results where batch_id = (select id from test_batch)
  ) scores where lead_score is not null),
  'recommendation rows are deterministically sorted by descending score'
);
select is(
  (select count(*)::integer from public.recommendation_results result
    join public.stories story on story.id = result.story_id
    where result.batch_id = (select id from test_batch) and story.user_id = '00000000-0000-0000-0000-000000000999'),
  0,
  'a user never recommends their own story'
);

create temporary table first_image_claim as
select public.claim_story_image_generation(
  '10000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000999',
  'clay-3d',
  'test prompt',
  '{"title":"test"}'::jsonb,
  'test-image-model',
  'reference-hash'
) as result;

select is(
  (select result ->> 'outcome' from first_image_claim),
  'claimed',
  'the first image request claims the only image slot'
);
select is(
  (select active_attempt_id::text from public.generated_images
    where story_id = '10000000-0000-0000-0000-000000000000'),
  (select result ->> 'attemptId' from first_image_claim),
  'the image row points to the attempt allowed to publish its result'
);

select set_config('request.jwt.claim.role', 'service_role', true);
create temporary table first_image_job as
select public.queue_story_image_job(
  '10000000-0000-0000-0000-000000000000',
  (result ->> 'imageId')::uuid,
  (result ->> 'attemptId')::uuid
) as msg_id
from first_image_claim;
select ok((select msg_id > 0 from first_image_job), 'the claimed image is added to the durable queue');

create temporary table claimed_image_job as
select * from public.claim_story_image_job();
select is(
  (select message ->> 'story_id' from claimed_image_job),
  '10000000-0000-0000-0000-000000000000',
  'the worker claims the queued story identifier'
);
select is(
  (select (message ->> 'retry_count')::integer from claimed_image_job),
  0,
  'a new image job starts without a retry'
);

create temporary table retried_image_job as
select public.retry_story_image_job(
  (select msg_id from claimed_image_job),
  jsonb_set((select message from claimed_image_job), '{retry_count}', '1'::jsonb),
  0
) as msg_id;
select isnt(
  (select msg_id from retried_image_job),
  (select msg_id from claimed_image_job),
  'a retry archives the old delivery and creates a new durable message'
);
create temporary table claimed_retried_image_job as
select * from public.claim_story_image_job();
select is(
  (select (message ->> 'retry_count')::integer from claimed_retried_image_job),
  1,
  'the worker can claim the automatic retry with its retry count preserved'
);
select ok(
  public.archive_story_image_job((select msg_id from claimed_retried_image_job)),
  'a completed image job is archived exactly once'
);
select set_config('request.jwt.claim.role', '', true);
select is(
  (public.claim_story_image_generation(
    '10000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000999',
    'clay-3d', 'test prompt', '{}'::jsonb, 'test-image-model', 'reference-hash'
  ) ->> 'outcome'),
  'generating',
  'a concurrent image request does not claim a second generation'
);
select set_config('request.jwt.claim.role', 'service_role', true);
select ok(
  public.complete_story_image_job(
    '10000000-0000-0000-0000-000000000000',
    (select (result ->> 'imageId')::uuid from first_image_claim),
    (select (result ->> 'attemptId')::uuid from first_image_claim),
    'test prompt',
    'test/image.png',
    'https://example.invalid/image.png',
    now()
  ),
  'image, attempt and story success state are committed together'
);
select set_config('request.jwt.claim.role', '', true);
select is(
  (public.claim_story_image_generation(
    '10000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000999',
    'retro-collage', 'different prompt', '{}'::jsonb, 'test-image-model', 'reference-hash'
  ) ->> 'outcome'),
  'ready',
  'a later style request reuses the already selected image'
);
select is(
  (select count(*)::integer from public.generated_images
    where story_id = '10000000-0000-0000-0000-000000000000'),
  1,
  'repeated image requests leave exactly one generated image row'
);
select throws_ok(
  $$insert into public.generated_images (
      story_id, user_id, style, status, prompt, model, model_version, source_content_hash
    ) values (
      '10000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000000999',
      'indie-zine', 'failed', 'duplicate', 'test', 'test', 'reference-hash'
    )$$,
  '23505',
  'duplicate key value violates unique constraint "generated_images_one_per_story_idx"',
  'a second image row is rejected even outside the Edge Function'
);

update public.generated_images
set status = 'generating', storage_path = null, public_url = null
where story_id = '10000000-0000-0000-0000-000000000000';
update public.image_generation_attempts
set status = 'started', completed_at = null
where id = (select (result ->> 'attemptId')::uuid from first_image_claim);
select set_config('request.jwt.claim.role', 'service_role', true);
select ok(
  public.fail_story_image_job(
    '10000000-0000-0000-0000-000000000000',
    (select (result ->> 'imageId')::uuid from first_image_claim),
    (select (result ->> 'attemptId')::uuid from first_image_claim),
    'test failure',
    now()
  ),
  'image, attempt and story failure state are committed together'
);
select set_config('request.jwt.claim.role', '', true);
insert into public.image_generation_attempts (story_id, user_id, style, status)
select
  '10000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000999',
  'clay-3d',
  'failed'
from generate_series(1, 4);
select is(
  (public.claim_story_image_generation(
    '10000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000999',
    'clay-3d', 'test prompt', '{}'::jsonb, 'test-image-model', 'reference-hash'
  ) ->> 'outcome'),
  'rate_limited',
  'five attempts within an hour enforce the account rate limit'
);
select is(
  (select count(*)::integer from public.image_generation_attempts
    where user_id = '00000000-0000-0000-0000-000000000999'),
  5,
  'a rejected sixth request does not add another attempt row'
);

set local role authenticated;
select is(
  (select count(*)::integer from public.stories
    where user_id in (
      '00000000-0000-0000-0000-000000000997'::uuid,
      '00000000-0000-0000-0000-000000000998'::uuid,
      '00000000-0000-0000-0000-000000000999'::uuid
    )),
  102,
  'RLS exposes published fixture stories and the current user own fixture story only'
);
select throws_ok(
  $$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000999'$$,
  '42501',
  'permission denied for table profiles',
  'ordinary users cannot promote themselves to admin'
);
reset role;

update public.profiles set status = 'suspended' where id = '00000000-0000-0000-0000-000000000997';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000997', true);
set local role authenticated;
select is(
  (select count(*)::integer from public.stories where id = '20000000-0000-0000-0000-000000000000'),
  0,
  'a suspended account cannot read its private story through RLS'
);
reset role;

select has_table('public', 'analytics_events', 'analytics_events table exists');
select has_table('public', 'analytics_rate_limits', 'anonymous rate-limit table exists');
select col_is_pk('public', 'analytics_events', 'event_id', 'event_id is the idempotency key');
select col_not_null('public', 'analytics_events', 'participant_key', 'participant key is required');
select col_not_null('public', 'analytics_events', 'properties', 'event properties are required');
select has_function('public', 'check_analytics_rate_limit', array['text', 'integer', 'integer'], 'rate-limit function exists');
select has_function(
  'public',
  'analytics_dashboard',
  array['timestamp with time zone', 'timestamp with time zone', 'uuid', 'text', 'text'],
  'filtered research dashboard function exists'
);
select policies_are(
  'public',
  'analytics_events',
  array['analytics_events_admin_read'],
  'only administrators receive a direct read policy'
);

insert into public.analytics_events (
  event_id, event_name, priority, occurred_at, user_id, participant_key, anonymous_id,
  session_id, page_view_id, page_id, route, language, theme, device_type,
  browser, os, app_version, environment, properties
) values
  (
    '40000000-0000-0000-0000-000000000001', 'home_viewed', 'P1', '2000-01-01 12:00:00+00',
    '00000000-0000-0000-0000-000000000999', repeat('a', 64),
    '41000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001',
    '43000000-0000-0000-0000-000000000001', 'home_intro', '/', 'zh', 'day', 'desktop',
    'test', 'test', 'test', 'test', '{}'
  ),
  (
    '40000000-0000-0000-0000-000000000002', 'story_input_snapshot', 'P0', '2000-01-01 12:00:00+00',
    '00000000-0000-0000-0000-000000000999', repeat('a', 64),
    '41000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001',
    '43000000-0000-0000-0000-000000000002', 'story_write', '/StoryWrite', 'zh', 'day', 'desktop',
    'test', 'test', 'test', 'test', '{"was_pasted":true,"title_active_ms":1000,"body_active_ms":2000}'
  ),
  (
    '40000000-0000-0000-0000-000000000003', 'star_clicked', 'P0', '2000-01-01 12:00:00+00',
    '00000000-0000-0000-0000-000000000999', repeat('a', 64),
    '41000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001',
    '43000000-0000-0000-0000-000000000003', 'star_lobby', '/StarLobby', 'zh', 'day', 'desktop',
    'test', 'test', 'test', 'test', '{}'
  ),
  (
    '40000000-0000-0000-0000-000000000004', 'story_read_ended', 'P0', '2000-01-01 12:00:00+00',
    '00000000-0000-0000-0000-000000000998', repeat('b', 64),
    '41000000-0000-0000-0000-000000000002', '42000000-0000-0000-0000-000000000002',
    '43000000-0000-0000-0000-000000000004', 'star_lobby', '/StarLobby', 'zh', 'day', 'desktop',
    'test', 'test', 'test', 'test', '{"meaningful_read":true,"is_own_story":false,"active_duration_ms":21000}'
  );

select is(
  (public.analytics_dashboard('2000-01-01 00:00:00+00', '2000-01-02 00:00:00+00', null, null, null) #>> '{overview,participants}')::integer,
  2,
  'research dashboard counts distinct participants'
);
select is(
  (public.analytics_dashboard('2000-01-01 00:00:00+00', '2000-01-02 00:00:00+00', '00000000-0000-0000-0000-000000000999', null, null) #>> '{overview,events}')::integer,
  3,
  'account filter returns only the selected account events'
);
select is(
  public.analytics_dashboard('2000-01-01 00:00:00+00', '2000-01-02 00:00:00+00', '00000000-0000-0000-0000-000000000999', null, null) #>> '{selected_account,username}',
  'reference_user',
  'account drill-down exposes the human login account'
);
select is(
  (public.analytics_dashboard('2000-01-01 00:00:00+00', '2000-01-02 00:00:00+00', null, 'P1', null) #>> '{overview,events}')::integer,
  1,
  'priority filter is applied to every dashboard section'
);
select is(
  (public.analytics_dashboard('2000-01-01 00:00:00+00', '2000-01-02 00:00:00+00', null, null, 'discovery') #>> '{overview,events}')::integer,
  1,
  'behaviour module filter is applied'
);
select is(
  (public.analytics_dashboard('2000-01-01 00:00:00+00', '2000-01-02 00:00:00+00', '00000000-0000-0000-0000-000000000999', 'P0', 'creation') #>> '{overview,events}')::integer,
  1,
  'account, priority and module filters compose correctly'
);
select is(
  jsonb_array_length(public.analytics_dashboard('2000-01-01 00:00:00+00', '2000-01-02 00:00:00+00', null, null, null) -> 'accounts'),
  2,
  'active account ranking includes both fixture accounts'
);
select is(
  public.analytics_event_module('story_input_snapshot'),
  'creation',
  'event names map to a stable research module'
);

select * from finish();
rollback;
