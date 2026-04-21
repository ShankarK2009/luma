import { SectionCard } from "@/components/section-card";
import { StylistChat } from "@/components/stylist-chat";
import { getCurrentUserContext } from "@/lib/auth/session";
import {
  getOrCreateStylistThread,
  getStyleProfile,
  getUserProfile,
  listStylistMessages,
} from "@/lib/data/repository";
import { getWeatherSnapshot } from "@/lib/weather/open-meteo";
import { formatTemperature } from "@/lib/utils";

export default async function StylistPage() {
  const user = await getCurrentUserContext();
  const [profile, thread, person] = await Promise.all([
    getStyleProfile(user.userId),
    getOrCreateStylistThread(user.userId),
    getUserProfile(user.userId),
  ]);
  const weather = await getWeatherSnapshot(person);
  const messages = await listStylistMessages(thread.id);

  return (
    <>
      <SectionCard
        eyebrow="Stylist"
        title="Ask for outfit help in plain language"
        description="This assistant is grounded in your wardrobe, weather, and feedback history."
      >
        <p className="text-sm leading-6 text-[var(--text-soft)]">
          Current model summary: {profile.structuredTraits.summary}
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">
          Weather now: {weather.conditionCode}, {formatTemperature(weather.currentTempC ?? weather.temperatureLowC)}
          {" "}({formatTemperature(weather.temperatureLowC)} - {formatTemperature(weather.temperatureHighC)} today)
        </p>
      </SectionCard>
      <StylistChat threadId={thread.id} initialMessages={messages} />
    </>
  );
}
