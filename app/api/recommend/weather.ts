const KMA_SHORT_FORECAST_URL =
  "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";

const SEOUL_GRID_COORDINATES: Record<string, { nx: number; ny: number }> = {
  "서울": { nx: 60, ny: 127 },
  "서울특별시": { nx: 60, ny: 127 },
  "강남": { nx: 61, ny: 126 },
  "강남구": { nx: 61, ny: 126 },
  "마포": { nx: 59, ny: 127 },
  "마포구": { nx: 59, ny: 127 },
  "송파": { nx: 62, ny: 126 },
  "송파구": { nx: 62, ny: 126 },
};

const DEFAULT_SEOUL_GRID = { nx: 60, ny: 127 };
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

export function getSeoulGrid(location: string) {
  const normalizedLocation = location.trim().replace(/\s+/g, "");
  const matchedName = Object.keys(SEOUL_GRID_COORDINATES).find((name) =>
    normalizedLocation.includes(name),
  );

  return matchedName
    ? SEOUL_GRID_COORDINATES[matchedName]
    : DEFAULT_SEOUL_GRID;
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

export async function getShortForecast(
  location: string,
): Promise<ShortForecast | null> {
  const serviceKey = process.env.KMA_SERVICE_KEY;
  if (!serviceKey) return null;

  const { nx, ny } = getSeoulGrid(location);
  const { baseDate, baseTime } = getForecastBaseDateTime();
  const url = new URL(KMA_SHORT_FORECAST_URL);
  url.search = new URLSearchParams({
    serviceKey: normalizeServiceKey(serviceKey),
    pageNo: "1",
    numOfRows: "1000",
    dataType: "JSON",
    base_date: baseDate,
    base_time: baseTime,
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
    if (!Array.isArray(items)) throw new Error("KMA response has no forecast items");

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
  } catch (error) {
    console.error("Unable to load KMA short forecast", error);
    return null;
  }
}
