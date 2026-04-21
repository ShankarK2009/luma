import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";

import {
  garmentExtractionSchema,
  outfitRankingSchema,
  styleSummarySchema,
} from "@/lib/ai/schemas";
import { CHAT_SYSTEM_PROMPT } from "@/lib/ai/prompts/chat";
import { buildIngestionPrompt, INGEST_PROMPT_VERSION } from "@/lib/ai/prompts/ingest";
import { buildOutfitPrompt, OUTFIT_PROMPT_VERSION } from "@/lib/ai/prompts/outfit";
import { geminiApiKey, hasGeminiEnv } from "@/lib/env";
import type {
  CandidateOutfit,
  StyleProfile,
  ToolCallRecord,
  WardrobeItem,
  WeatherSnapshot,
} from "@/lib/types";
import { hashToVector, stableHash, titleCase } from "@/lib/utils";

let client: GoogleGenAI | null = null;

function getGeminiClient() {
  if (!hasGeminiEnv) {
    return null;
  }

  if (!client) {
    client = new GoogleGenAI({
      apiKey: geminiApiKey!,
    });
  }

  return client;
}

async function generateStructured<T>({
  schema,
  model = "gemini-2.5-flash",
  contents,
  systemInstruction,
}: {
  schema: z.ZodType<T>;
  model?: string;
  contents: string | Array<Record<string, unknown>>;
  systemInstruction?: string;
}) {
  const gemini = getGeminiClient();

  if (!gemini) {
    throw new Error("Gemini is not configured.");
  }

  const config = {
    responseMimeType: "application/json",
    thinkingConfig: {
      thinkingBudget: 0,
    },
    ...(systemInstruction ? { systemInstruction } : {}),
  };

  const attempt = async (suffix?: string) => {
    const response = await gemini.models.generateContent({
      model,
      contents:
        typeof contents === "string"
          ? `${contents}${suffix ? `\n\n${suffix}` : ""}`
          : suffix
            ? [
                ...contents,
                {
                  text: suffix,
                },
              ]
            : contents,
      config,
    });

    return schema.parse(JSON.parse(response.text ?? "{}"));
  };

  try {
    return await attempt();
  } catch {
    return attempt("Return valid JSON only. Do not wrap in markdown.");
  }
}

function guessCategory(fileName: string) {
  const lower = fileName.toLowerCase();

  if (lower.includes("jacket") || lower.includes("coat") || lower.includes("blazer")) {
    return {
      label: "Outer layer",
      category: "outerwear",
      subcategory: lower.includes("blazer") ? "blazer" : "jacket",
      layerRole: "outer" as const,
    };
  }

  if (lower.includes("pant") || lower.includes("trouser") || lower.includes("jean")) {
    return {
      label: "Bottom",
      category: "bottom",
      subcategory: lower.includes("jean") ? "jeans" : "trousers",
      layerRole: "base" as const,
    };
  }

  if (lower.includes("dress")) {
    return {
      label: "Dress",
      category: "dress",
      subcategory: "dress",
      layerRole: "full-look" as const,
    };
  }

  if (lower.includes("shoe") || lower.includes("boot") || lower.includes("loafer")) {
    return {
      label: "Shoes",
      category: "shoes",
      subcategory: lower.includes("boot") ? "boots" : "loafers",
      layerRole: "accessory" as const,
    };
  }

  return {
    label: "Top",
    category: "top",
    subcategory: lower.includes("tee") ? "tee" : "shirt",
    layerRole: "base" as const,
  };
}

function buildFallbackStyleSummary(params: {
  freeformPreferences: string;
  explicitLikes?: string[];
  explicitDislikes?: string[];
}) {
  return styleSummarySchema.parse({
    summary: params.freeformPreferences,
    preferred_colors: params.explicitLikes?.filter((entry) => entry.length < 20) ?? [
      "navy",
      "white",
      "charcoal",
    ],
    avoided_colors: params.explicitDislikes ?? [],
    preferred_silhouettes: ["tailored", "easy layer"],
    favorite_categories: ["shirt", "trousers", "outerwear"],
    target_vibes: ["confident", "clean"],
    formality_tendency: "balanced",
    notes: ["Fallback summary used because Gemini was unavailable."],
  });
}

