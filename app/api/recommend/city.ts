const SEOUL_CITY_DATA_URL = "https://openapi.seoul.go.kr:8088";

type CityDataRow = {
  AREA_NM?: string;
  AREA_CONGEST_LVL?: string;
  AREA_PPLTN_MIN?: number;
  AREA_PPLTN_MAX?: number;
};

export type Congestion = {
  area: string;
  level: string;
  minPopulation: number | null;
  maxPopulation: number | null;
};

function normalizeServiceKey(serviceKey: string) {
  try {
    return decodeURIComponent(serviceKey);
  } catch {
    return serviceKey;
  }
}

export async function getCityCongestion(): Promise<Congestion[]> {
  const serviceKey = process.env.SEOUL_CITY_DATA_API_KEY;
  if (!serviceKey) {
    console.info("[CITY_API] count=0");
    return [];
  }

  try {
    const key = encodeURIComponent(normalizeServiceKey(serviceKey));
    const response = await fetch(
      `${SEOUL_CITY_DATA_URL}/${key}/json/citydata/1/1000/`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      console.info("[CITY_API] count=0");
      return [];
    }

    const payload = (await response.json()) as {
      CITYDATA?: { row?: CityDataRow[] };
      citydata?: { row?: CityDataRow[] };
    };
    const rows = payload.CITYDATA?.row ?? payload.citydata?.row ?? [];
    console.info(`[CITY_API] count=${rows.length}`);

    return rows
      .filter((row) => Boolean(row.AREA_NM && row.AREA_CONGEST_LVL))
      .map((row) => ({
        area: row.AREA_NM as string,
        level: row.AREA_CONGEST_LVL as string,
        minPopulation: row.AREA_PPLTN_MIN ?? null,
        maxPopulation: row.AREA_PPLTN_MAX ?? null,
      }));
  } catch (error) {
    console.error("Unable to load Seoul City Data", error);
    console.info("[CITY_API] count=0");
    return [];
  }
}
