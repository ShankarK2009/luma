import { CloudSun, Sparkles, Thermometer } from "lucide-react";

import { TodayGenerateButton } from "@/components/today-generate-button";
import { SectionCard } from "@/components/section-card";
import { TodayOutfitCard } from "@/components/today-outfit-card";
import { getCurrentUserContext } from "@/lib/auth/session";
import {
  canGenerateOutfitFromItems,
  getStyleProfile,
  getTodayOutfit,
  getUserProfile,
  listWardrobeItems,
} from "@/lib/data/repository";
import { generateOutfitForUser } from "@/lib/outfits/generate";
import { getWeatherSnapshot } from "@/lib/weather/open-meteo";
import { formatTemperature } from "@/lib/utils";

export default async function TodayPage() {
  const user = await getCurrentUserContext();
  const [items, styleProfile, savedOutfit, profile] = await Promise.all([
    listWardrobeItems(user.userId),
    getStyleProfile(user.userId),
    getTodayOutfit(user.userId),
    getUserProfile(user.userId),
  ]);
  const weather = await getWeatherSnapshot(profile);
  const generationState = canGenerateOutfitFromItems(items);
  const generated =
    !savedOutfit && generationState.canGenerate
      ? await generateOutfitForUser({
          userId: user.userId,
        }).catch(() => null)
      : null;
  const outfit = savedOutfit ?? generated?.outfit ?? null;

  const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));

  return (
    <>
      <SectionCard
        eyebrow="Today"
        title="Forecast and styling context"
        description="Luma uses weather, saved preferences, and your feedback loop to narrow today’s look."
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[1.5rem] border border-white/10 bg-black/10 p-4">
            <div className="flex items-center gap-2 text-[var(--text-soft)]">
              <Thermometer className="h-4 w-4" />
              Temperature
            </div>
            <p className="mt-3 text-lg font-semibold text-[var(--text-strong)]">
              {formatTemperature(weather.temperatureLowC)} - {formatTemperature(weather.temperatureHighC)}
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-black/10 p-4">
            <div className="flex items-center gap-2 text-[var(--text-soft)]">
              <CloudSun className="h-4 w-4" />
              Conditions
            </div>
            <p className="mt-3 text-lg font-semibold capitalize text-[var(--text-strong)]">
              {weather.conditionCode}
            </p>
            <p className="mt-1 text-sm text-[var(--text-soft)]">
              {weather.precipitationProbability}% chance of precipitation
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-black/10 p-4">
            <div className="flex items-center gap-2 text-[var(--text-soft)]">
              <Thermometer className="h-4 w-4" />
              Feels like
            </div>
            <p className="mt-3 text-lg font-semibold text-[var(--text-strong)]">
              {formatTemperature(weather.apparentTempC ?? weather.currentTempC ?? weather.temperatureLowC)}
            </p>
            <p className="mt-1 text-sm text-[var(--text-soft)]">
              Current {formatTemperature(weather.currentTempC ?? weather.temperatureLowC)}
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-black/10 p-4">
            <div className="flex items-center gap-2 text-[var(--text-soft)]">
              <CloudSun className="h-4 w-4" />
              Wind and UV
            </div>
            <p className="mt-3 text-lg font-semibold text-[var(--text-strong)]">
              {Math.round(weather.windSpeedKph ?? 0)} km/h
            </p>
            <p className="mt-1 text-sm text-[var(--text-soft)]">
              UV max {weather.uvIndexMax ?? "n/a"}
            </p>
          </div>
        </div>
      </SectionCard>

      {outfit ? (
        <TodayOutfitCard outfit={outfit} itemsById={itemsById} />
      ) : (
        <SectionCard
          eyebrow="Outfits"
          title={
            generationState.canGenerate
              ? "Generate today's look"
              : "Almost ready to generate"
          }
          description={
            generationState.canGenerate
              ? "You have enough wardrobe coverage to generate a fresh weather-aware outfit."
              : "Luma needs either a top, bottom, and shoes, or a one-piece and shoes."
          }
        >
          {generationState.canGenerate ? (
            <TodayGenerateButton />
          ) : (
            <p className="text-sm leading-6 text-[var(--text-soft)]">
              Missing pieces:
              {" "}
              {[
                !generationState.needs.top && !generationState.needs.onePiece ? "top or one-piece" : null,
                !generationState.needs.bottom && !generationState.needs.onePiece ? "bottom" : null,
                !generationState.needs.shoes ? "shoes" : null,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
        </SectionCard>
      )}

      <SectionCard
        eyebrow="Style profile"
        title="What the model is optimizing for"
        description="This is the summary currently driving outfit ranking and stylist responses."
        action={
          <Sparkles className="h-5 w-5 text-[var(--accent)]" />
        }
      >
        <p className="text-sm leading-6 text-[var(--text-strong)]">
          {styleProfile.structuredTraits.summary}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {styleProfile.structuredTraits.targetVibes.map((vibe) => (
            <span
              key={vibe}
              className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-[var(--text-soft)]"
            >
              {vibe}
            </span>
          ))}
        </div>
      </SectionCard>
    </>
  );
}
