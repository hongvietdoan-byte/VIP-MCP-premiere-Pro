# TODO — Premiere MCP

Cập nhật lần cuối: 2026-09-10. Xem thêm chi tiết đầy đủ trong Claude memory: `premiere-mcp.md`.

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
