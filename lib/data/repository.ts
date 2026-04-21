import { getDemoState } from "@/lib/data/demo";
import { hasSupabaseEnv } from "@/lib/env";
import { inferSlotFromItem } from "@/lib/outfits/rules";
import { getSupabaseAdminMaybe } from "@/lib/supabase/admin";
import { getServerSupabaseClientMaybe } from "@/lib/supabase/server";
import type {
  AiRun,
  FeedbackEvent,
  OutfitSuggestion,
  OutfitSlotMap,
  ProcessingJob,
  StyleProfile,
  StylistMessage,
  StylistThread,
  UserProfile,
  WardrobeAsset,
  WardrobeFilters,
  WardrobeItem,
} from "@/lib/types";
import { buildOutfitSlotKey } from "@/lib/outfits/engine";

function matchesFilters(item: WardrobeItem, filters?: WardrobeFilters) {
  if (!filters) return true;
  if (filters.category && item.category !== filters.category) return false;
  if (filters.formality && item.formality !== filters.formality) return false;
  if (filters.color && !item.colors.includes(filters.color)) return false;
  if (filters.season && !item.seasonality.includes(filters.season)) return false;

  if (filters.query) {
    const haystack = [
      item.name,
      item.category,
      item.subcategory,
      item.colors.join(" "),
      item.styleTags.join(" "),
    ]
      .join(" ")
      .toLowerCase();

    if (!haystack.includes(filters.query.toLowerCase())) {
      return false;
    }
  }

  return true;
}

function attachAssets(items: WardrobeItem[], assets: WardrobeAsset[]) {
  const assetMap = new Map(assets.map((asset) => [asset.itemId, asset]));
  return items.map((item) => ({
    ...item,
    asset: assetMap.get(item.id) ?? null,
  }));
}

async function getSupabaseClient() {
  return getSupabaseAdminMaybe() ?? (await getServerSupabaseClientMaybe());
}

function throwIfSupabaseError(
  error: { message?: string } | null,
  context: string,
) {
  if (error) {
    throw new Error(`${context}: ${error.message ?? "Unknown Supabase error."}`);
  }
}

export function isTransientSupabaseFetchFailure(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("error code 521") ||
    message.includes("web server is down") ||
    message.includes("cloudflare")
  );
}

function mapAsset(record: Record<string, unknown>): WardrobeAsset {
  return {
    id: String(record.id),
    itemId: String(record.item_id),
    originalPath: String(record.original_path ?? ""),
    croppedPath: String(record.cropped_path ?? record.original_path ?? ""),
    isolatedPath: String(record.isolated_path ?? record.cropped_path ?? record.original_path ?? ""),
    maskPath: String(record.mask_path ?? ""),
    bbox: (record.bbox_json as WardrobeAsset["bbox"]) ?? null,
    qualityFlags: Array.isArray(record.quality_flags_json)
      ? (record.quality_flags_json as string[])
      : [],
  };
}

function mapItem(record: Record<string, unknown>, asset?: WardrobeAsset | null): WardrobeItem {
  return {
    id: String(record.id),
    userId: String(record.user_id),
    status: String(record.status ?? "active") as WardrobeItem["status"],
    name: String(record.name ?? "Untitled item"),
    category: String(record.category ?? "top"),
    subcategory: String(record.subcategory ?? "shirt"),
    colors: Array.isArray(record.colors_json) ? (record.colors_json as string[]) : ["neutral"],
    pattern: String(record.pattern ?? "solid"),
    fabric: String(record.fabric ?? "unknown"),
    size: String(record.size ?? ""),
    formality: String(record.formality ?? "casual") as WardrobeItem["formality"],
    seasonality: Array.isArray(record.seasonality_json)
      ? (record.seasonality_json as string[])
      : ["spring", "fall"],
    layerRole: String(record.layer_role ?? "base") as WardrobeItem["layerRole"],
    occasionTags: Array.isArray(record.occasion_tags_json)
      ? (record.occasion_tags_json as string[])
      : [],
    styleTags: Array.isArray(record.style_tags_json)
      ? (record.style_tags_json as string[])
      : [],
    wearCount: Number(record.wear_count ?? 0),
    lastWornAt: record.last_worn_at ? String(record.last_worn_at) : null,
    favoriteScore: Number(record.favorite_score ?? 0),
    dislikeScore: Number(record.dislike_score ?? 0),
    confidence:
      typeof record.confidence_json === "object" && record.confidence_json
        ? (record.confidence_json as Record<string, number>)
        : {},
    sourcePromptVersion: String(record.source_prompt_version ?? "unknown"),
    createdAt: String(record.created_at ?? new Date().toISOString()),
    asset: asset ?? null,
  };
}

