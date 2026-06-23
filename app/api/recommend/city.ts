// Seoul Open Data's documented API gateway on port 8088 uses HTTP, not HTTPS.
const SEOUL_CITY_DATA_URL = "http://openapi.seoul.go.kr:8088";

type CityDataRow = { AREA_NM?: string; AREA_CONGEST_LVL?: string; AREA_PPLTN_MIN?: number; AREA_PPLTN_MAX?: number };
export type Congestion = { area: string; level: string; minPopulation: number | null; maxPopulation: number | null };

function normalizeServiceKey(serviceKey: string) {
  try { return decodeURIComponent(serviceKey); } catch { return serviceKey; }
}

export async function getCityCongestion(): Promise<Congestion[]> {
  const serviceKey = process.env.SEOUL_CITY_DATA_API_KEY;
  if (!serviceKey) {
    console.info("[CITY_API] reason=SEOUL_CITY_DATA_API_KEY is not configured");
    console.info("[CITY_API] count=0");
    return [];
  }

  const key = encodeURIComponent(normalizeServiceKey(serviceKey));
  const url = `${SEOUL_CITY_DATA_URL}/${key}/json/citydata/1/1000/`;
  console.info(`[CITY_API] url=${SEOUL_CITY_DATA_URL}/[REDACTED]/json/citydata/1/1000/`);

  try {
    const response = await fetch(url, { cache: "no-store" });
    console.info(`[CITY_API] status=${response.status}`);
    const responseBody = await response.text();
    console.info(`[CITY_API] body=${responseBody.slice(0, 500)}`);
    if (!response.ok) {
      console.info(`[CITY_API] reason=HTTP ${response.status}`);
      console.info("[CITY_API] count=0");
      return [];
    }

    let payload: { CITYDATA?: { row?: CityDataRow[] }; citydata?: { row?: CityDataRow[] } };
    try { payload = JSON.parse(responseBody) as typeof payload; }
    catch (error) {
      console.error("[CITY_API] reason=JSON parse failed", error);
      console.info("[CITY_API] count=0");
      return [];
    }

    const rows = payload.CITYDATA?.row ?? payload.citydata?.row;
    if (!Array.isArray(rows)) {
      console.info("[CITY_API] reason=CITYDATA.row is missing from the response");
      console.info("[CITY_API] count=0");
      return [];
    }
    if (rows.length === 0) console.info("[CITY_API] reason=no city congestion rows were returned");
    console.info(`[CITY_API] count=${rows.length}`);
    return rows.filter((row) => Boolean(row.AREA_NM && row.AREA_CONGEST_LVL)).map((row) => ({ area: row.AREA_NM as string, level: row.AREA_CONGEST_LVL as string, minPopulation: row.AREA_PPLTN_MIN ?? null, maxPopulation: row.AREA_PPLTN_MAX ?? null }));
  } catch (error) {
    console.error("[CITY_API] reason=request failed", error);
    console.info("[CITY_API] count=0");
    return [];
  }
}
