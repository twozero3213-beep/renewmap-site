// 서버 올리기 설정. url·key가 비어 있으면 '서버로 올리기' 버튼은 보이지 않는다(내보내기·공유만 쓴다).
// 켜는 법: docs/field_upload_setup.md. key에는 공개용(anon/publishable) 키만 넣는다. 읽기 권한이 없는 쓰기 전용 저장소여야 한다.
window.FIELD_UPLOAD = { url: "", key: "", bucket: "field-uploads" };
