# TODO — Premiere MCP

Cập nhật lần cuối: 2026-09-10. Xem thêm chi tiết đầy đủ trong Claude memory: `premiere-mcp.md` và `premiere-25-6-4-api-corrections.md`.

## ✅ Ưu tiên 1 — `insert_clip` / `overwrite_clip` đặt sai vị trí — ĐÃ FIX, LIVE-TESTED 2026-09-10

Core tool cho use case gốc (đặt ảnh/clip lên timeline theo time range).
- Root cause: `SequenceEditor.createInsertProjectItemAction`/`createOverwriteItemAction` đặt được clip thật nhưng **bỏ qua hoàn toàn** tham số vị trí — luôn đặt vào ~1 giờ trừ 1 frame.
- Các cách sửa cũ thất bại vì dùng nhầm API: `createSetInPointAction`/`createSetOutPointAction` chỉnh **source trim** (`getInPoint`/`getOutPoint` = "relative to start time of the project item"), không phải vị trí timeline.
- **API đúng** (từ `@adobe/premierepro` type declarations chính thức): `VideoClipTrackItem`/`AudioClipTrackItem.createMoveAction(tickTime)` (dịch theo **offset**) + `getStartTime()`/`getEndTime()` ("relative to the sequence start time" — vị trí thật trên timeline).
- Implement trong `plugin/premiereActions.js` (`insertOrOverwriteClip`): đặt tạm → tìm đúng track item mới tạo (khớp tên projectItem + startTime chưa từng thấy trước) → tính offset thật → `createMoveAction(offset)`. Áp dụng cho cả video lẫn audio track item.
- **LIVE-TESTED 2026-09-10** qua WS controller trực tiếp (không qua UI): gọi `insert_clip` (icon.png @10s) và `overwrite_clip` (icon.png @20s) trên sequence `MCP Test Sequence` — cả hai đọc lại `getStartTime()` thật từ Premiere sau khi move, khớp chính xác với `startSeconds` yêu cầu. Xác nhận hoạt động đúng.

## Ưu tiên 2 — Vài lỗi tên API đã xác nhận

- `create_bin` — `parent.createBin is not a function`. Chưa tìm ra tên đúng.
- `select_all_clips` — `sequence.getEnd is not a function`. Chưa tìm ra tên đúng. **Cộng thêm bug mới bên dưới** (mục "select_clips_in_range / select_all_clips dùng nhầm field vị trí").
- `get_clip_metadata` — `projectItem.getXMPMetadata is not a function`.
- `move_item_to_bin`, `get_project_info`'s bins list — nghi dùng chung pattern `getChildCount`/`getChildAtIndex` đã biết sai (đúng phải là `getItems()`), chưa fix.
- `move_clip` — dùng `createSetStartTimeAction`, đã xác nhận **không tồn tại** (phát hiện khi debug insert_clip). **Đã sửa 2026-09-10** sang `createMoveAction(offset)` (cùng API/pattern đã fix cho `insert_clip`/`overwrite_clip`, xem trên) — **CHƯA LIVE-TEST**: `move_clip` cần một clip đang **được chọn (selected)** trên timeline trước khi gọi, và không có cách chọn clip từ script (xem bug `select_clips_in_range` bên dưới) — cần người dùng click chọn clip trong Premiere UI trước rồi gọi tool để test.

### 🆕 `select_clips_in_range` / `select_all_clips` dùng nhầm field vị trí (2026-09-10, chưa fix)

Phát hiện khi tìm cách chọn clip để test `move_clip`: hàm dùng chung `getTrackItemsInRange()` (`plugin/premiereActions.js`) xác định clip có nằm trong khoảng `[startTick, endTick]` bằng cách so `item.getInPoint()`/`item.getOutPoint()` — đây là **source trim** (giống hệt bug gốc của `insert_clip`/`move_clip` trước khi fix), KHÔNG PHẢI vị trí trên timeline. Vị trí thật phải dùng `item.getStartTime()`/`item.getEndTime()`. Ảnh hưởng: `select_clips_in_range`, `select_all_clips` (cộng thêm bug `getEnd` riêng), và fallback path của `ripple_delete`/`cut_clip_at_time` (cũng gọi `getTrackItemsInRange`). Cần sửa `getTrackItemsInRange()` sang `getStartTime()`/`getEndTime()` rồi test lại cả 4 tool này.

