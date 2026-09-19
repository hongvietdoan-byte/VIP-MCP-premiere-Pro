# -*- coding: utf-8 -*-
"""Quản lý trạng thái test tool — NGUỒN DUY NHẤT là tool-status.json.

  py scripts/tool-status.py report     # đối chiếu code <-> trạng thái, đếm theo trạng thái, cảnh báo lệch
  py scripts/tool-status.py review     # kết quả test ban đêm (nightly-results.jsonl) khác gì trạng thái hiện tại
  py scripts/tool-status.py apply      # áp kết quả ban đêm vào tool-status.json (bỏ qua tool infeasible/stub)
  py scripts/tool-status.py markdown   # sinh TOOL_STATUS.md (bản xem, KHÔNG sửa tay)
  py scripts/tool-status.py csv [file] # sinh CSV để import lên Google Sheet (bản xuất, KHÔNG sửa tay)

Quy tắc chống lệch:
  * Danh sách tool lấy từ code (server/src/tools/premiere-tools.js), không nhập tay -> tổng luôn đúng.
  * Test ban đêm chỉ APPEND vào nightly-results.jsonl (không sửa tool-status.json) -> không xung đột.
  * Tool đã chốt infeasible/stub không bị ghi đè tự động (cần --force).
"""
import argparse, collections, csv, io, json, os, re, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATUS_F = os.path.join(ROOT, "tool-status.json")
EVENTS_F = os.path.join(ROOT, "nightly-results.jsonl")
TOOLS_JS = os.path.join(ROOT, "server", "src", "tools", "premiere-tools.js")
LABEL = {"ok": "✅ Đã test đúng", "fail": "🔴 Test ra lỗi", "partial": "◐ Một phần", "unverified": "⚠️ Chưa xác nhận",
         "untested": "⏳ Chưa test", "stub": "⛔ Stub cố ý", "infeasible": "❌ Không khả thi"}
ORDER = ["ok", "fail", "partial", "unverified", "untested", "stub", "infeasible"]
PROTECTED = {"infeasible", "stub"}


def registered():
    src = open(TOOLS_JS, encoding="utf-8").read()
    return sorted(set(re.findall(r"^\s{4}name: '([a-z0-9_]+)'", src, re.M)))


def load_status():
    return json.load(open(STATUS_F, encoding="utf-8"))


def save_status(d):
    with open(STATUS_F, "w", encoding="utf-8", newline="\n") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
        f.write("\n")


def load_events():
    ev = []
    if os.path.exists(EVENTS_F):
        for i, line in enumerate(open(EVENTS_F, encoding="utf-8"), 1):
            line = line.strip()
            if not line:
                continue
            try:
                e = json.loads(line)
            except ValueError:
                print("CẢNH BÁO: nightly-results.jsonl dòng %d không phải JSON hợp lệ, bỏ qua" % i)
                continue
            if not all(k in e for k in ("ts", "tool", "result")):
                print("CẢNH BÁO: dòng %d thiếu ts/tool/result, bỏ qua" % i)
                continue
            ev.append(e)
    return ev


def latest_by_tool(events):
    best = {}
    for e in events:
        if e["tool"] not in best or e["ts"] > best[e["tool"]]["ts"]:
            best[e["tool"]] = e
    return best


def pending(status, events):
    """Sự kiện đêm MỚI hơn bằng chứng đã áp trong status, kết quả khác ok/fail thì bỏ."""
    out = []
    for tool, e in latest_by_tool(events).items():
        cur = status["tools"].get(tool)
        if cur is None:
            out.append((tool, e, "TOOL KHÔNG CÓ trong tool-status.json (tool mới?)"))
            continue
        if e["ts"] <= (cur.get("evidenceTs") or ""):
            continue
        if e["result"] not in ("ok", "fail"):
            continue
        if e["result"] == cur["status"]:
            out.append((tool, e, "khớp trạng thái hiện tại (chỉ cập nhật ngày test)"))
        else:
            out.append((tool, e, "ĐỔI: %s -> %s" % (cur["status"], e["result"])))
    return out


def cmd_report(_):
    reg, st = registered(), load_status()["tools"]
    print("Tổng tool trong code: %d" % len(reg))
    c = collections.Counter(st[t]["status"] for t in reg if t in st)
    for k in ORDER:
        if c.get(k):
            print("  %-16s %d" % (LABEL[k], c[k]))
    miss = [t for t in reg if t not in st]
    orph = [t for t in st if t not in reg]
    if miss:
        print("\nLỆCH: tool có trong code nhưng CHƯA có trạng thái (%d): %s" % (len(miss), ", ".join(miss)))
    if orph:
        print("\nLỆCH: có trạng thái nhưng tool KHÔNG còn trong code (%d): %s" % (len(orph), ", ".join(orph)))
    noDate = [t for t in reg if t in st and st[t]["status"] == "ok" and not st[t].get("lastTested")]
    if noDate:
        print("\nCẢNH BÁO: ✅ nhưng không có ngày test (%d): %s" % (len(noDate), ", ".join(noDate)))
    if not (miss or orph):
        print("\nKhớp: mọi tool trong code đều có trạng thái, không có mục thừa.")
    return 1 if (miss or orph) else 0


