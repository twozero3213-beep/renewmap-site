// 화면에 보이는 목록만 나눈다. 저장된 전체 기록과 내보내기는 그대로 둔다.
(function (root) {
  "use strict";
  // size: 한 쪽 줄 수. 현장 기록·보관함은 5줄, 순위는 20줄(11-13 평가: 5줄씩 711쪽은 훑을 수 없다)
  function windowOf(total, page, size = 5) {
    const pages = Math.max(1, Math.ceil(total / size));
    page = Math.max(1, Math.min(pages, page));
    const start = (page - 1) * size;
    return { page, pages, start, end: Math.min(total, start + size) };
  }
  function create(list, label, changed, initialPage = 1, size = 5) {
    let page = initialPage;
    const nav = document.createElement("nav"), prev = document.createElement("button"), next = document.createElement("button"), select = document.createElement("select"), status = document.createElement("span");
    nav.className = "list-pages"; nav.setAttribute("aria-label", label + " 페이지");
    for (const button of [prev, next]) { button.type = "button"; button.className = "ghost"; button.setAttribute("aria-controls", list.id); }
    prev.textContent = "이전"; next.textContent = "다음";
    select.setAttribute("aria-label", label + " 페이지 선택"); select.setAttribute("aria-controls", list.id);
    status.setAttribute("role", "status");
    nav.append(prev, select, next, status); list.before(nav);
    function move(value) { page = value; changed(); select.focus({ preventScroll: true }); nav.scrollIntoView({ block: "nearest" }); }
    prev.addEventListener("click", () => move(page - 1));
    next.addEventListener("click", () => move(page + 1));
    select.addEventListener("change", () => move(Number(select.value)));
    return {
      reset() { page = 1; },
      goTo(value) { page = value; },   // 바깥에서 쪽을 옮길 때(순위의 '우리 동네 몇 위' 찾기)
      get page() { return page; },   // 순위 화면이 주소(?page=)에 적는다
      slice(rows) {
        const range = windowOf(rows.length, page, size); page = range.page;
        select.textContent = "";
        for (let n = 1; n <= range.pages; n++) { const option = document.createElement("option"); option.value = n; option.textContent = `${n} / ${range.pages}쪽`; option.selected = n === page; select.append(option); }
        prev.disabled = page === 1; next.disabled = page === range.pages;
        status.textContent = rows.length ? `전체 ${rows.length.toLocaleString("ko-KR")}건 중 ${(range.start + 1).toLocaleString("ko-KR")}–${range.end.toLocaleString("ko-KR")}건` : "기록 없음";   // v9: '3541건'과 '3,541개'가 섞였다
        nav.hidden = range.pages === 1;
        return rows.slice(range.start, range.end);
      }
    };
  }
  const api = { windowOf, create };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RenewListPages = api;
})(typeof window === "object" ? window : globalThis);
