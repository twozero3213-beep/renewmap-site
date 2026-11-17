"""공개 후보의 건물 자료에서 이용조건 보류·이름·허용하지 않은 열을 차단한다."""
import argparse
import json
import math
import re
from pathlib import Path


API_URL = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo"
API_LICENSE = "공공데이터포털 이용허락범위 제한 없음(건축HUB 건축물대장정보 서비스, 15134735)"
TEXT_FIELDS = set("pnu jibun mgm_bld_pk main_use structure use_apr_day house_type apr_odd".split())
INT_FIELDS = {"floors", "age_years", "hhld"}
BOOL_FIELDS = {"over30", "mixed_home"}
FIELDS = TEXT_FIELDS | INT_FIELDS | BOOL_FIELDS | {"name", "tot_area", "use_apr_span"}
HEADER_TEXT = set("source source_url license data_source_system retrieved_at hub_reference_date age_reference_date bjd10 name kind personal_data name_rule pnu_rule age_rule".split())
HEADER_FIELDS = HEADER_TEXT | {"count", "excluded_attached", "fields", "buildings"}


def record_ok(row):
    if not isinstance(row, dict) or "name" not in row or row["name"] is not None or set(row) - FIELDS:
        return False
    for key, value in row.items():
        if value is None:
            continue
        if key in TEXT_FIELDS and not isinstance(value, str):
            return False
        if key in INT_FIELDS and type(value) is not int:
            return False
        if key in BOOL_FIELDS and type(value) is not bool:
            return False
        if key == "tot_area":
            if type(value) not in (int, float):
                return False
            try:
                if not math.isfinite(value):
                    return False
            except OverflowError:
                return False
        if key == "use_apr_span" and (not isinstance(value, list) or len(value) != 2 or not all(isinstance(v, str) for v in value)):
            return False
    return True


def header_ok(data):
    return (isinstance(data, dict) and set(data) == HEADER_FIELDS
            and all(isinstance(data[key], str) for key in HEADER_TEXT)
            and all(type(data[key]) is int and data[key] >= 0 for key in ("count", "excluded_attached"))
            and isinstance(data["fields"], list) and all(isinstance(v, str) for v in data["fields"])
            and isinstance(data["buildings"], list))


def load_json(path, label, errors):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        errors.append(f"{label}: JSON을 읽을 수 없음")
        return None


def index_entries(index):
    if not isinstance(index, dict) or set(index) != {"note", "sigungu"} or not isinstance(index["note"], str) or not isinstance(index["sigungu"], list):
        return None
    entries, groups = [], set()
    for group in index["sigungu"]:
        if (not isinstance(group, dict) or set(group) != {"code", "name", "dongs"}
                or not isinstance(group["code"], str) or not re.fullmatch(r"[0-9]{5}", group["code"])
                or not isinstance(group["name"], str) or not isinstance(group["dongs"], list)
                or group["code"] in groups):
            return None
        groups.add(group["code"])
        for dong in group["dongs"]:
            if (not isinstance(dong, dict) or set(dong) != {"code", "name", "count"}
                    or not isinstance(dong["code"], str) or not re.fullmatch(r"[0-9]{10}", dong["code"])
                    or not dong["code"].startswith(group["code"]) or not isinstance(dong["name"], str)
                    or type(dong["count"]) is not int or dong["count"] < 0):
                return None
            entries.append(dong)
    return entries


