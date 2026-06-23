const SEOUL_CITY_DATA_URL = "http://openapi.seoul.go.kr:8088";

type CityDataRow = {
  AREA_NM?: string;
  AREA_CONGEST_LVL?: string;
  AREA_PPLTN_MIN?: number;
  AREA_PPLTN_MAX?: number;
};

type CityDataPayload = {
  CITYDATA?: { row?: CityDataRow[] };
  citydata?: { row?: CityDataRow[] };
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

function getXmlValue(xml: string, tagName: string) {
  return xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i"))?.[1]?.trim() ?? "";
}

async function readUtf8Body(response: Response) {
  return new TextDecoder("utf-8").decode(await response.arrayBuffer());
}

function repairMojibake(value: string) {
  if (!/(?:ë|ì|í|ê|ã|Â|Ã)[\u0080-\u00BF]/.test(value)) return value;
  if ([...value].some((character) => character.codePointAt(0)! > 0xff)) return value;

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(value, (character) => character.charCodeAt(0)),
    );
  } catch {
    return value;
  }
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
    const responseBody = await readUtf8Body(response);
    console.info(`[CITY_API] body=${responseBody.slice(0, 500)}`);

    if (responseBody.trimStart().startsWith("<")) {
      const code = getXmlValue(responseBody, "CODE") || "unknown";
      const message = getXmlValue(responseBody, "MESSAGE") || "unknown";
      console.warn(`[CITY_API] xmlCode=${code} xmlMessage=${message}`);
      console.info("[CITY_API] count=0");
      return [];
    }

    if (!response.ok) {
      console.info(`[CITY_API] reason=HTTP ${response.status}`);
      console.info("[CITY_API] count=0");
      return [];
    }

    let payload: CityDataPayload;
    try {
      payload = JSON.parse(responseBody) as CityDataPayload;
    } catch (error) {
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

    console.info(`[CITY_API] count=${rows.length}`);
    if (rows.length === 0) {
      console.info("[CITY_API] reason=no city congestion rows were returned");
    }

    return rows
      .filter((row) => Boolean(row.AREA_NM && row.AREA_CONGEST_LVL))
      .map((row) => ({
        area: repairMojibake(row.AREA_NM as string),
        level: repairMojibake(row.AREA_CONGEST_LVL as string),
        minPopulation: row.AREA_PPLTN_MIN ?? null,
        maxPopulation: row.AREA_PPLTN_MAX ?? null,
      }));
  } catch (error) {
    console.error("[CITY_API] reason=request failed", error);
    console.info("[CITY_API] count=0");
    return [];
  }
}
