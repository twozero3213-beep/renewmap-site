# 대시보드 데이터 계약 (`landing/data/dashboard.json`)

## 현재 공통 계약 (2026-11-11)

- 식별자 `mgm_bld_pk`·PNU·행정구역 코드는 문자열이다. 합산·평균 대상이 아니다. `buildings/`와 `bldg_outline/` 생성기 및 현장 기록·3D 대응에서도 같은 형식을 유지한다. 현장·3D의 관리번호 입력 지원 범위는 현재 공개 자료와 대조한 ASCII 숫자 1~22자리이며, 원천 전체의 공식 규격 상한을 뜻하지 않는다.
- 외부에서 받은 오래된 숫자 ID가 JavaScript 안전 정수 범위를 넘으면 자동으로 문자열화해 대응시키지 않는다. 반올림된 원래 번호는 알 수 없으므로 대응 미확인으로 둔다.
- 정상 0과 결측 `null`을 구분한다. NaN/Infinity를 JSON 숫자로 내보내지 않는다. 서로 다른 중복 원천 행은 첫 행을 임의 채택하지 않고 보류한다.
- `cell_pack.omit`에 있는 `value`는 생략된 정상 값일 수 있다. 모든 원장 소비자는 `cellpack` 복원 후 집계한다. 생략을 결측으로 세지 않는다.
- 코드/모델의 현재 구조와 운영 검수 경계는 소스 저장소 `docs/IMPLEMENTATION_STATUS.md`, 원장 요구사항은 `docs/PRD.md`를 따른다.

## 부산 이전 직원 정착 지도 (2026-11-19) — `national/reloc/busan.json`

`national/reloc/office/{회사 행정동 코드}.json`에는 부산 행정동 206곳의 `OFFICE_KM` 셀이 하나씩 들어 있다. 206개 회사 동에서 42,436셀을 생성하며, 화면은 선택한 회사 동 파일만 요청한다. 각 셀의 ID와 스냅샷은 회사 동과 대상 동을 구분한다.

SGIS 2025 행정동 경계 단순화본의 내부 대표점을 EPSG:5186으로 투영하고 두 점 사이 평면 거리를 km로 환산한다. 출처와 이용조건은 국가데이터처 SGIS, 공공누리 제1유형이다. `boundary_source.districts`와 셀 메모에 구·군별 원본·공개 경계 SHA-256 및 원본 조회시각이 있다. 셀 조회시각은 두 원본 중 늦은 시각이다. 기준일 2025-12-31은 연도 단위 원천을 연말로 정규화한 표기다. 실제 회사 주소·교통망·통근시간은 계산에 쓰지 않는다.


- 생성기 `backend/scripts/export_reloc_busan.py`. 기존 `Cell` → `export_cell` → `cellpack` v1 계약을 그대로 쓴다. 브라우저는 `RenewCellPack.unpack(await response.json())`, Python은 `cellpack.load_json(path)`로 **먼저 복원**한다. 복원 전 `value` 생략을 결측으로 판단하지 않는다.
- 최상위 `{generated_at, rule_version, snapshot_id, snapshot_hash, snapshot_scheme, peds, rent, metro, dongs}`. `generated_at`은 입력 중 가장 늦은 조회일시이며 실행 시각이 아니다. 동일 입력은 동일 바이트를 만든다. `snapshot_id`는 입력의 SHA-256, `snapshot_hash`는 `file-cells-v1` 셀 지문이다.
- `dongs[]`: `{code7, name, sigungu, sigungu_code, representative_point:[경도,위도], cells}`. `code7`은 이름과 달리 기존 living·dong_index와 같은 **SGIS 행정동 8자리 문자열**, `sigungu_code`는 SGIS 5자리, `sigungu`는 구·군 이름. 부산 경계·색인 206곳을 모두 싣는다. 대표점은 기존 `living.interior_point` 방식이다.
- 각 셀은 `indicator_code, value, unit, source_name, source_url, retrieved_at, reference_date, formula_id, formula_text, rule_version, sample_n, coverage, status, note` 등 기존 원장 필드를 가진다. 요청의 표본수 `n`은 기존 필드명 **`sample_n`**으로 제공한다. 현장·전문의·영업시간 확인을 완료한 값이 아니므로 정상 값의 상태는 `미확인`, 결측은 `추가확인`이다.

