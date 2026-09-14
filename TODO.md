# TODO — Premiere MCP

Cập nhật lần cuối: 2026-09-14. Xem thêm chi tiết đầy đủ trong Claude memory: `premiere-mcp.md`.

## 🔨 `get_clip_volume`/`set_clip_mute` mới — ĐÃ CODE, CHỜ RESTART ĐỂ LIVE-TEST (2026-09-14)

Tiếp tục nhóm 13 (Audio nâng cao) từ `AUDIT_MASTER_TOOL_LIST.md`. Trước khi code:
- **Xác nhận `set_track_volume`/`set_track_pan`/`solo_track` KHÔNG khả thi** — dựa vào kết quả probe `Track` prototype đã có từ trước (mục track management, 2026-09-14 đợt đầu): Track chỉ có `createSetNameAction/setMute/getMediaType/getIndex/isMuted/getTrackItems`, không có method volume/pan/solo nào. Loại khỏi kế hoạch.
- `get_clip_volume`/`set_clip_mute` khả thi: probe `get_effect_properties("Internal Volume Stereo")` cho thấy component Volume có sẵn param **`Mute`** (boolean, index 0) bên cạnh `Level` (dB, đã dùng ở `set_clip_volume` cũ) — dùng trực tiếp, không cần tự thêm effect như Balance.

**Cần restart app Claude** để nạp schema mới.

## ✅ `get_effect_properties`/`remove_all_effects` — ĐÃ LIVE-TEST, 1 BUG AN TOÀN ĐÃ FIX (2026-09-14)

`get_effect_properties` đúng ngay từ đầu — đọc đủ tên/giá trị/keyframeCount của từng param, verify trên effect Gaussian Blur (Blurriness/Blur Dimensions/param không tên thứ 3).

**🐛 Bug an toàn (ĐÃ FIX)**: `remove_all_effects` lần đầu test xoá SẠCH cả `Motion`/`Opacity` — 2 component nội tại mà UI Premiere bình thường KHÔNG cho xoá (luôn mờ, không có nút xoá trong Effect Controls). Live-test xác nhận hậu quả thật: sau khi xoá, `get_clip_transform` trên đúng clip đó trả về rỗng `{}` — clip mất hẳn khả năng đọc/ghi transform qua `set_clip_position`/`set_clip_scale`/... (các tool nhóm 9 đợt trước). Đây là hành vi API cho phép nhưng vượt quá kỳ vọng thông thường của "xoá hết effect".

**Đã fix**: mặc định `remove_all_effects` BỎ QUA Motion/Opacity (thêm field `skipped` trong kết quả trả về), chỉ xoá khi truyền rõ `includeIntrinsic:true`. Live-test lại: xoá clip có 1 effect Gaussian Blur (không có Motion/Opacity trong chain lúc đó) → xoá đúng, `skipped:[]`.

**Ghi chú phụ (không phải bug, chỉ là quan sát)**: Motion/Opacity KHÔNG phải lúc nào cũng xuất hiện sẵn trong `getComponentChain()` của mọi clip — clip đầu tiên test trong phiên có cả 3 (Opacity/Motion/Gaussian Blur), nhưng các clip khác chèn sau đó trong CÙNG session chỉ hiện đúng effect vừa áp (không có Motion/Opacity) dù cùng loại media. Có thể là hành vi lazy-load của Premiere, chưa rõ nguyên nhân chính xác — không ảnh hưởng tính đúng đắn của fix trên (logic skip vẫn đúng bất kể component có xuất hiện hay không).

## 🔨 `get_effect_properties`/`remove_all_effects` mới — ĐÃ CODE, CHỜ RESTART ĐỂ LIVE-TEST (2026-09-14)

Tiếp tục nhóm 11 (Effects nâng cao) từ `AUDIT_MASTER_TOOL_LIST.md`. Trước khi code, probe trực tiếp prototype `Component` (effect) qua hijack tạm `get_clip_transform` (không cần restart) — xác nhận:
- Component chỉ có `getParam/getMatchName/getDisplayName/getParamCount` — **KHÔNG có API enable/disable/bypass nào** → `set_effect_enabled` KHÔNG khả thi qua UXP, loại khỏi kế hoạch.
- `get_effect_properties`/`remove_all_effects` dựng trên infrastructure đã verify (`findParamByName`, `chain.createRemoveComponentAction` đã dùng ở `remove_effect`) — không cần API mới, rủi ro thấp.

**Cần restart app Claude** để nạp schema mới.

## ✅ `rename_clip`/`enable_disable_clip` — ĐÃ LIVE-TEST ĐÚNG, KHÔNG BUG (2026-09-14)

Live-test trên sequence test riêng (tạo mới, xác nhận qua `get_status` trước khi ghi — áp dụng bài học từ sự cố trước). `rename_clip("Test Clip Renamed")` → `actualName` khớp đúng. `enable_disable_clip(false)` → `actualEnabled:false`; bật lại `enable_disable_clip(true)` → `actualEnabled:true`. Cả 2 tool đúng ngay từ lần code đầu (nhờ probe API trước khi viết thay vì đoán) — không cần fix gì thêm.

## Chi tiết batch `rename_clip`/`enable_disable_clip` (đã live-test xong, xem mục ✅ phía trên)

Tiếp tục nhóm 8 (Editing precision) từ `AUDIT_MASTER_TOOL_LIST.md`. Trước khi code, đã probe trực tiếp prototype `TrackItem` thật (tạm dùng `get_clip_transform` đã có sẵn để chèn debug, không cần restart) — xác nhận:
- `getName()`/`createSetNameAction()` → `rename_clip` khả thi (đổi tên TRACK ITEM trên timeline, khác tên project item gốc).
- `isDisabled()`/`createSetDisabledAction()` → `enable_disable_clip` khả thi.
- **Xác nhận KHÔNG có** API move-to-track hay link/unlink audio+video trên TrackItem — `move_clip_to_track`/`link_selection`/`unlink_selection` KHÔNG khả thi qua UXP (giống pattern track add/delete/lock đã biết từ trước), loại khỏi danh sách, không code.
- Phát hiện thêm (chưa dùng): `createAddVideoTransitionAction`/`createRemoveVideoTransitionAction` — có thể dùng cho `remove_transition` (nhóm 12) nếu làm tiếp.

**Cần restart app Claude** để nạp schema mới ở `server/src/tools/premiere-tools.js`.

### ⚠️ Sự cố nhỏ trong lúc test đợt trước (đã xử lý, ghi lại làm bài học)

Lúc probe API cho batch này, do quên tạo lại sequence test sau khi xoá sequence cũ, 1 lệnh `insert_clip` đã lỡ chạy vào sequence **"VN - WAG - BOOYAH-"** (data test tên thật, đã được user xác nhận an toàn để test) thay vì sequence test riêng — đẩy lùi nội dung ~10s. User xác nhận không cần khôi phục chính xác (không quan trọng), nhưng đã dọn tạm bằng `extract_selection` — kết quả dọn không khớp hoàn toàn 100% với nguyên trạng ban đầu (Video 1 còn 42 clip thay vì 44 gốc, do khoảng xoá vô tình trúng thêm vài clip gốc rất ngắn nằm trong đúng vùng thời gian đó). Không ảnh hưởng gì (user xác nhận), nhưng rút kinh nghiệm: **LUÔN xác nhận sequence active đúng là sequence test (qua `get_status`) trước MỌI lệnh ghi**, đặc biệt sau khi vừa `delete_sequence` (active sequence tự rơi về sequence khác).

## ✅ Batch tool mới đợt 2 — ĐÃ LIVE-TEST ĐẦY ĐỦ 9/9, 2 BUG FIX MỚI (2026-09-14)

Live-test sau khi user restart app Claude, trên sequence test riêng (`MCP Transform Test`/`MCP RemoveSel Test`, đã xoá sau khi xong) với clip video thật.

**9/9 tool hoạt động đúng sau khi fix 2 bug:**
- `set_clip_scale`, `set_clip_rotation`, `set_clip_opacity` — đúng ngay từ đầu, verify read-back khớp.
- `set_clip_position`, `set_clip_anchor_point`, `get_clip_transform` — đúng SAU KHI fix bug 1.
- `remove_selected_clips`, `extract_selection`, `lift_selection` — đúng SAU KHI fix bug 2, verify kỹ: xoá đúng clip trong phạm vi, KHÔNG đụng clip ngoài phạm vi, `extract_selection` (ripple:true) xác nhận đóng khoảng trống đúng (clip sau dịch về đúng vị trí), `lift_selection` (ripple:false) xác nhận giữ nguyên khoảng trống.

### 🐛 Bug 1 (ĐÃ FIX) — Position/Anchor Point đọc ra `null` + đơn vị sai (tưởng pixel, thật ra chuẩn hoá 0-1)

`get_clip_transform` lần đầu trả `position: null, anchorPoint: null`. Nguyên nhân: comment cũ (kế thừa từ code Beat Shake, chưa từng verify riêng cho component Motion builtin) giả định Position/Anchor Point của Motion dùng object `{x,y}` pixel tuyệt đối — nhưng thực tế đọc ra `{value: [x,y]}`, tức MẢNG CHUẨN HOÁ 0-1 (giống hệt effect Transform tự thêm, không phải dạng riêng của Motion như tưởng). 2 lỗi chồng nhau: (1) thiếu `unwrapParamValue()` trước khi đưa vào `parsePositionValue()` nên không nhận diện được `{value:[...]}`; (2) `set_clip_position(x:960,y:540)` (tưởng pixel) ghi thẳng 960/540 vào trường chuẩn hoá 0-1 → đọc lại ra `[960,540]` — giá trị vô lý, đẩy clip ra ngoài xa khung hình.

**Đã fix**: `setClipPosition`/`setClipAnchorPoint`/`getClipTransform` giờ quy đổi pixel↔chuẩn hoá qua `getFrameDimensions()` (chia/nhân theo width/height sequence thật) trước khi ghi/sau khi đọc — API tool vẫn nhận/trả pixel (dễ dùng), nội bộ tự quy đổi đúng đơn vị Premiere thật cần.

**Live-tested**: `set_clip_position(960,540)` (giữa khung 1920x1080) → đọc lại đúng `{x:960,y:540}`; test lệch tâm `(1440,270)` → đọc lại khớp chính xác; `get_clip_transform` sau khi set cả 5 giá trị (position, anchorPoint, scale 150, rotation 45, opacity 50) → đọc lại đúng tất cả, đồng bộ đơn vị pixel giữa các tool.

### 🐛 Bug 2 (ĐÃ FIX) — `getMediaType()` không trả về string, so sánh `=== "Audio"` luôn sai

Live-test `remove_selected_clips` lần đầu (chọn 2 clip trong khoảng 15-40s) báo `deleted:3` — xoá NHẦM cả 1 clip ngoài phạm vi đã chọn. Điều tra bằng debug sentinel phát hiện: `item.getMediaType()` trả về 1 OBJECT enum thật (dạng GUID nội bộ), KHÔNG PHẢI string `"Audio"`/`"Video"` như code cũ giả định (dùng ở cả `deleteClip` lẫn `removeSelectedClips` mới viết) — so sánh `mt === "Audio"` luôn `false`, khiến MỌI item (kể cả clip audio) đều bị xếp nhầm vào nhóm "video" khi gom theo mediaType để xoá theo lô.

So sánh ĐÚNG xác nhận qua debug: `mt === ppro.Constants.MediaType.AUDIO` / `=== ppro.Constants.MediaType.VIDEO` — identity so với hằng số SDK, không phải string.