function mapStyleProfile(record: Record<string, unknown>): StyleProfile {
  const traits = (record.structured_traits_json ?? {}) as Record<string, unknown>;
  return {
    userId: String(record.user_id),
    freeformPreferences: String(record.freeform_preferences ?? ""),
    structuredTraits: {
      summary: String(traits.summary ?? ""),
      preferredColors: Array.isArray(traits.preferredColors)
        ? (traits.preferredColors as string[])
        : Array.isArray(traits.preferred_colors)
          ? (traits.preferred_colors as string[])
          : [],
      avoidedColors: Array.isArray(traits.avoidedColors)
        ? (traits.avoidedColors as string[])
        : Array.isArray(traits.avoided_colors)
          ? (traits.avoided_colors as string[])
          : [],
      preferredSilhouettes: Array.isArray(traits.preferredSilhouettes)
        ? (traits.preferredSilhouettes as string[])
        : Array.isArray(traits.preferred_silhouettes)
          ? (traits.preferred_silhouettes as string[])
          : [],
      favoriteCategories: Array.isArray(traits.favoriteCategories)
        ? (traits.favoriteCategories as string[])
        : Array.isArray(traits.favorite_categories)
          ? (traits.favorite_categories as string[])
          : [],
      targetVibes: Array.isArray(traits.targetVibes)
        ? (traits.targetVibes as string[])
        : Array.isArray(traits.target_vibes)
          ? (traits.target_vibes as string[])
          : [],
      formalityTendency: String(
        traits.formalityTendency ?? traits.formality_tendency ?? "balanced",
      ) as StyleProfile["structuredTraits"]["formalityTendency"],
      notes: Array.isArray(traits.notes) ? (traits.notes as string[]) : [],
    },
    dislikedTraits: Array.isArray(record.disliked_traits_json)
      ? (record.disliked_traits_json as string[])
      : [],
    styleEmbedding: Array.isArray(record.style_embedding)
      ? (record.style_embedding as number[])
      : [],
    updatedAt: String(record.updated_at ?? new Date().toISOString()),
  };
}

export async function getUserProfile(userId: string) {
  const demo = getDemoState();

  if (!hasSupabaseEnv) {
    return demo.user;
  }

  const client = await getSupabaseClient();

  if (!client) {
    return demo.user;
  }

  const { data } = await client
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (!data) {
    return {
      id: userId,
      displayName: "Luma user",
      timezone: "America/Chicago",
      homeLat: 41.8781,
      homeLng: -87.6298,
      createdAt: new Date().toISOString(),
    } satisfies UserProfile;
  }

  return {
    id: String(data.id),
    displayName: String(data.display_name ?? "Luma user"),
    timezone: String(data.timezone ?? "America/Chicago"),
    homeLat: data.home_lat ? Number(data.home_lat) : null,
    homeLng: data.home_lng ? Number(data.home_lng) : null,
    createdAt: String(data.created_at),
  } satisfies UserProfile;
}

