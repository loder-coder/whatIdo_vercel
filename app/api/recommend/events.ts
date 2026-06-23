const SEOUL_OPEN_DATA_EVENT_URL = "http://openapi.seoul.go.kr:8088";
const EVENT_PAGE_SIZE = 1000;
const MAX_EVENT_PAGES = 3;

type SeoulEventRow = {
  TITLE?: string;
  PLACE?: string;
  DATE?: string;
  STRTDATE?: string;
  END_DATE?: string;
};

type EventPayload = {
  culturalEventInfo?: { list_total_count?: number; row?: SeoulEventRow[] };
};

type EventPage = { rows: SeoulEventRow[]; totalCount: number };

export type SeoulEvent = {
  title: string;
  period: string;
  place: string;
  startDate: string;
  endDate: string;
};

function getKoreaToday(now = new Date()) {
  const korea = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(korea.getUTCFullYear(), korea.getUTCMonth(), korea.getUTCDate()));
}

function formatDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function getTargetDates(mode: string) {
  const today = getKoreaToday();
  if (mode === "tomorrow") {
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return [formatDate(tomorrow)];
  }
  if (mode === "weekend") {
    const saturday = new Date(today);
    saturday.setUTCDate(saturday.getUTCDate() + ((6 - saturday.getUTCDay() + 7) % 7));
    const sunday = new Date(saturday);
    sunday.setUTCDate(sunday.getUTCDate() + 1);
    return [formatDate(saturday), formatDate(sunday)];
  }
  return [formatDate(today)];
}

function normalizeDate(value: string | undefined) {
  const match = value?.match(/(20\d{2})[.\-/]?([01]\d)[.\-/]?([0-3]\d)/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function normalizeServiceKey(serviceKey: string) {
  try {
    return decodeURIComponent(serviceKey);
  } catch {
    return serviceKey;
  }
}

function getXmlValue(xml: string, tagName: string) {
  return xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i"))?.[1]?.trim() ?? "";
}

async function fetchEventPage(key: string, page: number): Promise<EventPage | null> {
  const start = (page - 1) * EVENT_PAGE_SIZE + 1;
  const end = page * EVENT_PAGE_SIZE;
  const url = `${SEOUL_OPEN_DATA_EVENT_URL}/${key}/json/culturalEventInfo/${start}/${end}/`;
  console.info(`[EVENT_API] url=${SEOUL_OPEN_DATA_EVENT_URL}/[REDACTED]/json/culturalEventInfo/${start}/${end}/`);

  try {
    const response = await fetch(url, { cache: "no-store" });
    console.info(`[EVENT_API] page=${page} status=${response.status}`);
    const responseBody = await response.text();
    console.info(`[EVENT_API] page=${page} body=${responseBody.slice(0, 500)}`);
    if (responseBody.trimStart().startsWith("<")) {
      const code = getXmlValue(responseBody, "CODE") || "unknown";
      const message = getXmlValue(responseBody, "MESSAGE") || "unknown";
      console.warn(`[EVENT_API] page=${page} xmlCode=${code} xmlMessage=${message}`);
      return null;
    }
    if (!response.ok) {
      console.info(`[EVENT_API] page=${page} reason=HTTP ${response.status}`);
      return null;
    }

    let payload: EventPayload;
    try {
      payload = JSON.parse(responseBody) as EventPayload;
    } catch (error) {
      console.error(`[EVENT_API] page=${page} reason=JSON parse failed`, error);
      return null;
    }

    const source = payload.culturalEventInfo;
    if (!source || !Array.isArray(source.row)) {
      console.info(`[EVENT_API] page=${page} reason=culturalEventInfo.row is missing from the response`);
      return null;
    }

    return { rows: source.row, totalCount: source.list_total_count ?? source.row.length };
  } catch (error) {
    console.error(`[EVENT_API] page=${page} reason=request failed`, error);
    return null;
  }
}

export async function getSeoulEvents(mode: string): Promise<SeoulEvent[]> {
  const serviceKey = process.env.SEOUL_OPEN_DATA_API_KEY;
  if (!serviceKey) {
    console.info("[EVENT_API] reason=SEOUL_OPEN_DATA_API_KEY is not configured");
    console.info("[EVENT_API] count=0");
    return [];
  }

  const key = encodeURIComponent(normalizeServiceKey(serviceKey));
  const firstPage = await fetchEventPage(key, 1);
  if (!firstPage) {
    console.info("[EVENT_API] count=0");
    return [];
  }

  const pageCount = Math.min(MAX_EVENT_PAGES, Math.ceil(firstPage.totalCount / EVENT_PAGE_SIZE));
  const remainingPages = Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => index + 2);
  const remainingResults = await Promise.all(remainingPages.map((page) => fetchEventPage(key, page)));
  const rows = [firstPage.rows, ...remainingResults.flatMap((result) => result?.rows ?? [])].flat();
  const targetDates = getTargetDates(mode);
  console.info(`[EVENT_API] sourceCount=${rows.length} targetDates=${targetDates.join(",")}`);

  const events = rows
    .map((row): SeoulEvent | null => {
      const periodDates = [...(row.DATE ?? "").matchAll(/20\d{2}[.\-/]?[01]\d[.\-/]?[0-3]\d/g)].map(([value]) => normalizeDate(value));
      const startDate = normalizeDate(row.STRTDATE) ?? periodDates[0] ?? null;
      const endDate = normalizeDate(row.END_DATE) ?? periodDates.at(-1) ?? startDate;
      const title = row.TITLE?.trim();
      const place = row.PLACE?.trim();
      const period = row.DATE?.trim();
      return title && place && period && startDate && endDate ? { title, place, period, startDate, endDate } : null;
    })
    .filter((event): event is SeoulEvent => event !== null)
    .filter((event) => targetDates.some((date) => event.startDate <= date && event.endDate >= date));

  if (events.length === 0) {
    console.info("[EVENT_API] reason=no events matched the requested date or required fields");
  }
  console.info(`[EVENT_API] count=${events.length}`);
  return events;
}