**Đã fix**: `removeSelectedClips` và `deleteClip` (cả 2 dùng chung pattern cũ) đổi sang so sánh đúng bằng hằng số. **Lưu ý phụ**: lần đầu nghi ngờ do "selection không được thay thế đúng" (chọn 2 nhưng xoá 3) — sau khi điều tra kỹ bằng test sạch (deselect hẳn → chọn đúng 1 clip → verify qua `get_selected_clips` độc lập → xoá) xác nhận nguyên nhân THẬT là bug mediaType ở trên, không phải bug selection. Có thể lần đầu bị nhiễu bởi state chọn tồn đọng từ bước test Motion/Transform trước đó trong cùng phiên (chưa deselect giữa các bước test) — đã rút kinh nghiệm: luôn deselect + verify qua `get_selected_clips` TRƯỚC khi test các tool xoá hàng loạt.

**Live-tested lại sau fix**: chọn chính xác 1 clip (verify qua `get_selected_clips` trước khi xoá) → `remove_selected_clips` → đúng 1 clip bị xoá, clip khác giữ nguyên (verify qua `list_sequence_tracks`).

## Chi tiết batch tool mới đợt 2 (nguồn AUDIT_MASTER_TOOL_LIST.md — đã live-test xong, xem mục ✅ phía trên)

Theo yêu cầu user "làm toàn bộ lần lượt theo plan, xong 1 đợt commit thì chạy build tiếp" — tiếp tục từ `AUDIT_MASTER_TOOL_LIST.md` (187 tool tiềm năng, 20 nhóm), ưu tiên đúng thứ tự audit khuyến nghị: nhóm 1 (Keyframe) + nhóm 2 (Track) + nhóm 8 (Roll/Slip edit) đã xong đợt trước — đợt này làm **nhóm 9 (Motion/Transform)** + phần còn lại khả thi của **nhóm 8 (Editing precision)**.

**9 tool mới** (`plugin/premiereActions.js`, wire vào `plugin/mcpBridge.js` + `server/src/tools/premiere-tools.js`):
- `set_clip_position`/`set_clip_anchor_point` — dùng `ppro.PointF()` (pixel tuyệt đối), tái dùng pattern `buildPositionValue`/`parsePositionValue` đã verify đúng từ code Beat Shake cũ.
- `set_clip_scale`/`set_clip_rotation`/`set_clip_opacity` — number thường qua component Motion/Opacity có sẵn mặc định trên mọi clip (không cần tự thêm effect).
- `get_clip_transform` — đọc gộp cả 5 giá trị trên trong 1 lệnh.
- `remove_selected_clips` — xoá TOÀN BỘ clip đang chọn (khác `delete_clip` chỉ 1 clip), tái dùng `createRemoveItemsAction` đã verify đúng.
- `extract_selection`/`lift_selection` — xoá theo khoảng thời gian, ripple/không-ripple, tái dùng cùng pattern `rippleDelete` đã có (helper chung `_removeItemsInTimeRange`).

**Chưa làm trong đợt này** (cần probe API trực tiếp trước khi code, để dành đợt sau): `rename_clip`, `enable_disable_clip`, `link_selection`/`unlink_selection`, `move_clip_to_track`, `slide_edit` — chưa có xác nhận API nào từ trước trong dự án, rủi ro đoán sai chữ ký cao (giống bài học `move_item_to_bin`/`delete_clip` cũ), nên để lại probe sống qua UXP trước khi viết code thay vì đoán mù.

**Cần restart hẳn app Claude** để nạp tool schema mới bên server trước khi live-test (pattern giống hệt đợt 9 tool trước — sửa `plugin/*.js` tự reload, nhưng thêm tool mới ở `server/src/tools/premiere-tools.js` thì không).

## ✅ `scripts/Chuyen_Doi_Mic_Check.bat` — kéo-thả file docx, không cần gõ lệnh (2026-09-10)

Cách dùng đơn giản nhất cho `docx_to_mic_check.py`: kéo file `.docx` thả vào file `.bat` này (đặt shortcut ra Desktop nếu muốn) — tự suy ra `--images`/`--out-dir` từ đúng thư mục chứa file docx (đúng quy ước "mọi thứ nằm phẳng 1 thư mục" của workflow Mic Check), tự kiểm tra Python đã cài chưa, tự báo lỗi rõ nếu thả nhầm file không phải `.docx`.

**2 bug thật đã fix khi test** (không phải do môi trường test — đã live-test qua `cmd.exe` thật):
1. `%~dp1` (thư mục file được thả) luôn có `\` ở cuối — đặt trong `"..."` thì Windows hiểu nhầm `\"` là ký tự thoát, làm gộp nhầm `--out-dir` vào chung giá trị `--images`, khiến `argparse` báo thiếu `--out-dir`. Fix: bỏ `\` cuối trước khi dùng.
2. Python in tiếng Việt bị `UnicodeEncodeError` (rơi về codepage cp1252) dù đã có `chcp 65001` trong .bat — không nên tin console tự nhận đúng codepage. Fix: ép `PYTHONIOENCODING=utf-8` cho tiến trình Python con.
3. (Ghi chú kỹ thuật) File `.bat` phải lưu CRLF, không phải LF — cmd.exe đọc sai từng dòng nếu file chỉ có LF.

Đã live-test full: kéo thật file `FFWS_SEA_FALL_2026_Week2.docx` vào `.bat`, ra đúng kết quả giống hệt gọi lệnh tay.

## ✅ Premiere crash sau khi chạy `run_mic_check_workflow` lần đầu (2026-09-10) — đã giảm thiểu, live-test lại KHÔNG crash

Live-test đầu tiên `run_mic_check_workflow` (64 ảnh, gộp toàn bộ pipeline FFWS thành 1 lệnh) chạy xong báo kết quả đúng (`placed: 64, failed: []`), nhưng **ngay sau đó Premiere Pro tắt đột ngột** (user báo trực tiếp). Kiểm tra lại:
- Premiere tự mở lại được, project không mất dữ liệu — sequence `Mic Check Auto Test` với đủ 64 clip, duration đúng 100% vẫn còn nguyên sau khi mở lại (autosave/recovery hoạt động tốt).
- **Chưa có bằng chứng nhân quả chắc chắn** giữa `run_mic_check_workflow` và crash — có thể trùng hợp.
- Nhưng khớp với cảnh báo đã biết từ trước trong dự án (`anthropic-skills:premiere-uxp-api` / `references/uxp-api-behaviors.md`): "UXP timeline operations có thể block main thread dù bọc async/await... thao tác nhiều có thể treo UI hoặc crash Premiere. Với batch lớn, cân nhắc UXP Hybrid Plugin (native C++) thay vì thuần JS." — workflow này chạy ~150+ `executeTransaction` liên tiếp trong vài giây (mỗi ảnh = insert + move + set duration = 3 transaction riêng × 64 ảnh).

**Đã giảm thiểu**: thêm delay 80ms giữa mỗi placement trong `batchPlaceClips()` (`plugin/premiereActions.js`, hằng số `BATCH_PLACEMENT_DELAY_MS`) — 64 item chỉ thêm ~5s tổng thời gian chạy, đổi lại giảm tốc độ dồn transaction.

**Live-test lại 2026-09-10 (sau khi thêm delay)**: xoá sequence test cũ, chạy lại `run_mic_check_workflow` với cùng bộ dữ liệu (64 ảnh) — kết quả `placed: 64, failed: []`, **Premiere KHÔNG crash lần này** (cùng tiến trình, vẫn responding bình thường trước/sau khi chạy — xác nhận qua `Get-Process`). Coi như đã ổn định — nếu sau này lại gặp crash với batch lớn hơn nhiều (vd >200 item), cân nhắc chunk batch thành nhóm nhỏ + nghỉ giữa nhóm, hoặc hướng UXP Hybrid Plugin (việc lớn, chỉ làm nếu cần).

## ✅ HOÀN THÀNH — Workflow "Mic Check" tối ưu, Phương án B (2026-09-10)

User yêu cầu tối ưu workflow FFWS (video nền + ảnh theo caption + SRT) thành quy trình A→Z nhanh hơn, không cần Claude cho các lần chạy lại. Đã chốt **Phương án B**: chuẩn hoá input thành JSON/SRT thay vì đọc thẳng `.docx` trong plugin (tránh phải nhúng thư viện unzip vào UXP — xem lý do so sánh Phương án A/B trong lịch sử chat, tóm tắt: A (nhúng JSZip vào plugin) không lag nhưng dễ vỡ vì cấu trúc XML Word không cố định + khó debug trong Premiere; B dùng Node ngoài Premiere, input JSON có schema rõ, ít rủi ro hơn).

### Kiến trúc đã chốt

**Setup 1 lần** (không lặp lại mỗi video):
- **A. (bản Node, đã xong)** `scripts/docx_to_json.js` — đọc `.docx`, xuất CHỈ `cues.json`. Vẫn cần `.srt` chuẩn bị riêng.
- **A2. (bản Python, đã xong, KHUYẾN NGHỊ dùng bản này)** `scripts/docx_to_mic_check.py` — đọc `.docx` bằng `python-docx` (đọc qua Table API thật, bền hơn regex XML của bản Node — tìm header theo NỘI DUNG cell "Time Stamp"/"Player"/"EN"/"Ảnh", không hardcode vị trí dòng), xuất **CẢ 2 FILE cùng lúc** từ cùng 1 nguồn: `<tên>.cues.json` VÀ `<tên>.srt` — đảm bảo 2 file luôn khớp nhau tuyệt đối, **không cần chuẩn bị `.srt` riêng nữa**. Có validate ảnh thiếu/thừa giống bản Node. Live-tested: SRT xuất ra khớp byte-cho-byte 100% với file SRT gốc đã dùng cả buổi (`cmp` xác nhận identical). Cần cài: `pip install python-docx` (đã cài trên máy này qua `py -m pip install python-docx`).
- **B. (KHÔNG CẦN NỮA nếu dùng A2)** `srt_to_json.js` đối chiếu chéo — bỏ vì A2 sinh cả 2 file từ 1 nguồn, không còn nguy cơ lệch.
- **C.** Nút "Mic Check" trong panel (`plugin/index.html` + `plugin/micCheckPanel.js`) — gọi trực tiếp `runMicCheckWorkflow()`/`verifyMicCheckWorkflow()` trong `premiereActions.js`, KHÔNG qua WS/MCP/Claude. **Đã xong + live-tested bởi user qua UI thật.**

### Quy trình mỗi lần chạy (đã hoạt động đầy đủ, live-tested end-to-end 2026-09-10)

1. Chuẩn bị: video nền, ảnh (bao nhiêu cũng được, đặt tên `ảnh N.png` khớp cột "Ảnh N" trong docx), `.docx` — tất cả nằm PHẲNG cùng 1 thư mục (không cần `.srt` riêng).
2. Chạy `python scripts/docx_to_mic_check.py --docx <file.docx> --images <thư mục> --out-dir <cùng thư mục đó>` → ra `<tên>.cues.json` + `<tên>.srt` ngay trong thư mục dự án.
3. Trong Premiere, mở panel Premiere MCP v2 → bấm nút **"Chọn"** ở mục Mic Check, chọn đúng thư mục đó.
4. Panel tự dò và hiện: `✓ cues.json: ...` / `✓ Video nền: ...` (hoặc dropdown nếu >1 file cùng loại, hoặc báo lỗi rõ nếu thiếu cues.json).
5. Điền tên sequence (tự gợi ý sẵn từ tên file), chọn orientation, bấm **"▶ Chạy Mic Check"**.
6. Plugin tự động: tạo sequence 60fps → import media → đặt video nền → đặt toàn bộ ảnh theo cues.json (có delay chống crash) — **live-tested qua UI thật: 64/64 ảnh đặt đúng.**
7. Panel nhắc bước tay duy nhất còn lại: kéo file `.srt` từ Project panel vào 1 caption track trên timeline (đảm bảo không còn caption track cũ nào — vd từ Speech-to-Text tự động — nếu không Premiere có thể giữ track cũ).
8. Sau khi kéo xong, bấm **"✓ Verify"** trong panel — đối chiếu lại toàn bộ ảnh + đếm caption item so với cues.json. **Live-tested qua UI thật: ảnh khớp 100%, caption 65/65 khớp.**

