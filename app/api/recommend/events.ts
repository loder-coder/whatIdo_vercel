const SEOUL_OPEN_DATA_EVENT_URL = "https://openapi.seoul.go.kr:8088";

type SeoulEventRow = {
  TITLE?: string;
  PLACE?: string;
  DATE?: string;
  STRTDATE?: string;
  END_DATE?: string;
};

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
  if (!value) return null;
  const match = value.match(/(20\d{2})[.\-/]?([01]\d)[.\-/]?([0-3]\d)/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function getEventDates(row: SeoulEventRow) {
  const periodDates = [...(row.DATE ?? "").matchAll(/20\d{2}[.\-/]?[01]\d[.\-/]?[0-3]\d/g)]
    .map(([value]) => normalizeDate(value));
  const startDate = normalizeDate(row.STRTDATE) ?? periodDates[0] ?? null;
  const endDate = normalizeDate(row.END_DATE) ?? periodDates.at(-1) ?? startDate;
  return { startDate, endDate };
}

function normalizeServiceKey(serviceKey: string) {
  try {
    return decodeURIComponent(serviceKey);
  } catch {
    return serviceKey;
  }
}

export async function getSeoulEvents(mode: string): Promise<SeoulEvent[]> {
  const serviceKey = process.env.SEOUL_OPEN_DATA_API_KEY;
  if (!serviceKey) return [];

  try {
    const key = encodeURIComponent(normalizeServiceKey(serviceKey));
    const response = await fetch(
      `${SEOUL_OPEN_DATA_EVENT_URL}/${key}/json/culturalEventInfo/1/1000/`,
      { cache: "no-store" },
    );
    if (!response.ok) return [];

    const payload = (await response.json()) as {
      culturalEventInfo?: { row?: SeoulEventRow[] };
    };
    const targetDates = getTargetDates(mode);

    return (payload.culturalEventInfo?.row ?? [])
      .map((row): SeoulEvent | null => {
        const title = row.TITLE?.trim();
        const place = row.PLACE?.trim();
        const period = row.DATE?.trim();
        const { startDate, endDate } = getEventDates(row);
        return title && place && period && startDate && endDate
          ? { title, place, period, startDate, endDate }
          : null;
      })
      .filter((event): event is SeoulEvent => event !== null)
      .filter((event) =>
        targetDates.some((date) => event.startDate <= date && event.endDate >= date),
      );
  } catch (error) {
    console.error("Unable to load Seoul Open Data events", error);
    return [];
  }
}