def cmd_review(_):
    p = pending(load_status(), load_events())
    if not p:
        print("Không có kết quả ban đêm mới cần duyệt.")
        return 0
    for tool, e, why in p:
        prot = " [BỊ CHẶN: đã chốt %s]" % load_status()["tools"][tool]["status"] if (
            tool in load_status()["tools"] and load_status()["tools"][tool]["status"] in PROTECTED) else ""
        print("- %s: %s | %s%s\n    tham số: %s\n    verify: %s\n    lỗi/ghi chú: %s" % (
            tool, e["ts"], why, prot, e.get("params"), e.get("verify"), e.get("error") or e.get("note")))
    return 0


def cmd_apply(a):
    d = load_status()
    n = 0
    for tool, e, why in pending(d, load_events()):
        cur = d["tools"].get(tool)
        if cur is None:
            print("BỎ QUA %s: chưa có trong tool-status.json, cần thêm tay" % tool)
            continue
        if cur["status"] in PROTECTED and not a.force:
            print("BỎ QUA %s: đã chốt %s (dùng --force nếu chắc chắn)" % (tool, cur["status"]))
            continue
        old = cur["status"]
        cur["status"] = e["result"]
        cur["lastTested"] = e["ts"][:10]
        cur["evidenceTs"] = e["ts"]
        if e["result"] == "fail":
            cur["note"] = "[tự động %s] %s" % (e["ts"][:10], e.get("error") or e.get("note") or "lỗi khi test ban đêm")
        n += 1
        print("ÁP %s: %s -> %s" % (tool, old, cur["status"]))
    save_status(d)
    print("Đã áp %d tool. Chạy tiếp: report, markdown." % n)
    return 0


def rows():
    reg, st = registered(), load_status()["tools"]
    return [(t, st.get(t, {"status": "untested", "lastTested": None, "note": "CHƯA CÓ TRẠNG THÁI"})) for t in reg]


def cmd_markdown(_):
    rs = rows()
    c = collections.Counter(v["status"] for _, v in rs)
    L = ["# TOOL_STATUS (sinh tự động từ tool-status.json — KHÔNG sửa tay)", "",
         "Tổng tool trong code: **%d**" % len(rs), ""]
    L += ["| Trạng thái | Số tool |", "|---|---|"] + ["| %s | %d |" % (LABEL[k], c[k]) for k in ORDER if c.get(k)]
    for k in ORDER:
        grp = [(t, v) for t, v in rs if v["status"] == k]
        if not grp:
            continue
        L += ["", "## %s (%d)" % (LABEL[k], len(grp)), "", "| Tool | Ngày test | Ghi chú |", "|---|---|---|"]
        for t, v in grp:
            L.append("| `%s` | %s | %s |" % (t, v.get("lastTested") or "-", (v.get("note") or "").replace("|", "/").replace("\n", " ")))
    open(os.path.join(ROOT, "TOOL_STATUS.md"), "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")
    print("Đã ghi TOOL_STATUS.md (%d tool)" % len(rs))
    return 0


def cmd_csv(a):
    path = a.file or os.path.join(ROOT, "tool-status-export.csv")
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["STT", "Tool (tên MCP)", "Trạng thái", "Ghi chú", "Ngày test cuối"])
        for i, (t, v) in enumerate(rows(), 1):
            w.writerow([i, t, LABEL[v["status"]], v.get("note") or "", v.get("lastTested") or "-"])
    print("Đã ghi %s" % path)
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest="cmd", required=True)
    sp.add_parser("report").set_defaults(fn=cmd_report)
    sp.add_parser("review").set_defaults(fn=cmd_review)
    ap_apply = sp.add_parser("apply")
    ap_apply.add_argument("--force", action="store_true")
    ap_apply.set_defaults(fn=cmd_apply)
    sp.add_parser("markdown").set_defaults(fn=cmd_markdown)
    ap_csv = sp.add_parser("csv")
    ap_csv.add_argument("file", nargs="?")
    ap_csv.set_defaults(fn=cmd_csv)
    a = ap.parse_args()
    sys.exit(a.fn(a))