### Trạng thái từng phần

- [x] `scripts/docx_to_json.js` — converter Node.js (bản cũ, vẫn giữ nhưng không còn là đường chính)
- [x] `scripts/docx_to_mic_check.py` — converter Python, xuất cả cues.json + srt cùng lúc, khớp byte-cho-byte với SRT gốc — **đường chính**
- [x] `runMicCheckWorkflow()` + tool MCP `run_mic_check_workflow` — live-tested nhiều lần, không crash
- [x] `verifyMicCheckWorkflow()` + tool MCP `verify_mic_check_workflow`
- [x] Nút "Mic Check" + "Verify" trong panel (`plugin/index.html`, `plugin/micCheckPanel.js`) — chọn 1 thư mục duy nhất, tự dò file, KHÔNG cần Claude/WS/MCP cho các lần chạy lại — **live-tested end-to-end bởi user qua UI thật, hoạt động đúng 100%.**

### Bug đã fix trong lúc build UI panel

`uxpFsPanel.getFolderForOpening is not a function` — API này không tồn tại (đoán nhầm khi viết code, chưa verify). Tên đúng: `require("uxp").storage.localFileSystem.getFolder()`. Đã xác nhận qua probe live prototype thật: chỉ có `getFileForOpening`/`getFileForSaving`/`getFolder`/`getTemporaryFolder`/`getPluginFolder`/`getDataFolder`/`readFromFile`/`writeToFile`.

### Việc còn lại (không chặn, có thể làm sau nếu cần)

- Route B (GUI automation để tự động hoá luôn cả bước kéo SRT) — đã cân nhắc và **không làm**, rủi ro cao hơn lợi ích (xem lịch sử chat mục so sánh Phương án A/B/D cho caption track).
- `move_item_to_bin` vẫn lỗi "Not Enough Parameters" dù API `createMoveItemAction` có thật — chưa tìm ra đúng chữ ký tham số (không chặn workflow Mic Check).

## ✅ Bug lớn phát hiện + fix — `durationSeconds` chưa từng được áp dụng trong `insert_clip`/`overwrite_clip`/`batch_place_clips` (2026-09-10)

Phát hiện khi user yêu cầu "cắt đoạn ảnh thừa cho khớp caption": đối chiếu kỹ **end time** (không chỉ start time như trước giờ vẫn verify) của 64 clip ảnh trên sequence FFWS thấy 49/64 clip dài hơn yêu cầu. Root cause: `insertOrOverwriteClip()` (`plugin/premiereActions.js`) nhận tham số `durationSeconds` nhưng **KHÔNG BAO GIỜ áp dụng nó** — chỉ verify/set đúng `startSeconds` qua `createMoveAction`, còn end time luôn giữ nguyên duration mặc định của project item (vd default still-image duration của Premiere, hoặc duration cũ nếu ghi đè lên clip đã có sẵn cùng tên/vị trí). Bug này tồn tại từ lần đầu implement `insert_clip`/`overwrite_clip` (2026-09-09/10) và ảnh hưởng luôn `batch_place_clips` (kế thừa cùng hàm) — chỉ không bị phát hiện vì các lần verify trước giờ chỉ check `finalStartSeconds`, chưa bao giờ check `finalEnd`.

**Đã fix**: thêm bước 3/3 trong `insertOrOverwriteClip()` — sau khi move về đúng start, gọi `createSetEndAction` để set đúng end time từ `startSeconds + durationSeconds`, có verify read-back thật (throw nếu lệch >0.05s). Đã live-test: sửa lại 49 clip lệch trên sequence FFWS, toàn bộ khớp đúng ngay sau khi fix (verify bằng `createSetEndAction` trực tiếp qua debug probe trước khi đưa vào code chính thức).

**Cần làm tiếp**: bất kỳ workflow nào TRƯỚC 2026-09-10 dùng `insert_clip`/`overwrite_clip`/`batch_place_clips` với `durationSeconds` (đặc biệt ảnh tĩnh) đều có thể bị sai duration — nên re-verify nếu còn dùng kết quả cũ.

**Bug phụ đã fix cùng lúc — idempotency khi gọi lại `overwrite_clip` đúng vị trí cũ**: nếu gọi `overwrite_clip`/`insert_clip`/`batch_place_clips` 2 lần liên tiếp với cùng `itemName` + `startSeconds` (vd chạy lại workflow), lần thứ 2 báo lỗi "KHÔNG xác định được track item mới" — vì Premiere merge overwrite vào track item CŨ đã có sẵn thay vì tạo item mới, khiến cơ chế phát hiện "item mới" (so sánh signature start-time trước/sau) không thấy gì thay đổi. Đã fix: thêm `findExistingItemAtPosition()` làm fallback — nếu không tìm được item "mới", tìm item đã có sẵn đúng tên+vị trí (dung sai 0.05s), coi như đã đúng chỗ, bỏ qua bước move, vẫn chạy tiếp bước set duration. Live-tested: gọi `overwrite_clip` 2-3 lần liên tiếp cùng vị trí với duration khác nhau mỗi lần, verify đều set đúng end time thật, không lỗi.

## ✅ Ưu tiên 0 — Sequence frame rate/timebase — ĐÃ GIẢI QUYẾT, LIVE-TESTED 2026-09-10 (sau khi nâng cấp Premiere 2026)

User yêu cầu: **mọi sequence tạo mới luôn phải là 60fps**. Điều tra 2026-09-10 phát hiện: API duy nhất đọc/set frame rate thật (`SequenceSettings.getVideoFrameRate()`/`setVideoFrameRate()` + `FrameRate.createWithValue()`) chỉ tồn tại từ **Premiere Pro 26.2+** — máy công ty lúc đó chỉ có Premiere 2025 nên hoàn toàn không set/verify được qua script (đã thử cả cách nhân bản template — `createCloneAction` không bảo toàn frame rate, xác nhận không đáng tin).

**User đã nâng cấp lên Premiere Pro 2026.** Sau khi bật Developer Mode cho bản mới + reload plugin, đã implement và **live-test thành công đầy đủ**:
- `get_sequence_settings(sequenceName?)` — đọc fps/ticksPerFrame/resolution thật qua `getVideoFrameRate()`/`getVideoFrameRect()`.
- `set_sequence_frame_rate(fps, sequenceName?)` — set qua `FrameRate.createWithValue()` + `executeTransaction`, **verify read-back thật** (so before/after, throw nếu no-op). Dùng rational chuẩn cho 23.976/29.97/59.94 (`CANONICAL_FPS` map trong `plugin/premiereActions.js`), không so sánh float trực tiếp.
- `create_sequence(name, timebase=60, frameWidth?, frameHeight?)` — viết lại: tạo sequence trắng → gọi `setSequenceFrameRate` ngay → verify. Đã bỏ hẳn cách nhân bản template cũ (không cần nữa, không đáng tin).
- **Live-test thật trên Premiere 2026**: tạo `MCP Test 60fps v2` (1920x1080) → `timebaseApplied:true, actualFps:60`, xác nhận độc lập qua `get_sequence_settings` (`fps:60, ticksPerFrame:4233600000`, đúng công thức `254016000000/60`). Đổi fps 60→23.976 qua `set_sequence_frame_rate` → `beforeFps:60, afterFps:23.976023976023978` đúng như kỳ vọng. Tạo `MCP Test Tiktok 60fps` (1080x1920, custom frame size) → `frameSizeApplied:true`, đúng 60fps.
- **Bonus fix**: phát hiện template `Template Youtube 1920x1080 60fps` thực ra chỉ 23.976fps (tên sai lệch với thực tế, không phải do code) — đã sửa về đúng 60fps thật qua `set_sequence_frame_rate`. `Template Tiktok 1080x1920 60fps` vốn đã đúng 60fps sẵn.

**Chưa test**: đủ toàn bộ dải fps (24, 25, 29.97, 30, 50, 59.94) — mới test 60 và 23.976. Nên test nốt trước khi coi là hoàn toàn ổn định.

## 🟡 SRT → MOGRT caption timeline — VỊ TRÍ hoạt động, TEXT chưa set được (2026-09-10)

Theo `PLAN_MCP_PREMIERE_SRT_TO_TEXT_TIMELINE.docx` (user cung cấp), implement `insert_mogrt_caption` + `srt_to_mogrt_captions` (batch, 1 lệnh MCP xử lý cả file SRT). Live-test trên Premiere 2026:

- **Vị trí/thời lượng: hoạt động đúng, verify thật** — `SequenceEditor.insertMogrtFromPath()` tồn tại, tạo graphic clip thật, nhưng bỏ qua tham số tick (cùng bug họ insert_clip cũ) — đã áp dụng lại pattern chèn tạm → `createMoveAction` về đúng vị trí, test với `Basic Title.mogrt` và `Simple Web Caption.mogrt` đều cho `positionOk: true` chính xác đến 3 chữ số thập phân giây.
- **Set text: KHÔNG hoạt động được** — text layer thật của MOGRT nằm lồng bên trong component `AE.ADBE Graphic Group`, nhưng component này chỉ có API `getParam`/`getParamCount` (param transform chung: Position/Scale/Rotation/Anchor), **không có** `getComponentChain`/`getChildren`/`getChildAtIndex` nào để drill xuống từng text layer con bên trong. Đã test cả `Basic Title.mogrt` lẫn `Simple Web Caption.mogrt`, cùng kết quả. (1 lần probe ban đầu tưởng thấy `AE.ADBE Text` ở top-level chain — hoá ra do track đã có sẵn item cũ từ nhiều lần thử trước, không phải hành vi chuẩn của 1 lần insert sạch — đã tái xác nhận trên sequence hoàn toàn mới, sạch.)
- **Kết luận tạm**: `srt_to_mogrt_captions` hiện dùng được để đặt đúng timing/thời lượng graphic clip theo từng cue SRT, nhưng **text vẫn giữ nguyên mặc định của template** — chưa tự động hoá được nội dung caption qua đường này. Cần điều tra thêm API nào khác (ngoài `TrackItem.getComponentChain()`) có thể set được Essential Graphics text property, hoặc chờ Adobe bổ sung.
- **Đường thay thế đã xác nhận từ trước**: Native Caption backend (`import_srt`) — timing tự động đúng 100% (cùng nguồn SRT), nhưng cần 1 bước kéo tay từ Project panel vào caption track trên timeline (Premiere API không có cách đặt caption track item qua script — xem mục cũ về `CaptionTrack`, class này cũng chỉ có `getTrackItems` để đọc, không có API tạo mới).

## 🔴 SRT → Native Caption Track qua script — KHÔNG khả thi ở kiến trúc hiện tại (2026-09-10)

Theo `PLAN_MCP_PREMIERE_SRT_TO_CAPTION_TRACK_DETAILED.docx` (user cung cấp), đường được khuyến nghị #1 là `Sequence.createCaptionTrack(projectItem, startAtSeconds, Sequence.CAPTION_FORMAT_SUBTITLE)` — **nhưng đây là API ExtendScript**, cần bridge CEP/ExtendScript riêng. Đã probe trực tiếp để kiểm chứng cảnh báo của chính tài liệu ("không nên giả định UXP thuần đã làm được"):