export async function ensureUserProfileRecord(params: {
  userId: string;
  displayName: string;
  timezone?: string;
  homeLat?: number | null;
  homeLng?: number | null;
}) {
  const demo = getDemoState();

  if (!hasSupabaseEnv) {
    return demo.user;
  }

  const client = await getSupabaseClient();

  if (!client) {
    return demo.user;
  }

  const payload = {
    id: params.userId,
    display_name: params.displayName,
    timezone: params.timezone ?? demo.user.timezone,
    home_lat: params.homeLat ?? demo.user.homeLat,
    home_lng: params.homeLng ?? demo.user.homeLng,
  };

  const { error } = await client.from("users").upsert(payload, {
    onConflict: "id",
  });

  throwIfSupabaseError(error, "Could not create the user profile record");

  return {
    id: payload.id,
    displayName: payload.display_name,
    timezone: payload.timezone,
    homeLat: payload.home_lat,
    homeLng: payload.home_lng,
    createdAt: new Date().toISOString(),
  } satisfies UserProfile;
}

export async function listWardrobeItems(userId: string, filters?: WardrobeFilters) {
  const demo = getDemoState();

  if (!hasSupabaseEnv) {
    return attachAssets(
      demo.wardrobeItems.filter((item) => item.userId === userId && matchesFilters(item, filters)),
      demo.wardrobeAssets,
    );
  }

  const client = await getSupabaseClient();

  if (!client) {
    return attachAssets(demo.wardrobeItems, demo.wardrobeAssets);
  }

  const { data: itemRows } = await client
    .from("wardrobe_items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const items = (itemRows ?? []).map((row) => mapItem(row));

  if (!items.length) {
    return [];
  }

  const { data: assetRows } = await client
    .from("wardrobe_assets")
    .select("*")
    .in(
      "item_id",
      items.map((item) => item.id),
    );

  const assetMap = new Map(
    (assetRows ?? []).map((row) => {
      const asset = mapAsset(row);
      return [asset.itemId, asset] as const;
    }),
  );

  return items
    .filter((item) => matchesFilters(item, filters))
    .map((item) => ({ ...item, asset: assetMap.get(item.id) ?? null }));
}

export async function getStyleProfile(userId: string) {
  const demo = getDemoState();

  if (!hasSupabaseEnv) {
    return demo.styleProfile;
  }

  const client = await getSupabaseClient();

  if (!client) {
    return demo.styleProfile;
  }

  try {
    const { data } = await client
      .from("style_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    return data ? mapStyleProfile(data) : demo.styleProfile;
  } catch (error) {
    if (isTransientSupabaseFetchFailure(error)) {
      return demo.styleProfile;
    }
    throw error;
  }
}

export async function upsertStyleProfile(userId: string, payload: StyleProfile) {
  const demo = getDemoState();

  if (!hasSupabaseEnv) {
    demo.styleProfile = payload;
    return payload;
  }

  const client = await getSupabaseClient();

  if (!client) {
    demo.styleProfile = payload;
    return payload;
  }

  const { error } = await client.from("style_profiles").upsert(
    {
      user_id: userId,
      freeform_preferences: payload.freeformPreferences,
      structured_traits_json: payload.structuredTraits,
      disliked_traits_json: payload.dislikedTraits,
      style_embedding: payload.styleEmbedding,
      updated_at: payload.updatedAt,
    },
    {
      onConflict: "user_id",
    },
  );

  throwIfSupabaseError(error, "Could not save the style profile");

  return payload;
}

export async function getTodayOutfit(userId: string, date = new Date().toISOString().slice(0, 10)) {
  const demo = getDemoState();

  if (!hasSupabaseEnv) {
    return (
      demo.outfitSuggestions.find(
        (outfit) => outfit.userId === userId && outfit.generatedForDate === date,
      ) ?? demo.outfitSuggestions[0]
    );
  }

  const client = await getSupabaseClient();

  if (!client) {
    return demo.outfitSuggestions[0];
  }

  let data:
    | Array<Record<string, unknown>>
    | null
    | undefined;
  try {
    const response = await client
      .from("outfit_suggestions")
      .select("*")
      .eq("user_id", userId)
      .eq("generated_for_date", date)
      .order("created_at", { ascending: false })
      .limit(1);
    data = response.data as Array<Record<string, unknown>> | null;
    throwIfSupabaseError(response.error, "Could not load today's outfit");
  } catch (error) {
    if (isTransientSupabaseFetchFailure(error)) {
      console.warn("Supabase fetch failed while loading today's outfit. Returning no saved outfit.", error);
      return null;
    }

    throw error;
  }

  const record = data?.[0];

  if (!record) {
    return null;
  }

  return {
    id: String(record.id),
    userId: String(record.user_id),
    generatedForDate: String(record.generated_for_date),
    context: (record.context_json ?? {}) as Record<string, unknown>,
    primarySlots: (record.primary_slots_json ?? {}) as OutfitSuggestion["primarySlots"],
    alternateSlots: (record.alternate_slots_json ?? []) as OutfitSuggestion["alternateSlots"],
    reasoning: Array.isArray(record.reasoning_json)
      ? (record.reasoning_json as string[])
      : [],
    confidence: Number(record.confidence ?? 0),
    acceptedAt: record.accepted_at ? String(record.accepted_at) : null,
    rejectedAt: record.rejected_at ? String(record.rejected_at) : null,
    createdAt: String(record.created_at),
  } satisfies OutfitSuggestion;
}

export async function listOutfitSuggestionsForDate(
  userId: string,
  date = new Date().toISOString().slice(0, 10),
  limit = 12,
) {
  const demo = getDemoState();

  if (!hasSupabaseEnv) {
    return demo.outfitSuggestions
      .filter((outfit) => outfit.userId === userId && outfit.generatedForDate === date)
      .slice(0, limit);
  }

  const client = await getSupabaseClient();

  if (!client) {
    return demo.outfitSuggestions
      .filter((outfit) => outfit.userId === userId && outfit.generatedForDate === date)
      .slice(0, limit);
  }

  const { data, error } = await client
    .from("outfit_suggestions")
    .select("*")
    .eq("user_id", userId)
    .eq("generated_for_date", date)
    .order("created_at", { ascending: false })
    .limit(limit);

  throwIfSupabaseError(error, "Could not load outfit history");

  return (data ?? []).map(
    (record) =>
      ({
        id: String(record.id),
        userId: String(record.user_id),
        generatedForDate: String(record.generated_for_date),
        context: (record.context_json ?? {}) as Record<string, unknown>,
        primarySlots: (record.primary_slots_json ?? {}) as OutfitSuggestion["primarySlots"],
        alternateSlots: (record.alternate_slots_json ?? []) as OutfitSuggestion["alternateSlots"],
        reasoning: Array.isArray(record.reasoning_json)
          ? (record.reasoning_json as string[])
          : [],
        confidence: Number(record.confidence ?? 0),
        acceptedAt: record.accepted_at ? String(record.accepted_at) : null,
        rejectedAt: record.rejected_at ? String(record.rejected_at) : null,
        createdAt: String(record.created_at),
      }) satisfies OutfitSuggestion,
  );
}

export function canGenerateOutfitFromItems(items: WardrobeItem[]) {
  const active = items.filter((item) => item.status !== "archived");
  const slots = new Set(
    active
      .map((item) => inferSlotFromItem(item))
      .filter((slot): slot is NonNullable<ReturnType<typeof inferSlotFromItem>> => slot !== null),
  );
  const hasTop = slots.has("top");
  const hasBottom = slots.has("bottom");
  const hasOnePiece = slots.has("onePiece");
  const hasShoes = slots.has("shoes");

  return {
    canGenerate: hasShoes && ((hasTop && hasBottom) || hasOnePiece),
    needs: {
      top: hasTop,
      bottom: hasBottom,
      onePiece: hasOnePiece,
      shoes: hasShoes,
    },
  };
}

export function buildSuggestionExclusionKeys(
  suggestions: Array<{ primarySlots: OutfitSlotMap }>,
) {
  return suggestions.map((suggestion) => buildOutfitSlotKey(suggestion.primarySlots));
}

export async function saveOutfitSuggestion(outfit: OutfitSuggestion) {
  const demo = getDemoState();

  if (!hasSupabaseEnv) {
    demo.outfitSuggestions = [
      outfit,
      ...demo.outfitSuggestions.filter((entry) => entry.id !== outfit.id),
    ];
    return outfit;
  }

  const client = await getSupabaseClient();

  if (!client) {
    return outfit;
  }

  const { error } = await client.from("outfit_suggestions").insert({
    id: outfit.id,
    user_id: outfit.userId,
    generated_for_date: outfit.generatedForDate,
    context_json: outfit.context,
    primary_slots_json: outfit.primarySlots,
    alternate_slots_json: outfit.alternateSlots,
    reasoning_json: outfit.reasoning,
    confidence: outfit.confidence,
    accepted_at: outfit.acceptedAt,
    rejected_at: outfit.rejectedAt,
    created_at: outfit.createdAt,
  });

  throwIfSupabaseError(error, "Could not save the outfit suggestion");

  return outfit;
}

export async function recordFeedback(event: FeedbackEvent) {
  const demo = getDemoState();

  if (!hasSupabaseEnv) {
    demo.feedbackEvents.unshift(event);
    return event;
  }

  const client = await getSupabaseClient();

  if (!client) {
    demo.feedbackEvents.unshift(event);
    return event;
  }

  const { error } = await client.from("feedback_events").insert({
    id: event.id,
    user_id: event.userId,
    target_type: event.targetType,
    target_id: event.targetId,
    reaction: event.reaction,
    reason_code: event.reasonCode,
    notes: event.notes,
    created_at: event.createdAt,
  });

  throwIfSupabaseError(error, "Could not record outfit feedback");

  return event;
}

export async function listRecentFeedback(userId: string, limit = 8) {
  const demo = getDemoState();

  if (!hasSupabaseEnv) {
    return demo.feedbackEvents.filter((event) => event.userId === userId).slice(0, limit);
  }

  const client = await getSupabaseClient();

  if (!client) {
    return demo.feedbackEvents.slice(0, limit);
  }

  const { data } = await client
    .from("feedback_events")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map(
    (record) =>
      ({
        id: String(record.id),
        userId: String(record.user_id),
        targetType: String(record.target_type) as FeedbackEvent["targetType"],
        targetId: String(record.target_id),
        reaction: String(record.reaction) as FeedbackEvent["reaction"],
        reasonCode: String(record.reason_code ?? ""),
        notes: String(record.notes ?? ""),
        createdAt: String(record.created_at),
      }) satisfies FeedbackEvent,
  );
}

export async function createProcessingJob(job: ProcessingJob) {
  const demo = getDemoState();

  if (!hasSupabaseEnv) {
    demo.processingJobs.unshift(job);
    return job;
  }

  const client = await getSupabaseClient();

  if (!client) {
    demo.processingJobs.unshift(job);
    return job;
  }

  try {
    const { error } = await client.from("processing_jobs").insert({
      id: job.id,
      user_id: job.userId,
      status: job.status,
      capture_mode: job.captureMode,
      file_name: job.fileName,
      mime_type: job.mimeType,
      source_path: job.sourcePath,
      result_item_ids: job.resultItemIds,
      error_message: job.errorMessage,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
    });

    throwIfSupabaseError(error, "Could not create the processing job");
  } catch (error) {
    if (isTransientSupabaseFetchFailure(error)) {
      demo.processingJobs.unshift(job);
      return job;
    }

    throw error;
  }

  return job;
}

export async function getProcessingJob(userId: string, jobId: string) {
  const demo = getDemoState();

  if (!hasSupabaseEnv) {
    return demo.processingJobs.find((job) => job.id === jobId && job.userId === userId) ?? null;
  }

  const client = await getSupabaseClient();

  if (!client) {
    return null;
  }

  const { data } = await client
    .from("processing_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    return null;
  }

  return {
    id: String(data.id),
    userId: String(data.user_id),
    status: String(data.status) as ProcessingJob["status"],
    captureMode: String(data.capture_mode ?? ""),
    fileName: String(data.file_name ?? ""),
    mimeType: String(data.mime_type ?? ""),
    sourcePath: String(data.source_path ?? ""),
    resultItemIds: Array.isArray(data.result_item_ids)
      ? (data.result_item_ids as string[])
      : [],
    errorMessage: data.error_message ? String(data.error_message) : null,
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
  } satisfies ProcessingJob;
}

export async function updateProcessingJob(jobId: string, patch: Partial<ProcessingJob>) {
  const demo = getDemoState();
  const demoJob = demo.processingJobs.find((job) => job.id === jobId);

  if (!hasSupabaseEnv) {
    if (demoJob) {
      Object.assign(demoJob, patch);
    }
    return demoJob ?? null;
  }

  const client = await getSupabaseClient();

  if (!client) {
    return demoJob ?? null;
  }

  try {
    const { error } = await client
      .from("processing_jobs")
      .update({
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.resultItemIds ? { result_item_ids: patch.resultItemIds } : {}),
        ...(patch.errorMessage !== undefined ? { error_message: patch.errorMessage } : {}),
        updated_at: patch.updatedAt ?? new Date().toISOString(),
      })
      .eq("id", jobId);

    throwIfSupabaseError(error, "Could not update the processing job");
  } catch (error) {
    if (isTransientSupabaseFetchFailure(error)) {
      if (demoJob) {
        Object.assign(demoJob, patch);
      }
      return demoJob ?? null;
    }

    throw error;
  }

  return getProcessingJob(patch.userId ?? demo.user.id, jobId);
}

export async function insertProcessedWardrobeItem(params: {
  item: WardrobeItem;
  asset: WardrobeAsset;
}) {
  const demo = getDemoState();

  if (!hasSupabaseEnv) {
    demo.wardrobeItems.unshift(params.item);
    demo.wardrobeAssets.unshift(params.asset);
    return params.item;
  }

  const client = await getSupabaseClient();

  if (!client) {
    demo.wardrobeItems.unshift(params.item);
    demo.wardrobeAssets.unshift(params.asset);
    return params.item;
  }

  try {
    const { error: itemError } = await client.from("wardrobe_items").insert({
      id: params.item.id,
      user_id: params.item.userId,
      status: params.item.status,
      name: params.item.name,
      category: params.item.category,
      subcategory: params.item.subcategory,
      colors_json: params.item.colors,
      pattern: params.item.pattern,
      fabric: params.item.fabric,
      size: params.item.size,
      formality: params.item.formality,
      seasonality_json: params.item.seasonality,
      layer_role: params.item.layerRole,
      occasion_tags_json: params.item.occasionTags,
      style_tags_json: params.item.styleTags,
      wear_count: params.item.wearCount,
      last_worn_at: params.item.lastWornAt,
      favorite_score: params.item.favoriteScore,
      dislike_score: params.item.dislikeScore,
      confidence_json: params.item.confidence,
      source_prompt_version: params.item.sourcePromptVersion,
      created_at: params.item.createdAt,
    });

    throwIfSupabaseError(itemError, "Could not save the wardrobe item");

    const { error: assetError } = await client.from("wardrobe_assets").insert({
      id: params.asset.id,
      item_id: params.asset.itemId,
      original_path: params.asset.originalPath,
      cropped_path: params.asset.croppedPath,
      isolated_path: params.asset.isolatedPath,
      mask_path: params.asset.maskPath,
      bbox_json: params.asset.bbox,
      quality_flags_json: params.asset.qualityFlags,
    });

    throwIfSupabaseError(assetError, "Could not save the wardrobe asset");
  } catch (error) {
    if (isTransientSupabaseFetchFailure(error)) {
      demo.wardrobeItems.unshift(params.item);
      demo.wardrobeAssets.unshift(params.asset);
      return params.item;
    }

    throw error;
  }

  return params.item;
}

export async function updateWardrobeItem(userId: string, itemId: string, patch: Partial<WardrobeItem>) {
  const demo = getDemoState();
  const demoItem = demo.wardrobeItems.find((item) => item.userId === userId && item.id === itemId);

  if (!hasSupabaseEnv) {
    if (demoItem) {
      Object.assign(demoItem, patch);
    }
    return attachAssets(demoItem ? [demoItem] : [], demo.wardrobeAssets)[0] ?? null;
  }

  const client = await getSupabaseClient();

  if (!client) {
    return attachAssets(demoItem ? [demoItem] : [], demo.wardrobeAssets)[0] ?? null;
  }

  const { error } = await client
    .from("wardrobe_items")
    .update({
      ...(patch.name ? { name: patch.name } : {}),
      ...(patch.category ? { category: patch.category } : {}),
      ...(patch.subcategory ? { subcategory: patch.subcategory } : {}),
      ...(patch.colors ? { colors_json: patch.colors } : {}),
      ...(patch.pattern ? { pattern: patch.pattern } : {}),
      ...(patch.fabric ? { fabric: patch.fabric } : {}),
      ...(patch.size !== undefined ? { size: patch.size } : {}),
      ...(patch.formality ? { formality: patch.formality } : {}),
      ...(patch.seasonality ? { seasonality_json: patch.seasonality } : {}),
      ...(patch.status ? { status: patch.status } : {}),
    })
    .eq("id", itemId)
    .eq("user_id", userId);

  throwIfSupabaseError(error, "Could not update the wardrobe item");

  const items = await listWardrobeItems(userId);
  return items.find((item) => item.id === itemId) ?? null;
}

export async function deleteWardrobeItem(userId: string, itemId: string) {
  const demo = getDemoState();
  const demoItemIndex = demo.wardrobeItems.findIndex(
    (item) => item.userId === userId && item.id === itemId,
  );

  if (!hasSupabaseEnv) {
    if (demoItemIndex === -1) {
      return false;
    }

    demo.wardrobeItems.splice(demoItemIndex, 1);
    demo.wardrobeAssets = demo.wardrobeAssets.filter((asset) => asset.itemId !== itemId);
    return true;
  }

  const client = await getSupabaseClient();

  if (!client) {
    if (demoItemIndex === -1) {
      return false;
    }

    demo.wardrobeItems.splice(demoItemIndex, 1);
    demo.wardrobeAssets = demo.wardrobeAssets.filter((asset) => asset.itemId !== itemId);
    return true;
  }

  const { error } = await client
    .from("wardrobe_items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", userId);

  return !error;
}

export async function getOrCreateStylistThread(userId: string, threadId?: string) {
  const demo = getDemoState();

  if (!hasSupabaseEnv) {
    if (threadId) {
      return demo.stylistThreads.find((thread) => thread.id === threadId) ?? demo.stylistThreads[0];
    }
    return demo.stylistThreads[0];
  }

  const client = await getSupabaseClient();

  if (!client) {
    return demo.stylistThreads[0];
  }

  try {
    if (threadId) {
      const { data } = await client
        .from("stylist_threads")
        .select("*")
        .eq("id", threadId)
        .eq("user_id", userId)
        .maybeSingle();

      if (data) {
        return {
          id: String(data.id),
          userId: String(data.user_id),
          title: String(data.title ?? "Stylist"),
          createdAt: String(data.created_at),
        } satisfies StylistThread;
      }
    }

    const { data: latestMessage } = await client
      .from("stylist_messages")
      .select("thread_id, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestMessage?.thread_id) {
      const { data: activeThread } = await client
        .from("stylist_threads")
        .select("*")
        .eq("id", String(latestMessage.thread_id))
        .eq("user_id", userId)
        .maybeSingle();

      if (activeThread) {
        return {
          id: String(activeThread.id),
          userId: String(activeThread.user_id),
          title: String(activeThread.title ?? "Stylist"),
          createdAt: String(activeThread.created_at),
        } satisfies StylistThread;
      }
    }

    const { data: latest } = await client
      .from("stylist_threads")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest) {
      return {
        id: String(latest.id),
        userId: String(latest.user_id),
        title: String(latest.title ?? "Stylist"),
        createdAt: String(latest.created_at),
      } satisfies StylistThread;
    }

    const created = {
      id: crypto.randomUUID(),
      userId,
      title: "Daily stylist",
      createdAt: new Date().toISOString(),
    } satisfies StylistThread;

    const { error } = await client.from("stylist_threads").insert({
      id: created.id,
      user_id: created.userId,
      title: created.title,
      created_at: created.createdAt,
    });

    throwIfSupabaseError(error, "Could not create the stylist thread");

    return created;
  } catch (error) {
    if (isTransientSupabaseFetchFailure(error)) {
      if (threadId) {
        return demo.stylistThreads.find((thread) => thread.id === threadId) ?? demo.stylistThreads[0];
      }
      return demo.stylistThreads[0];
    }
    throw error;
  }
}

