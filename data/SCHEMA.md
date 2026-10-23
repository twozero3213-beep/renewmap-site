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

## v2 전국 레이어 (2026-10-23 저녁 추가) — `landing/data/national/`
출처: 도시재생종합정보체계 쇠퇴진단지표 읍면동 CSV(2000~2024, 전국, 행정동 7자리 코드 = 통계청 코드) + 통계청 SGIS 경계(공공누리 1유형, EPSG:5179→4326 변환). 모든 값은 원장 셀을 거쳐 `export_cell()`로 내보낸다.

- `index.json`: `{generated_at, snapshot_hash, source:{name,url,license_type,base_year}, sido:[{code2,name,center}], sigungu:[{code5,sido2,name,center,bbox,summary:{indicator_code:{value,year,status}}}]}` — summary는 최신 연도의 대표 지표 3개(`DECLINE_AGING_20Y_PCT`, `DECLINE_POP_CHANGE_PCT`, `DECLINE_BIZ_*`)만.
- `sido.geojson`, `sigungu.geojson`: 단순화된 경계(각 2MB 이하), `properties.code`, `properties.name`.
- `emd/{code5}.geojson`: 해당 시군구의 행정동 경계. `properties.code`(7자리), `name`.
- `emd/{code5}.json`: `{sigungu:code5, dongs:[{code7,name,series:{indicator_code:[[year,value|null],...]},cells:[export_cell...]}]}` — 2000~2024 시계열. 결측은 null, 추정 없음.
- 경계와 지표의 코드가 안 맞는 동(폐지·신설)은 `unmatched`에 목록으로 남기고 지도에서 회색 처리.
- 인구(2026-10-23 밤 추가): `index.json.pop_source` = `{name, url, license_type, tables, years:[시작,끝], dongs_matched, retrieved_at, unmatched_count, unmatched_file}`. 출처는 KOSIS 주민등록인구(`DT_1B04005` 1992~2010, `DT_1B04005N` 2011~), 행안부 10자리 코드를 KIKmix 이름으로 통계청 8자리에 잇는다. 못 이은 코드는 `pop_unmatched.json`(`[{code10,name,mois_sigungu,years,reason}]`)에 두고 추정·이름 보정하지 않는다. 동 시계열에 `DECLINE_POP_TOTAL`(명), `DECLINE_POP_DROP30Y_PCT`(30년 최대 대비 감소율), `DECLINE_POP_DECL3IN5`(5년 중 3년 연속 감소)가 들어간다. `DECLINE_MET_COUNT`는 확정된 요건만 센 하한이며 `sample_n`=확정 요건 수, note에 요건별 결과를 적는다.
- 화면 규칙: 고정 구간 색(값 순 정렬·순위 금지), 범례에 "판정 아님·출처·기준연도" 상시 표시. 건축HUB 3기준(`dashboard.json`)은 수집된 시군구에서만 별도 레이어로 겹친다.

### 행정구역 체계 (2026-10-23 사용자 지시, v2 필수)
법적 체계를 그대로 따른다. 임의로 단계를 합치거나 건너뛰지 않는다.
- 광역(level 1): 특별시(서울) · 광역시(부산·대구·인천·광주·대전·울산) · 특별자치시(세종) · 도 · 특별자치도(강원·전북·제주). `index.json.sido[].kind`에 종류를 적는다.
- 기초(level 2): 특별시·광역시 아래 **자치구·군**, 도 아래 **시·군**. 세종특별자치시는 기초가 없어 읍·면·동이 광역 직속이다.
- 일반구(level 2.5, 자치단체 아님): 도의 큰 시 아래 구(수원시 장안구 등), 제주의 행정시(제주시·서귀포시)도 자치단체가 아니다. `index.json.sigungu[].kind ∈ {자치구, 군, 시, 일반구, 행정시}`와 `parent`(일반구·행정시는 상위 시·도 코드)를 적는다. 화면 브레드크럼: 경기도 › 수원시 › 장안구 › 정자1동.
- 읍·면·동(level 3): 군 아래는 읍·면, 자치구 아래는 동, 도의 시 아래는 읍·면·동이 섞일 수 있다(도농복합시). `emd[].kind ∈ {읍, 면, 동}`. 행정동 코드 7자리(통계청) 기준. 법정동(건축물대장)은 별도 레이어이며 `spatial_unit`으로 구분한다.
- 검증 케이스: 서울 종로구(특별시›자치구›동), 부산 기장군(광역시›군›읍면), 경기 수원시 장안구(도›시›일반구›동), 전남 담양군(도›군›읍면), 세종(특별자치시›읍면동 직속), 제주 서귀포시(특별자치도›행정시›읍면동).
