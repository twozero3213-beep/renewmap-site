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

## 안전 인프라 (living 레이어, group "안전 인프라", D17)
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

## 건축·정비·복지·안전비상벨 (2026-10-26, living 확장)
- `indicators[].group`: "건축·정비"(PERMIT_COUNT_3Y, DEMOLITION_COUNT_3Y, OLD_PUBLIC_FACILITY_COUNT, REDEV_PROJECTS → 화면 '정비 신호'), "안전 인프라"(+EMERGENCY_BELL_PER_KM2, ELDERLY_PED_ACCIDENT_ZONES), "복지"(ELDERLY_LIVING_ALONE → 화면 '인구 변화'). 모두 standard null·기준 없음.
- `indicators[].hidden_until_decision`(+hidden_reason): true면 셀은 있으나 화면에 내지 않는다. 현재 EMERGENCY_BELL_PER_KM2만(대표 결정 대기, D17).
- 부산만 있는 지표(허가·철거·노후시설·독거노인·정비)는 부산 행정동에만 셀. value 있고 status 추가확인이면 하한(위치를 다 못 가림). DEMOLITION_COUNT_3Y는 원천 철거멸실대장이 2021-12-31 이후 미갱신이라 전부 null. 허가·철거는 법정동 단위라 관할 법정동이 한 행정동에만 속할 때만 행정동 값, `living/{code5}.json`에 `sigungu_cells[]`·`bjdong_cells[{code10,name,cells}]` 추가.
- 보고서 템플릿 `report_templates.json`(TPL-2026-10-27.2): 파이썬(`report_quality/templates.py`)과 JS(`docgen.js`)가 같은 파일을 읽는다. `doc_style`(나눔고딕·글자 크기)·`onepage.sizes`가 보고서 서식이다(GOV_DOC_STYLE.md 6장). 양식 조각 정의는 `docs/gov/form_fragments.md`.