## Ưu tiên 3 — Test theo đợt ~44 tool còn lại

`cut_clip_at_time`, `trim_clip`, `delete_clip`, `ripple_delete`, `detect_silence_regions`, `remove_silence_gaps`, `apply_effect`, `set_effect_param`, `remove_effect`, `search_effects`, `list_available_transitions`, `set_clip_volume`, `set_clip_pan`, `mute_track`, `setup_audio_ducking`, `add_transition`, `batch_add_transitions`, `apply_lumetri_preset`, `set_clip_color_label`, `adjust_color_values`, `create_caption_track`, `import_srt`, `set_clip_speed`, `reverse_clip`, `freeze_frame`, `replace_clip_media`, `relink_offline_media`, `detect_scene_edits`, `set_clip_metadata`, `import_mogrt`, `capture_frame`, `export_as_xml`, `export_to_media_encoder`, `transcribe_clip`, `auto_caption_from_speech`, `duplicate_clip`, `import_transcript_json` (thử nghiệm).

`select_clips_in_range` đã chuyển sang mục bug ở trên (Ưu tiên 2), không nằm trong batch test thường nữa — cần sửa field trước khi test.

Bỏ qua (đã biết là stub cố định, không cần test): `add_text_overlay`, `open_project`.

**Lưu ý khi test**: nếu tool "không báo lỗi nhưng cũng không thấy tác dụng gì", nghi ngờ chính code xác minh (verify) trước khi kết luận API bị hỏng — đây chính xác là lý do `create_sequence`/`duplicate_sequence` từng bị chẩn đoán nhầm là lỗi.

## Dọn dẹp thủ công trong Premiere (không tự động hóa vì rủi ro)

- Vài clip `icon.png` rác quanh mốc ~3599-3600s trên video track 0 của sequence "Active Sequence" và "test 1" trong `test mới.prproj`.
- 2 clip `icon.png` mới tạo khi live-test `insert_clip`/`overwrite_clip` 2026-09-10, ở giây 10 và giây 20 trên video track 0 của sequence `MCP Test Sequence` — an toàn xoá (sequence test).
- Các sequence test dư: `MCP Test Sequence`, `MCP Test Sequence 2`, `MCP Test Sequence 3`, `MCP Test Sequence 3 Copy`, `MCP Verify Test`, `MCP Verify Test Copy`.

## Vận hành trên máy mới

- Server MCP không tự chạy nền — mỗi máy/phiên phải tự chạy `node server/index.js` trong thư mục `server/` (lắng nghe port 3005) trước khi panel Premiere kết nối được. Panel tự retry mỗi 5s, không cần reload plugin nếu bật server sau.
- Plugin phải được add trong UXP Developer Tool trỏ đúng `plugin/manifest.json` trong thư mục `premiere-mcp` hiện tại (không phải đường dẫn `premiere-mcp-standalone` cũ đã xoá).

## ✅ Đã xong (2026-09-09 → 2026-09-10)

- Fix bug ArrayBuffer/TextDecoder khiến mọi lệnh WS bị treo vô thời hạn.
- Fix `.getName()` → `.name` trên Sequence/ProjectItem/Marker (nhiều chỗ).
- Xác nhận `create_sequence`, `duplicate_sequence`, `set_active_sequence` hoạt động đúng.
- Fix + live-test thành công `insert_clip`, `overwrite_clip` (vị trí timeline qua `createMoveAction`); fix (chưa live-test) `move_clip` cùng cách.
- 22/68 tool đã test thật và xác nhận hoạt động (xem danh sách đầy đủ trong memory).
- Gộp toàn bộ về 1 thư mục `premiere-mcp`, đẩy lên GitHub.
