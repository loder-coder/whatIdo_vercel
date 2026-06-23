import { NextResponse } from "next/server";
import { getCityCongestion, type Congestion } from "./city";
import { getSeoulEvents, type SeoulEvent } from "./events";
import { getShortForecast, type ShortForecast } from "./weather";

type RecommendRequest = {
  location?: unknown;
  mode?: unknown;
};

function isOutdoorEvent(event: SeoulEvent) {
  return /야외|공원|광장|한강|거리|산책/.test(`${event.title} ${event.place}`);
}

function getEventCongestion(event: SeoulEvent, congestion: Congestion[]) {
  return congestion.find(({ area }) => {
    const areaName = area.replace(/\s*(관광특구|고궁·문화유산|발달상권|공원|역|거리|지역).*$/, "").trim();
    return areaName.length > 1 && `${event.title} ${event.place}`.includes(areaName);
  });
}

function isHighCongestion(level: string) {
  return level === "붐빔" || level === "매우 붐빔";
}

function isLowCongestion(level: string) {
  return level === "여유" || level === "보통";
}

function createRecommendations(
  events: SeoulEvent[],
  weather: ShortForecast | null,
  congestion: Congestion[],
) {
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

  return events
    .filter((event) => !isHighCongestion(getEventCongestion(event, congestion)?.level ?? ""))
    .sort((first, second) => {
      const score = (event: SeoulEvent) => {
        const outdoor = isOutdoorEvent(event);
        const level = getEventCongestion(event, congestion)?.level;
        let result = level && isLowCongestion(level) ? 2 : 0;
        if ((precipitationExpected || highPrecipitationProbability) && outdoor) result -= 1;
        if (clearSky && outdoor) result += 1;
        return result;
      };
      return score(second) - score(first);
    })
    .slice(0, 10)
    .map((event) => ({
      title: event.title,
      place: event.place,
      date: event.period,
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

  const [weather, events, congestion] = await Promise.all([
    getShortForecast(body.location),
    getSeoulEvents(body.mode),
    getCityCongestion(),
  ]);

  return NextResponse.json({
    success: true,
    weather,
    events: events.map(({ title, period, place }) => ({
      title,
      place,
      date: period,
    })),
    congestion,
    recommendations: createRecommendations(events, weather, congestion),
  });
}