export async function listStylistMessages(threadId: string) {
  const demo = getDemoState();

  if (!hasSupabaseEnv) {
    return demo.stylistMessages.filter((message) => message.threadId === threadId);
  }

  const client = await getSupabaseClient();

  if (!client) {
    return demo.stylistMessages.filter((message) => message.threadId === threadId);
  }

  try {
    const { data } = await client
      .from("stylist_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    return (data ?? []).map(
      (record) =>
        ({
          id: String(record.id),
          threadId: String(record.thread_id),
          role: String(record.role) as StylistMessage["role"],
          content: String(record.content ?? ""),
          toolCalls: Array.isArray(record.tool_calls_json)
            ? (record.tool_calls_json as StylistMessage["toolCalls"])
            : [],
          createdAt: String(record.created_at),
        }) satisfies StylistMessage,
    );
  } catch (error) {
    if (isTransientSupabaseFetchFailure(error)) {
      return demo.stylistMessages.filter((message) => message.threadId === threadId);
    }
    throw error;
  }
}

export async function appendStylistMessage(message: StylistMessage) {
  const demo = getDemoState();

  if (!hasSupabaseEnv) {
    demo.stylistMessages.push(message);
    return message;
  }

  const client = await getSupabaseClient();

  if (!client) {
    demo.stylistMessages.push(message);
    return message;
  }

  try {
    const { error } = await client.from("stylist_messages").insert({
      id: message.id,
      thread_id: message.threadId,
      role: message.role,
      content: message.content,
      tool_calls_json: message.toolCalls,
      created_at: message.createdAt,
    });

    throwIfSupabaseError(error, "Could not append the stylist message");
  } catch (error) {
    if (isTransientSupabaseFetchFailure(error)) {
      demo.stylistMessages.push(message);
      return message;
    }
    throw error;
  }

  return message;
}

export async function saveAiRun(run: AiRun) {
  const demo = getDemoState();

  if (!hasSupabaseEnv) {
    demo.aiRuns.unshift(run);
    return run;
  }

  const client = await getSupabaseClient();

  if (!client) {
    demo.aiRuns.unshift(run);
    return run;
  }

  try {
    const { error } = await client.from("ai_runs").insert({
      id: run.id,
      user_id: run.userId,
      run_type: run.runType,
      model: run.model,
      prompt_version: run.promptVersion,
      input_json: run.input,
      output_json: run.output,
      latency_ms: run.latencyMs,
      token_usage_json: run.tokenUsage,
      status: run.status,
      created_at: run.createdAt,
    });

    throwIfSupabaseError(error, "Could not save the AI run");
  } catch (error) {
    if (isTransientSupabaseFetchFailure(error)) {
      demo.aiRuns.unshift(run);
      return run;
    }

    throw error;
  }

  return run;
}
