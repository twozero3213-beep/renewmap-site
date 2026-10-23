# 대시보드 데이터 계약 (`landing/data/dashboard.json`)

화면의 모든 숫자는 이 파일에서만 온다. 이 파일은 `backend/scripts/export_dashboard.py`가 원장 셀을 `export_cell()`로 내보내 만든다. 손으로 고치지 않는다.

```json
{
  "generated_at": "2026-10-23T20:00:00+09:00",
  "snapshot_hash": "sha256 hex",
  "sido": {"code": "26", "name": "부산광역시"},
  "sigungu": [
    {"code": "26350", "name": "해운대구", "status": "수집됨"},
    {"code": "26110", "name": "중구", "status": "수집 예정"}
  ],
  "dongs": [
    {
      "sigungu_code": "26350",
      "code": "2635010300",
      "name": "반여동",
      "unit": "법정동",
      "buildings_total": 5207,
      "cells": [ { "...export_cell() 결과 그대로..." } ]
    }
  ]
}
```

- `sigungu.status`: `수집됨` | `수집 예정`. 수집 예정 구는 `dongs`에 항목이 없다. 화면은 빈 상태를 보여 주고 숫자를 지어내지 않는다.
- `cells[].indicator_code` 규칙: `AGING_{20|30}Y_{COUNT|AREA|HH}` (동수·연면적·세대 기준 노후율, 단위 `%`).
- `cells[]`는 `export_cell()` 필드를 그대로 둔다: `value`(숨겨지면 null + `value_hidden_reason`), `unit`, `status`, `source_name`, `source_url`, `retrieved_at`, `reference_date`, `formula_text`, `rule_version`, `sample_n`, `coverage`, `spatial_unit`, `base_year`, `license_type`, `derived` 등.
- 지도(선택 필드, 2026-10-23 추가): `dongs[].center` = `[위도, 경도]`(EPSG:4326), `dongs[].center_source` = 좌표 출처 문자열. 경계 다각형이 있으면 `landing/data/dong_boundaries.geojson`(FeatureCollection, `properties.code` = 법정동 코드, 좌표 EPSG:4326)에 두고, 출처·이용조건은 `properties.source`·`properties.license`와 이 문서에 적는다. 없으면 화면은 중심점 원으로 그린다.
- `cells[].spatial_unit`은 `법정동|행정동|집계구|격자|폴리곤`. `읍면동`은 구 데이터 호환값이며 신규 생성 금지.
- 순서는 법정동 코드 순이다. 화면에서 값 크기로 줄 세우거나 순위를 매기지 않는다(D13).
