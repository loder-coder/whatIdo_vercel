import { NextResponse } from "next/server";
import { getShortForecast, type ShortForecast } from "./weather";

type RecommendRequest = {
  location?: unknown;
  mode?: unknown;
};

function createRecommendation(location: string, mode: string, weather: ShortForecast | null) {
  if (!weather) {
    return `${location}의 ${mode} 행사 정보를 바탕으로 전시, 공연, 실내 체험을 추천합니다.`;
  }

  if (weather.precipitationType !== null && weather.precipitationType !== "0") {
    return `${location}에는 강수 예보가 있어 전시, 공연, 실내 체험 같은 실내 활동을 추천합니다.`;
  }

  if ((weather.precipitationProbability ?? 0) >= 60) {
    return `${location}의 강수확률이 높아 야외 행사보다 실내 전시와 공연을 우선 추천합니다.`;
  }

  if (weather.sky === "1") {
    return `${location}은 맑은 예보라 공원 산책, 야외 행사, 플리마켓을 우선 추천합니다.`;
  }

  return `${location}의 날씨를 고려해 접근하기 좋은 행사와 문화 활동을 추천합니다.`;
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

  const weather = await getShortForecast(body.location);

  return NextResponse.json({
    success: true,
    location: body.location,
    mode: body.mode,
    recommendation: createRecommendation(body.location, body.mode, weather),
  });
}