| indicator_code | 값·단위 | sample_n |
|---|---|---|
| `PEDS_CLINIC_COUNT` | 소아청소년과 진료과목을 기재한 의원의 동 안 개수(곳) | 동 안 해당 의원 수 |
| `PEDS_ALL_COUNT` | 같은 진료과목의 기관 중 요양·정신·한방병원을 제외한 동 안 개수(곳) | 동 안 적격 기관 수 |
| `PEDS_NEAREST_M` | 동 대표점에서 부산 수록 적격 기관까지 EPSG:5186 최소 직선거리(m, 소수 1자리) | 검색 대상 부산 적격 기관 수 |
| `JEONSE_M2_MED_APT` / `_RH` / `_OFFI` | 주택 유형별 전세 보증금/전용면적 중위값(만원/㎡, 소수 1자리) | 해당 동·유형의 전세 표본 수 |
| `WOLSE_MED_APT` / `_RH` / `_OFFI` | 주택 유형별 월세 중위값(만원, 보증금 별도) | 해당 동·유형의 월세 표본 수 |
| `SUBWAY_AM_PEAK_BOARD` | 출근 시간대 최근접 역 평균 승차 인원(평일 07~09시), 명/평일·소수 1자리 | 수록 월~금 날짜 수(공휴일 포함) |

- `APT`=아파트, `RH`=연립다세대, `OFFI`=오피스텔. 임대차는 기존 `export_rent.dong_values`를 그대로 사용한다. 전세는 월세=0이며 보증금·전용면적이 있는 계약, 월세는 월세 값이 있는 계약이다. **동·유형·지표별 표본 5건 미만은 `value:null`**, `sample_n`은 실제 수를 유지한다. 결측을 0으로 바꾸지 않는다.
- `metro`: 승하차 출처·실제 기간·원본 SHA-256, 역 좌표 출처·조회시각·실제/기록 SHA-256과 일치 여부, 역별 좌표·기준일·평균·표본 수를 보존한다. 동 대표점→부산교통공사 1~4호선 114개 역 좌표의 EPSG:5186 최근접 역을 먼저 고르고, 그 역의 값이 없으면 `null`이다. 부역명 괄호·가운뎃점·공백만 제거한 같은 역명의 호선 게이트를 날짜별 합산한다. 동률은 좌표 원본 역번호 오름차순. 동해선·부산김해경전철·열차별 혼잡·방향·착석은 반영하지 않는다. 실제 수록 2026-01-01~09-30, 월~금 195일이다. 문화시설은 좌표와 기존 캐시 매칭이 없어 미생성한다.
- `peds`: `{total, by_kind, qualified_n, assigned_n, unassigned_n, retrieved_at_precision:"day"}`. 원본은 조회일만 주므로 셀 `retrieved_at`의 00:00 KST는 날짜 정규화이며 실제 조회 시각은 미확인이다. `reference_date`도 조회일 스냅샷이다. 경계 미배정 기관은 동별 개수에서 빠지지만 최근접 검색 대상에는 포함한다.
- `rent`: `{months:[YYYYMM 12개], min_n:5, geocode_cache, geocode_source, by_type:{apt,rh,offi}}`. 각 유형에는 `raw_n, assigned_n, no_public_coordinate_n, outside_boundary_n, wrong_sigungu_n, available_months, missing_months, missing_entries:[LAWD:YYYYMM], retrieved_at`이 있다. `coverage`는 해당 유형 부산 원본 대비 행정동 배정률(%)이며 표본의 모집단 대표성을 뜻하지 않는다.
- 계약월 창은 부산 manifest에 수록된 최신 월까지 12개월이다. 현재 창은 **2025-11~2026-10**, 실제 원본은 **2026-07~10의 4개월**뿐이다. 없는 8개월을 계약 0건으로 취급하지 않는다. 임대차 `reference_date`는 창 마지막 월 말일, `retrieved_at`은 해당 유형·창 안 부산 원본의 최신 수집 시각이다.
- 좌표는 기존 `geocode_public.json`의 SGIS 캐시만 읽는다. 구 캐시 `geocode.json`과 지오코딩 API는 쓰지 않는다. 계약의 법정 시군구와 배정된 SGIS 시군구가 다르면 제외한다. 원본 주소·기관명·개별 계약은 공개 파일에 싣지 않는다.
- 의료기관 출처는 공공데이터포털 **15001698**(기존 생활 지표와 같은 공공누리 1유형), 임대차는 유형별 **15126474·15126473·15126475**(기존 이용허락범위 제한 없음)로 연결한다. 전문 소아과·실제 진료 가능 여부, 이동시간, 현재 매물 호가·시세를 뜻하지 않는다. 부산 밖 의료기관과 미배정 계약이 빠지고 단순화 경계 오차가 있다. 이 작업에서 원천 이용조건을 온라인 재확인하지 않았다.

## 대시보드 파일 구조

