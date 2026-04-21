import { OUTFIT_PROMPT_VERSION } from "@/lib/ai/prompts/outfit";
import { buildFallbackReasoning, buildPromptUsage, rerankOutfitsWithGemini } from "@/lib/ai/gemini";
import {
  buildSuggestionExclusionKeys,
  getStyleProfile,
  listOutfitSuggestionsForDate,
  getUserProfile,
  listWardrobeItems,
  saveAiRun,
  saveOutfitSuggestion,
} from "@/lib/data/repository";
import { buildDeterministicCandidates, buildOutfitSlotKey } from "@/lib/outfits/engine";
import { deriveTimeOfDay, deriveWeatherTags } from "@/lib/outfits/rules";
import { getWeatherSnapshot } from "@/lib/weather/open-meteo";
import type { OutfitSuggestion } from "@/lib/types";

export async function generateOutfitForUser(params: {
  userId: string;
  vibePrompt?: string;
  date?: string;
  excludeSlotKeys?: string[];
}) {
  const userProfile = await getUserProfile(params.userId);
  const [styleProfile, wardrobeItems, weather] = await Promise.all([
    getStyleProfile(params.userId),
    listWardrobeItems(params.userId),
    getWeatherSnapshot(userProfile),
  ]);
  const targetDate = params.date ?? weather.forecastDate;

  const context = {
    vibePrompt: params.vibePrompt,
    timeOfDay: deriveTimeOfDay(),
    tags: [...deriveWeatherTags(weather), "workday"],
    weather,
  };

  const candidates = buildDeterministicCandidates(
    wardrobeItems.filter((item) => item.status !== "archived"),
    context,
  );

  const previousSuggestions = await listOutfitSuggestionsForDate(params.userId, targetDate);
  const excludedKeys = new Set([
    ...buildSuggestionExclusionKeys(previousSuggestions),
    ...(params.excludeSlotKeys ?? []),
  ]);
  const unseenCandidates = candidates.filter(
    (candidate) => !excludedKeys.has(buildOutfitSlotKey(candidate.slots)),
  );
  const availableCandidates = unseenCandidates.length > 0 ? unseenCandidates : candidates;

  if (!availableCandidates.length) {
    throw new Error("Not enough wardrobe items to generate an outfit.");
  }

  const startedAt = Date.now();
  const ranking = await rerankOutfitsWithGemini({
    candidates: availableCandidates,
    wardrobeItems,
    styleProfile,
    weather,
    vibePrompt: params.vibePrompt,
  });

  const primary =
    availableCandidates.find((candidate) => candidate.id === ranking.primary_candidate_id) ??
    availableCandidates[0];
  const alternates = ranking.alternate_candidate_ids
    .map((candidateId) =>
      availableCandidates.find((candidate) => candidate.id === candidateId),
    )
    .filter(Boolean);
  const fallbackAlternates = availableCandidates
    .filter((candidate) => candidate.id !== primary.id)
    .slice(0, 2);

  const suggestion: OutfitSuggestion = {
    id: crypto.randomUUID(),
    userId: params.userId,
    generatedForDate: targetDate,
    context: {
      vibePrompt: params.vibePrompt ?? "",
      tags: context.tags,
      weather,
      timeOfDay: context.timeOfDay,
    },
    primarySlots: primary.slots,
    alternateSlots:
      alternates.length > 0
        ? alternates.map((candidate) => candidate!.slots)
        : fallbackAlternates.map((candidate) => candidate.slots),
    reasoning:
      ranking.reasoning.length > 0
        ? ranking.reasoning
        : buildFallbackReasoning(primary.id),
    confidence: ranking.confidence || 0.72,
    acceptedAt: null,
    rejectedAt: null,
    createdAt: new Date().toISOString(),
  };

  await saveOutfitSuggestion(suggestion);
  await saveAiRun({
    id: crypto.randomUUID(),
    userId: params.userId,
    runType: "outfit",
    model: "gemini-2.5-flash",
    promptVersion: OUTFIT_PROMPT_VERSION,
    input: {
      vibePrompt: params.vibePrompt ?? "",
      weather,
      candidateCount: availableCandidates.length,
    },
    output: {
      primaryCandidateId: primary.id,
      reasoning: suggestion.reasoning,
    },
    latencyMs: Date.now() - startedAt,
    tokenUsage: buildPromptUsage(JSON.stringify(context)),
    status: "succeeded",
    createdAt: new Date().toISOString(),
  });

  return {
    outfit: suggestion,
    weather,
    styleProfile,
    wardrobeItems,
  };
}