- `Sequence.createCaptionTrack`: **KHÔNG có** trong UXP (xác nhận trực tiếp qua `Object.getOwnPropertyNames(Sequence.prototype)`).
- `SequenceEditor.createCaptionTrack`: **KHÔNG có**.
- `CaptionTrack` class (đọc được qua `sequence.getCaptionTrack(i)`) chỉ có: `getTrackItems`, `setMute`, `getIndex`, `createSetNameAction` — hoàn toàn không có API tạo/insert caption item nào.
- Dự án hiện tại **chỉ có UXP, không có CEP/ExtendScript bridge** (`plugin/manifest.json` chỉ khai báo UXP panel) — muốn dùng đường ExtendScript phải xây thêm 1 extension CEP riêng chạy song song, là thay đổi kiến trúc lớn, và theo ghi chú cũ trong dự án (`anthropic-skills:premiere-uxp-api`) CEP đang dần gãy tương thích trên Premiere 2026, chỉ nên dùng làm fallback tạm + đánh dấu nợ kỹ thuật, không phải nền tảng chính.

**Đã loại thêm 2 phương án** theo `PLAN_MCP_PREMIERE_SRT_CAPTION_TRACK_UXP_2026_REVISED.docx` (bản sửa, cùng ngày):
- **Phương án A — command/menu automation**: đã enumerate TOÀN BỘ top-level module `premierepro` (đầy đủ ~70 class/property) — không có bất kỳ API command/menu execution nào (`Action`/`CompoundAction` chỉ là action-object cho transaction, không phải command dispatcher). **Loại.**
- **Phương án C — generic `insertProjectItemAction` với SRT ProjectItem**: test trực tiếp theo đúng tiêu chí chấp nhận của tài liệu (`sequence.getCaptionTrackCount()` phải TĂNG) — gọi xong không throw nhưng **count không đổi** (1→1). **Loại chính thức, không chỉ vì đoán.**

**Kết luận cuối**: với kiến trúc UXP-only hiện tại (không CEP/ExtendScript), KHÔNG có cách nào tạo Native Caption Track từ SRT hoàn toàn qua script.

**⚠️ Đính chính lần 1 (2026-09-10)**: lúc điều tra ban đầu thấy sequence `FFWS SEA Fall 2026 Week2` có 1 caption track với 65 item, đếm trùng khớp số cue SRT nên tưởng nhầm là kết quả của việc user kéo tay SRT vào timeline. **Sai** — đối chiếu timing cho thấy lệch đều ~0.2s so với SRT thật, tên item `"SyntheticCaption"` — hoá ra đó là caption **Speech-to-Text tự động** của Premiere (phân tích audio thật) còn sót lại từ trước, che mất kết quả thật.

**✅ Xác nhận cuối cùng (2026-09-10, sau khi user xoá track cũ + kéo lại SRT)**: sau khi xoá hẳn caption track cũ (Speech-to-Text) rồi kéo lại đúng file `FFWS_SEA_FALL_2026_Week2.srt` từ Project panel vào timeline, đọc lại timing thật:

| Cue | SRT gốc | Caption thật trên timeline | Lệch |
|---|---|---|---|
| 1 | 0.2s→1.333s | 0.2s→1.317s | ~1 frame (60fps) |
| 2 | 1.4s→2.2s | 1.4s→2.2s | khớp tuyệt đối |
| 3 | 2.633s→3.133s | 2.617s→3.117s | ~1 frame |
| 4 | 3.133s→3.366s | 3.117s→3.35s | ~1 frame |

Khớp đúng với SRT (chênh lệch ~0.016s = đúng 1 frame ở 60fps, do Premiere làm tròn caption về frame boundary — bình thường, không phải lỗi). **Kéo tay SRT → caption track hoạt động đúng và đáng tin cậy**, chỉ cần đảm bảo không có caption track cũ nào (vd từ Speech-to-Text) còn tồn tại trước khi kéo, nếu không Premiere có thể giữ nguyên track cũ thay vì tạo/ghi đè bằng dữ liệu SRT mới.

**Quyết định cuối**: dùng đường kéo tay làm chuẩn cho native caption track — đã live-test xác nhận hoạt động đúng. Không cần GUI automation hay CEP bridge. Có thể tiếp tục hướng MOGRT (mục phía trên) nếu sau này cần tự động hoá 100% không cần thao tác tay, nhưng không phải ưu tiên hiện tại vì đường kéo tay đã đủ tin cậy.

**Ước lượng thời gian nếu sau này muốn thử tiếp** (2026-09-10, chưa làm — ghi lại để tham khảo):
- **Route D — XML/FCPXML interchange**: ~1-3 giờ cho phần nghiên cứu (export sequence có caption thật → đọc cấu trúc XML → thử sửa tay thêm 2-3 caption → import lại xem có tạo caption track không). Rẻ để thử, biết kết quả nhanh — nếu không work thì dừng ngay, nếu work mới cần thêm vài giờ viết generator SRT→XML.
- **Route B — GUI automation**: **ĐÃ kiểm tra khả thi thật (2026-09-14, live spike ~15 phút, không phải suy đoán nữa)**. Dùng `System.Windows.Automation` (.NET) enumerate cây UI Automation của cả cửa sổ Premiere Pro lẫn UXP Developer Tool đang mở thật:
  - **Premiere Pro**: xác nhận đúng lo ngại — dùng framework UI riêng của Adobe (class "DroverLord - Window Class"), cây UI Automation chỉ thấy vài Pane/Window rỗng tên, KHÔNG lộ Project panel/Timeline/nút bấm nào ra ngoài dưới dạng control có tên/loại. Click theo AutomationElement (tìm theo tên) **không khả thi**.
  - **UXP Developer Tool**: app Electron (`Chrome_WidgetWin_1`) nhưng render qua "Intermediate D3D Window" (bề mặt GPU thô), cũng KHÔNG lộ children — Electron mặc định tắt accessibility tree trừ khi có screen reader đang chạy (chưa thử bật, có thể là hướng research thêm nếu cần).
  - **Kết luận**: click/gõ theo UI Automation Element **không dùng được cho cả 2 app**. Muốn tự động hoá GUI thật (vd nút Load trong UDT, kéo SRT vào Caption Track) chỉ còn cách **click theo toạ độ cố định** (qua PowerShell + Win32 API `SetCursorPos`/`mouse_event`/`SendKeys` — đã verify hoạt động, xem `Claude_Dieu_Khien_May_Tinh_PowerShell.docx` ở gốc repo) — dễ vỡ khi đổi kích thước cửa sổ/zoom/layout đúng như lo ngại ban đầu, cần tính toán lại toạ độ mỗi khi layout đổi.
  - **Thử coordinate-click thật với UDT (2026-09-14, sau khi viết mục trên) — thêm 1 giới hạn nghiêm trọng mới phát hiện**: `Graphics.CopyFromScreen` (GDI) **không bắt được nội dung cửa sổ UDT một cách đáng tin cậy** vì UDT render qua D3D ("Intermediate D3D Window") — nhiều lần ảnh chụp cho thấy cửa sổ UDT "biến mất" dù `EnumWindows`+`IsWindowVisible()` (Win32 thuần) xác nhận nó vẫn tồn tại/visible thật. Đã loại trừ hết nguyên nhân khác trước khi kết luận (toạ độ đúng — verify qua `GetCursorPos`; focus đúng — verify qua `GetForegroundWindow()`; không có dialog con nào bật lên sau click — verify qua `EnumWindows` trước/sau). Nghĩa là nguyên tắc an toàn "chụp màn hình xác nhận trước khi click" **không dùng được cho app render D3D** như UDT — cần API chụp màn hình khác (vd `Windows.Graphics.Capture`) mới đáng tin, chưa làm.
  - **Quyết định giữ nguyên**: đường kéo tay SRT + tự bấm Load trong UDT vẫn là chuẩn. GUI automation toạ độ-cố-định cho UDT cụ thể **tạm dừng** — không đủ cách verify an toàn trước khi click, rủi ro cao hơn lợi ích ở trạng thái hiện tại. Có thể thử lại nếu sau này có API chụp màn hình hỗ trợ D3D tốt hơn.

## ✅ Ưu tiên 1 — `insert_clip` / `overwrite_clip` đặt sai vị trí — ĐÃ FIX, LIVE-TESTED 2026-09-10

Core tool cho use case gốc (đặt ảnh/clip lên timeline theo time range).
- Root cause: `SequenceEditor.createInsertProjectItemAction`/`createOverwriteItemAction` đặt được clip thật nhưng **bỏ qua hoàn toàn** tham số vị trí — luôn đặt vào ~1 giờ trừ 1 frame.
- Các cách sửa cũ thất bại vì dùng nhầm API: `createSetInPointAction`/`createSetOutPointAction` chỉnh **source trim** (`getInPoint`/`getOutPoint` = "relative to start time of the project item"), không phải vị trí timeline.
- **API đúng** (từ `@adobe/premierepro` type declarations chính thức): `VideoClipTrackItem`/`AudioClipTrackItem.createMoveAction(tickTime)` (dịch theo **offset**) + `getStartTime()`/`getEndTime()` ("relative to the sequence start time" — vị trí thật trên timeline).
- Implement trong `plugin/premiereActions.js` (`insertOrOverwriteClip`): đặt tạm → tìm đúng track item mới tạo (khớp tên projectItem + startTime chưa từng thấy trước) → tính offset thật → `createMoveAction(offset)`. Áp dụng cho cả video lẫn audio track item.
- **LIVE-TESTED 2026-09-10** qua WS controller trực tiếp (không qua UI): gọi `insert_clip` và `overwrite_clip` — đọc lại `getStartTime()` thật từ Premiere sau khi move, khớp chính xác với `startSeconds` yêu cầu.

## ✅ Ưu tiên 2 — Các lỗi tên API — ĐÃ FIX, LIVE-TESTED 2026-09-10

- **`create_bin`** — `parent.createBin` không tồn tại. Fix: `FolderItem.cast(parent).createBinAction(name, makeUnique)` qua `executeTransaction` (cùng pattern action-based như `duplicateSequence`). **Live-tested**: tạo `MCP Test Bin` thành công, xác nhận bằng diff danh sách item.
- **`select_all_clips` / `select_clips_in_range`** — 2 bug chồng nhau, cả 2 đã fix:
  1. `getTrackItemsInRange()` dùng `item.getInPoint()`/`getOutPoint()` (source trim) để xác định clip nằm trong range — sai, đúng phải `getStartTime()`/`getEndTime()` (cùng loại bug gốc của `insert_clip` trước khi fix). Ảnh hưởng luôn cả fallback path của `ripple_delete`/`cut_clip_at_time`.
  2. `sequence.createSelectItemsAction` **không tồn tại** trong Sequence prototype thật (bị nuốt lỗi trong try/catch rỗng → tool báo `selected: N` giả dù không chọn được gì, `get_selected_clips` vẫn báo rỗng). API đúng: `sequence.setSelection(trackItems)` gọi trực tiếp, không qua `executeTransaction`.
  - **Live-tested**: `select_all_clips` sau khi `insert_clip` 1 clip → báo `selected: 1` và **có xác nhận thật** (khác lần test trước fix).
- **`move_item_to_bin`** — vẫn LỖI, đã đào sâu 2026-09-10 nhưng chưa xong: `getChildCount`/`getChildAtIndex` đã sửa đúng (`getItems()`), và xác nhận `FolderItem.createMoveItemAction` **có thật** trên prototype (live-test) — nhưng gọi với `(sourceItem)` báo `"Not Enough Parameters"` từ native layer, thử thêm `([sourceItem], false)`/`(sourceItem, false)` đều fail cùng lỗi. `createMoveItemAction.length` báo 0 (không đáng tin, hàm native). Chưa tìm ra chữ ký đúng — cần điều tra thêm (có thể cần 1 object `ProjectItemSelection` thay vì item trực tiếp, class này tồn tại nhưng chưa rõ cách khởi tạo).
- **`get_project_info` bins list, `import_files` binName lookup** — cùng bug `getChildCount`/`getChildAtIndex`, đã sửa sang `getItems()`. **CHƯA LIVE-TEST riêng** (nhưng cùng pattern đã xác nhận đúng ở `create_bin`).
- **`get_clip_metadata`/`set_clip_metadata`** — `projectItem.getXMPMetadata` không tồn tại. **CHƯA tìm ra API đúng** — docs Adobe UXP hiện tại không liệt kê method XMP metadata nào trên `ProjectItem`. Code giờ báo lỗi rõ kèm liệt kê toàn bộ prototype thật của `projectItem` (khi gọi sẽ thấy list) thay vì lỗi mù mờ — cần gọi thử `get_clip_metadata` với 1 clip đang chọn để xem danh sách method thật, rồi tra xem có method nào khác đảm nhiệm XMP không (có thể metadata phải qua 1 class riêng chưa được expose ở `ppro.*`, hoặc thật sự chưa có API — cần điều tra thêm).
- **`move_clip`** — sửa dùng `createMoveAction` từ 2026-09-09. **✅ LIVE-TESTED 2026-09-14** (sau khi fix `select_all_clips` thật): chọn clip qua `select_clips_in_range`, gọi `move_clip(startSeconds:3)`, `get_selected_clips` xác nhận `startSeconds:3` đúng.