`dashboard.json`을 사용하는 대시보드의 지표값은 이 파일에서 온다. 이 파일은 `backend/scripts/export_dashboard.py`가 원장 셀을 `export_cell()`로 내보내 만든다. 손으로 고치지 않는다.

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
- 다시 받아 값이 바뀔 때(2026-11-12 추가): `cell_id`(`{법정동 코드}:{지표}`)는 그대로 두고 `version`만 1씩 올린 새 판을 만든다.
  - 앞 판 파일은 지우지 않는다. `data/versions/dashboard_{앞 판 기준일}.json`에 바이트 그대로 둔다.
  - 새 파일의 `previous_versions[]`(`file`·`reference_dates`·`generated_at`·`snapshot_hash`·`status: 대체됨`)가 앞 판 위치를 가리킨다.
  - 실행: `export_dashboard.py --units-from-dashboard --no-collect --new-version`. 이 옵션이 없으면 셀이 하나라도 바뀌었을 때 저장을 거부한다.
  - 첫 적용: 2026-11-12 부산 재수집으로 10-24판(version 1)을 대체했다.
- `cells[].spatial_unit`은 `법정동|행정동|시군구|집계구|격자|폴리곤`. `읍면동`은 구 데이터 호환값이며 신규 생성 금지.
- 이 근거 표의 순서는 법정동 코드 순이다. D24~D27의 참고용 점수·순위는 공모 근거 표와 별도로 제공한다.

## v2 전국 레이어 (2026-10-23 저녁 추가) — `landing/data/national/`
출처: 도시재생종합정보체계 쇠퇴진단지표 읍면동 CSV(2000~2024, 전국, 행정동 7자리 코드 = 통계청 코드) + 통계청 SGIS 경계(공공누리 1유형, EPSG:5179→4326 변환). 모든 값은 원장 셀을 거쳐 `export_cell()`로 내보낸다.

> **줄여 저장(cell_pack v1, 2026-11-08)** — `emd/`·`living/`·`forecast/`·`latest/`의 셀 파일은 되풀이되는 출처 칸을 파일 맨 위 `cell_pack.prov`에 한 번만 적고,
> 셀에는 번호 `_p`와 셀마다 다른 칸만 남긴다. 모든 셀에 있는 칸의 흔한 값은 `cell_pack.omit`에 둔다. 아래 설명은 **되돌린 모양** 기준이다.
> 읽을 때: 화면은 `util.js fetchJson`(현장앱은 `cellpack.js`)이, 파이썬은 `renewmap.export.cellpack.load_json`이 자동으로 되돌린다. 직접 `JSON.parse`/`json.loads` 하지 않는다.
> 쓸 때: 내보내기 스크립트는 원래 모양으로 써도 되고, 마지막에 `python -m scripts.pack_cells`를 한 번 돌린다. 되돌렸을 때 원본과 다르면 그 파일은 쓰지 않는다.

- `index.json`: `{generated_at, snapshot_hash, source:{name,url,license_type,base_year}, sido:[{code2,name,center}], sigungu:[{code5,sido2,name,center,bbox,summary:{indicator_code:{value,year,status}}}]}` — summary는 최신 연도의 대표 지표 3개(`DECLINE_AGING_20Y_PCT`, `DECLINE_POP_CHANGE_PCT`, `DECLINE_BIZ_*`)만.
- `sido.geojson`, `sigungu.geojson`: 단순화된 경계(각 2MB 이하), `properties.code`, `properties.name`.
  `sigungu.geojson`의 FeatureCollection `boundary_source` = `{name, year, method, usage}`(2026-11-20 추가). 부산(시도 21) 16개 구·군은 `emd/{code5}.geojson` 행정동 경계를 합친(dissolve) 도형이라 구 선이 늘 동 선 위에 있고 동 파일의 섬이 남는다(좌표 소수 5자리, 이웃 시군구 선과 만나는 교점만 더 길다). 그 밖 시·도는 mapshaper 단순화본(소수 4자리)이다. 화면용이며 면적·거리·필지 판정에 쓰지 않는다.
  동 파일은 구마다 따로 단순화돼 이웃 구와 맞닿은 동 선이 최대 약 150m 어긋난다. 그래서 구 선을 한 묶음으로 쪼개 구끼리 겹친 칠(0.33km²)은 코드가 앞선 구에, 사이 틈(0.49km²)은 둘레를 가장 길게 맞댄 구에 주고, 맞닿은 시군구(울주군·김해시·양산시·창원 진해구)는 부산 외곽선에 맞춰 자르고 사이 틈을 붙였다(2026-11-20). 구끼리·이웃과의 겹침과 틈은 0이고, 부산 안 구멍은 남구 동 원본 구멍(약 0.11km², SGIS 시군구 원본에도 있음) 하나다. 남는 한계: 틈·겹침을 받은 곳에서는 구 선이 이웃 구의 동 선을 따라가 그 구 자기 동 선과 최대 약 270m(동래구) 다르고, 받은 틈 안의 점은 구는 찾아도 그 구 동 파일에서 동을 못 찾는다.
  `sigungu-overview.geojson`은 이 파일에서 만든 전국 개요(줌 8 이하)이고 `overview.source_sha256`이 이 파일과 같다. 판 고정 mapshaper(`export_national.MAPSHAPER_PKG`, npx)를 못 쓰면 두 파일 모두 쓰지 않는다. 다시 만들기: `python scripts/export_national.py --dissolve-only 21`(SGIS·키 불필요).
