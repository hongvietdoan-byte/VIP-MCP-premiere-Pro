# TODO — Premiere MCP

Cập nhật lần cuối: 2026-09-10. Xem thêm chi tiết đầy đủ trong Claude memory: `premiere-mcp.md` và `premiere-25-6-4-api-corrections.md`.

## Ưu tiên 1 — `insert_clip` / `overwrite_clip` đặt sai vị trí (FIX ĐÃ VIẾT, CHƯA LIVE-TEST)

Core tool cho use case gốc (đặt ảnh/clip lên timeline theo time range). Trạng thái 2026-09-10:
- Root cause đã xác nhận từ trước: `SequenceEditor.createInsertProjectItemAction`/`createOverwriteItemAction` đặt được clip thật nhưng **bỏ qua hoàn toàn** tham số vị trí — luôn đặt vào ~1 giờ trừ 1 frame.
- Các cách sửa cũ thất bại vì dùng nhầm API: `createSetInPointAction`/`createSetOutPointAction` chỉnh **source trim** (`getInPoint`/`getOutPoint` = "relative to start time of the project item"), không phải vị trí timeline — nên không có tác dụng, và set cả 2 cùng lúc gây crash native.
- **Đã tìm ra API đúng** qua `@adobe/premierepro` type declarations chính thức: `VideoClipTrackItem`/`AudioClipTrackItem.createMoveAction(tickTime)` — dịch chuyển item theo **offset**, và `getStartTime()`/`getEndTime()` ("relative to the sequence start time") mới là vị trí thật trên timeline.
- **Đã implement** (`plugin/premiereActions.js`, hàm `insertOrOverwriteClip`): đặt tạm (biết sẽ rơi sai chỗ) → tìm đúng track item mới tạo (khớp tên projectItem + startTime chưa từng thấy trước) → tính offset = vị trí mong muốn − vị trí thật hiện tại → `createMoveAction(offset)` trong transaction riêng. Áp dụng cho cả video lẫn audio track item (clip AV linked) để không bị lệch nhau. Có verify cuối cùng, throw rõ nếu không khớp.

**CHƯA XÁC NHẬN CHẠY THẬT** — cần: reload plugin trong UXP Developer Tool (Watch), gọi `insert_clip`/`overwrite_clip` thật qua WS, kiểm tra vị trí clip trên timeline đúng bằng mắt + `get_sequence_info`. Nếu lỗi, xem log Debug console. Không được kết luận "đã fix" cho tới khi có bằng chứng chạy thật (theo nguyên tắc premiere-capability-tester).

## Ưu tiên 2 — Vài lỗi tên API đã xác nhận, chưa sửa

- `create_bin` — `parent.createBin is not a function`. Chưa tìm ra tên đúng.
- `select_all_clips` — `sequence.getEnd is not a function`. Chưa tìm ra tên đúng.
- `get_clip_metadata` — `projectItem.getXMPMetadata is not a function`.
- `move_item_to_bin`, `get_project_info`'s bins list — nghi dùng chung pattern `getChildCount`/`getChildAtIndex` đã biết sai (đúng phải là `getItems()`), chưa fix.
- `move_clip` — dùng `createSetStartTimeAction`, đã xác nhận **không tồn tại** (phát hiện khi debug insert_clip). **Đã sửa 2026-09-10** sang `createMoveAction(offset)` (cùng API/pattern vừa fix cho `insert_clip`/`overwrite_clip`) — CHƯA LIVE-TEST.

## Ưu tiên 3 — Test theo đợt ~45 tool còn lại

`cut_clip_at_time`, `trim_clip`, `delete_clip`, `ripple_delete`, `detect_silence_regions`, `remove_silence_gaps`, `apply_effect`, `set_effect_param`, `remove_effect`, `search_effects`, `list_available_transitions`, `set_clip_volume`, `set_clip_pan`, `mute_track`, `setup_audio_ducking`, `add_transition`, `batch_add_transitions`, `apply_lumetri_preset`, `set_clip_color_label`, `adjust_color_values`, `create_caption_track`, `import_srt`, `set_clip_speed`, `reverse_clip`, `freeze_frame`, `replace_clip_media`, `relink_offline_media`, `select_clips_in_range`, `detect_scene_edits`, `set_clip_metadata`, `import_mogrt`, `capture_frame`, `export_as_xml`, `export_to_media_encoder`, `transcribe_clip`, `auto_caption_from_speech`, `duplicate_clip`, `import_transcript_json` (thử nghiệm).

Bỏ qua (đã biết là stub cố định, không cần test): `add_text_overlay`, `open_project`.

**Lưu ý khi test**: nếu tool "không báo lỗi nhưng cũng không thấy tác dụng gì", nghi ngờ chính code xác minh (verify) trước khi kết luận API bị hỏng — đây chính xác là lý do `create_sequence`/`duplicate_sequence` từng bị chẩn đoán nhầm là lỗi.

## Dọn dẹp thủ công trong Premiere (không tự động hóa vì rủi ro)

- Vài clip `icon.png` rác quanh mốc ~3599-3600s trên video track 0 của sequence "Active Sequence" và "test 1" trong `test mới.prproj`.
- Các sequence test dư: `MCP Test Sequence`, `MCP Test Sequence 2`, `MCP Test Sequence 3`, `MCP Test Sequence 3 Copy`, `MCP Verify Test`, `MCP Verify Test Copy`.

## ✅ Đã xong (2026-09-09 → 2026-09-10)

- Fix bug ArrayBuffer/TextDecoder khiến mọi lệnh WS bị treo vô thời hạn.
- Fix `.getName()` → `.name` trên Sequence/ProjectItem/Marker (nhiều chỗ).
- Xác nhận `create_sequence`, `duplicate_sequence`, `set_active_sequence` hoạt động đúng.
- 20/68 tool đã test thật và xác nhận hoạt động (xem danh sách đầy đủ trong memory).
- Gộp toàn bộ về 1 thư mục `premiere-mcp`, đẩy lên GitHub.
