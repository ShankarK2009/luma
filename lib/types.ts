export type DataMode = "demo" | "supabase";

export type WardrobeStatus =
  | "processing"
  | "needs_review"
  | "active"
  | "archived";

export type ProcessingJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export type FeedbackReaction =
  | "like"
  | "dislike"
  | "swap"
  | "accept"
  | "reject";

export type OutfitSlotName =
  | "top"
  | "bottom"
  | "onePiece"
  | "outerwear"
  | "shoes"
  | "accessories";

export type TimeOfDay = "morning" | "afternoon" | "evening";

export interface BoundingBox {
  y0: number;
  x0: number;
  y1: number;
  x1: number;
}

export interface StyleTraits {
  summary: string;
  preferredColors: string[];
  avoidedColors: string[];
  preferredSilhouettes: string[];
  favoriteCategories: string[];
  targetVibes: string[];
  formalityTendency: "relaxed" | "balanced" | "polished";
  notes: string[];
}

export interface WardrobeAsset {
  id: string;
  itemId: string;
  originalPath: string;
  croppedPath: string;
  isolatedPath: string;
  maskPath: string;
  bbox: BoundingBox | null;
  qualityFlags: string[];
}

export interface WardrobeItem {
  id: string;
  userId: string;
  status: WardrobeStatus;
  name: string;
  category: string;
  subcategory: string;
  colors: string[];
  pattern: string;
  fabric: string;
  size: string;
  formality: "casual" | "smart-casual" | "formal";
  seasonality: string[];
  layerRole: "base" | "mid" | "outer" | "full-look" | "accessory";
  occasionTags: string[];
  styleTags: string[];
  wearCount: number;
  lastWornAt: string | null;
  favoriteScore: number;
  dislikeScore: number;
  confidence: Record<string, number>;
  sourcePromptVersion: string;
  createdAt: string;
  asset?: WardrobeAsset | null;
}

export interface ProcessingJob {
  id: string;
  userId: string;
  status: ProcessingJobStatus;
  captureMode: string;
  fileName: string;
  mimeType: string;
  sourcePath: string;
  resultItemIds: string[];
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StyleProfile {
  userId: string;
  freeformPreferences: string;
  structuredTraits: StyleTraits;
  dislikedTraits: string[];
  styleEmbedding: number[];
  updatedAt: string;
}

export interface InspirationAsset {
  id: string;
  userId: string;
  storagePath: string;
  summary: string[];
  embedding: number[];
  createdAt: string;
}

export interface WeatherSnapshot {
  id: string;
  userId: string;
  forecastDate: string;
  temperatureHighC: number;
  temperatureLowC: number;
  currentTempC?: number;
  apparentTempC?: number;
  windSpeedKph?: number;
  uvIndexMax?: number;
  sunrise?: string;
  sunset?: string;
  precipitationProbability: number;
  conditionCode: string;
  raw: Record<string, unknown>;
}

export interface OutfitSlotMap {
  top?: string;
  bottom?: string;
  onePiece?: string;
  outerwear?: string;
  shoes?: string;
  accessories?: string[];
}

export interface CandidateOutfit {
  id: string;
  slots: OutfitSlotMap;
  score: number;
  notes: string[];
  vibe: string;
}

export interface OutfitSuggestion {
  id: string;
  userId: string;
  generatedForDate: string;
  context: Record<string, unknown>;
  primarySlots: OutfitSlotMap;
  alternateSlots: OutfitSlotMap[];
  reasoning: string[];
  confidence: number;
  acceptedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
}

export interface FeedbackEvent {
  id: string;
  userId: string;
  targetType: "item" | "outfit";
  targetId: string;
  reaction: FeedbackReaction;
  reasonCode: string;
  notes: string;
  createdAt: string;
}

export interface StylistThread {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface StylistMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: ToolCallRecord[];
  createdAt: string;
}

export interface AiRun {
  id: string;
  userId: string;
  runType: "ingest" | "outfit" | "chat" | "embed";
  model: string;
  promptVersion: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  latencyMs: number;
  tokenUsage: Record<string, number | string>;
  status: "succeeded" | "failed";
  createdAt: string;
}

export interface NotificationEvent {
  id: string;
  userId: string;
  title: string;
  body: string;
  level: "info" | "nudge";
  createdAt: string;
}

export interface UserProfile {
  id: string;
  displayName: string;
  timezone: string;
  homeLat: number | null;
  homeLng: number | null;
  createdAt: string;
}

export interface UserContext {
  userId: string;
  displayName: string;
  isAuthenticated: boolean;
  mode: DataMode;
}

export interface WardrobeFilters {
  category?: string;
  color?: string;
  formality?: string;
  season?: string;
  query?: string;
}

export interface OutfitGenerationContext {
  vibePrompt?: string;
  timeOfDay: TimeOfDay;
  tags: string[];
  weather: WeatherSnapshot;
}

export interface DemoState {
  user: UserProfile;
  styleProfile: StyleProfile;
  inspirationAssets: InspirationAsset[];
  wardrobeItems: WardrobeItem[];
  wardrobeAssets: WardrobeAsset[];
  processingJobs: ProcessingJob[];
  outfitSuggestions: OutfitSuggestion[];
  feedbackEvents: FeedbackEvent[];
  weatherSnapshots: WeatherSnapshot[];
  stylistThreads: StylistThread[];
  stylistMessages: StylistMessage[];
  aiRuns: AiRun[];
  notifications: NotificationEvent[];
}
