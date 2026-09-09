# TODO — Premiere MCP

Cập nhật lần cuối: 2026-09-10. Xem thêm chi tiết đầy đủ trong Claude memory: `premiere-mcp.md` và `premiere-25-6-4-api-corrections.md`.

## Ưu tiên 1 — `insert_clip` / `overwrite_clip` đặt sai vị trí (CHƯA GIẢI QUYẾT)

Core tool cho use case gốc (đặt ảnh/clip lên timeline theo time range). Đã xác nhận:
- `SequenceEditor.createInsertProjectItemAction`/`createOverwriteItemAction` đặt được clip thật (track item count tăng đúng) nhưng **bỏ qua hoàn toàn** tham số vị trí — luôn đặt vào ~1 giờ trừ 1 frame, bất kể input.
- Đã thử cộng `zeroPoint` vào tick — không tìm được API đọc đúng giá trị zero point thật (`getZeroPoint()`, `getSettings()`, `getInPoint()` đều trả rỗng/vô nghĩa).
- Đã thử đặt tạm rồi di chuyển bằng `createSetInPointAction` — không có tác dụng.
- Đã thử set cả In+Out cùng lúc để di chuyển — **CRASH Premiere native** ("A nullptr was dereferenced"). Không thử lại cách này.

**Hướng thử tiếp theo**: QE DOM (`app.enableQE()`) có sẵn fallback trong codebase cho vài tool khác — thử xem có API insert-tại-vị-trí nào qua đường này không. Hoặc tìm đúng API "di chuyển vị trí track item trên timeline" (khác với `createSetInPointAction`, có vẻ chỉ ảnh hưởng source trim chứ không phải vị trí timeline).

Hiện tại tool này throw lỗi rõ ràng ngay đầu hàm, không tạo thêm clip rác nữa.

## Ưu tiên 2 — Vài lỗi tên API đã xác nhận, chưa sửa

- `create_bin` — `parent.createBin is not a function`. Chưa tìm ra tên đúng.
- `select_all_clips` — `sequence.getEnd is not a function`. Chưa tìm ra tên đúng.
- `get_clip_metadata` — `projectItem.getXMPMetadata is not a function`.
- `move_item_to_bin`, `get_project_info`'s bins list — nghi dùng chung pattern `getChildCount`/`getChildAtIndex` đã biết sai (đúng phải là `getItems()`), chưa fix.
- `move_clip` — dùng `createSetStartTimeAction`, đã xác nhận **không tồn tại** (phát hiện khi debug insert_clip). Cần sửa + test lại.

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
