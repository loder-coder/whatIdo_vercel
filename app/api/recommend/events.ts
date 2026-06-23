const DEFAULT_CULTURE_PORTAL_EVENT_URL =
  "https://api.kcisa.kr/openapi/service/rest/convergence2010/conver5";

type CulturePortalItem = Record<string, unknown>;

export type CulturalEvent = {
  title: string;
  period: string;
  place: string;
  startDate: string;
  endDate: string;
};

function toKoreaDate(date = new Date()) {
  const korea = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(korea.getUTCFullYear(), korea.getUTCMonth(), korea.getUTCDate()));
}

function formatDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function getTargetDates(mode: string, now = new Date()) {
  const today = toKoreaDate(now);
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

function normalizeDate(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/(20\d{2})[.\-/]?([01]\d)[.\-/]?([0-3]\d)/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function getValue(item: CulturePortalItem, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function getEventDates(item: CulturePortalItem, period: string) {
  const startDate = normalizeDate(getValue(item, ["startDate", "eventStartDate", "eventstartdate", "startdate"]));
  const endDate = normalizeDate(getValue(item, ["endDate", "eventEndDate", "eventenddate", "enddate"]));
  const dates = [...period.matchAll(/20\d{2}[.\-/]?[01]\d[.\-/]?[0-3]\d/g)].map(([date]) => normalizeDate(date));
  return { startDate: startDate ?? dates[0] ?? null, endDate: endDate ?? dates.at(-1) ?? startDate ?? dates[0] ?? null };
}

function getItems(payload: unknown): CulturePortalItem[] {
  if (!payload || typeof payload !== "object") return [];
  const source = payload as { response?: { body?: { items?: { item?: unknown } } }; items?: { item?: unknown } };
  const items = source.response?.body?.items?.item ?? source.items?.item;
  if (Array.isArray(items)) return items.filter((item): item is CulturePortalItem => Boolean(item) && typeof item === "object");
  return items && typeof items === "object" ? [items as CulturePortalItem] : [];
}

function decodeXmlValue(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function getItemsFromXml(xml: string): CulturePortalItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, itemXml]) => {
    const item: CulturePortalItem = {};
    for (const [, key, value] of itemXml.matchAll(/<([\w-]+)>([\s\S]*?)<\/\1>/g)) {
      item[key] = decodeXmlValue(value).trim();
    }
    return item;
  });
}

function isInSeoul(event: CulturalEvent) {
  return `${event.place} ${event.title}`.includes("서울");
}

function normalizeServiceKey(serviceKey: string) {
  try { return decodeURIComponent(serviceKey); } catch { return serviceKey; }
}

export async function getSeoulEvents(mode: string): Promise<CulturalEvent[]> {
  const serviceKey = process.env.CULTURE_PORTAL_SERVICE_KEY;
  if (!serviceKey) throw new Error("CULTURE_PORTAL_SERVICE_KEY is not configured");

  const url = new URL(process.env.CULTURE_PORTAL_EVENT_URL ?? DEFAULT_CULTURE_PORTAL_EVENT_URL);
  url.search = new URLSearchParams({ serviceKey: normalizeServiceKey(serviceKey), numOfRows: "100", pageNo: "1", format: "json" }).toString();
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Culture Portal request failed with ${response.status}`);

  const body = await response.text();
  let items: CulturePortalItem[];
  try {
    items = getItems(JSON.parse(body));
  } catch {
    items = getItemsFromXml(body);
  }

  const targetDates = getTargetDates(mode);
  return items
    .map((item): CulturalEvent | null => {
      const title = getValue(item, ["title", "eventName", "eventname"]);
      const period = getValue(item, ["eventPeriod", "eventperiod", "period"]);
      const place = getValue(item, ["place", "eventPlace", "eventplace", "venue"]);
      const { startDate, endDate } = getEventDates(item, period);
      return title && period && place && startDate && endDate ? { title, period, place, startDate, endDate } : null;
    })
    .filter((event): event is CulturalEvent => event !== null)
    .filter(isInSeoul)
    .filter((event) => targetDates.some((date) => event.startDate <= date && event.endDate >= date));
}
