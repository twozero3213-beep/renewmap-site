# 같이 둔 오픈소스 (문서 열기 화면용)

문서 열기(`docs.html`)가 형식별로 쓰는 도구다. 파일은 고친 것 없이 그대로 두었고, 필요한 형식을 열 때만 브라우저가 불러온다.

| 도구 | 버전 | 라이선스 | 열 수 있는 형식 | 출처 |
|---|---|---|---|---|
| rhwp (`rhwp/`) | 0.8.7 | MIT | 한글 hwp·hwpx | https://github.com/edwardkim/rhwp |
| pdf.js (`pdfjs/`) | 3.11.174 | Apache-2.0 | PDF | https://github.com/mozilla/pdf.js |
| SheetJS Community (`office/xlsx.mini.min.js`) | 0.20.3 | Apache-2.0 | 엑셀 xlsx·xls·xlsb·ods·csv | https://github.com/SheetJS/sheetjs |
| docx-preview (`office/docx-preview.min.js`) | 0.4.1 | Apache-2.0 | 워드 docx | https://github.com/VolodymyrBaydalka/docxjs |
| JSZip (`office/jszip.min.js`) | 3.10.1 | MIT 또는 GPL-3.0 중 MIT 선택 | pptx·odt 안의 글자 읽기, docx-preview 의존 | https://github.com/Stuk/jszip |

- pdf.js 3.11.174는 `isEvalSupported:false`로 열어 글꼴 처리 취약점(CVE-2024-4367)을 막는다.
- SheetJS는 0.18.5의 알려진 취약점(프로토타입 오염·ReDoS)이 고쳐진 0.20.3을 공식 CDN(cdn.sheetjs.com)에서 받아 두었다. 사용자가 고른 파일만 읽는다.
- 이음오피스(Apache-2.0, https://github.com/pblsketch/openoffice)는 같은 한글 열기 엔진 rhwp 위에 만든 데스크톱 프로그램이다. 이 사이트는 그 앱의 코드를 가져다 쓰지 않고, 같은 오픈소스 부품을 브라우저용으로 쓴다. 형식 변환·편집·저장은 이음오피스 앱에서 한다.
- 본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다(rhwp 고지).
- rhwp의 라이선스 전문은 `rhwp/LICENSE`에 있다. 나머지 도구의 라이선스 전문은 각 저장소에 있다.

## 현장 사진 자동 가림 (`vision/`, 현장 확인 앱에서만 불러옴)

| 도구 | 버전 | 라이선스 | 쓰임 | 출처 |
|---|---|---|---|---|
| MediaPipe Tasks Vision (`vision/mediapipe/`) | 1.1.1 | Apache-2.0 | 얼굴 찾기(BlazeFace 짧은 거리 모델 `models/blaze_face_short_range.tflite`) | https://github.com/google-ai-edge/mediapipe |
| Tesseract.js·tesseract.js-core (`vision/tesseract/`) | 7.0.0 | Apache-2.0 | 번호판 숫자 읽기(`models/eng.traineddata.gz`, tessdata_fast) | https://github.com/naptha/tesseract.js |

- 전부 이 기기 안에서 돌고, 처음 쓸 때만 약 20MB를 받는다. 자동 결과는 보조이며 사람의 가림 확인을 대신하지 않는다.