def outline_problems(site, building_codes):
    folder = site / "data" / "bldg_outline"
    if not folder.exists() and not folder.is_symlink():
        return []
    if not folder.is_dir() or folder.is_symlink():
        return ["외곽선 폴더가 아니거나 허용하지 않은 연결"]
    errors, codes = [], set()
    for path in folder.iterdir():
        if path.is_symlink() or not path.is_file() or (path.name != "index.json" and not re.fullmatch(r"[0-9]{10}\.json", path.name)):
            errors.append("예상 밖 외곽선 파일·폴더 또는 연결이 있음")
        elif path.name != "index.json":
            codes.add(path.stem)
    # 외곽선의 대장 연결 키도 원천 건물 파일과 같은 공개 범위 안에 있어야 한다.
    if not codes <= building_codes:
        errors.append("외곽선: 공개 건물 범위 밖의 대장 연결 자료가 있음")
    path = folder / "index.json"
    index = load_json(path, "외곽선 index.json", errors) if path.is_file() and not path.is_symlink() else None
    header = {"name", "url", "portal_url", "license_type", "base_date", "note"}
    if (not isinstance(index, dict) or set(index) != header | {"files"}
            or not all(isinstance(index[key], str) for key in header)
            or not isinstance(index["files"], dict)):
        errors.append("외곽선 index.json: 색인의 허용 필드·타입 위반 또는 파일 없음")
        return errors
    indexed = index["files"]
    if set(indexed) != codes or not set(indexed) <= building_codes:
        errors.append("외곽선 index.json: 공개 외곽선·건물 범위 불일치")
    for code, entry in indexed.items():
        if (not re.fullmatch(r"[0-9]{10}", code) or not isinstance(entry, dict)
                or set(entry) != {"bbox", "n", "sha256"}
                or not isinstance(entry["bbox"], list) or len(entry["bbox"]) != 4
                or not all(type(v) in (int, float) and -180 <= v <= 180 for v in entry["bbox"])
                or type(entry["n"]) is not int or entry["n"] < 0
                or not isinstance(entry["sha256"], str) or not re.fullmatch(r"[0-9a-f]{16}", entry["sha256"])):
            errors.append("외곽선 index.json: 색인 항목의 허용 필드·타입 위반")
            break
    return errors


def problems(site: Path) -> list[str]:
    folder = site / "data" / "buildings"
    if not folder.is_dir() or folder.is_symlink():
        return ["공개 건물 폴더 없음 또는 허용하지 않은 연결"]
    errors, counts = [], {}
    for path in sorted(folder.iterdir()):
        if path.is_symlink() or not path.is_file() or (path.name != "index.json" and not re.fullmatch(r"[0-9]{10}\.json", path.name)):
            errors.append("예상 밖 건물 파일·폴더 또는 연결이 있음")
            continue
        if path.name == "index.json":
            continue
        data = load_json(path, path.name, errors)
        if not header_ok(data):
            errors.append(f"{path.name}: 파일 머리·배열의 허용 필드 또는 타입 위반")
            continue
        rows = data["buildings"]
        if data.get("source_url") != API_URL or data.get("license") != API_LICENSE:
            errors.append(f"{path.name}: 공개 확인된 API 원천·이용조건이 아님")
        if data.get("bjd10") != path.stem or data.get("count") != len(rows):
            errors.append(f"{path.name}: 법정동 코드·건수 불일치")
        counts[path.stem] = (len(rows), data["name"])
        # 실패 로그에도 실제 건물명이나 추가 개인정보 열의 값을 남기지 않는다.
        if any(not record_ok(row) for row in rows):
            errors.append(f"{path.name}: 건물명 또는 허용하지 않은 필드·타입이 있음")
    index_path = folder / "index.json"
    index = load_json(index_path, "index.json", errors) if index_path.is_file() and not index_path.is_symlink() else None
    entries = index_entries(index)
    if entries is None:
        errors.append("index.json: 색인의 허용 필드·타입 위반 또는 파일 없음")
    else:
        indexed = {dong["code"]: (dong["count"], dong["name"]) for dong in entries}
        if len(entries) != len(indexed) or indexed != counts:
            errors.append("index.json: 공개 파일 목록·건수·법정동명 불일치")
    if not counts:
        errors.append("공개 건물 파일 없음")
    errors.extend(outline_problems(site, set(counts)))
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("site", type=Path)
    args = parser.parse_args()
    errors = problems(args.site)
    if errors:
        print("\n".join(errors))
        raise SystemExit(1)
    print("공개 건물 검사 통과: API 원천·이용조건·이름 제외·필드·색인·외곽선 공개 범위")


if __name__ == "__main__":
    main()