function buildFallbackOutfitRanking(candidates: CandidateOutfit[]) {
  return outfitRankingSchema.parse({
    primary_candidate_id: candidates[0]?.id ?? "",
    alternate_candidate_ids: candidates.slice(1, 3).map((entry) => entry.id),
    reasoning: candidates[0]?.notes ?? ["Used deterministic fallback ordering."],
    confidence: 0.74,
  });
}

function buildFallbackWardrobeExtraction(fileName: string) {
  const guess = guessCategory(fileName);
  return garmentExtractionSchema.parse({
    garments: [
      {
        label: guess.label,
        category: guess.category,
        subcategory: guess.subcategory,
        colors: ["neutral"],
        pattern: "solid",
        fabric: "unknown",
        size: "",
        size_source: "unknown",
        formality: "casual",
        seasonality: ["spring", "fall"],
        layer_role: guess.layerRole,
        occasion_tags: ["everyday"],
        style_tags: ["clean"],
        confidence: {
          category: 0.56,
          segmentation: 0.48,
        },
        box_2d: [0, 0, 1000, 1000],
        mask: "",
      },
    ],
  });
}

function pickSearchQuery(message: string) {
  const cleaned = message
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const stripped = cleaned
    .replace(/\b(remix|show|find|search|for|my|the|a|an|today|look|outfit|wear|create|me)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return stripped || cleaned || "wardrobe";
}

async function runFallbackStylistAssistant(params: {
  message: string;
  toolHandlers: Record<string, ToolHandler>;
}) {
  const message = params.message.toLowerCase();
  const toolCalls: ToolCallRecord[] = [];

  const callTool = async (name: string, args: Record<string, unknown>) => {
    const handler = params.toolHandlers[name];
    const result = handler
      ? await handler(args)
      : {
          error: `No tool handler registered for ${name}`,
        };
    const record = { name, args, result } satisfies ToolCallRecord;
    toolCalls.push(record);
    return record;
  };

  if (message.includes("style")) {
    return {
      reply:
        "Your wardrobe reads polished, neutral, and layered. You lean toward clean combinations that feel sharp without looking overworked.",
      toolCalls,
      promptVersion: "fallback",
      model: "fallback",
    };
  }

  if (
    message.includes("outfit") ||
    message.includes("wear") ||
    message.includes("look") ||
    message.includes("streetwear") ||
    message.includes("date") ||
    message.includes("cozy")
  ) {
    const weatherRecord = await callTool("getWeatherContext", {});
    const outfitRecord = await callTool("generateOutfit", {
      vibePrompt: params.message,
    });

    const weather =
      typeof weatherRecord.result === "object" && weatherRecord.result && "weather" in weatherRecord.result
        ? (weatherRecord.result.weather as Partial<WeatherSnapshot>)
        : null;
    const outfit =
      typeof outfitRecord.result === "object" && outfitRecord.result && "primaryItems" in outfitRecord.result
        ? (outfitRecord.result.primaryItems as Array<{ name?: string }>)
        : [];
    const itemNames = outfit.map((item) => item.name).filter(Boolean);

    return {
      reply:
        itemNames.length > 0
          ? `For ${weather?.conditionCode ?? "today’s weather"}, I’d go with ${itemNames.join(", ")}.`
          : `I pulled together a weather-aware outfit for ${weather?.conditionCode ?? "today"}.`,
      toolCalls,
      promptVersion: "fallback",
      model: "fallback",
    };
  }

  if (message.includes("prefer") || message.includes("like") || message.includes("avoid")) {
    const saved = await callTool("savePreference", {
      preference: params.message,
    });

    return {
      reply:
        typeof saved.result === "object" && saved.result && "saved" in saved.result
          ? "Saved that preference. I’ll factor it into future suggestions."
          : "I noted that preference for future suggestions.",
      toolCalls,
      promptVersion: "fallback",
      model: "fallback",
    };
  }

  const search = await callTool("searchWardrobe", {
    query: pickSearchQuery(params.message),
  });
  const matches =
    typeof search.result === "object" && search.result && "matches" in search.result
      ? (search.result.matches as Array<{ name?: string; category?: string }>)
      : [];

  return {
    reply:
      matches.length > 0
        ? `I found ${matches
            .slice(0, 3)
            .map((item) => item.name ?? item.category ?? "a wardrobe item")
            .join(", ")} in your wardrobe.`
        : "I couldn’t find a clear wardrobe match, but I can help if you ask for a specific vibe, event, or item.",
    toolCalls,
    promptVersion: "fallback",
    model: "fallback",
  };
}

export async function extractWardrobeGarments(params: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  captureMode?: string;
}) {
  const prompt = buildIngestionPrompt(params);
  const gemini = getGeminiClient();

  if (!gemini) {
    return buildFallbackWardrobeExtraction(params.fileName);
  }

  try {
    return await generateStructured({
      schema: garmentExtractionSchema,
      contents: [
        {
          inlineData: {
            mimeType: params.mimeType,
            data: params.buffer.toString("base64"),
          },
        },
        {
          text: prompt,
        },
      ],
    });
  } catch {
    return buildFallbackWardrobeExtraction(params.fileName);
  }
}

