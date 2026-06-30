import { NextResponse } from "next/server";
import { getCityCongestion, type Congestion } from "./city";
import { getSeoulEvents, type SeoulEvent } from "./events";
import { resolveLocation } from "./location";
import { getShortForecast, type ShortForecast } from "./weather";

type RecommendRequest = { location?: unknown; mode?: unknown };

function isOutdoorEvent(event: SeoulEvent) {
  return /야외|공원|광장|한강|거리|산책/.test(`${event.title} ${event.place}`);
}

function getEventCongestion(event: SeoulEvent, congestion: Congestion[]) {
  const eventText = `${event.title} ${event.place}`;
  return congestion.find(({ area }) =>
    area
      .replace(/관광특구|고궁|문화유산|발달상권|공원|역|거리|지역/g, " ")
      .split(/[·&\s]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
      .some((token) => eventText.includes(token)),
  );
}

function isHighCongestion(level: string) {
  return level === "붐빔" || level === "매우 붐빔";
}

function isLowCongestion(level: string) {
  return level === "여유" || level === "보통";
}

function getRecommendationReason(
  event: SeoulEvent,
  weather: ShortForecast | null,
  congestion: Congestion[],
) {
  const outdoor = isOutdoorEvent(event);
  const precipitationExpected =
    weather?.precipitationType != null && weather.precipitationType !== "0";
  const clearSky = weather?.sky === "1";
  const matchedCongestion = getEventCongestion(event, congestion);
  let reason = "행사 기간 내 추천";

  if (outdoor && clearSky) reason = "야외 행사, 맑은 날씨에 추천";
  else if (outdoor && precipitationExpected) reason = "우천 예보 있음, 우산 챙기세요";
  else if (!outdoor && precipitationExpected) reason = "비 오는 날 실내 행사 추천";

  if (matchedCongestion && isLowCongestion(matchedCongestion.level)) {
    reason += " (현재 여유)";
  }
  return reason;
}

function createRecommendations(
  events: SeoulEvent[],
  weather: ShortForecast | null,
  congestion: Congestion[],
) {
  const precipitationExpected =
    weather?.precipitationType != null && weather.precipitationType !== "0";
  const highPrecipitationProbability =
    (weather?.precipitationProbability ?? 0) >= 60;
  const clearSky = weather?.sky === "1";

  return events
    .filter(
      (event) =>
        !isHighCongestion(getEventCongestion(event, congestion)?.level ?? ""),
    )
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
      reason: getRecommendationReason(event, weather, congestion),
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

  const resolvedLocation = resolveLocation(body.location);
  const [weather, events, congestion] = await Promise.all([
    getShortForecast(body.location),
    getSeoulEvents(body.mode, body.location),
    getCityCongestion(body.location),
  ]);
  console.info(
    `[RECOMMEND] weather=${weather ? "available" : "null"} events.length=${events.length} congestion.length=${congestion.length}`,
  );
  if (events.length === 0) {
    console.info("[RECOMMEND] reason=recommendations skipped because events is empty");
  } else if (congestion.length === 0) {
    console.info("[RECOMMEND] reason=events are recommended without congestion prioritization");
  } else {
    console.info("[RECOMMEND] reason=events are recommended with congestion prioritization");
  }

  return NextResponse.json({
    success: true,
    location: {
      requested: body.location,
      latitude: resolvedLocation.latitude,
      longitude: resolvedLocation.longitude,
      district: resolvedLocation.district,
    },
    weather,
    events: events.map(({ title, period, place }) => ({ title, place, date: period })),
    congestion,
    congestionApplied: resolvedLocation.isSeoul && congestion.length > 0,
    recommendations: createRecommendations(events, weather, congestion),
  });
}
