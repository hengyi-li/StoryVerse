alter table public.story_translations
drop constraint if exists story_translations_target_language_check;

alter table public.story_translations
add constraint story_translations_target_language_check
check (target_language in ('zh', 'en'));
