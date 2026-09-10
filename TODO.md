# TODO — Premiere MCP

Cập nhật lần cuối: 2026-09-10. Xem thêm chi tiết đầy đủ trong Claude memory: `premiere-mcp.md`.

## 🔴 Ưu tiên 0 — Sequence frame rate/timebase: giới hạn phiên bản Premiere, cần nâng cấp lên 2026 (26.2+)

User yêu cầu: **mọi sequence tạo mới luôn phải là 60fps**. Đã điều tra kỹ 2026-09-10, kết luận:

- API DUY NHẤT đọc/set được frame rate thật của sequence — `SequenceSettings.getVideoFrameRate()`/`setVideoFrameRate()` + `FrameRate.createWithValue()` — **chỉ tồn tại từ Premiere Pro bản 26.2 trở lên** (xác nhận qua tài liệu research user cung cấp, đối chiếu docs Adobe chính thức).
- Máy công ty này chỉ cài **Adobe Premiere Pro 2025** (`C:\Program Files\Adobe\Adobe Premiere Pro 2025`, không có bản 2026/26.x nào) — live-test xác nhận `settings.setVideoFrameRate` không tồn tại trong prototype thật.
- `Project.createSequence()` chỉ nhận `(name)`, không có overload presetPath, không có `createSequenceWithPresetPath` nào — không có đường nào khác để truyền frame rate lúc tạo.
- Đã thử workaround: tạo 2 sequence template tay trong Premiere (`Template Youtube 1920x1080 60fps`, `Template Tiktok 1080x1920 60fps`, đã set 60fps qua UI) rồi `create_sequence` nhân bản (`createCloneAction`) + đổi tên. **KHÔNG hoạt động** — live-test `createCloneAction` không bảo toàn đúng frame rate của template gốc, sequence mới vẫn ra ~24fps (user xác nhận bằng mắt trong Premiere UI).
- Kết luận: **ở Premiere Pro 2025, không có cách nào (script) để set hoặc verify frame rate thật của sequence.** `create_sequence` hiện tại (code đã sửa) báo rõ `timebaseApplied: false` kèm lý do, không báo thành công giả.

**Quyết định 2026-09-10**: user chọn nâng cấp Premiere Pro lên bản 2026 (26.2+) qua Creative Cloud thay vì chấp nhận giới hạn. Đã mở app Creative Cloud cho user tự update/install.

**Việc cần làm sau khi user nâng cấp xong Premiere 2026:**
1. Load lại plugin trong UXP Developer Tool trỏ đúng Premiere Pro 2026 (không phải 2025).
2. Implement lại theo đúng kiến trúc trong tài liệu research (`README_MCP_Premiere_Sequence_FPS_60fps.docx`, user cung cấp 2026-09-10):
   - Tool `get_sequence_settings` riêng: đọc actual fps, ticks/timebase, resolution, display format.
   - Tool `set_sequence_frame_rate(fps)` riêng: set qua `FrameRate.createWithValue()`, **verify read-back** (đọc lại `getVideoFrameRate()` sau khi set, so `before`/`after`, coi bridge trả OK nhưng không đổi = lỗi no-op chứ không phải thành công).
   - `create_sequence` nhận `frame_rate` tuỳ chọn: tạo sequence trắng bằng preset mặc định → gọi `set_sequence_frame_rate` → verify.
   - Dùng rational number (23.976=24000/1001, 29.97=30000/1001, 59.94=60000/1001), KHÔNG so sánh bằng float decimal.
   - Không nhầm `videoDisplayFormat`/timecode display với frame rate thật.
