-- Generate story images outside the participant's HTTP request. The durable
-- queue prevents a browser close or an Edge Function retirement from losing
-- the job, while active_attempt_id prevents an old delivery from overwriting a
-- newer request for the same story.

alter table public.generated_images
  add column if not exists active_attempt_id uuid
    references public.image_generation_attempts(id) on delete set null;

do $$
begin
  perform pgmq.create('story_image_generation');
exception
  when duplicate_table or unique_violation then null;
end;
$$;

create or replace function public.claim_story_image_generation(
  p_story_id uuid,
  p_user_id uuid,
  p_style public.image_style,
  p_prompt text,
  p_highlight jsonb,
  p_model text,
  p_source_content_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_image public.generated_images%rowtype;
  claimed_image_id uuid;
  attempt_id uuid;
  recent_attempt_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select *
  into current_image
  from public.generated_images
  where story_id = p_story_id
  for update;

  if found and current_image.status = 'ready' then
    if current_image.source_content_hash <> p_source_content_hash then
      return jsonb_build_object(
        'outcome', 'stale',
        'imageId', current_image.id,
        'storagePath', current_image.storage_path
      );
    end if;
    return jsonb_build_object(
      'outcome', 'ready',
      'imageId', current_image.id,
      'imageUrl', current_image.public_url,
      'style', current_image.style,
      'highlight', current_image.highlight,
      'prompt', current_image.prompt
    );
  end if;

  if found
    and current_image.status = 'generating'
    and current_image.created_at > now() - interval '15 minutes'
  then
    return jsonb_build_object(
      'outcome', 'generating',
      'imageId', current_image.id,
      'attemptId', current_image.active_attempt_id
    );
  end if;

  select count(*)::integer
  into recent_attempt_count
  from public.image_generation_attempts
  where user_id = p_user_id
    and created_at >= now() - interval '1 hour';

  if recent_attempt_count >= 5 then
    return jsonb_build_object('outcome', 'rate_limited');
  end if;

  insert into public.image_generation_attempts (story_id, user_id, style)
  values (p_story_id, p_user_id, p_style)
  returning id into attempt_id;

  if current_image.id is null then
    insert into public.generated_images (
      story_id, user_id, style, status, prompt, highlight, model, model_version,
      source_content_hash, active_attempt_id, created_at, completed_at,
      storage_path, public_url, error
    ) values (
      p_story_id, p_user_id, p_style, 'generating', p_prompt, p_highlight, p_model, p_model,
      p_source_content_hash, attempt_id, now(), null, null, null, null
    )
    returning id into claimed_image_id;
  else
    update public.generated_images
    set
      user_id = p_user_id,
      style = p_style,
      status = 'generating',
      prompt = p_prompt,
      highlight = p_highlight,
      model = p_model,
      model_version = p_model,
      source_content_hash = p_source_content_hash,
      active_attempt_id = attempt_id,
      storage_path = null,
      public_url = null,
      error = null,
      created_at = now(),
      completed_at = null
    where id = current_image.id
    returning id into claimed_image_id;
  end if;

  return jsonb_build_object(
    'outcome', 'claimed',
    'imageId', claimed_image_id,
    'attemptId', attempt_id
  );
end;
$$;

create or replace function public.queue_story_image_job(
  p_story_id uuid,
  p_image_id uuid,
  p_attempt_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  message_id bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if not exists (
    select 1
    from public.generated_images image
    join public.image_generation_attempts attempt
      on attempt.id = p_attempt_id
      and attempt.story_id = p_story_id
      and attempt.user_id = image.user_id
    where image.id = p_image_id
      and image.story_id = p_story_id
      and image.active_attempt_id = p_attempt_id
      and image.status = 'generating'
      and attempt.status = 'started'
  ) then
    raise exception 'story image job does not match the active attempt';
  end if;
  select pgmq.send(
    'story_image_generation',
    jsonb_build_object(
      'story_id', p_story_id,
      'image_id', p_image_id,
      'attempt_id', p_attempt_id,
      'retry_count', 0
    )
  ) into message_id;
  return message_id;
end;
$$;

create or replace function public.claim_story_image_job()
returns table (msg_id bigint, read_ct integer, message jsonb)
language plpgsql
security definer
set search_path = public, pgmq
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  return query
  select item.msg_id, item.read_ct::integer, item.message
  from pgmq.read('story_image_generation', 130, 1) item;
end;
$$;

create or replace function public.archive_story_image_job(p_msg_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  archived boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  select pgmq.archive('story_image_generation', p_msg_id) into archived;
  return archived;
end;
$$;

create or replace function public.retry_story_image_job(
  p_msg_id bigint,
  p_message jsonb,
  p_delay_seconds integer default 3
)
returns bigint
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  archived boolean;
  new_message_id bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if greatest(0, least(coalesce(p_delay_seconds, 3), 60)) <> coalesce(p_delay_seconds, 3) then
    raise exception 'invalid retry delay';
  end if;
  select pgmq.archive('story_image_generation', p_msg_id) into archived;
  if not archived then raise exception 'image queue message could not be archived'; end if;
  select pgmq.send(
    'story_image_generation',
    p_message,
    greatest(0, least(coalesce(p_delay_seconds, 3), 60))
  ) into new_message_id;
  return new_message_id;
end;
$$;

create or replace function public.complete_story_image_job(
  p_story_id uuid,
  p_image_id uuid,
  p_attempt_id uuid,
  p_prompt text,
  p_storage_path text,
  p_public_url text,
  p_completed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;

  update public.generated_images
  set
    status = 'ready',
    prompt = p_prompt,
    storage_path = p_storage_path,
    public_url = p_public_url,
    error = null,
    completed_at = p_completed_at
  where id = p_image_id
    and story_id = p_story_id
    and active_attempt_id = p_attempt_id
    and status = 'generating';
  if not found then return false; end if;

  update public.image_generation_attempts
  set status = 'succeeded', error = null, completed_at = p_completed_at
  where id = p_attempt_id and story_id = p_story_id;
  update public.stories set visual_status = 'ready' where id = p_story_id;
  return true;
end;
$$;

create or replace function public.fail_story_image_job(
  p_story_id uuid,
  p_image_id uuid,
  p_attempt_id uuid,
  p_error text,
  p_completed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;

  update public.generated_images
  set
    status = 'failed',
    error = left(coalesce(p_error, 'Image generation failed'), 1000),
    storage_path = null,
    public_url = null,
    completed_at = p_completed_at
  where id = p_image_id
    and story_id = p_story_id
    and active_attempt_id = p_attempt_id
    and status in ('queued', 'generating');
  if not found then return false; end if;

  update public.image_generation_attempts
  set status = 'failed', error = left(coalesce(p_error, 'Image generation failed'), 1000), completed_at = p_completed_at
  where id = p_attempt_id and story_id = p_story_id;
  update public.stories set visual_status = 'failed' where id = p_story_id;
  return true;
end;
$$;

revoke all on function public.queue_story_image_job(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_story_image_job() from public, anon, authenticated;
revoke all on function public.archive_story_image_job(bigint) from public, anon, authenticated;
revoke all on function public.retry_story_image_job(bigint, jsonb, integer) from public, anon, authenticated;
revoke all on function public.complete_story_image_job(uuid, uuid, uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.fail_story_image_job(uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.queue_story_image_job(uuid, uuid, uuid) to service_role;
grant execute on function public.claim_story_image_job() to service_role;
grant execute on function public.archive_story_image_job(bigint) to service_role;
grant execute on function public.retry_story_image_job(bigint, jsonb, integer) to service_role;
grant execute on function public.complete_story_image_job(uuid, uuid, uuid, text, text, text, timestamptz)
  to service_role;
grant execute on function public.fail_story_image_job(uuid, uuid, uuid, text, timestamptz)
  to service_role;

-- The immediate request also wakes the worker. Cron is a recovery path for a
-- closed browser, a retired isolate, or a transient internal invocation error.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $schedule$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'storyverse-story-image-worker';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;

  if exists (select 1 from vault.decrypted_secrets where name = 'storyverse_project_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'storyverse_worker_token')
  then
    perform cron.schedule(
      'storyverse-story-image-worker',
      '10 seconds',
      $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'storyverse_project_url')
          || '/functions/v1/story-image-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-storyverse-worker-token',
          (select decrypted_secret from vault.decrypted_secrets where name = 'storyverse_worker_token')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000
      );
      $job$
    );
  end if;
end;
$schedule$;