## ✅ Bug fix — `get_sequence_info` báo sai frameRate (2026-09-14)

`_cmdGetSequenceInfo` trong `plugin/mcpBridge.js` (dùng bởi `get_status`/`get_sequence_info`) hardcode `frameRate = 25` mặc định và **không bao giờ gán giá trị thật** — code cũ chỉ nhét kết quả `getVideoFrameRate()` vào 1 object `_fpsDebug` để probe (sót lại từ lúc điều tra Ưu tiên 0), rồi trả về luôn giá trị mặc định 25 không đổi. Phát hiện khi user thấy `get_status` báo `frameRate: 25` trong khi `_fpsDebug.getVideoFrameRateValue` lại đúng là `23.976...`.

**Đã fix**: dùng đúng pattern đã xác nhận chuẩn ở `getSequenceSettings()` (`plugin/premiereActions.js`) — ưu tiên `settings.getVideoFrameRate().value` (chỉ có từ Premiere 26.2+), fallback tính từ `sequence.getTimebase()` cho bản cũ hơn. Trả thêm `fpsSource` (`"getVideoFrameRate"` | `"timebaseGuess"` | `"error: ..."`) để biết đường nào được dùng. Bỏ hẳn field debug `_fpsDebug` (không cần probe nữa, API đã xác nhận rõ).

**Live-tested**: `get_sequence_info` trên "Sequence 01" (1080x1920) → `frameRate: 60, fpsSource: "getVideoFrameRate"` — đúng thật, không còn báo sai 25/làm tròn.

## ✅ Bug fix lớn — `select_all_clips`/`select_clips_in_range` báo "selected:N" giả — ĐÃ FIX THẬT, LIVE-TESTED (2026-09-14)

Bug ghi nhận trước đó (2026-09-10) tưởng đã fix bằng `sequence.setSelection(trackItems)` (mảng thô) hoá ra **vẫn sai** — live-test lại hôm nay trên `Test MCP.prproj` với 1 clip thật trên timeline vẫn báo `selectError: "Illegal Parameter type"` (dễ nhầm là do timeline rỗng, đã loại trừ bằng debug field đếm track/item thật trước khi kết luận).

**Root cause thật**: `sequence.setSelection()` **không nhận mảng `TrackItem[]` thô**. API đúng (tìm ra bằng cách probe trực tiếp prototype của object `sequence.getSelection()` trả về): lấy `TrackItemSelection` hiện tại qua `sequence.getSelection()` (trả về object rỗng hợp lệ kể cả khi chưa chọn gì, không throw), gọi `.addItem(item)` cho từng track item, rồi mới `sequence.setSelection(selectionObj)` — truyền object đó, không phải mảng.

**Đã fix**: thêm helper `_buildSelectionObject(sequence, items)` dùng chung cho `selectClipsInRange`/`selectAllClips` (`plugin/premiereActions.js`). Cũng dọn `deselectAllClips` — bỏ nhánh `createSelectItemsAction` chết (API không tồn tại, đã biết từ trước) chỉ giữ `sequence.clearSelection()` trực tiếp.

**Live-tested đầy đủ trên `Test MCP.prproj`** (import `icon.png`, đặt lên timeline qua `insert_clip`):
- `select_all_clips` → `selected:1`, xác nhận thật qua `get_selected_clips` (Premiere thực sự chọn clip).
- `deselect_all_clips` → `done:true`.
- `select_clips_in_range(0,5)` → `selected:1` đúng clip trong range.
- `move_clip(startSeconds:3)` (dùng clip đang chọn từ bước trên) → **unblock được, live-tested lần đầu** — `get_selected_clips` xác nhận `startSeconds:3` đúng.

**Bài học lặp lại lần 2**: lỗi bị nuốt/hiểu nhầm dễ đổ lỗi sai nguyên nhân (tưởng "timeline rỗng" hoặc "code cũ đã đúng rồi") — phải thêm debug field đếm thật (track count, item count, kiểu dữ liệu tham số) trước khi kết luận, đúng bài học đã ghi ở TODO cũ nhưng lần này áp dụng triệt để hơn (probe cả prototype instance thay vì chỉ đoán tên method).

## ✅ Bug fix — `trim_clip` dùng nhầm SOURCE TRIM API, crash native "nullptr" — ĐÃ FIX, LIVE-TESTED (2026-09-14)

Cùng lớp bug đã fix ở `insert_clip`/`overwrite_clip` (Ưu tiên 1): code cũ dùng `createSetInPointAction`/`createSetOutPointAction` (source trim, `getInPoint`/`getOutPoint` = "relative to start time of the project item"), trong khi mô tả tool là "chỉnh in/out theo **sequence time**" (vị trí timeline). Live-test trên clip ảnh tĩnh (`icon.png`, start=3s end=13s) gọi `trim_clip(inSeconds:3, outSeconds:8)` → crash native **"A nullptr was dereferenced"** (still image không có in/out point hợp lệ theo source trim ở giá trị đó).

**Đã fix**: probe trực tiếp prototype của track item (`clip`) — xác nhận có `createSetStartAction`/`createSetEndAction`, đối xứng đúng với `getStartTime()`/`getEndTime()` (API vị trí timeline đã xác nhận chuẩn nhiều lần trước, dùng ở `insertOrOverwriteClip`). Đổi `trim_clip` sang dùng 2 action này thay vì cặp In/OutPoint.

**Live-tested**: clip 3s→13s (duration 10s) → `trim_clip(inSeconds:3, outSeconds:8)` → `trimmed:true, newInSeconds:3, newOutSeconds:8`, xác nhận độc lập qua `get_selected_clips`: `startSeconds:3, durationSeconds:5` đúng thật.

## ✅ Bug fix — `duplicate_clip` báo sai `expectedNewStartSeconds` + cảnh báo hành vi overlap (2026-09-14)

`duplicateClip()` tính `originalStart` bằng `clip.getInPoint()` (source trim, thường mặc định ~3600s cho clip ảo/still image) thay vì `clip.getStartTime()` (vị trí timeline) — cùng lớp bug getInPoint/getStartTime đã gặp nhiều lần. Live-test: `duplicate_clip(offsetSeconds:2)` báo `expectedNewStartSeconds: 3601.98` dù clip gốc ở giây 3 trên timeline. Đã fix dùng `getStartTime()`.

**Phát hiện thêm khi verify qua `get_selected_clips`**: `createCloneTrackItemAction` với `offsetSeconds` NHỎ HƠN duration clip gốc (bản sao đè lên chính nó) sẽ **cắt/chia clip gốc thành nhiều mảnh** thay vì giữ nguyên clip gốc + thêm bản sao độc lập — live-test cho ra 3 track item từ 1 clip gốc (3-8s) + 1 duplicate (offset 2s), kết quả thật là 3 mảnh `[3-5s][5-10s][10-13s]` thay vì 2 clip riêng biệt như kỳ vọng. Đã thêm cảnh báo rõ trong response field `note`: dùng `offsetSeconds >= duration` clip gốc hoặc đổi track (`videoTrackOffset`) để tránh làm hỏng clip gốc ngoài ý muốn. Không phải bug code (đúng là hành vi native của `createCloneTrackItemAction` khi overlap) — chỉ documentation gap trước đó.

## 🔴 CHƯA GIẢI QUYẾT — `delete_clip`/`ripple_delete` hoàn toàn không hoạt động (2026-09-14)

Live-test trên `Test MCP.prproj` (3 clip ảnh tĩnh thật trên timeline): CẢ 2 tool đều lỗi.

- **`delete_clip(ripple:false)`**: nhánh chính `clip.createRemoveAction()` — method này **KHÔNG tồn tại** trên TrackItem (đã xác nhận qua probe prototype trực tiếp, xem mục fix `trim_clip` phía trên — danh sách đầy đủ method thật không có `createRemoveAction`). Fallback `clip.remove(false, false)` cũng **KHÔNG tồn tại** (`clip.remove is not a function`). Cả 2 API mà code cũ giả định đều sai.
- **`delete_clip(ripple:true)`**: nhánh QE DOM (`qeSeq.rippleDelete`) thất bại âm thầm (lỗi bị nuốt trong catch rỗng — nợ kỹ thuật cũ), fallback `clip.remove(true, false)` cũng lỗi tương tự.
- **`ripple_delete`**: cùng gốc — dùng `item.remove(true, false)` không tồn tại, QE DOM cũng không thành công. Trả về `removed:false` thay vì throw (do catch rỗng trong vòng lặp), dễ nhầm là "không tìm thấy clip" dù thực ra clip có thật.

**Đã điều tra tìm API đúng nhưng CHƯA RA**: probe trực tiếp `SequenceEditor` prototype (giống cách tìm ra `createRemoveItemsAction` cho bin ở `move_item_to_bin`) → xác nhận có `SequenceEditor.createRemoveItemsAction`, nhưng thử **9 chữ ký tham số khác nhau** (số lượng tham số 1-3, thứ tự `(selection, ripple, alignToVideo)` / `(ripple, alignToVideo, selection)` / mảng thô thay vì `TrackItemSelection`, `clip` trực tiếp...) đều báo `"Not Enough Parameters"` (thiếu tham số) hoặc `"Illegal Parameter type"` (sai kiểu) — không tìm ra tổ hợp đúng. `Track` prototype (`getVideoTrack(i)`) cũng không có method xoá nào (`getTrackItems`/`setMute`/`getIndex` chỉ đọc).

**Cần làm tiếp**: tìm tài liệu Adobe UXP chính thức cho `SequenceEditor.createRemoveItemsAction` (không có trong bất kỳ file nào của repo này — đã grep toàn bộ), hoặc thử thêm tổ hợp tham số khác (vd `TrackItemSelection` built khác cách, hoặc method cần gọi qua `project.executeTransaction` context khác). Cho tới khi tìm ra, **`delete_clip`/`ripple_delete` không dùng được qua script** — xoá clip vẫn phải làm tay trong Premiere.

**Dọn dẹp còn nợ do bug này**: 3 clip test `icon.png` (3-5s, 5-10s, 10-13s trên `Test MCP.prproj` V1) không xoá được qua MCP — cần xoá tay.

## ✅ 3 BUG LỚN CUỐI CÙNG ĐÃ FIX — nhờ audit 5 repo GitHub tham khảo (2026-09-14)

Theo yêu cầu user, đã audit 5 repo GitHub MCP Premiere khác (`hetpatel-11/Adobe_Premiere_Pro_MCP`, `leancoderkavy/premiere-pro-mcp`, `ayushozha/AdobePremiereProMCP`, `antipaster/Adobe-Premiere-Pro-MCP`, `nepfaff/premiere-pro-mcp`) + repo tham khảo `CaYatur/PremiereProMCP` + **quan trọng nhất: `AdobeDocs/uxp-premiere-pro-samples`** (sample chính thức của Adobe — nguồn xác thực, override mọi suy luận từ repo bên thứ 3). Báo cáo đầy đủ tại `AUDIT_5_REPOS.md` (gốc repo). Tìm ra fix UXP-native thật cho cả 3 vấn đề đã bí lâu:

