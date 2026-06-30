const KMA_SHORT_FORECAST_URL =
  "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";

import { resolveLocation, type Coordinates } from "./location";

const FORECAST_CATEGORIES = ["TMP", "POP", "SKY", "PTY"] as const;

type ForecastCategory = (typeof FORECAST_CATEGORIES)[number];

type ForecastItem = {
  category?: string;
  fcstDate?: string;
  fcstTime?: string;
  fcstValue?: string;
};

export type ShortForecast = {
  temperature: number | null;
  precipitationProbability: number | null;
  sky: string | null;
  precipitationType: string | null;
};

export function toKmaGrid({ latitude, longitude }: Coordinates) {
  const earthRadius = 6371.00877;
  const gridSpacing = 5;
  const firstStandardParallel = (30 * Math.PI) / 180;
  const secondStandardParallel = (60 * Math.PI) / 180;
  const originLongitude = (126 * Math.PI) / 180;
  const originLatitude = (38 * Math.PI) / 180;
  const falseEasting = 43;
  const falseNorthing = 136;

  let cone = Math.tan(Math.PI * 0.25 + secondStandardParallel * 0.5) /
    Math.tan(Math.PI * 0.25 + firstStandardParallel * 0.5);
  cone = Math.log(Math.cos(firstStandardParallel) / Math.cos(secondStandardParallel)) /
    Math.log(cone);
  let scale = Math.tan(Math.PI * 0.25 + firstStandardParallel * 0.5);
  scale = (Math.cos(firstStandardParallel) * scale ** cone) / cone;
  let radius = Math.tan(Math.PI * 0.25 + originLatitude * 0.5);
  radius = (earthRadius / gridSpacing) * scale / radius ** cone;

  let pointRadius = Math.tan(Math.PI * 0.25 + (latitude * Math.PI / 180) * 0.5);
  pointRadius = (earthRadius / gridSpacing) * scale / pointRadius ** cone;
  let theta = longitude * Math.PI / 180 - originLongitude;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= cone;

  return {
    nx: Math.floor(pointRadius * Math.sin(theta) + falseEasting + 0.5),
    ny: Math.floor(radius - pointRadius * Math.cos(theta) + falseNorthing + 0.5),
  };
}

export function getKmaGrid(location: string) {
  const resolved = resolveLocation(location);
  if (resolved.source === "fallback") {
    console.warn(`[KMA_GRID] reason=location fallback input=${JSON.stringify(location)}`);
  }
  return toKmaGrid(resolved);
}

function getKoreaDateParts(date = new Date()) {
  const koreaDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);

  return {
    year: koreaDate.getUTCFullYear(),
    month: koreaDate.getUTCMonth(),
    day: koreaDate.getUTCDate(),
    hour: koreaDate.getUTCHours(),
    minute: koreaDate.getUTCMinutes(),
  };
}

export function getForecastBaseDateTime(now = new Date()) {
  const korea = getKoreaDateParts(now);
  const baseDate = new Date(
    Date.UTC(korea.year, korea.month, korea.day, korea.hour, korea.minute),
  );

  // The short forecast is published at 02, 05, 08, 11, 14, 17, 20, and 23 KST,
  // and is normally available about ten minutes later.
  if (baseDate.getUTCMinutes() < 10) {
    baseDate.setUTCHours(baseDate.getUTCHours() - 1);
  }

  while (![2, 5, 8, 11, 14, 17, 20, 23].includes(baseDate.getUTCHours())) {
    baseDate.setUTCHours(baseDate.getUTCHours() - 1);
  }

  const baseDateValue = `${baseDate.getUTCFullYear()}${String(
    baseDate.getUTCMonth() + 1,
  ).padStart(2, "0")}${String(baseDate.getUTCDate()).padStart(2, "0")}`;

  return {
    baseDate: baseDateValue,
    baseTime: `${String(baseDate.getUTCHours()).padStart(2, "0")}00`,
  };
}

