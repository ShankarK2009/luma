import { z } from "zod";

export const boundingBoxTupleSchema = z.tuple([
  z.number().min(0).max(1000),
  z.number().min(0).max(1000),
  z.number().min(0).max(1000),
  z.number().min(0).max(1000),
]);

export const garmentCandidateSchema = z.object({
  label: z.string().min(1),
  category: z.string().min(1),
  subcategory: z.string().min(1),
  colors: z.array(z.string()).min(1).max(5),
  pattern: z.string().min(1),
  fabric: z.string().min(1),
  size: z.string().default(""),
  size_source: z.enum(["visible_label", "inferred", "unknown"]).default("unknown"),
  formality: z.enum(["casual", "smart-casual", "formal"]).default("casual"),
  seasonality: z.array(z.string()).min(1).max(4),
  layer_role: z
    .enum(["base", "mid", "outer", "full-look", "accessory"])
    .default("base"),
  occasion_tags: z.array(z.string()).max(8).default([]),
  style_tags: z.array(z.string()).max(8).default([]),
  confidence: z.record(z.string(), z.number()).default({}),
  box_2d: boundingBoxTupleSchema,
  mask: z.string().default(""),
});

export const garmentExtractionSchema = z.object({
  garments: z.array(garmentCandidateSchema).min(1).max(5),
});

export const styleSummarySchema = z.object({
  summary: z.string().min(1),
  preferred_colors: z.array(z.string()).default([]),
  avoided_colors: z.array(z.string()).default([]),
  preferred_silhouettes: z.array(z.string()).default([]),
  favorite_categories: z.array(z.string()).default([]),
  target_vibes: z.array(z.string()).default([]),
  formality_tendency: z
    .enum(["relaxed", "balanced", "polished"])
    .default("balanced"),
  notes: z.array(z.string()).default([]),
});

export const outfitRankingSchema = z.object({
  primary_candidate_id: z.string().min(1),
  alternate_candidate_ids: z.array(z.string()).max(2).default([]),
  reasoning: z.array(z.string()).min(1).max(5),
  confidence: z.number().min(0).max(1),
});

export const wardrobeItemPatchSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  subcategory: z.string().min(1).optional(),
  colors: z.array(z.string()).min(1).optional(),
  pattern: z.string().min(1).optional(),
  fabric: z.string().min(1).optional(),
  size: z.string().optional(),
  formality: z.enum(["casual", "smart-casual", "formal"]).optional(),
  seasonality: z.array(z.string()).optional(),
  status: z.enum(["needs_review", "active", "archived"]).optional(),
});

export const styleProfileUpdateSchema = z.object({
  freeformPreferences: z.string().min(1),
  explicitLikes: z.array(z.string()).default([]),
  explicitDislikes: z.array(z.string()).default([]),
  inspirationAssetIds: z.array(z.string()).default([]),
});

export const outfitGenerateRequestSchema = z.object({
  vibePrompt: z.string().optional(),
  date: z.string().optional(),
  excludeSlotKeys: z.array(z.string()).default([]),
});

export const feedbackRequestSchema = z.object({
  reaction: z.enum(["like", "dislike", "swap", "accept", "reject"]),
  reasonCode: z.string().default(""),
  notes: z.string().default(""),
});

export const stylistChatRequestSchema = z.object({
  threadId: z.string().optional(),
  message: z.string().min(1),
});