**1. `delete_clip`/`ripple_delete` — FIX + LIVE-TESTED.** API đúng từ sample `sequenceEditor.ts` của Adobe: `sequenceEditor.createRemoveItemsAction(trackItemSelection, ripple, mediaType)` — **3 THAM SỐ**, thiếu tham số thứ 3 (`ppro.Constants.MediaType.VIDEO`/`AUDIO`) là lý do mọi lần thử trước (kể cả 9 tổ hợp đã thử) đều lỗi "Not Enough Parameters"/"Illegal Parameter type". `trackItemSelection` lấy qua `_buildSelectionObject()` (helper đã có sẵn từ fix `select_all_clips`). Đã viết lại `deleteClip()` và `rippleDelete()` trong `plugin/premiereActions.js`, bỏ hết nhánh QE DOM/`clip.remove()` chết. Live-test: xoá thường (`ripple:false`) và ripple thật (`ripple:true`, clip sau tự dịch trái đúng từ 5s→2s) đều đúng, verify qua `get_selected_clips`.

**2. `move_item_to_bin` — FIX + LIVE-TESTED.** API đúng từ sample `projectPanel.ts`: `createMoveItemAction(itemToMove, destinationFolderCast)` — **2 THAM SỐ** (item cần di chuyển + folder đích đã `ppro.FolderItem.cast()`), gọi trên `rootItem` (không phải trên folder đích như code cũ đoán). Lỗi "Not Enough Parameters" trước đây đúng nghĩa đen — code cũ chỉ truyền 1 tham số. Live-test: tạo bin `Test Move Bin`, move `icon.png` vào, verify qua `get_project_info`.

**3. `get_clip_metadata`/`set_clip_metadata` — FIX + LIVE-TESTED.** XMP metadata KHÔNG nằm trên `ProjectItem` (đúng như đã xác nhận trước đây không tìm thấy) mà nằm trên namespace tĩnh riêng `ppro.Metadata`: `ppro.Metadata.getXMPMetadata(projectItem)` / `ppro.Metadata.createSetXMPMetadataAction(projectItem, xmpString)`. Sau khi đổi API, phát hiện thêm 1 bug phụ trong code write cũ: chèn thẳng `<dc:field>` vào `rdf:Description` có sẵn nhưng node đó KHÔNG khai báo namespace `xmlns:dc` → Premiere âm thầm bỏ qua field khi lưu (API không báo lỗi nhưng field không thật sự lưu). Fix: tạo `rdf:Description` riêng có khai báo `xmlns:dc="http://purl.org/dc/elements/1.1/"`, Premiere tự merge vào node cũ (tự thêm xmlns:dc vào node gốc luôn). Phát hiện thêm bug đọc: `dc:description` theo chuẩn XMP là Language Alternative (`<dc:description><rdf:Alt><rdf:li xml:lang="x-default">giá trị</rdf:li></rdf:Alt></dc:description>`), không phải text phẳng như `dc:director` — regex đọc cũ chỉ bắt được text phẳng, đã thêm regex phụ bắt cấu trúc lồng `rdf:Alt/rdf:li`. Live-test: set `description`+`director`, đọc lại đúng cả 2, xem raw XMP xác nhận Premiere đã merge namespace đúng.

**Bài học lớn nhất phiên này**: nghiên cứu tham khảo repo cộng đồng + đặc biệt **sample chính thức Adobe** hiệu quả hơn nhiều so với tự đoán chữ ký tham số qua thử-sai — 3 bug tồn đọng lâu nhất của dự án (đã từng thử 9+ tổ hợp tham số cho riêng `delete_clip`) đều giải quyết được trong 1 lần audit có định hướng rõ ràng (biết chính xác cần tìm gì).

**Còn lại KHÔNG giải quyết được (đã audit xác nhận là giới hạn thật của cả hệ sinh thái, không phải do thiếu tìm kiếm)**:
- MOGRT text content (`insert_mogrt_caption`/`srt_to_mogrt_captions`) — không repo nào kể cả sample Adobe có cách set text Essential Graphics qua UXP thuần.
- Native caption track tạo qua script — xác nhận lại là ExtendScript-only, sample Transcript của Adobe (`ppro.Transcript.*`) chỉ có import/export JSON transcript, không có API tạo Caption Track.
- `cut_clip_at_time` cần QE DOM — xác nhận không có repo UXP-first nào tránh được nhu cầu QE DOM cho thao tác cắt/trim nâng cao; chấp nhận giữ QE DOM cho riêng tool này.

## 🆕 Đề xuất tool mới từ audit 5 repo (chưa code, ưu tiên thấp/trung bình)

Từ mục "Capabilities we're missing entirely" trong `AUDIT_5_REPOS.md` — không urgent, ghi lại để cân nhắc sau:
- **Proxy media management** (create/attach/toggle proxy) — antipaster + ayushozha có, mình chưa có tool nào tương đương. Ưu tiên thấp.
- **Export interchange formats** (`export_as_fcpxml`/`export_as_aaf`/`export_as_omf`) — hetpatel-11 + sample Adobe official hỗ trợ AAF/FCPXML/OTIO, mình chỉ có `export_as_xml` (Premiere native XML). Cân nhắc nếu cần trao đổi project với DaVinci/FCP/Avid.
- **`batch_set_metadata`** (đổi metadata hàng loạt nhiều clip) — sample `metadata-handler` chính thức Adobe có logic `batchUpdate.js` — nên khai thác vì `get/set_clip_metadata` đã fix xong (2026-09-14). Ưu tiên trung bình.
- **`create_project_checkpoint`/`restore_checkpoint`** — CaYatur có pattern lưu snapshot trước thao tác rủi ro rồi cho phục hồi — hữu ích để bọc quanh `delete_clip`/`ripple_delete` vừa fix, giảm rủi ro thao tác sai. Ưu tiên trung bình.
- **Đã verify KHÔNG có gap**: scene/silence detection (hetpatel-11, ayushozha có tương tự) — mình đã có `detect_scene_edits`/`detect_silence_regions`/`remove_silence_gaps`, chỉ cần test chứ không cần tool mới.

## ✅ Quyết định kiến trúc — giữ UXP-only, KHÔNG hybrid CEP (2026-09-14)

User hỏi kỹ UXP vs CEP vs .ccx trước khi quyết định. Tóm tắt (chi tiết đầy đủ trong Claude memory `references/uxp-vs-cep-capabilities.md` + `projects/premiere-mcp.md`):

- **.ccx không phải công nghệ khác** — chỉ là file đóng gói CÙNG code UXP (qua nút Package trong UXP Developer Tool). Không có live-reload như UDT+Watch — mỗi lần fix phải Package lại + cài lại. Dùng .ccx khi code đã ổn định để phân phối, không phải vòng lặp sửa lỗi hàng ngày.
- **CEP làm được 3 việc UXP không làm được** (xác nhận qua audit 4 repo cộng đồng): tạo native caption track (`Sequence.createCaptionTrack`, ExtendScript-only), add/delete/lock track (leancoderkavy+hetpatel expose qua CEP+QE DOM), có thể cả set text MOGRT (ayushozha claim, chưa xác nhận chắc là UXP thật hay vẫn cần CEP).
- **Quyết định: KHÔNG làm hybrid UXP+CEP.** Lý do: (1) CEP đang bị Adobe khai tử dần, (2) thêm 1 bridge = thêm phức tạp bảo trì cho chỉ 2-3 tính năng, (3) bản kế hoạch rebuild cũ cũng khuyến nghị CEP chỉ là "reference", không phải kiến trúc mục tiêu. Nếu sau này thật sự cần, làm CEP extension riêng biệt tối giản (như Mic Check đã tách riêng), không hợp nhất vào plugin UXP chính.
- **Copy code từ 4 repo đã audit (MIT license)**: được phép về pháp lý (giữ notice bản quyền), nhưng PHẢI live-test lại trên máy mình — không tin claim "verified" của họ (bài học lặp lại nhiều lần trong dự án này).

## ✅ Batch tool mới từ AUDIT_MASTER_TOOL_LIST.md — ĐÃ LIVE-TEST ĐẦY ĐỦ 9/9, 3 BUG FIX MỚI (2026-09-14)

Sau restart Claude, live-test toàn bộ 9 tool mới trên sequence test sạch (`MCP Tool Test 2026-09-14`, tạo riêng trong `Test MCP.prproj` để không đụng sequence thật — user xác nhận data trong file này an toàn để test).

**Kết quả — 9/9 tool hoạt động đúng sau khi fix 2 bug phát sinh:**
- `list_sequence_tracks`, `get_track_info`, `rename_track` — đúng, verify read-back thật (`actualName` khớp).
- `roll_edit` — đúng, verify `actualLeftEnd`/`actualRightStart` khớp thật (test 2 clip liền kề 0-5s/5-10s, dời điểm cắt 5s→6s → ra đúng 0-6s/6-10s).
- `save_project` — đúng, `saved:true`.
- `save_project_as` — đúng, nhưng **lưu ý hành vi**: giống Premiere thật, sau khi Save As, project ĐANG MỞ chuyển hẳn sang file mới (`get_project_info` xác nhận `projectPath` đổi) — không phải "lưu bản sao rồi vẫn ở file cũ". Nếu dùng tool này, project gốc sẽ không còn là project active nữa.
- `get_keyframes`, `get_value_at_time`, `set_keyframe_interpolation`, `remove_keyframe`, `remove_keyframe_range` — đúng SAU KHI fix 2 bug dưới đây (trước khi fix, `get_keyframes` báo đúng `count:0` vì keyframe thật sự chưa từng được tạo — không phải bug của riêng nó).

### 🐛 Bug 1 (ĐÃ FIX) — `set_effect_param(timeSeconds=...)` không tạo keyframe thật, chỉ ghi đè giá trị tĩnh

Phát hiện khi verify chéo: set 2 "keyframe" (0s=10, 3s=50) qua `set_effect_param`, nhưng `get_keyframes` báo `count:0` và `get_value_at_time` tại MỌI thời điểm đều trả về 50 (giá trị set sau cùng) — chứng tỏ không có keyframe thật, chỉ là static value bị ghi đè liên tục.

**Root cause**: `setEffectParam()` (`plugin/premiereActions.js`) gọi thẳng `createAddKeyframeAction` mà **thiếu bước bật `param.createSetTimeVaryingAction(true)`** trước đó — không bật "time-varying" (stopwatch) thì add keyframe chỉ set giá trị tĩnh, không tạo animation thật. Pattern đúng đã có sẵn từ code Beat Shake cũ trong cùng file (dòng ~1216) nhưng `setEffectParam` (viết sau, dùng cho tool `set_effect_param` generic) không áp dụng.

**Đã fix**: thêm `if (timeSeconds != null) compoundAction.addAction(param.createSetTimeVaryingAction(true));` trước khi add keyframe, chỉ khi có `timeSeconds` (giữ nguyên hành vi static-set khi không truyền).

**Live-tested lại sau fix**: set lại 2 keyframe (0s=10, 3s=50) → `get_keyframes` trả đúng `count:2` với giá trị khớp; `get_value_at_time(1.5s)` = 30 (đúng nội suy linear giữa 10 và 50).

**⚠️ Ảnh hưởng ngược**: bug này tồn tại từ khi `set_effect_param` được viết (trước 2026-09-14) — nghĩa là **MỌI lần dùng `set_effect_param` với `timeSeconds` trước ngày fix này đều KHÔNG tạo keyframe thật**, kể cả khi tool báo `set:true` + `actualValueReadBack` đúng (vì đọc lại giá trị tĩnh tại đúng thời điểm đó vẫn khớp, dễ đánh lừa). Nếu có workflow cũ dựa vào animation/keyframe qua `set_effect_param`, cần chạy lại.