- `emd/{code5}.geojson`: 해당 시군구의 행정동 경계. `properties.code`(7자리), `name`.
- `emd/{code5}.json`: `{sigungu:code5, dongs:[{code7,name,series:{indicator_code:[[year,value|null],...]},cells:[export_cell...]}]}` — 2000~2025 시계열. 결측은 null, 추정 없음.
- 경계와 지표의 코드가 안 맞는 동(폐지·신설)은 `unmatched`에 목록으로 남기고 지도에서 회색 처리.
- 인구(2026-10-23 밤 추가): `index.json.pop_source` = `{name, url, license_type, tables, years:[시작,끝], dongs_matched, retrieved_at, unmatched_count, unmatched_file}`. 출처는 KOSIS 주민등록인구(`DT_1B04005` 1992~2010, `DT_1B04005N` 2011~), 행안부 10자리 코드를 KIKmix 이름으로 통계청 8자리에 잇는다. 못 이은 코드는 `pop_unmatched.json`(`[{code10,name,mois_sigungu,years,reason}]`)에 두고 추정·이름 보정하지 않는다. 동 시계열에 `DECLINE_POP_TOTAL`(명), `DECLINE_POP_DROP30Y_PCT`(30년 최대 대비 감소율), `DECLINE_POP_DECL3IN5`(5년 중 3년 연속 감소)가 들어간다. `DECLINE_MET_COUNT`는 확정된 요건만 센 하한이며 `sample_n`=확정 요건 수, note에 요건별 결과를 적는다.
- 근거 지도 화면 규칙: 고정 구간 색, 범례에 "판정 아님·출처·기준연도" 상시 표시. 건축HUB 3기준(`dashboard.json`)은 수집된 시군구에서만 별도 레이어로 겹친다. 참고용 점수·순위의 별도 범위는 D24~D27을 따른다.

### 행정구역 체계 (2026-10-23 사용자 지시, v2 필수)
법적 체계를 그대로 따른다. 임의로 단계를 합치거나 건너뛰지 않는다.
- 광역(level 1): 특별시(서울) · 광역시(부산·대구·인천·광주·대전·울산) · 특별자치시(세종) · 도 · 특별자치도(강원·전북·제주). `index.json.sido[].kind`에 종류를 적는다.
- 기초(level 2): 특별시·광역시 아래 **자치구·군**, 도 아래 **시·군**. 세종특별자치시는 기초가 없어 읍·면·동이 광역 직속이다.
- 일반구(level 2.5, 자치단체 아님): 도의 큰 시 아래 구(수원시 장안구 등), 제주의 행정시(제주시·서귀포시)도 자치단체가 아니다. `index.json.sigungu[].kind ∈ {자치구, 군, 시, 일반구, 행정시}`와 `parent`(일반구·행정시는 상위 시·도 코드)를 적는다. 화면 브레드크럼: 경기도 › 수원시 › 장안구 › 정자1동.
- 읍·면·동(level 3): 군 아래는 읍·면, 자치구 아래는 동, 도의 시 아래는 읍·면·동이 섞일 수 있다(도농복합시). `emd[].kind ∈ {읍, 면, 동}`. 행정동 코드 7자리(통계청) 기준. 법정동(건축물대장)은 별도 레이어이며 `spatial_unit`으로 구분한다.
- 검증 케이스: 서울 종로구(특별시›자치구›동), 부산 기장군(광역시›군›읍면), 경기 수원시 장안구(도›시›일반구›동), 전남 담양군(도›군›읍면), 세종(특별자치시›읍면동 직속), 제주 서귀포시(특별자치도›행정시›읍면동).

