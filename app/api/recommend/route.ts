import { NextResponse } from "next/server";
import { getSeoulEvents, type SeoulEvent } from "./events";
import { getShortForecast, type ShortForecast } from "./weather";

type RecommendRequest = {
  location?: unknown;
  mode?: unknown;
};

function isOutdoorEvent(event: SeoulEvent) {
  return /야외|공원|광장|한강|거리|산책/.test(`${event.title} ${event.place}`);
}

function createRecommendations(events: SeoulEvent[], weather: ShortForecast | null) {
  const precipitationExpected =
    weather?.precipitationType !== null && weather?.precipitationType !== "0";
  const highPrecipitationProbability =
    (weather?.precipitationProbability ?? 0) >= 60;
  const clearSky = weather?.sky === "1";
  const weatherNote = precipitationExpected
    ? "강수 예보를 고려한 추천"
    : highPrecipitationProbability
      ? "높은 강수확률을 고려한 추천"
      : clearSky
        ? "맑은 날씨를 고려한 추천"
        : "행사 기간을 고려한 추천";

  return [...events]
    .sort((first, second) => {
      const score = (event: SeoulEvent) => {
        const outdoor = isOutdoorEvent(event);
        if ((precipitationExpected || highPrecipitationProbability) && outdoor) return -1;
        if (clearSky && outdoor) return 1;
        return 0;
      };
      return score(second) - score(first);
    })
    .slice(0, 10)
    .map((event) => ({
      title: event.title,
      period: event.period,
      place: event.place,
      reason: weatherNote,
    }));
}

export async function POST(request: Request) {
  let body: RecommendRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (typeof body.location !== "string" || typeof body.mode !== "string") {
    return NextResponse.json(
      { success: false, error: "location and mode must be strings." },
      { status: 400 },
    );
  }

  const [weather, events] = await Promise.all([
    getShortForecast(body.location),
    getSeoulEvents(body.mode),
  ]);

  return NextResponse.json({
    success: true,
    weather,
    events: events.map(({ title, period, place }) => ({ title, period, place })),
    recommendations: createRecommendations(events, weather),
  });
}
