# 같이 둔 오픈소스

리뉴맵 공개 사이트가 이 폴더(`vendor/`)에 두거나 CDN에서 불러오는 오픈소스의 고지를 한곳에 모았다. 라이선스 전문이 있는 곳은 맨 아래 '전문 위치'에 적었다.

## 문서 열기 (`docs.html`)

문서 열기가 형식별로 쓰는 도구다. 파일은 고친 것 없이 그대로 두었고, 필요한 형식을 열 때만 브라우저가 불러온다.

| 도구 | 버전 | 라이선스 | 열 수 있는 형식 | 출처 |
|---|---|---|---|---|
| rhwp (`rhwp/`) | 0.8.7 | MIT | 한글 hwp·hwpx | https://github.com/edwardkim/rhwp |
| pdf.js (`pdfjs/`) | 3.11.174 | Apache-2.0 | PDF | https://github.com/mozilla/pdf.js |
| SheetJS Community (`office/xlsx.mini.min.js`) | 0.20.3 | Apache-2.0 | 엑셀 xlsx·xls·xlsb·ods·csv | https://github.com/SheetJS/sheetjs |
| docx-preview (`office/docx-preview.min.js`) | 0.4.1 | Apache-2.0 | 워드 docx | https://github.com/VolodymyrBaydalka/docxjs |
| JSZip (`office/jszip.min.js`) | 3.10.1 | MIT 또는 GPL-3.0 중 MIT 선택 | pptx·odt 안의 글자 읽기, docx-preview 의존 | https://github.com/Stuk/jszip |

- pdf.js 3.11.174는 `isEvalSupported:false`로 열어 글꼴 처리 취약점(CVE-2024-4367)을 막는다.
- SheetJS는 0.18.5의 알려진 취약점(프로토타입 오염·ReDoS)이 고쳐진 0.20.3을 공식 CDN(cdn.sheetjs.com)에서 받아 두었다. 사용자가 고른 파일만 읽는다.
- JSZip 안에는 pako(MIT)가 함께 묶여 있다.
- 이음오피스(Apache-2.0, https://github.com/pblsketch/openoffice)는 같은 한글 열기 엔진 rhwp 위에 만든 데스크톱 프로그램이다. 이 사이트는 그 앱의 코드를 가져다 쓰지 않고, 같은 오픈소스 부품을 브라우저용으로 쓴다. 형식 변환·편집·저장은 이음오피스 앱에서 한다.
- 본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다(rhwp 고지).

## 지도

| 도구 | 버전 | 라이선스 | 쓰임 | 출처 |
|---|---|---|---|---|
| MapLibre GL JS (`maplibre/`) | 5.24.1 | BSD-3-Clause | 건물 나이 4D 지도(`time4d.html`) | https://github.com/maplibre/maplibre-gl-js |
| OpenMapTiles positron 스타일 (`openfreemap/positron.json`) | 2026-11-13 받음 | 코드 BSD-3-Clause, 디자인 CC-BY 4.0 | 4D 지도의 바탕 모양. **고쳐 씀**: 글자를 한국어 이름(name:ko) 먼저 보이게 하고 도로 번호 방패를 뺐다(2026-11-13) | https://github.com/openmaptiles/positron-gl-style |
| Leaflet (CDN, cdnjs.cloudflare.com) | 1.9.4 | BSD-2-Clause | 동네 진단·구역 계산 지도 | https://github.com/Leaflet/Leaflet |
| Cesium (CDN, cdn.jsdelivr.net) | 1.134.0 | Apache-2.0 | 3D 모델 배치 비교(`field/twin.html`) | https://github.com/CesiumGS/cesium |

- MapLibre 버전은 `maplibre/maplibre-gl-csp.js` 머리말로 확인했다.
- positron 스타일은 OpenFreeMap에서 받았고, 바탕 타일도 OpenFreeMap(tiles.openfreemap.org)이 제공한다. 지도 자료는 © OpenMapTiles · © OpenStreetMap contributors(ODbL)이고, 지도 화면 구석의 출처 표시에도 나온다.
- Leaflet과 Cesium은 이 폴더에 두지 않고 CDN에서 고정 버전으로 불러온다.

## 현장 사진 자동 가림 (`vision/`, 현장 확인 앱에서만 불러옴)

| 도구 | 버전 | 라이선스 | 쓰임 | 출처 |
|---|---|---|---|---|
| MediaPipe Tasks Vision (`vision/mediapipe/`) | 1.1.1 | Apache-2.0 | 얼굴 찾기(BlazeFace 짧은 거리 모델 `vision/models/blaze_face_short_range.tflite`) | https://github.com/google-ai-edge/mediapipe |
| Tesseract.js·tesseract.js-core (`vision/tesseract/`) | 7.0.0 | Apache-2.0 | 번호판 숫자 읽기(`vision/models/eng.traineddata.gz`, tessdata_fast) | https://github.com/naptha/tesseract.js |

- 전부 이 기기 안에서 돌고, 처음 쓸 때만 약 20MB를 받는다. 자동 결과는 보조이며 사람의 가림 확인을 대신하지 않는다.
- Tesseract.js 배포본 안에는 buffer·regenerator-runtime·zlib.js(MIT)와 ieee754(BSD-3-Clause)가 함께 묶여 있다.

## 글꼴 (`fonts/`)

- 사이트 글꼴은 Pretendard 1.3.9(SIL OFL 1.1)에서 사이트가 쓰는 글자만 남긴 수정판이다. 수정판의 내부 이름에는 예약 글꼴 이름 Pretendard를 쓰지 않는다. 저작권 줄과 전문은 `fonts/OFL.txt`에 있다.

## 전문 위치

- `rhwp/LICENSE`: rhwp의 MIT 전문
- `maplibre/LICENSE.txt`: MapLibre GL JS의 BSD-3-Clause 전문
- `vision/tesseract/core/LICENSE`: Apache License 2.0 전문(pdf.js, SheetJS, docx-preview, MediaPipe, BlazeFace 모델, Tesseract.js와 core, tessdata_fast에 적용)
- `THIRD_PARTY_LICENSES.txt`: MIT·BSD-3-Clause 전문과 묶여 들어간 부품의 저작권 줄(JSZip, pako, buffer, regenerator-runtime, zlib.js, ieee754, positron), positron 디자인의 CC-BY 4.0 표기와 고친 내용
- `vision/tesseract/tesseract.min.js.LICENSE.txt`, `vision/tesseract/worker.min.js.LICENSE.txt`: Tesseract.js 배포본이 가리키는 묶음 부품 표기(npm tesseract.js 7.0.0 원본 그대로)
- Leaflet(BSD-2-Clause)과 Cesium(Apache-2.0)의 전문은 각 저장소에 있다.
