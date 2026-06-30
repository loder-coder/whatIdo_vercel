export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type ResolvedLocation = Coordinates & {
  district: string | null;
  isSeoul: boolean;
  source: "coordinates" | "name" | "fallback";
};

const SEOUL_DISTRICT_CENTERS: Record<string, Coordinates> = {
  강남구: { latitude: 37.5172, longitude: 127.0473 },
  강동구: { latitude: 37.5301, longitude: 127.1238 },
  강북구: { latitude: 37.6396, longitude: 127.0257 },
  강서구: { latitude: 37.5509, longitude: 126.8495 },
  관악구: { latitude: 37.4784, longitude: 126.9516 },
  광진구: { latitude: 37.5385, longitude: 127.0823 },
  구로구: { latitude: 37.4955, longitude: 126.8874 },
  금천구: { latitude: 37.4569, longitude: 126.8955 },
  노원구: { latitude: 37.6542, longitude: 127.0568 },
  도봉구: { latitude: 37.6688, longitude: 127.0471 },
  동대문구: { latitude: 37.5744, longitude: 127.0396 },
  동작구: { latitude: 37.5124, longitude: 126.9393 },
  마포구: { latitude: 37.5663, longitude: 126.9019 },
  서대문구: { latitude: 37.5791, longitude: 126.9368 },
  서초구: { latitude: 37.4837, longitude: 127.0324 },
  성동구: { latitude: 37.5633, longitude: 127.0371 },
  성북구: { latitude: 37.5894, longitude: 127.0167 },
  송파구: { latitude: 37.5145, longitude: 127.1059 },
  양천구: { latitude: 37.517, longitude: 126.8666 },
  영등포구: { latitude: 37.5264, longitude: 126.8962 },
  용산구: { latitude: 37.5326, longitude: 126.9905 },
  은평구: { latitude: 37.6027, longitude: 126.9291 },
  종로구: { latitude: 37.573, longitude: 126.9794 },
  중구: { latitude: 37.5641, longitude: 126.9979 },
  중랑구: { latitude: 37.6063, longitude: 127.0927 },
};

const KOREAN_CITY_CENTERS: Record<string, Coordinates> = {
  서울: { latitude: 37.5665, longitude: 126.978 },
  부산: { latitude: 35.1796, longitude: 129.0756 },
  대전: { latitude: 36.3504, longitude: 127.3845 },
  대구: { latitude: 35.8714, longitude: 128.6014 },
  인천: { latitude: 37.4563, longitude: 126.7052 },
  광주: { latitude: 35.1595, longitude: 126.8526 },
  울산: { latitude: 35.5384, longitude: 129.3114 },
  세종: { latitude: 36.48, longitude: 127.289 },
  제주: { latitude: 33.4996, longitude: 126.5312 },
};

const DEFAULT_SEOUL_COORDINATES = KOREAN_CITY_CENTERS.서울;

function isInSeoul({ latitude, longitude }: Coordinates) {
  return latitude >= 37.413 && latitude <= 37.715 && longitude >= 126.734 && longitude <= 127.27;
}

function parseCoordinates(location: string): Coordinates | null {
  const values = location.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
  if (!values || values.length < 2) return null;

  const [latitude, longitude] = values;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

export function resolveLocation(location: string): ResolvedLocation {
  const coordinates = parseCoordinates(location);
  if (coordinates) {
    return {
      ...coordinates,
      district: null,
      isSeoul: isInSeoul(coordinates),
      source: "coordinates",
    };
  }

  const compactLocation = location.replace(/\s+/g, "");
  const district = Object.keys(SEOUL_DISTRICT_CENTERS).find((name) =>
    compactLocation.includes(name),
  );
  if (district) {
    return {
      ...SEOUL_DISTRICT_CENTERS[district],
      district,
      isSeoul: true,
      source: "name",
    };
  }

  const city = Object.keys(KOREAN_CITY_CENTERS).find((name) =>
    compactLocation.includes(name),
  );
  if (city) {
    return {
      ...KOREAN_CITY_CENTERS[city],
      district: null,
      isSeoul: city === "서울",
      source: "name",
    };
  }

  console.warn(`[LOCATION] reason=unrecognized location fallback=Seoul input=${JSON.stringify(location)}`);
  return {
    ...DEFAULT_SEOUL_COORDINATES,
    district: null,
    isSeoul: true,
    source: "fallback",
  };
}

export function distanceInKilometers(first: Coordinates, second: Coordinates) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadius = 6371.0088;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
}