### 🐛 Bug 2 (ĐÃ FIX) — `remove_keyframe` crash "start time should be less than stoptime"

`removeKeyframe()` gọi `param.createRemoveKeyframeRangeAction(atTick, atTick, true)` — truyền CÙNG 1 tick cho start và end để xoá đúng 1 keyframe tại 1 thời điểm, nhưng API native đòi `start < stop` NGHIÊM NGẶT, không chấp nhận range rỗng/bằng nhau.

**Đã fix**: pad ±1ms quanh thời điểm cần xoá (`secondsToTick(timeSeconds + clipInPoint.seconds ± 0.001)`) — nhỏ hơn nhiều khoảng cách 1 frame thực tế ở mọi fps thường dùng nên chỉ trúng đúng keyframe mục tiêu, không ăn nhầm keyframe lân cận.

**Live-tested lại sau fix**: xoá keyframe tại 3s → `countBefore:2, countAfter:1` đúng. `remove_keyframe_range(2s→5s)` cũng test kèm (dùng chung pattern range thật, không bị bug này) → xoá đúng 1/1 keyframe trong khoảng, giữ lại keyframe ở 0s ngoài khoảng.

### ✅ Bug 3 (ĐÃ FIX, LIVE-TESTED) — `slip_edit` dịch cả VỊ TRÍ timeline thay vì chỉ dịch nguồn (source)

Mô tả tool: "dịch in/out điểm nguồn... GIỮ NGUYÊN vị trí và thời lượng trên timeline". Live-test lần đầu (ảnh tĩnh `icon.png`, 0-6s) → `slip_edit(offsetSeconds:1)` dịch clip sang **1-6s** — sai.

**Live-test lại với clip VIDEO THẬT** (`keo BG ingame.mp4`, không phải ảnh tĩnh) để loại trừ khả năng bug chỉ riêng still-image: cùng hành vi sai xảy ra — clip 0-10.07s → `slip_edit(offsetSeconds:1)` → dịch sang 1-11.07s. **Xác nhận đây là bug CHUNG của `createSetInPointAction`/`createSetOutPointAction`**, không phải riêng ảnh tĩnh: 2 API này không chỉ đổi source trim như tài liệu ngầm định, mà còn dịch luôn `getStartTime()`/`getEndTime()` (vị trí timeline) đúng bằng offset.

**Đã fix**: sau khi set In/Out point, đọc lại `getStartTime()`, tính độ lệch (`driftSeconds`) so với vị trí gốc trước khi set, rồi gọi `createMoveAction(-driftSeconds)` để bù lại đúng vị trí ban đầu (dùng lại pattern offset-based đã verify đúng nhiều lần ở `insert_clip`/`move_clip`). Trả thêm field `actualStartSeconds` + `driftCompensatedSeconds` để verify.

**Live-tested lại sau fix** (clip video thật): gọi `slip_edit(offsetSeconds:1)` 2 lần liên tiếp trên clip đang ở vị trí 1-11.07s → `driftCompensatedSeconds:1` (đúng bằng độ lệch bị bù), `actualStartSeconds:1` (không đổi), verify độc lập qua `get_selected_clips`: `startSeconds:1, durationSeconds:10.067` — vị trí/thời lượng giữ nguyên hoàn toàn đúng như kỳ vọng, chỉ source in/out dịch (1→2s, 11.07→12.07s).

### Ghi chú phụ (không chặn, phát hiện tình cờ lúc test)

- `search_effects` lỗi `"Cannot read properties of null (reading 'toLowerCase')"` khi gọi với query "gaussian blur" — bug riêng, chưa điều tra (không nằm trong scope 9 tool mới đợt này).
- `apply_effect` trả `componentIndex: -1` dù áp effect thành công thật (verify qua `get_clip_effects` thấy effect có mặt đúng ở index 2) — có thể chỉ là field không được tính đúng, không ảnh hưởng chức năng chính, nhưng đáng nghi nếu code khác dựa vào `componentIndex` trả về từ tool này.

### Dọn dẹp còn sót lại từ đợt test này

- File `Test MCP.prproj` gốc: lúc test đã `save_project` MỘT LẦN khi project này đang active (trước khi `save_project_as`) — nghĩa là sequence test `MCP Tool Test 2026-09-14` (đã đổi tên track Video 1 thành "MCP Test Track") **có thể vẫn còn tồn tại trong file `Test MCP.prproj` gốc trên đĩa** (không tự dọn được vì `open_project` chỉ là stub, không thể mở lại project khác qua script sau khi đã `save_project_as` chuyển active project đi). Cần mở tay `Test MCP.prproj` trong Premiere, xoá sequence `MCP Tool Test 2026-09-14` nếu còn, đổi tên track Video 1 về lại "Video 1" nếu cần.
- File mới phát sinh `Test MCP - saveas test.prproj` (tạo ra để test `save_project_as`) — đã dọn sequence test + save sạch, nhưng bản thân file này là bản sao thừa của `Test MCP.prproj`, có thể xoá tay nếu không cần giữ.
- Project hiện đang mở trong Premiere (cuối phiên test) là `Test MCP - saveas test.prproj`, KHÔNG phải `Test MCP.prproj` — nếu muốn quay lại làm việc trên file gốc, cần tự mở tay lại trong Premiere (File > Open Project).

**1. Keyframe (5 tool mới)** — `get_keyframes`, `remove_keyframe`, `remove_keyframe_range`, `get_value_at_time`, `set_keyframe_interpolation`. API dùng lại nguyên xi từ code Beat Shake cũ đã merge vào file này (đã verify chạy được thật trước đây): `createKeyframe`/`createAddKeyframeAction`/`getKeyframeListAsTickTimes`/`createRemoveKeyframeRangeAction`/`createSetInterpolationAtKeyframeAction`/`getValueAtTime`. Tick = `clip.getInPoint().seconds + timeSeconds` (source-time, giống `set_effect_param`). `add_keyframe` KHÔNG cần tool riêng — đã có sẵn qua `set_effect_param(matchName, paramName, value, timeSeconds)`.

**2. Track management — PHÁT HIỆN QUAN TRỌNG: hầu hết KHÔNG THỂ làm qua UXP.** Probe trực tiếp prototype Sequence/Track/SequenceEditor (qua sentinel tạm trong `mute_track`, đã dọn) xác nhận: Sequence chỉ có `getVideoTrackCount/getAudioTrackCount/getVideoTrack/getAudioTrack/getCaptionTrack` (thuần đọc), Track chỉ có `createSetNameAction/setMute/getMediaType/getIndex/isMuted/getTrackItems` — **KHÔNG có bất kỳ API nào cho add/delete/lock/toggle-visibility/set-target track**. Xác nhận là giới hạn thật, không phải chưa tìm ra — loại bỏ khỏi danh sách "đề xuất", không code tiếp các tool này.
- **Bonus fix quan trọng**: `mute_track` (tool cũ, chưa từng live-test) dùng nhầm `track.createSetMuteAction()` — **KHÔNG tồn tại**. Sửa sang `track.setMute(muted)` gọi trực tiếp (không qua transaction). **LIVE-TESTED NGAY** (tool cũ, không cần restart): mute→true rồi unmute→false, cả 2 lần đều verify đúng qua `actualMuted`.
- Đã thêm 3 tool mới khả thi: `get_track_info` (đọc tên/mute/số clip 1 track), `list_sequence_tracks` (liệt kê tất cả), `rename_track` (qua `createSetNameAction`, đã xác nhận có thật).

**3. Project lifecycle (2 tool mới)** — `save_project`/`save_project_as`. Xác nhận `project.save()`/`project.saveAs(path)` có thật trên `Project.prototype` (probe trực tiếp qua `debug_probe_api`, đã dọn debug). Trước đây dự án không có cách nào lưu project qua MCP.

**4. Editing precision (2 tool mới)** — `roll_edit`, `slip_edit`. KHÔNG cần API mới — dựng từ các primitive đã verify đúng nhiều lần: `roll_edit` = `createSetEndAction` (clip trái) + `createSetStartAction` (clip phải) trong CÙNG 1 transaction; `slip_edit` = `createSetInPointAction`/`createSetOutPointAction` cùng lúc (dịch nguồn, giữ nguyên vị trí/thời lượng timeline — khác `trim_clip` đổi cả 2). `slide_edit` chưa làm (phức tạp hơn — cần tìm + điều chỉnh cả 2 clip liền kề khi dời clip giữa), để lại cho đợt sau.

**Việc còn lại sau khi user restart Claude**: live-test đầy đủ 9 tool mới (5 keyframe + 3 track + save_project×2 + roll/slip edit), cập nhật Sheet + TODO.md với kết quả thật.

## ✅ Ưu tiên 3 — Batch test ~40 tool còn lại — HOÀN THÀNH, NHIỀU BUG FIX MỚI (2026-09-14)

Live-test trên sequence tạm `MCP Batch Test 2026-09-14` (đã xoá sau khi xong) với clip video thật (`keo BG ingame.mp4`) + audio thật (`file test mp3.MP3`) — không dùng data giả vì nhiều bug chỉ lộ ra với clip video/audio thật (vd `slip_edit`, xem mục Bug 3 phía trên).

### 🐛 Bug mới tìm ra + ĐÃ FIX