function getForecastTimestamp(item: ForecastItem) {
  return `${item.fcstDate ?? ""}${item.fcstTime ?? ""}`;
}

function selectForecastItems(items: ForecastItem[], now = new Date()) {
  const current = getKoreaDateParts(now);
  const currentTimestamp = `${current.year}${String(current.month + 1).padStart(
    2,
    "0",
  )}${String(current.day).padStart(2, "0")}${String(current.hour).padStart(
    2,
    "0",
  )}${String(current.minute).padStart(2, "0")}`;
  const groups = new Map<string, ForecastItem[]>();

  for (const item of items) {
    if (!item.category || !FORECAST_CATEGORIES.includes(item.category as ForecastCategory)) {
      continue;
    }

    const timestamp = getForecastTimestamp(item);
    if (!timestamp) continue;

    const group = groups.get(timestamp) ?? [];
    group.push(item);
    groups.set(timestamp, group);
  }

  const completeGroups = [...groups.entries()]
    .filter(([, group]) =>
      FORECAST_CATEGORIES.every((category) =>
        group.some((item) => item.category === category),
      ),
    )
    .sort(([first], [second]) => first.localeCompare(second));

  return (
    completeGroups.find(([timestamp]) => timestamp >= currentTimestamp)?.[1] ??
    completeGroups[0]?.[1] ??
    []
  );
}

function normalizeServiceKey(serviceKey: string) {
  try {
    return decodeURIComponent(serviceKey);
  } catch {
    return serviceKey;
  }
}

function getPreviousForecastBaseDateTime(baseDate: string, baseTime: string) {
  const date = new Date(
    Date.UTC(
      Number(baseDate.slice(0, 4)),
      Number(baseDate.slice(4, 6)) - 1,
      Number(baseDate.slice(6, 8)),
      Number(baseTime.slice(0, 2)),
    ),
  );
  date.setUTCHours(date.getUTCHours() - 3);
  return {
    baseDate: `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`,
    baseTime: `${String(date.getUTCHours()).padStart(2, "0")}00`,
  };
}

export async function getShortForecast(
  location: string,
): Promise<ShortForecast | null> {
  const serviceKey = process.env.KMA_SERVICE_KEY;
  if (!serviceKey) return null;

  const { nx, ny } = getKmaGrid(location);
  let base = getForecastBaseDateTime();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const url = new URL(KMA_SHORT_FORECAST_URL);
    url.search = new URLSearchParams({
      serviceKey: normalizeServiceKey(serviceKey),
      pageNo: "1",
      numOfRows: "1000",
      dataType: "JSON",
      base_date: base.baseDate,
      base_time: base.baseTime,
      nx: String(nx),
      ny: String(ny),
    }).toString();

    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`KMA request failed with ${response.status}`);

      const payload = (await response.json()) as {
        response?: { body?: { items?: { item?: ForecastItem[] } } };
      };
      const items = payload.response?.body?.items?.item;
      if (Array.isArray(items) && items.length > 0) {
        const selectedItems = selectForecastItems(items);
        const values = Object.fromEntries(
          selectedItems
            .filter((item) => item.category && FORECAST_CATEGORIES.includes(item.category as ForecastCategory))
            .map((item) => [item.category as ForecastCategory, item.fcstValue]),
        );

        return {
          temperature: values.TMP ? Number(values.TMP) : null,
          precipitationProbability: values.POP ? Number(values.POP) : null,
          sky: values.SKY ?? null,
          precipitationType: values.PTY ?? null,
        };
      }
      console.warn(`[KMA_API] reason=empty items baseDate=${base.baseDate} baseTime=${base.baseTime}`);
    } catch (error) {
      console.error(`[KMA_API] reason=request failed baseDate=${base.baseDate} baseTime=${base.baseTime}`, error);
    }

    if (attempt === 0) {
      base = getPreviousForecastBaseDateTime(base.baseDate, base.baseTime);
      console.info(`[KMA_API] retryBaseDate=${base.baseDate} retryBaseTime=${base.baseTime}`);
    }
  }

  return null;
}
