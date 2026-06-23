// Seoul Open Data's documented API gateway on port 8088 uses HTTP, not HTTPS.
const SEOUL_OPEN_DATA_EVENT_URL = "http://openapi.seoul.go.kr:8088";

type SeoulEventRow = { TITLE?: string; PLACE?: string; DATE?: string; STRTDATE?: string; END_DATE?: string };

export type SeoulEvent = { title: string; period: string; place: string; startDate: string; endDate: string };

function getKoreaToday(now = new Date()) {
  const korea = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(korea.getUTCFullYear(), korea.getUTCMonth(), korea.getUTCDate()));
}

function formatDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function getTargetDates(mode: string) {
  const today = getKoreaToday();
  if (mode === "tomorrow") { const tomorrow = new Date(today); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1); return [formatDate(tomorrow)]; }
  if (mode === "weekend") { const saturday = new Date(today); saturday.setUTCDate(saturday.getUTCDate() + ((6 - saturday.getUTCDay() + 7) % 7)); const sunday = new Date(saturday); sunday.setUTCDate(sunday.getUTCDate() + 1); return [formatDate(saturday), formatDate(sunday)]; }
  return [formatDate(today)];
}

function normalizeDate(value: string | undefined) {
  const match = value?.match(/(20\d{2})[.\-/]?([01]\d)[.\-/]?([0-3]\d)/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function normalizeServiceKey(serviceKey: string) {
  try { return decodeURIComponent(serviceKey); } catch { return serviceKey; }
}

export async function getSeoulEvents(mode: string): Promise<SeoulEvent[]> {
  const serviceKey = process.env.SEOUL_OPEN_DATA_API_KEY;
  if (!serviceKey) {
    console.info("[EVENT_API] reason=SEOUL_OPEN_DATA_API_KEY is not configured");
    console.info("[EVENT_API] count=0");
    return [];
  }

  const key = encodeURIComponent(normalizeServiceKey(serviceKey));
  const url = `${SEOUL_OPEN_DATA_EVENT_URL}/${key}/json/culturalEventInfo/1/1000/`;
  console.info(`[EVENT_API] url=${SEOUL_OPEN_DATA_EVENT_URL}/[REDACTED]/json/culturalEventInfo/1/1000/`);

  try {
    const response = await fetch(url, { cache: "no-store" });
    console.info(`[EVENT_API] status=${response.status}`);
    const responseBody = await response.text();
    console.info(`[EVENT_API] body=${responseBody.slice(0, 500)}`);
    if (!response.ok) {
      console.info(`[EVENT_API] reason=HTTP ${response.status}`);
      console.info("[EVENT_API] count=0");
      return [];
    }

    let payload: { culturalEventInfo?: { row?: SeoulEventRow[] } };
    try { payload = JSON.parse(responseBody) as typeof payload; }
    catch (error) {
      console.error("[EVENT_API] reason=JSON parse failed", error);
      console.info("[EVENT_API] count=0");
      return [];
    }

    const rows = payload.culturalEventInfo?.row;
    if (!Array.isArray(rows)) {
      console.info("[EVENT_API] reason=culturalEventInfo.row is missing from the response");
      console.info("[EVENT_API] count=0");
      return [];
    }

    const targetDates = getTargetDates(mode);
    console.info(`[EVENT_API] sourceCount=${rows.length} targetDates=${targetDates.join(",")}`);
    const events = rows.map((row): SeoulEvent | null => {
      const periodDates = [...(row.DATE ?? "").matchAll(/20\d{2}[.\-/]?[01]\d[.\-/]?[0-3]\d/g)].map(([value]) => normalizeDate(value));
      const startDate = normalizeDate(row.STRTDATE) ?? periodDates[0] ?? null;
      const endDate = normalizeDate(row.END_DATE) ?? periodDates.at(-1) ?? startDate;
      const title = row.TITLE?.trim();
      const place = row.PLACE?.trim();
      const period = row.DATE?.trim();
      return title && place && period && startDate && endDate ? { title, place, period, startDate, endDate } : null;
    }).filter((event): event is SeoulEvent => event !== null).filter((event) => targetDates.some((date) => event.startDate <= date && event.endDate >= date));

    if (events.length === 0) console.info("[EVENT_API] reason=no events matched the requested date or required fields");
    console.info(`[EVENT_API] count=${events.length}`);
    return events;
  } catch (error) {
    console.error("[EVENT_API] reason=request failed", error);
    console.info("[EVENT_API] count=0");
    return [];
  }
}