## 생활 지표 레이어 (2026-10-23 추가) — `national/living/`, `national/dong_index.json`
- `living/{code5}.json`: `{sigungu, generated_at, snapshot_hash(앞12), dongs:[{code7(SGIS 8자리, emd와 같은 코드), name, cells:[export_cell...]}]}`
- `living/index.json`: `{generated_at, snapshot_hash, indicators:[{code,label,unit,group,standard:{value,direction,text,source,status}}], sources:{key:{name,url,license_type,retrieved_at,base_date}}, coverage:{code:{dongs_with_value,dongs_total}}}`. 기준이 없으면 `standard.value`·`direction`=null, `status`="기준 없음". `sources.std` = 기준 해당 항목 수(파생).
- 지표: POP_AGED65_PCT(+_DELTA5Y), POP_YOUTH_PCT(20~34세, +_DELTA5Y), HOSP_CLINIC_COUNT, HOSP_PER10K, LIB_NEAREST_M, PARK_AREA_PER_CAPITA, PARK_COUNT, ER_NEAREST_M, BUS_STOP_DENSITY, STD_SHORTFALL_COUNT. 기준값은 `rules/living_std.py`(LIVING-STD-2026.10, 승인 대기).
- STD_SHORTFALL_COUNT는 법정·공식 정의 기준에 해당하는 항목 수의 하한이다(sample_n=확정 항목 수, note에 항목별 결과). 승인 대기 기준(도서관·응급 거리)은 세지 않는다. 가중 종합점수·순위가 아니다(D13). 화면은 항목별 기준 대비 해당 여부만 보여 주고 값 크기로 동을 줄 세우지 않는다.
- 거리는 동 대표점(경계 내부점, 인구 가중 아님)에서의 직선거리, 시설 수는 단순화 경계 기준이라 경계선 부근 오차가 있다. 공원 면적은 공원 좌표가 속한 동에 전부 귀속한다.
- `dong_index.json`: `[[code8, 동이름, code5, 시군구이름(일반구는 "시 구"), 시도이름], ...]` 전국 검색용.
- 사업체(2026-10-23 밤): `DECLINE_BIZ_TOTAL`은 ~2019 쇠퇴진단지표(조사기반), 2020~ 통계청 SGIS 전국사업체조사(등록기반). `index.json.biz_source`에 출처·경계 연도, 못 이은 코드는 `biz_unmatched.json`. `DECLINE_BIZ_DROP10Y_PCT`·`DECLINE_BIZ_DECL3IN5`는 rules/decline.py business_req 결과에서 나온 파생값.

## 시군구 단위 레이어 (2026-10-24) — `national/designations.json`, `national/migration.json`
- `designations.json`: `{generated_at, snapshot_hash, source:{name,url,file_url,notice_no,notice_date,effective_date,retrieved_at,file_sha256,license_type,rule_version,secondary}, counts, note, items:[{code5(SGIS|null), mois_code5, mois_code5_2026, name, sido, status:"인구감소지역"|"관심지역"|"인구활력+", origin, since, first_designated|null, join, cells:[export_cell]}]}`. 고시(행안부 제2026-61호)에 없는 시군구는 items에 없다(= 미지정). `code5=null`은 SGIS 2024 경계에 없는 신설·개편 지역. 행정 지정의 전사이며 판정·순위가 아니다(D13).
- `migration.json`: `{generated_at, snapshot_hash, source, sigungu:[{code5, mois_code5, name, series:{YOUTH_NET_MIGRATION:[[y,v]], YOUTH_NET_MIGRATION_PER1K:[[y,v]]}, cells}], unmatched:[...]}`. 시군구 단위만 있고 행정동 자료는 없다. 일반구는 KOSIS가 시 단위까지만 줘서 unmatched. 결측은 null. 순위·TOP 목록 없음.
- `spatial_unit`에 `시군구` 추가(migrations/003). `DEPOP_STATUS` 값은 문자열이라 DB `cells.value`(double)에는 아직 못 넣는다(텍스트 열 추가 전).

## 안전 인프라 (living 레이어, group "안전 인프라")
- `CCTV_PER_KM2`(대/㎢), `STREETLIGHT_PER_KM2`(개/㎢), `POLICE_NEAREST_M`(m). 모두 `standard:{value:null,status:"기준 없음"}`. 시설 위치의 사실 지표이며 범죄·치안 점수가 아니고 순위·등급을 매기지 않는다. 보안등은 시군구 좌표 보유율 80% 미만이면 null(추가확인), 80~95%는 값과 coverage. 경찰관서 좌표는 주소→카카오 지오코딩(약관 확인 대기).
- `dashboard.json`(정밀 사례): 부산 16개 구·군 전부 `수집됨`, dongs는 리 포함 법정동 254개.

## 추세 전망 레이어 (FORECAST-2026.10, 승인 전 초안) — `national/forecast/`
판정·투자 조언이 아니다. 원천 셀과 섞지 않고 `FORECAST_` 접두 셀로만 둔다.
- `index.json`: `{generated_at, snapshot_hash, method, approved:false, horizons:[2025,2026,2027,2029], backtest:{지표:{median_mape, n_areas, horizon_years, coverage_by_h, ...}}, excluded_dongs, disclaimer}`
- `{code5}.json`: `{sigungu, sigungu_forecast, sigungu_cells, sigungu_backtest, dongs:[{code7, name, forecast:{지표:{"2025":[점,하한,상한],…}}, backtest, excluded:{지표:사유}, cells}]}`
- 셀 코드 `FORECAST_{지표}_H{1|5}`(+`_LO`·`_HI`)만 싣고 `forecast` 배열은 4지평 모두. `derived=true`, `status=추가확인`, `rule_version=FORECAST-2026.10`. 구간은 전국 백테스트 상대오차의 10·90% 분위(동별 차이 미반영).
- 노후건축물비율은 백테스트에서 '마지막 값 유지'보다 오차가 커 보류(`excluded`), 사업체는 등록기반 5점뿐이라 제외. 65세 이상은 시군구 단위만. 화면은 점추정 단독으로 쓰지 않고 모델명·구간·면책을 함께 표시한다.