export async function summarizeStylePreferences(params: {
  freeformPreferences: string;
  inspirationSummaries?: string[];
  explicitLikes?: string[];
  explicitDislikes?: string[];
}) {
  const joinedText = [
    params.freeformPreferences,
    ...(params.inspirationSummaries ?? []),
    `likes: ${(params.explicitLikes ?? []).join(", ")}`,
    `dislikes: ${(params.explicitDislikes ?? []).join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  if (!getGeminiClient()) {
    return buildFallbackStyleSummary(params);
  }

  try {
    return await generateStructured({
      schema: styleSummarySchema,
      contents: `
Summarize these wardrobe preferences into structured traits for a stylist app.

Return JSON only.
Use this exact shape:
{
  "summary": "string",
  "preferred_colors": ["string"],
  "avoided_colors": ["string"],
  "preferred_silhouettes": ["string"],
  "favorite_categories": ["string"],
  "target_vibes": ["string"],
  "formality_tendency": "relaxed|balanced|polished",
  "notes": ["string"]
}

${joinedText}
    `.trim(),
    });
  } catch {
    return buildFallbackStyleSummary(params);
  }
}

export async function embedStyleText(input: string) {
  const gemini = getGeminiClient();

  if (!gemini) {
    return hashToVector(input, 16);
  }

  try {
    const response = await gemini.models.embedContent({
      model: "gemini-embedding-001",
      contents: input,
      config: {
        outputDimensionality: 768,
      },
    });

    const embeddings = response.embeddings as Array<{ values?: number[] }>;

    return embeddings[0]?.values ?? hashToVector(input, 16);
  } catch {
    return hashToVector(input, 16);
  }
}

export async function rerankOutfitsWithGemini(params: {
  candidates: CandidateOutfit[];
  wardrobeItems: WardrobeItem[];
  styleProfile: StyleProfile;
  weather: WeatherSnapshot;
  vibePrompt?: string;
}) {
  if (!getGeminiClient()) {
    return buildFallbackOutfitRanking(params.candidates);
  }

  const itemMap = new Map(params.wardrobeItems.map((item) => [item.id, item]));

  try {
    return await generateStructured({
      schema: outfitRankingSchema,
      contents: buildOutfitPrompt({
        weather: params.weather,
        styleProfile: params.styleProfile,
        candidates: params.candidates,
        itemMap,
        vibePrompt: params.vibePrompt,
      }),
    });
  } catch {
    return buildFallbackOutfitRanking(params.candidates);
  }
}

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

function extractFunctionCalls(response: {
  functionCalls?: Array<{ name?: string; args?: Record<string, unknown> }>;
  candidates?: Array<{
    content?: {
      parts?: Array<{
        functionCall?: {
          name?: string;
          args?: Record<string, unknown>;
        };
      }>;
    };
  }>;
}) {
  const directCalls = (response.functionCalls ?? []).map((call) => ({
    name: call.name,
    args: call.args ?? {},
  }));

  if (directCalls.length > 0) {
    return directCalls;
  }

  return (
    response.candidates?.[0]?.content?.parts
      ?.map((part) => part.functionCall)
      .filter(Boolean)
      .map((call) => ({
        name: call?.name,
        args: call?.args ?? {},
      })) ?? []
  );
}

function buildToolPrompt(params: {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  message: string;
  contextSummary: string;
  toolCalls: ToolCallRecord[];
}) {
  return `
Known context:
${params.contextSummary}

Conversation history:
${params.history.map((entry) => `${entry.role}: ${entry.content}`).join("\n")}

Latest user request:
${params.message}

Verified tool outputs:
${JSON.stringify(params.toolCalls, null, 2)}

Write a concise, helpful stylist reply for a phone screen.
Use the verified tool outputs directly.
Do not mention tool names.
Do not invent clothes or facts that are not in the tool outputs.
If the data is insufficient, say what is missing in one short sentence.
  `.trim();
}

function synthesizeToolReply(toolCalls: ToolCallRecord[]) {
  const generatedOutfit = toolCalls.find((record) => record.name === "generateOutfit");

  if (
    generatedOutfit &&
    typeof generatedOutfit.result === "object" &&
    generatedOutfit.result &&
    "outfit" in generatedOutfit.result
  ) {
    return "I pulled together a fresh outfit from your wardrobe. If you want, I can refine it for a more formal, casual, or evening feel.";
  }

  const wardrobeSearch = toolCalls.find((record) => record.name === "searchWardrobe");

  if (
    wardrobeSearch &&
    typeof wardrobeSearch.result === "object" &&
    wardrobeSearch.result &&
    "matches" in wardrobeSearch.result &&
    Array.isArray(wardrobeSearch.result.matches)
  ) {
    const matches = wardrobeSearch.result.matches as Array<{ name?: string }>;

    if (matches.length > 0) {
      return `I found ${matches
        .slice(0, 3)
        .map((match) => match.name ?? "a wardrobe item")
        .join(", ")} in your wardrobe.`;
    }
  }

  const weatherCall = toolCalls.find((record) => record.name === "getWeatherContext");

  if (
    weatherCall &&
    typeof weatherCall.result === "object" &&
    weatherCall.result &&
    "weather" in weatherCall.result &&
    typeof weatherCall.result.weather === "object" &&
    weatherCall.result.weather
  ) {
    const weather = weatherCall.result.weather as Partial<WeatherSnapshot>;
    return `Today looks ${weather.conditionCode ?? "mixed"}, so I’d style around that weather first.`;
  }

  const savePreferenceCall = toolCalls.find((record) => record.name === "savePreference");

  if (
    savePreferenceCall &&
    typeof savePreferenceCall.result === "object" &&
    savePreferenceCall.result &&
    "preference" in savePreferenceCall.result
  ) {
    return `Saved that preference, and I’ll use it in future outfit suggestions.`;
  }

  return "I’ve updated the stylist context from your wardrobe and saved data. Ask for a specific vibe, event, or item remix and I’ll narrow it down.";
}

export async function runStylistAssistant(params: {
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  contextSummary: string;
  toolHandlers: Record<string, ToolHandler>;
}) {
  const gemini = getGeminiClient();

  if (!gemini) {
    return runFallbackStylistAssistant({
      message: params.message,
      toolHandlers: params.toolHandlers,
    });
  }

  const tools = [
    {
      functionDeclarations: [
        {
          name: "searchWardrobe",
          description: "Search the user's wardrobe items by query or vibe.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              query: {
                type: Type.STRING,
              },
            },
            required: ["query"],
          },
        },
        {
          name: "getWeatherContext",
          description: "Get today's weather summary for outfit decisions.",
          parameters: {
            type: Type.OBJECT,
            properties: {},
          },
        },
        {
          name: "generateOutfit",
          description: "Generate a new outfit suggestion from the saved wardrobe.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              vibePrompt: {
                type: Type.STRING,
              },
            },
          },
        },
        {
          name: "savePreference",
          description: "Persist a new style preference or dislike.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              preference: {
                type: Type.STRING,
              },
            },
            required: ["preference"],
          },
        },
        {
          name: "listRecentFeedback",
          description: "Retrieve recent likes, dislikes, and swap reasons.",
          parameters: {
            type: Type.OBJECT,
            properties: {},
          },
        },
      ],
    },
  ] as const;

  const contents = [
    ...params.history.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    })),
    {
      role: "user",
      parts: [{ text: params.message }],
    },
  ];

  try {
    const initial = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction: `${CHAT_SYSTEM_PROMPT}\n\nKnown context:\n${params.contextSummary}`,
        tools: tools as never,
      },
    });

    const functionCalls = extractFunctionCalls(initial);

    if (!functionCalls.length) {
      return {
        reply:
          initial.text?.trim() ??
          "I found a grounded wardrobe answer, but it came back empty.",
        toolCalls: [] as ToolCallRecord[],
        promptVersion: "luma-chat-v2",
        model: "gemini-2.5-flash",
      };
    }

    const executed: ToolCallRecord[] = [];

    for (const call of functionCalls.slice(0, 4)) {
      const name = call.name ?? "unknown";
      const args = call.args ?? {};
      const handler = params.toolHandlers[name];
      const result = handler
        ? await handler(args)
        : {
            error: `No tool handler registered for ${name}`,
          };

      executed.push({ name, args, result });
    }

    const final = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: buildToolPrompt({
        history: params.history.slice(-8),
        message: params.message,
        contextSummary: params.contextSummary,
        toolCalls: executed,
      }),
      config: {
        systemInstruction: `${CHAT_SYSTEM_PROMPT}\n\nKnown context:\n${params.contextSummary}`,
      },
    });

    const reply =
      final.text?.trim() ||
      initial.text?.trim() ||
      synthesizeToolReply(executed);

    return {
      reply,
      toolCalls: executed,
      promptVersion: "luma-chat-v2",
      model: "gemini-2.5-flash",
    };
  } catch {
    return runFallbackStylistAssistant({
      message: params.message,
      toolHandlers: params.toolHandlers,
    });
  }
}

export function buildItemName(label: string, colors: string[]) {
  const base = titleCase(label.trim());
  const colorPrefix = colors[0] ? `${titleCase(colors[0])} ` : "";
  return `${colorPrefix}${base}`.trim();
}

export function buildFallbackReasoning(candidateId: string) {
  return [
    `Candidate ${candidateId} won because it balanced structure, weather fit, and novelty.`,
  ];
}

export function buildPromptUsage(input: string) {
  const tokenEstimate = Math.max(20, Math.ceil(input.length / 4));

  return {
    prompt_tokens: tokenEstimate,
    completion_tokens: Math.ceil(tokenEstimate * 0.45),
    total_tokens: Math.ceil(tokenEstimate * 1.45),
    checksum: stableHash(input),
    ingest_version: INGEST_PROMPT_VERSION,
    outfit_version: OUTFIT_PROMPT_VERSION,
  };
}
