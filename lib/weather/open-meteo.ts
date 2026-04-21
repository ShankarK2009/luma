import { getDemoState } from "@/lib/data/demo";
import type { UserProfile, WeatherSnapshot } from "@/lib/types";

const DEFAULT_COORDS = {
  lat: 41.8781,
  lng: -87.6298,
};

export function conditionLabelFromCode(code: number) {
  if (code === 0) return "clear";
  if (code <= 3) return "partly-cloudy";
  if (code <= 48) return "mist";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "showers";
  if (code <= 99) return "storm";
  return "unknown";
}

export async function getWeatherSnapshot(user?: Partial<UserProfile>) {
  const fallback = getDemoState().weatherSnapshots[0];
  const latitude = user?.homeLat ?? DEFAULT_COORDS.lat;
  const longitude = user?.homeLng ?? DEFAULT_COORDS.lng;

  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,wind_speed_10m&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset&timezone=auto`,
      {
        next: {
          revalidate: 900,
        },
      },
    );

    if (!response.ok) {
      return fallback;
    }

    const payload = (await response.json()) as {
      current?: {
        temperature_2m?: number;
        apparent_temperature?: number;
        wind_speed_10m?: number;
      };
      daily?: {
        time?: string[];
        weathercode?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
        uv_index_max?: number[];
        sunrise?: string[];
        sunset?: string[];
      };
    };

    const forecastDate = payload.daily?.time?.[0] ?? fallback.forecastDate;
    const weatherCode = payload.daily?.weathercode?.[0] ?? 2;

    return {
      id: `weather-${forecastDate}`,
      userId: user?.id ?? fallback.userId,
      forecastDate,
      temperatureHighC:
        payload.daily?.temperature_2m_max?.[0] ?? fallback.temperatureHighC,
      temperatureLowC:
        payload.daily?.temperature_2m_min?.[0] ?? fallback.temperatureLowC,
      currentTempC: payload.current?.temperature_2m,
      apparentTempC: payload.current?.apparent_temperature,
      windSpeedKph: payload.current?.wind_speed_10m,
      uvIndexMax: payload.daily?.uv_index_max?.[0],
      sunrise: payload.daily?.sunrise?.[0],
      sunset: payload.daily?.sunset?.[0],
      precipitationProbability:
        payload.daily?.precipitation_probability_max?.[0] ??
        fallback.precipitationProbability,
      conditionCode: conditionLabelFromCode(weatherCode),
      raw: payload as Record<string, unknown>,
    } satisfies WeatherSnapshot;
  } catch {
    return fallback;
  }
}