## 아파트 매매 실거래 (2026-10-25) — `national/realestate.json` (FACT-2026.10)
- `{generated_at, snapshot_hash, source:{name,url,api,license_type,retrieved_at,months,latest_month,provisional_months,yoy_window_end,min_n}, note, sigungu:[{code5, mois_code5, lawd_cd[], name, pooled, series:{APT_TRADE_COUNT, APT_PRICE_M2_MEDIAN, APT_PRICE_M2_YOY_PCT: [[yyyymm,v]]}, summary:{APT_TRADE_COUNT_YOY_PCT, latest_month}, cells}], unmatched}`. 출처 국토교통부 아파트 매매 실거래(공공데이터포털 15126469).
- 시군구·월 집계만 있고 개별 거래(단지·층·지번)는 없다. 해제 신고 건 제외. 거래 5건 미만이면 중위가·변화율 null(개별 거래 가격 노출 방지). 일반구가 있는 시·화성시는 구 합산(`pooled`). 최근 2개월은 신고기한 때문에 잠정(`provisional_months`). 화면은 `note`와 잠정 표시를 함께 보여 준다. 순위·투자 표현 없음.

## 추세 전망 FORECAST-2026.11 (2026-10-25, 승인 전 초안)
- 행정동 인구는 GradientBoosting(최근 1·3·5·10년 인구 변화율·노후율 등, 누설 없는 특징), 65세 이상(시군구)은 trend 유지, 노후·사업체 보류. 셀 `rule_version=FORECAST-2026.11`, 인구 `formula_id=F-FC-04`. `dongs[].backtest.explain`에 한 줄 설명.
- `index.backtest[지표]`: `median_mape`는 원점(2019) 이전 자료로만 고르거나 학습한 **정직한 값**, 검증 구간으로 고른 옛 값은 `mape_in_sample_selection`(낙관), 비교용 `trend_selected_before_origin`, `interval`(원점 2014→2015~19 오차 분위, 폭 배수, 2020~24 포함률), `models`.
- 시군구 65세 이상 실측: 각 `{code5}.json`의 `sigungu_observed:{POP_AGED65_PCT:[[y,v]]}`·`sigungu_observed_cells`, `index.sigungu_aged65_latest:{code5:{value,year,cell_id}}`(상위 시는 cell_id null). 화면 '지역 찾기'의 전국 초고령 조건이 이 값을 쓴다.

## 최신 월 주민등록 인구 (2026-10-26) — `national/latest/`
- 출처 행안부 주민등록인구통계(KOSIS DT_1B04005N 월 시점, 공공누리 1유형). 연 지표(2024 연말)는 그대로 두고 공표된 최근 월(현재 2026-09, 기준일 2026-09-30)을 따로 싣는다.
- `latest/index.json`: `{month, generated_at, snapshot_hash, source, sigungu:{code5:{POP_TOTAL_LATEST,POP_AGED65_PCT_LATEST,POP_YOUTH_PCT_LATEST:{value,status,cell_id}}}, coverage, unplaced_current}`; `latest/{code5}.json`: `{month, source, sigungu, sigungu_cells, dongs:[{code7,name,cells}], current_only:[{code10,name,reason,cells}], snapshot_hash}`.
- 2025~26 개편으로 2024 경계에 없는 현재 동은 `current_only`로만 두고 지도 색에 쓰지 않는다. 인천 중·동·서구는 분구로 시군구 값 null(추가확인).
- 이름 결합 규칙(연 인구도 동일): 같은 시군구 안에서 양쪽 이름이 하나뿐일 때만 결합, 셀 note에 `join: 이름 결합(행안부 코드 ↔ SGIS 코드, 2025~26 개편)`. 목록 `pop_name_joined.json`, 못 이은 코드·사유 `pop_unmatched.json`(join_method).

## 건물 단위 (2026-10-26) — `buildings/{bjd10}.json`
- `{source, source_url, license, retrieved_at, hub_reference_date, age_reference_date, bjd10, name, count, excluded_attached, pnu_rule, age_rule, personal_data, fields, buildings:[{pnu|null, jibun|null, mgm_bld_pk, name|null, main_use, structure, use_apr_day|null, floors|null, tot_area|null, age_years|null, over30|null}]}`. 건축물대장 표제부 주건축물 원천 행(원장 셀 아님), 지번 순, 소유자·거주자 항목 없음. 사용승인일이 비정상이면 age·over30 null. 부산 해운대구 8개 법정동 시범. 30년 이상 목록 XLSX는 `scripts/export_old_buildings.py`(좌표는 지적도 전까지 법정동 대표점).

