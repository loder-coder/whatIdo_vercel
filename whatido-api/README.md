# What I Do API

현재 위치와 날짜 조건에 맞춰 서울 문화 행사와 날씨, 혼잡도를 조합해 추천하는
Next.js Route Handler입니다.

## 실행

`.env.example`을 참고해 API 키를 설정한 뒤 실행합니다.

```bash
npm install
npm run dev
```

추천 API는 `POST /api/recommend`입니다.

```json
{
  "location": "강남구",
  "mode": "today"
}
```

- `location`: 서울 자치구명, 지원하는 광역시·도시명, 또는 `"위도,경도"` 형식
- `mode`: `today`, `tomorrow`, `weekend`

응답의 날씨 격자는 위치 좌표에서 계산됩니다. 서울 행사는 자치구명 입력 시 해당
자치구로, 좌표 입력 시 10km 반경으로 필터링됩니다. 서울 밖에서는 서울 행사와
서울시 혼잡도 데이터를 적용하지 않으며 `congestionApplied`가 `false`입니다.

## 위치별 요청 예시

단일 지역에 결과가 고정되지 않는지 아래처럼 서로 다른 위치로 확인할 수 있습니다.

```bash
curl -X POST http://localhost:3000/api/recommend \
  -H "Content-Type: application/json" \
  -d '{"location":"강남구","mode":"today"}'

curl -X POST http://localhost:3000/api/recommend \
  -H "Content-Type: application/json" \
  -d '{"location":"노원구","mode":"today"}'

curl -X POST http://localhost:3000/api/recommend \
  -H "Content-Type: application/json" \
  -d '{"location":"마포구","mode":"tomorrow"}'

curl -X POST http://localhost:3000/api/recommend \
  -H "Content-Type: application/json" \
  -d '{"location":"송파구","mode":"weekend"}'
```

전국 좌표의 기상청 격자 변환과 서울 외 방어 동작은 다음 요청으로 확인합니다.

```bash
curl -X POST http://localhost:3000/api/recommend \
  -H "Content-Type: application/json" \
  -d '{"location":"35.1796,129.0756","mode":"today"}'

curl -X POST http://localhost:3000/api/recommend \
  -H "Content-Type: application/json" \
  -d '{"location":"36.3504,127.3845","mode":"today"}'
```

필요한 환경 변수:

- `KMA_SERVICE_KEY`
- `SEOUL_OPEN_DATA_API_KEY`
- `SEOUL_CITY_DATA_API_KEY`