1. **`search_effects` crash "Cannot read properties of null"`** — `server/src/tools/premiere-tools.js`: filter gọi `e.matchName.toLowerCase()` trực tiếp, crash khi effect audio có `matchName: null` (effect audio dùng `useDisplayName` thay vì matchName — xem ghi chú cũ). Fix: `(e.matchName ?? '').toLowerCase()` cho cả 3 field so khớp. **⚠️ Cần restart server MCP (`node server/index.js`, hoặc restart app Claude) mới có hiệu lực** — chưa verify lại được trong phiên này vì restart sẽ mất kết nối toàn bộ tool `premiere__*` đang dùng.

2. **`set_clip_color_label` — logic if/else bị đảo ngược hoàn toàn + API giả định sai.** Code cũ: nếu `projectItem.setColorLabel` LÀ function thì lại gọi `createSetColorLabelAction`, nếu KHÔNG PHẢI function thì lại gọi thẳng `projectItem.setColorLabel()` — ngược hoàn toàn logic đúng. Probe trực tiếp xác nhận: chỉ có `createSetColorLabelAction` (action-based) + `getColorLabelIndex()` (đọc), **không có** `setColorLabel` nào cả. Đã viết lại dùng đúng API, verify qua `actualColorIndex`. Live-tested: `iris` → `actualColorIndex:2` đúng.

3. **`adjust_color_values`/`apply_lumetri_preset` — matchName sai hoàn toàn.** Code dùng `"ADBE Lumetri Color"` — tên này **KHÔNG TỒN TẠI** trong `VideoFilterFactory.getMatchNames()` thật (lỗi native "No video filter found", bị che dấu thành "undefined" vì lỗi ném ra là STRING không phải Error object nên `e.message` luôn `undefined` — xem bug 4). Probe ra tên thật: **`AE.ADBE Lumetri`**. Đã sửa cả 2 hàm + entry sai trong `server/src/data/premiere-effects.js`. Live-tested: `adjust_color_values(exposure:0.5,...)` → verify qua `get_value_at_time` = 0.5 đúng.

4. **`applyEffect()`/`findComponentByMatchName()` — bug nền tảng ảnh hưởng NHIỀU tool.** 2 lỗi chồng nhau:
   - Lỗi native khi `VideoFilterFactory.createComponent(matchName)` thất bại là **string ném thẳng ra**, không phải Error object → `e2.message` luôn `undefined`, che mất lý do thật. Đã sửa để bắt cả 2 dạng lỗi.
   - `findComponentByMatchName()` so khớp EXACT STRING — nhưng Premiere LƯU matchName effect đã áp với prefix `"AE."` (vd `"AE.ADBE Gaussian Blur 2"`) trong khi lúc GỌI apply lại dùng tên KHÔNG prefix. Kết quả: check "đã có effect chưa" ở đầu `applyEffect()` luôn báo sai (không thấy effect dù đã có), và field `componentIndex` trả về **luôn là -1** dù apply thành công thật (đã ghi nhận là "note phụ" ở batch test 9 tool trước, giờ hiểu rõ nguyên nhân). Đã sửa `findComponentByMatchName()` so khớp linh hoạt bỏ qua prefix `AE.`. Live-tested: apply lại `ADBE Gaussian Blur 2` lần 2 → đúng báo `alreadyExists:true`; `componentIndex` giờ trả đúng số thật (3) thay vì -1.

5. **`detect_silence_regions`/`remove_silence_gaps` — lỗi double-encode URL khi đọc file có dấu cách trong path.** `pathToFileUrl()` tự percent-encode (` ` → `%20`), nhưng `uxpFs.getEntryWithUrl()` encode THÊM 1 lần nữa → URL hỏng dạng `%2520`, báo "Could not find an entry". Bug này đã được ghi chú từ 2026-09-10 (đã fix ở `readTextFile` riêng) nhưng CHƯA áp dụng cho đường đọc audio dùng chung bởi `detect_silence_regions`/`remove_silence_gaps`/Beat Shake cũ. Đã thêm hàm `pathToRawFileUrl()` dùng thống nhất cho MỌI lần gọi `getEntryWithUrl()`. Live-tested: lỗi encode biến mất, tool giờ đọc được file `.MP3` có dấu cách trong path.

### 🔴 Giới hạn thật xác nhận sau bug fix trên (KHÔNG PHẢI bug, chỉ chưa cài)

`detect_silence_regions`/`remove_silence_gaps` sau khi hết lỗi encode thì lộ ra giới hạn CÓ TỪ TRƯỚC: thiếu hàm decode audio (`decodeAudioDataFromUint8`/`decodeToFloat32Mono` — grep toàn repo xác nhận CHƯA TỪNG được viết ở đâu, chỉ được gọi). Cần implement 1 audio decoder WAV/MP3 riêng cho môi trường UXP (việc lớn, ngoài phạm vi phiên fix bug này) — tạm thời 2 tool này vẫn KHÔNG dùng được dù đường đọc file đã thông.

### 🔴 Bug mới CHƯA FIX (đã điều tra sâu, để lại cho phiên sau)

**`set_clip_pan`** — clip audio stereo không có sẵn component Panner/Balance (chỉ có "Internal Volume Stereo"/"Internal Channel Volume Stereo"). Đã sửa để tự thêm effect "Balance" qua `AudioFilterFactory.createComponentByDisplayName(displayName, clip)`.

**Điều tra vòng 2 (2026-09-14, sau khi commit lần đầu)** — đào sâu thêm bằng debug step-by-step:
- Phát hiện + sửa thêm 1 bug con: chữ ký đúng của `createComponentByDisplayName` là **2 tham số** `("Balance", clip)`, KHÔNG PHẢI 1 tham số như ghi nhận lần đầu (lần đầu code thử nhiều biến thể trong vòng lặp và không log rõ biến thể nào thật sự thành công — kết luận vội).
- Với chữ ký đúng, effect "Balance" giờ chắc chắn được thêm thành công (verify từng bước: `append transaction: "ok"`, `re-find Balance after append: true`, `findParamByName: true`).
- NHƯNG việc GHI GIÁ TRỊ vào param "Balance" vẫn hoàn toàn không có tác dụng, đã thử THÊM 3 đường nữa (tổng cộng 7+ biến thể qua 2 vòng điều tra):
  - Tách `createSetTimeVaryingAction` và `setStaticKeyframe`/`createAddKeyframeAction` thành 2 transaction riêng (thay vì gộp chung) — vẫn đọc lại 0.
  - `createSetValueAction(rawNumber)` — lỗi "Illegal Parameter type".
  - `createSetValueAction(keyframeObject)` (tạo qua `param.createKeyframe(value)`) — **không lỗi**, nhưng đọc lại vẫn 0.
  - `createSetValueAction({value: x})` / `createSetValueAction(string)` — lỗi "Illegal Parameter type".
  - Đọc RAW giá trị (không qua hàm `unwrapParamValue`) xác nhận thật sự là `{value: 0}` — loại trừ khả năng bug nằm ở code đọc/unwrap, giá trị thật sự không đổi.
- **Kết luận cuối cùng**: đây là giới hạn thật (component audio filter thêm qua `AudioFilterFactory.createComponentByDisplayName` có vẻ không được Premiere "kích hoạt" đầy đủ trong audio engine dù MỌI API tạo/thêm/ghi đều không báo lỗi) — không phải do chưa tìm đúng API. Code hiện throw lỗi rõ ràng thay vì báo thành công giả. Nếu cần dùng, làm tay: chuột phải clip → Audio Gain, hoặc kéo Balance từ Effects panel + chỉnh tay trong Effect Controls.

### ✅ Xác nhận hoạt động đúng (không cần sửa)

`remove_effect`, `set_clip_metadata`/`get_clip_metadata` (verify qua raw XMP), `list_available_transitions` (155 kết quả live thật, không phải database tĩnh dù mô tả tool ghi "offline" — note phụ, không urgent), `move_item_to_bin` (đã fix từ trước, test lại vẫn đúng), `set_clip_volume` (lần đọc "0" đầu tiên là fluke, retry 2 lần đều đúng), `import_mogrt`/`import_srt` (import vào Project đúng, nhưng KHÔNG tự đặt lên timeline dù mô tả `import_mogrt` ngụ ý có — chỉ `import_srt` mô tả đúng thực tế "thêm vào caption track" cần thao tác tay), `relink_offline_media` (báo đúng `relinked:0` khi không có media offline).

### 🟡 Xác nhận là stub cố định (API UXP chưa hỗ trợ ở bản Premiere này — code đã xử lý gracefully, KHÔNG throw lỗi mù mờ)

`capture_frame`, `detect_scene_edits`, `add_transition`, `batch_add_transitions`, `set_clip_speed`, `reverse_clip`, `freeze_frame`, `create_caption_track`, `replace_clip_media`, `export_as_xml` — tất cả trả `applied/saved/created/exported: false` kèm message hướng dẫn thao tác tay rõ ràng, không phải bug (đã kiểm code: mỗi hàm đều check `typeof x.API === "function"` trước, fallback đúng khi API không tồn tại). `cut_clip_at_time` xác nhận lại cần QE DOM (giới hạn đã biết từ trước, không đổi).

### Chưa test (bỏ qua trong phiên này — cần audio giọng nói thật, tốn thời gian)

`transcribe_clip`, `auto_caption_from_speech`, `import_transcript_json`, `setup_audio_ducking`, `export_to_media_encoder`.

(`move_clip`, `trim_clip`, `duplicate_clip` đã live-tested xong 2026-09-14 — xem các mục bug fix phía trên. `delete_clip`/`ripple_delete` đã test và xác nhận HỎNG — xem mục 🔴 riêng phía trên.)

Bỏ qua (đã biết là stub cố định, không cần test): `add_text_overlay`, `open_project`.

**Lưu ý khi test**: nếu tool "không báo lỗi nhưng cũng không thấy tác dụng gì", nghi ngờ chính code xác minh (verify) trước khi kết luận API bị hỏng — bài học từ `create_sequence`/`duplicate_sequence` (chẩn nhầm lỗi) và `select_all_clips` (báo thành công giả vì lỗi bị nuốt trong try/catch rỗng). Bài học mới đợt này: đọc lại giá trị ĐÚNG VỊ TRÍ trong code (sau khi set, không phải trước) — 1 lần debug bị nhầm vì đặt điểm đọc trước bước ghi.

## Dọn dẹp thủ công trong Premiere (không tự động hóa vì rủi ro)

- Trong `Test MCP - saveas test.prproj` (project đang mở cuối phiên 2026-09-14): `icon.png` bị move vào bin `VN - WAG - BOOYAH-` lúc test `move_item_to_bin`, `Basic Title.mogrt` + `test.srt` bị import vào root Project panel lúc test `import_mogrt`/`import_srt` — an toàn xoá tay nếu không cần giữ (chỉ là item test, không ảnh hưởng sequence thật).
- Bin `Test Move Bin` trong `Test MCP.prproj` — tạo lúc test lại `move_item_to_bin` 2026-09-10, an toàn xoá (dùng chính `delete_clip`/xoá tay).
- Vài clip `icon.png` rác quanh mốc ~3599-3600s trên video track 0 của sequence "Active Sequence" và "test 1" trong `test mới.prproj` (project cũ, không phải `Premiere test.prproj` hiện tại).
- Bin thừa `MCP Test Bin` trong `Premiere test.prproj` — tạo lúc test `create_bin` 2026-09-10, an toàn xoá.
- Sequence test dư trong `Premiere test.prproj`: `Test 2` (đã dùng để test insert_clip/select_all_clips, có 1 clip icon.png @0s), `MCP Test 60fps v2` (đổi thành 23.976fps lúc test set_sequence_frame_rate), `MCP Test Tiktok 60fps` — tất cả an toàn xoá, không còn cần giữ.
- 2 sequence template `Template Youtube 1920x1080 60fps` / `Template Tiktok 1080x1920 60fps` — không còn được code tham chiếu (đã bỏ cách nhân bản template), nhưng đã sửa về đúng 60fps thật — giữ lại tuỳ ý làm tham khảo, không bắt buộc.

## Vận hành trên máy mới

- Server MCP không tự chạy nền — mỗi máy/phiên phải tự chạy `node server/index.js` trong thư mục `server/` (lắng nghe port 3005) trước khi panel Premiere kết nối được. Panel tự retry mỗi 5s, không cần reload plugin nếu bật server sau.
- Plugin phải được add trong UXP Developer Tool trỏ đúng `plugin/manifest.json` trong thư mục hiện tại.
- MCP server dùng qua Claude Code (không chỉ qua panel UI): cần file `.mcp.json` ở gốc repo (đã có, trỏ `server/index.js`) + user phải approve trust dialog cho server `premiere` (`enabledMcpjsonServers` trong `~/.claude.json`) — chỉ có hiệu lực sau khi **restart hẳn app Claude** (không phải chỉ restart cuộc hội thoại).

## ✅ Đã xong (2026-09-09 → 2026-09-10)

- Fix bug ArrayBuffer/TextDecoder khiến mọi lệnh WS bị treo vô thời hạn.
- Fix `.getName()` → `.name` trên Sequence/ProjectItem/Marker (nhiều chỗ).
- Xác nhận `create_sequence`, `duplicate_sequence`, `set_active_sequence` hoạt động đúng.
- Fix + live-test thành công `insert_clip`, `overwrite_clip` (vị trí timeline qua `createMoveAction`).
- Fix + live-test thành công `create_bin`, `select_all_clips`/`select_clips_in_range` (2 bug chồng nhau).
- Fix (chưa live-test) `move_clip`, `move_item_to_bin`, `get_project_info` bins list, `import_files` binName lookup.
- Điều tra kỹ + xác nhận rõ giới hạn: sequence frame rate/timebase không set/verify được qua script ở Premiere Pro 2025 — cần nâng cấp lên 2026 (26.2+), đã mở Creative Cloud cho user tự update.
- 24+/68 tool đã test thật và xác nhận hoạt động.
- Gộp toàn bộ về 1 thư mục `premiere-mcp`, đẩy lên GitHub, clone thành công về máy công ty, cấu hình MCP server dùng trực tiếp qua Claude Code (`.mcp.json`).
