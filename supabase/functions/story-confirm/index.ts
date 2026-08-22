import { arkModelInfo, createEmbedding } from "../_shared/ark.ts";
import { sha256 } from "../_shared/crypto.ts";
import { ApiError, json, readJson, serve } from "../_shared/http.ts";
import { draftDatabaseFields, normalizeDraftShape, storyContentHash, storyPayload } from "../_shared/story-data.ts";
import { archiveQueueMessage, processStoryAnalysis, storyAnalysisPayload } from "../_shared/story-pipeline.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { validateDraft, validateFinalLabels, type StoryDraftInput } from "../_shared/validation.ts";

serve(async (request) => {
  if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "不支持这个请求方式。");
  const { user } = await requireUser(request);
  const input = await readJson<{
    storyId: string;
    draft: StoryDraftInput;
    typeId: string;
    themes: string[];
    emotions?: unknown[];
  }>(request);
  const draft = normalizeDraftShape(validateDraft(input.draft) as StoryDraftInput & Record<string, unknown>);
  const labels = validateFinalLabels(input.typeId, input.themes);
  const admin = adminClient();
  const { data: selectedType } = await admin
    .from("story_types")
    .select("id")
    .eq("id", labels.typeId)
    .eq("enabled", true)
    .maybeSingle();
  if (!selectedType) throw new ApiError(400, "STORY_TYPE_DISABLED", "这个故事类型当前不可用，请重新选择。");
  const { data: original, error: originalError } = await admin
    .from("stories")
    .select("*")
    .eq("id", input.storyId)
    .eq("user_id", user.id)
    .single();
  if (originalError || !original) throw new ApiError(404, "STORY_NOT_FOUND", "没有找到这篇故事。");

  const contentHash = await storyContentHash(draft.title, draft.body);
  const acceptedSuggestedTitle =
    !String(original.title ?? "").trim() &&
    Boolean(String(original.ai_suggested_title ?? "").trim()) &&
    draft.title.trim() === String(original.ai_suggested_title).trim();
  let story = original;
  if (contentHash !== original.content_hash && !acceptedSuggestedTitle) {
    const { data: openReviews } = await admin
      .from("review_cases")
      .select("id")
      .eq("story_id", original.id)
      .in("status", ["pending", "reviewing"]);
    const reviewIds = (openReviews ?? []).map((review) => review.id);
    await admin
      .from("review_cases")
      .update({ status: "cancelled", resolved_at: new Date().toISOString() })
      .eq("story_id", original.id)
      .in("status", ["pending", "reviewing"]);
    if (reviewIds.length) await admin.from("notifications").delete().in("review_case_id", reviewIds);
    await admin
      .from("ai_tasks")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("story_id", original.id)
      .in("status", ["queued", "processing"]);
    const { data: oldImages } = await admin
      .from("generated_images")
      .select("id,storage_path")
      .eq("story_id", original.id);
    const paths = (oldImages ?? [])
      .map((image) => image.storage_path)
      .filter((value): value is string => Boolean(value));
    if (paths.length) await admin.storage.from("story-images").remove(paths);
    if (oldImages?.length)
      await admin
        .from("generated_images")
        .delete()
        .in(
          "id",
          oldImages.map((image) => image.id),
        );
    await admin.from("story_embeddings").delete().eq("story_id", original.id);
    const { data: updated, error } = await admin
      .from("stories")
      .update({
        ...draftDatabaseFields(draft),
        excerpt: draft.body.slice(0, 70),
        content_hash: contentHash,
        status: "analyzing",
        moderation_decision: null,
        moderation_categories: [],
        ai_suggested_title: null,
        ai_type_id: null,
        ai_type_confidence: null,
        ai_type_candidates: [],
        final_type_id: null,
        ai_themes: [],
        ai_model: null,
        ai_prompt_version: null,
        ai_analyzed_at: null,
        final_themes: [],
        visual_status: "queued",
        analysis_version: Number(original.analysis_version ?? 0) + 1,
      })
      .eq("id", original.id)
      .select("*")
      .single();
    if (error) throw error;
    const { data: task, error: taskError } = await admin
      .from("ai_tasks")
      .insert({ story_id: original.id, user_id: user.id, task_type: "story_analysis", status: "queued" })
      .select("id")
      .single();
    if (taskError) throw taskError;
    const { data: messageId, error: queueError } = await admin.rpc("queue_story_analysis", {
      p_story_id: original.id,
      p_task_id: task.id,
    });
    if (queueError) throw queueError;
    story = await processStoryAnalysis(admin, updated.id, task.id);
    await archiveQueueMessage(admin, typeof messageId === "number" ? messageId : Number(messageId));
    return json(request, {
      story: storyPayload(story),
      status: story.status,
      analysis: await storyAnalysisPayload(admin, story),
      requiresConfirmation: true,
    });
  }

  const nextStatus = story.moderation_decision === "pass" ? "published" : "pending_review";
  const finalTitle = draft.title || story.ai_suggested_title || "我的故事";
  const oldThemes = Array.isArray(story.final_themes) ? story.final_themes.map(String) : [];
  if (story.moderation_decision === "pass") {
    try {
      const { data: existingEmbedding, error: existingEmbeddingError } = await admin
        .from("story_embeddings")
        .select("story_id")
        .eq("story_id", story.id)
        .maybeSingle();
      if (existingEmbeddingError) throw existingEmbeddingError;

      const model = arkModelInfo().embedding;
      if (!existingEmbedding) {
        const [storyEmbedding, themeEmbedding] = await Promise.all([
          createEmbedding(`${finalTitle}\n${draft.body}`),
          createEmbedding(labels.themes.join(" / ")),
        ]);
        const { error } = await admin.from("story_embeddings").insert({
          story_id: story.id,
          story_embedding: storyEmbedding,
          theme_embedding: themeEmbedding,
          model,
          model_version: model,
          content_hash: contentHash,
          theme_hash: await sha256(labels.themes.join("\u0000")),
          generated_at: new Date().toISOString(),
        });
        if (error) throw error;
      } else if (oldThemes.join("\u0000") !== labels.themes.join("\u0000")) {
        const themeEmbedding = await createEmbedding(labels.themes.join(" / "));
        const { error } = await admin
          .from("story_embeddings")
          .update({
            theme_embedding: themeEmbedding,
            theme_hash: await sha256(labels.themes.join("\u0000")),
            model,
            model_version: model,
            generated_at: new Date().toISOString(),
          })
          .eq("story_id", story.id);
        if (error) throw error;
      }
    } catch (error) {
      console.error("Story embedding failed after moderation passed; publishing without vectors", error);
    }
  }

  const { data: confirmed, error: confirmError } = await admin
    .from("stories")
    .update({
      ...draftDatabaseFields(draft),
      title: finalTitle,
      excerpt: draft.body.slice(0, 70),
      content_hash: contentHash,
      final_type_id: labels.typeId,
      final_themes: labels.themes,
      emotion_tags: input.emotions ?? [],
      status: nextStatus,
      published_at: nextStatus === "published" ? new Date().toISOString() : null,
    })
    .eq("id", story.id)
    .select("*")
    .single();
  if (confirmError) throw confirmError;
  await admin.from("story_versions").upsert(
    {
      story_id: story.id,
      user_id: user.id,
      version: Number(confirmed.analysis_version ?? 1),
      title: finalTitle,
      body: draft.body,
      metadata: { typeId: labels.typeId, themes: labels.themes, status: nextStatus },
    },
    { onConflict: "story_id,version" },
  );
  await admin.from("story_drafts").delete().eq("user_id", user.id);
  return json(request, { story: storyPayload(confirmed), status: nextStatus });
});