2026-11-17 공개 건물 자료: 개별 건물의 `name`은 모두 `null`이다. 자유문자열 건물명에 개인명이 섞일 수 있어 원천의 `bldNm`을 읽거나 공개·검색하지 않는다. 파일 머리의 `name`은 법정동명이며 건물명과 구분한다. 실제 API 제공 범위는 `buildings/index.json`으로 확인하고, 대용량 자료의 재배포 조건이 확인되지 않은 파일은 공개 색인에서 제외한다. 파일 없음은 건물 0동을 뜻하지 않는다.

## 건축·정비·복지·안전비상벨 (2026-10-26, living 확장)
- `indicators[].group`: "건축·정비"(PERMIT_COUNT_3Y, DEMOLITION_COUNT_3Y, OLD_PUBLIC_FACILITY_COUNT, REDEV_PROJECTS → 화면 '정비 신호'), "안전 인프라"(+EMERGENCY_BELL_PER_KM2, ELDERLY_PED_ACCIDENT_ZONES), "복지"(ELDERLY_LIVING_ALONE → 화면 '인구 변화'). 모두 standard null·기준 없음.
- `indicators[].hidden_until_decision`(+hidden_reason): true면 셀은 있으나 화면에 내지 않는다. 현재 EMERGENCY_BELL_PER_KM2만(화면 공개 여부 확인 중).
- 부산만 있는 지표(허가·철거·노후시설·독거노인·정비)는 부산 행정동에만 셀. value 있고 status 추가확인이면 하한(위치를 다 못 가림). DEMOLITION_COUNT_3Y는 원천 철거멸실대장이 2021-12-31 이후 미갱신이라 전부 null. 허가·철거는 법정동 단위라 관할 법정동이 한 행정동에만 속할 때만 행정동 값, `living/{code5}.json`에 `sigungu_cells[]`·`bjdong_cells[{code10,name,cells}]` 추가.
- 보고서 템플릿 `report_templates.json`(TPL-2026-10-27.2): 파이썬(`report_quality/templates.py`)과 JS(`docgen.js`)가 같은 파일을 읽는다. `doc_style`(나눔고딕·글자 크기)·`onepage.sizes`가 보고서 서식이다(GOV_DOC_STYLE.md 6장). 양식 조각 정의는 `docs/gov/form_fragments.md`.

## 지역 SOC 점 (2026-11-07) — `soc_busan.json`
- 신청요건 화면 '영역 안 생활 SOC 세기'가 읽는다. `sources[]`(kind·name·id·url·retrieved_at·부산 행 수·뺀 행 수·기준일 범위), `points[]` = `[source 순번, 이름, 종류, 위도, 경도, 데이터기준일자, 관리번호(공원·주차장만)]`(`fields`에 같은 순서), `crs` EPSG:4326.
- 원천은 표준데이터 파일(이용허락범위 제한 없음) 도서관·도시공원·경로당·주차장. 원장 셀이 아니라 원자료 점 목록이다. 개수는 사용자가 그린 영역마다 기기에서 센다.
- 만들기: `backend/scripts/export_soc_busan.py`. 확인 기록: `docs/research/soc_datasets_2026-11-07.md`.

