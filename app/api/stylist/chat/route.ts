import { NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api/errors";
import { stylistChatRequestSchema } from "@/lib/ai/schemas";
import { runStylistAssistant } from "@/lib/ai/gemini";
import { requireCurrentUserContext } from "@/lib/auth/session";
import {
  appendStylistMessage,
  getOrCreateStylistThread,
  getStyleProfile,
  getUserProfile,
  listRecentFeedback,
  listStylistMessages,
  listWardrobeItems,
  saveAiRun,
  upsertStyleProfile,
} from "@/lib/data/repository";
import { generateOutfitForUser } from "@/lib/outfits/generate";
import { getWeatherSnapshot } from "@/lib/weather/open-meteo";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUserContext();
    const payload = stylistChatRequestSchema.parse(await request.json());
    const thread = await getOrCreateStylistThread(user.userId, payload.threadId);

    const userMessage = {
      id: crypto.randomUUID(),
      threadId: thread.id,
      role: "user" as const,
      content: payload.message,
      toolCalls: [],
      createdAt: new Date().toISOString(),
    };

    await appendStylistMessage(userMessage);

    const [history, wardrobe, profile, person, feedback] = await Promise.all([
      listStylistMessages(thread.id),
      listWardrobeItems(user.userId),
      getStyleProfile(user.userId),
      getUserProfile(user.userId),
      listRecentFeedback(user.userId),
    ]);
    const weather = await getWeatherSnapshot(person);
    const itemsById = new Map(wardrobe.map((item) => [item.id, item]));

    const result = await runStylistAssistant({
      message: payload.message,
      history: history.slice(-8).map((message) => ({
        role: message.role,
        content: message.content,
      })),
      contextSummary: [
        `Style summary: ${profile.structuredTraits.summary}`,
        `Weather: ${weather.conditionCode}, high ${weather.temperatureHighC}, low ${weather.temperatureLowC}`,
        `Wardrobe count: ${wardrobe.length}`,
        `Recent feedback count: ${feedback.length}`,
      ].join("\n"),
      toolHandlers: {
        searchWardrobe: async (args) => {
          const query = String(args.query ?? "");
          const matches = wardrobe
            .filter((item) =>
              [item.name, item.category, item.subcategory, item.colors.join(" ")]
                .join(" ")
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .slice(0, 6)
            .map((item) => ({
              id: item.id,
              name: item.name,
              category: item.category,
              colors: item.colors,
              styleTags: item.styleTags,
              occasionTags: item.occasionTags,
            }));

          return { matches };
        },
        getWeatherContext: async () => ({
          weather,
        }),
        generateOutfit: async (args) => {
          const outfit = await generateOutfitForUser({
            userId: user.userId,
            vibePrompt: String(args.vibePrompt ?? ""),
          });

          const primaryItems = [
            outfit.outfit.primarySlots.top,
            outfit.outfit.primarySlots.bottom,
            outfit.outfit.primarySlots.onePiece,
            outfit.outfit.primarySlots.outerwear,
            outfit.outfit.primarySlots.shoes,
            ...(outfit.outfit.primarySlots.accessories ?? []),
          ]
            .filter(Boolean)
            .map((itemId) => {
              const item = itemsById.get(String(itemId));
              return item
                ? {
                    id: item.id,
                    name: item.name,
                    category: item.category,
                    colors: item.colors,
                  }
                : {
                    id: String(itemId),
                  };
            });

          return {
            outfit: outfit.outfit,
            primaryItems,
            reasoning: outfit.outfit.reasoning,
          };
        },
        savePreference: async (args) => {
          const preference = String(args.preference ?? "").trim();

          const nextProfile = {
            ...profile,
            freeformPreferences: `${profile.freeformPreferences}\n${preference}`.trim(),
            updatedAt: new Date().toISOString(),
          };

          await upsertStyleProfile(user.userId, nextProfile);

          return {
            saved: true,
            preference,
          };
        },
        listRecentFeedback: async () => ({
          feedback,
        }),
      },
    });

    const assistantMessage = {
      id: crypto.randomUUID(),
      threadId: thread.id,
      role: "assistant" as const,
      content: result.reply,
      toolCalls: result.toolCalls,
      createdAt: new Date().toISOString(),
    };

    await appendStylistMessage(assistantMessage);
    await saveAiRun({
      id: crypto.randomUUID(),
      userId: user.userId,
      runType: "chat",
      model: result.model,
      promptVersion: result.promptVersion,
      input: {
        message: payload.message,
      },
      output: {
        reply: result.reply,
        toolCalls: result.toolCalls,
      },
      latencyMs: 0,
      tokenUsage: {},
      status: "succeeded",
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      threadId: thread.id,
      message: assistantMessage,
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