3. Xoá bỏ đoạn code nhân bản template hiện tại trong `createSequence()` (`plugin/premiereActions.js`, không còn cần thiết khi có API set trực tiếp) — nhưng giữ lại 2 sequence template có sẵn trong project phòng khi cần rollback.
4. Test lại đủ các fps: 23.976, 24, 25, 29.97, 30, 50, 59.94, 60.

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
- **`move_item_to_bin`** — dùng `getChildCount`/`getChildAtIndex` (sai, đúng phải `getItems()`) và `createMoveBinAction` (nghi sai tên, đúng theo docs Adobe là `createMoveItemAction` trên `FolderItem` đích). Đã sửa dùng `createMoveItemAction` làm chính, giữ `createMoveBinAction` làm fallback. **CHƯA LIVE-TEST.**
- **`get_project_info` bins list, `import_files` binName lookup** — cùng bug `getChildCount`/`getChildAtIndex`, đã sửa sang `getItems()`. **CHƯA LIVE-TEST riêng** (nhưng cùng pattern đã xác nhận đúng ở `create_bin`).
- **`get_clip_metadata`/`set_clip_metadata`** — `projectItem.getXMPMetadata` không tồn tại. **CHƯA tìm ra API đúng** — docs Adobe UXP hiện tại không liệt kê method XMP metadata nào trên `ProjectItem`. Code giờ báo lỗi rõ kèm liệt kê toàn bộ prototype thật của `projectItem` (khi gọi sẽ thấy list) thay vì lỗi mù mờ — cần gọi thử `get_clip_metadata` với 1 clip đang chọn để xem danh sách method thật, rồi tra xem có method nào khác đảm nhiệm XMP không (có thể metadata phải qua 1 class riêng chưa được expose ở `ppro.*`, hoặc thật sự chưa có API — cần điều tra thêm).
- **`move_clip`** — sửa dùng `createMoveAction` từ 2026-09-09, giờ đã unblock được vì `select_all_clips` hoạt động thật → có thể chọn clip bằng script rồi test `move_clip`. **CHƯA LIVE-TEST** (việc tiếp theo).

## Ưu tiên 3 — Test theo đợt ~40 tool còn lại

`cut_clip_at_time`, `trim_clip`, `delete_clip`, `ripple_delete`, `detect_silence_regions`, `remove_silence_gaps`, `apply_effect`, `set_effect_param`, `remove_effect`, `search_effects`, `list_available_transitions`, `set_clip_volume`, `set_clip_pan`, `mute_track`, `setup_audio_ducking`, `add_transition`, `batch_add_transitions`, `apply_lumetri_preset`, `set_clip_color_label`, `adjust_color_values`, `create_caption_track`, `import_srt`, `set_clip_speed`, `reverse_clip`, `freeze_frame`, `replace_clip_media`, `relink_offline_media`, `detect_scene_edits`, `set_clip_metadata`, `import_mogrt`, `capture_frame`, `export_as_xml`, `export_to_media_encoder`, `transcribe_clip`, `auto_caption_from_speech`, `duplicate_clip`, `import_transcript_json` (thử nghiệm), `move_clip`, `move_item_to_bin`.

Bỏ qua (đã biết là stub cố định, không cần test): `add_text_overlay`, `open_project`.

**Lưu ý khi test**: nếu tool "không báo lỗi nhưng cũng không thấy tác dụng gì", nghi ngờ chính code xác minh (verify) trước khi kết luận API bị hỏng — bài học từ `create_sequence`/`duplicate_sequence` (chẩn nhầm lỗi) và `select_all_clips` (báo thành công giả vì lỗi bị nuốt trong try/catch rỗng).

## Dọn dẹp thủ công trong Premiere (không tự động hóa vì rủi ro)

- Vài clip `icon.png` rác quanh mốc ~3599-3600s trên video track 0 của sequence "Active Sequence" và "test 1" trong `test mới.prproj` (project cũ, không phải `Premiere test.prproj` hiện tại).
- Bin thừa `MCP Test Bin` trong `Premiere test.prproj` — tạo lúc test `create_bin` 2026-09-10, an toàn xoá.
- Sequence test dư trong `Premiere test.prproj`: `Test 2` (đã dùng để test insert_clip/select_all_clips, có 1 clip icon.png @0s) — an toàn xoá nếu không cần giữ làm reference.
- **KHÔNG xoá** 2 sequence template `Template Youtube 1920x1080 60fps` / `Template Tiktok 1080x1920 60fps` — vẫn cần cho workaround hiện tại và có thể cần tham khảo sau khi nâng cấp Premiere.

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