## 경남 양산시·거제시 자료 (2026-11-15) — `soc_gyeongnam.json`, `vacant_gyeongnam.json`, `oa_decline_gyeongnam.json`
부산 밖으로 넓히는 임시안(사람 결정 9번 전, PR #122 건물 자료와 같은 두 시). 아직 이 세 파일을 읽는 화면은 없다(화면 연결은 Before/After 확인 후).
- `soc_gyeongnam.json`: `soc_busan.json`과 같은 7종 표준데이터 파일을 주소(경상남도 양산시·거제시)로 거른 점. `points[]` 끝에 시군구 코드 한 칸을 더 둔다(`fields` 참고).
  초등학교(사람이 받은 15099519 CSV, 85곳)·응급의료기관(15000563, 7곳)·보건소 4종(15001698, 31곳)도 넣어 부산과 같은 10종이다(2026-11-15). 못 받은 종류는 `missing[]`에 적는다. 만들기: `backend/scripts/export_soc_gyeongnam.py`.
- `vacant_gyeongnam.json`: 시가 올린 빈집 목록(한 채 한 줄, 공공데이터포털 15144630 양산·15144458 거제)을 **법정동(읍면은 리)**·등급별로 센 값. 부산 파일(행정동 합계)과 단위가 달라 `unit`에 적는다.
  등급 이름은 원자료 그대로(거제는 (신)·(구) 등급과 '행정조사'가 섞임). 지번 등 주소는 싣지 않는다. 만들기: `backend/scripts/export_vacant_gyeongnam.py`.
- `oa_decline_gyeongnam.json` + `oa/{행정동 8자리}.json`: `oa_decline_busan.json`과 같은 방법·규칙(rules/decline.py 그대로)으로 거제(38090)·양산(38100) 행정동 중 쇠퇴 요건이 2개 미만인 동을 집계구로 본다.
  만들기: `backend/scripts/export_oa_decline.py --region gyeongnam`.
- `shop_change_gyeongnam.json`(2026-11-16): `shop_change_busan.json`과 같은 원천(인허가 일반·휴게음식점)·같은 계산. 다른 점 두 가지 — 각 동을 **그 시 평균**(`kinds.*.city_avg[시]`)과 견주고,
  읍·면은 리를 나누지 않고 **읍·면 전체를 한 줄**(`unit`='읍면', `bjd10` 없음)로 센다. `rows[]` 칸은 부산 칸 + `unit`. 업소 이름·주소 없음. 화면: `field/shop.html` '경상남도' 묶음.
  만들기: `backend/scripts/export_shop_change_gyeongnam.py`(포털이 쪽당 100줄만 줘 3만 줄에 몇 시간, 끊기면 다시 돌리면 이어 받음).
- `national/living/38090.json`·`38100.json`의 `KINDER_NEAREST_M`·`CHILDCARE_NEAREST_M`(2026-11-16): 부산과 같은 '대표점→가장 가까운 시설' 직선거리.
  원천은 경남교육청 학교일람표(3036368)·양산·거제 어린이집현황(3040402·15117963) 주소를 SGIS로 바꾼 좌표. 만들기: `backend/scripts/export_kinder_gyeongnam.py`.
  `PERMIT_COUNT_3Y`는 `export_gov_national fetch|build --only 48330,48310`로 두 시만 먼저 채웠다(부산과 같은 창 2023-11-09~2026-11-09).
  `sigungu_cells`의 `ELDERLY_1P_HH_SGG`(65세 이상 1인가구 수)·`ELDERLY_1P_HH_PCT`(독거노인가구 비율): 통계청 KOSIS DT_1YL12701 시군구 값(2025: 양산 16,905가구·10.9%, 거제 8,947가구·9.0%).
  부산 `ELDERLY_LIVING_ALONE`(행정동 독거노인 인원)과 단위·원천이 달라 다른 코드다. 만들기: `backend/scripts/export_elderly_gyeongnam.py`.
- 양산 `SENIOR_HALL_COUNT`·`soc_gyeongnam.json` '경로당(양산시 현황)'(2026-11-16): 전국 표준데이터에 양산시 줄이 없어 양산시 경로당 현황(15045251, 337곳) 주소를 SGIS로 바꿔 셌다.
  띄어쓰기가 빠진 주소 4곳은 스크립트의 ADDR_FIX로 바로잡아 337곳 모두 좌표가 있다. 거제는 표준데이터 그대로. 만들기: `backend/scripts/export_senior_yangsan.py`.

## 건물 외곽선·대장 연결 (2026-11-07) — `bldg_outline/{bjd10}.json`, `bldg_outline/index.json`
- 현재 건물 3D 보기(`field/city3d.html`)에서 누른 자리의 건물을 우리 건축물대장 행(`buildings/{bjd10}.json`)과 잇는 데 쓴다.
- `items[]` = `[mgm_bld_pk|null, match, height_m|null, floors|null, pnu, [lng,lat,...] 바깥 고리]`. match 1 PNU+사용승인일+연면적, 2 PNU+연면적, 3 PNU+사용승인일(모두 대장 한 행과만 맞을 때), 0 못 이음.
- 원천: 국토교통부 GIS건물통합정보 부산 SHP(기준일 2026-10-09, 공공누리 제1유형). 높이는 대장 신고값 그대로, 층수로 만들지 않는다. `index.json`은 법정동별 경계 상자.
- 지금은 부산 건축물대장 파일이 있는 법정동 254곳 전부. 만들기: `backend/scripts/export_bldg_outline.py <bjd10...>`.
- 경남 양산·거제(2026-11-15): 같은 방법으로 경남 SHP(AL_D010_48_20261109, 기준일 2026-11-09)에서 147동(양산 58·거제 89, 4833031000은 외곽선 없음)을 더했다.
  파일마다 자기 출처 이름·기준일을 싣고, `index.json` 맨 위 출처 칸은 부산 그대로다. 대장 연결은 양산 42%·거제 35%(부산 57%)로 낮다(원인 [미확인]). 만들기: `export_bldg_outline.py --name AL_D010_48_20261109 <bjd10...>`.
