# TOOL_STATUS (sinh tự động từ tool-status.json — KHÔNG sửa tay)

Tổng tool trong code: **177**

| Trạng thái | Số tool |
|---|---|
| ✅ Đã test đúng | 131 |
| ◐ Một phần | 13 |
| ⚠️ Chưa xác nhận | 6 |
| ⏳ Chưa test | 16 |
| ⛔ Stub cố ý | 8 |
| ❌ Không khả thi | 3 |

## ✅ Đã test đúng (131)

| Tool | Ngày test | Ghi chú |
|---|---|---|
| `adjust_color_values` | 2026-09-14 | Bug fix matchName "AE.ADBE Lumetri". Live-tested: exposure:0.5 → verify qua get_value_at_time = 0.5 đúng |
| `apply_audio_effect` | 2026-09-14 | Bug fix: bọc nhầm trong lockedAccess() (không cần cho bước tạo component). Live-tested đúng |
| `apply_effect` | 2026-09-14 | Bug fix: findComponentByMatchName so khớp linh hoạt bỏ qua prefix "AE." (Premiere lưu matchName có prefix, lúc gọi apply không có). componentIndex trả đúng thay vì luôn -1 |
| `apply_lumetri_preset` | 2026-09-14 | Bug fix cùng lúc với adjust_color_values: matchName đúng là "AE.ADBE Lumetri" (không phải "ADBE Lumetri Color"). Live-test trực tiếp tập trung ở adjust_color_values (cùng root cause), apply_lumetri_preset dùng chung fix |
| `audit_timeline_health` | 2026-09-14 | audit_timeline_health đã code + live-tested đúng |
| `batch_apply_effect` | 2026-09-15 | Live-tested đúng trên 4 clip cùng lúc, verify qua get_clip_effects. |
| `batch_enable_disable_clip` | 2026-09-15 | Live-test đúng (verify qua get_clip_properties disabled true/false) |
| `batch_place_clips` | 2026-09-10 | Dùng trong Mic Check workflow, live-tested 64/64 ảnh đặt đúng |
| `batch_rename_clips` | 2026-09-15 | rename_clip live-tested 2026-09-14; batch_rename_clips live-tested 2026-09-15 |
| `check_offline_media` | 2026-09-14 | check_offline_media đã code + live-tested đúng |
| `close_sequence` | 2026-09-15 | Live-tested: sequence không mất dữ liệu, chỉ đóng tab; active sequence tự chuyển đúng. |
| `copy_effect_values` | 2026-09-15 | Live-tested đúng, verify effect xuất hiện trên clip đích. |
| `copy_effects_between_clips` | 2026-09-15 | Live-tested đúng, verify effect xuất hiện trên clip đích. |
| `create_bin` | 2026-09-10 | Fix createBinAction 2026-09-10 - live-tested |
| `create_sequence` | 2026-09-10 | Viết lại 2026-09-10, live-tested 60fps/23.976fps/custom size |
| `create_sequence_from_media` | 2026-09-15 | Live-test đúng, 3 item vào đúng sequence mới |
| `create_subsequence` | 2026-09-15 | Chữ ký thật tìm ra: sequence.createSubsequence(inSeconds, outSeconds, name) — số giây thô, tham số name bị Premiere ÂM THẦM BỎ QUA (luôn tự đặt tên "{gốc}_Sub_01"). Live-tested đúng |
| `crop_clip` | 2026-09-14 | Bug fix matchName ("AE.ADBE AECrop", không phải "AE.ADBE Crop") + live-tested đúng |
| `delete_clip` | 2026-09-14 | FIX 2026-09-14 nhờ audit sample Adobe chính thức: createRemoveItemsAction(selection, ripple, mediaType) cần 3 tham số - thiếu MediaType (thứ 3) là lý do 9 lần thử trước đều sai. Live-tested xoá thường + ripple |
| `delete_project_item` | 2026-09-15 | Live-tested đúng, verify độc lập. |
| `delete_sequence` | 2026-09-10 | Live-tested, verify read-back |
| `deselect_all_clips` | 2026-09-14 | Live-tested, dùng sequence.clearSelection() trực tiếp (bỏ nhánh createSelectItemsAction chết) |
| `duplicate_clip` | 2026-09-14 | FIX 2026-09-14: sửa originalStart tính sai (getInPoint→getStartTime). LƯU Ý: offsetSeconds < duration clip gốc sẽ cắt vỡ clip gốc thành nhiều mảnh (hành vi native, không phải bug) |
| `duplicate_sequence` | 2026-09-09 | Xác nhận hoạt động đúng |
| `enable_disable_clip` | 2026-09-15 | enable_disable_clip live-tested 2026-09-14; batch_enable_disable_clip xác nhận đúng sau khi test lại đúng tham số (startSeconds/endSeconds/trackIndex/enabled) |
| `extract_selection` | 2026-09-14 | Đã code + live-tested đúng sau fix bug mediaType comparison |
| `find_project_item_by_name` | 2026-09-15 | Live-tested đúng, dùng làm verify cho nhiều tool khác trong session. |
| `get_bin_contents` | 2026-09-15 | Live-tested đúng. |
| `get_clip_at_playhead` | 2026-09-15 | Live-tested đúng, đã fix cửa sổ ±1 tick quanh playhead để tránh bỏ sót clip trùng biên. |
| `get_clip_effects` | 2026-09-15 | Dùng làm verify cho rất nhiều tool khác xuyên suốt dự án — xác nhận hoạt động đúng |
| `get_clip_lut` | 2026-09-15 | Đọc InputLUTID đúng (GUID) |
| `get_clip_metadata` | 2026-09-14 | FIX 2026-09-14: API ở namespace tĩnh ppro.Metadata.getXMPMetadata(), không phải trên ProjectItem. Sửa thêm parse Language-Alternative (rdf:Alt/rdf:li) cho field dc:description. Live-tested |
| `get_clip_properties` | 2026-09-15 | Live-tested đúng, đọc đủ field. |
| `get_clip_speed` | 2026-09-15 | Live-tested đúng. |
| `get_clip_transform` | 2026-09-15 | Đã code + live-tested đúng (cả 5 field position/scale/rotation/opacity/anchor khớp) |
| `get_clip_volume` | 2026-09-14 | Đã code + live-tested đúng, không bug |
| `get_duplicate_media` | 2026-09-14 | get_duplicate_media đã code + live-tested đúng. consolidate_duplicates CHƯA làm — cố ý bỏ qua vì mutating rủi ro cao, không hoàn tác được |
| `get_effect_properties` | 2026-09-14 | Đã code + live-tested đúng |
| `get_file_metadata` | 2026-09-15 | Cùng fix Promise property với set_item_start_time. durationSeconds ảnh tĩnh ra 43200 (12 tiếng, default Premiere cho still image, không phải bug). |
| `get_footage_interpretation` | 2026-09-15 | BUG ĐÃ FIX: setFrameRate() nhận SỐ THÔ (không phải object FrameRate như Sequence). Partial-update (chỉ 1 field) cho kết quả sai khó lường qua nhiều lần gọi — giờ BẮT BUỘC truyền cả 2 field cùng lúc, verify ổn định. |
| `get_full_project_overview` | 2026-09-15 | Đã code + live-tested đúng (đợt 6) |
| `get_full_sequence_info` | 2026-09-15 | BUG ĐÃ FIX: sequence.guid là object cần .toString(), JSON.stringify trực tiếp ra {}. |
| `get_keyframes` | 2026-09-14 | Đã code + live-tested đúng |
| `get_next_edit_point` | 2026-09-15 | get_next_edit_point live-tested 2026-09-14; move_playhead_to_edit live-tested 2026-09-15. go_to_next_edit/go_to_previous_edit riêng biệt chưa rõ có tách tool hay gộp chung |
| `get_playhead_position` | 2026-09-14 | Live-test đúng |
| `get_project_info` | 2026-09-14 | Đọc project/sequence/bin đúng. Bins list dùng getItems() - đã sửa nhưng chưa live-test riêng nếu có bin lồng nhau |
| `get_project_item_info` | 2026-09-15 | Live-tested đúng. |
| `get_project_panel_selection` | 2026-09-15 | Live-test đúng |
| `get_proxy_info` | 2026-09-14 | Live-test đúng (hasProxy false với file không phải proxy thật) |
| `get_sequence_count` | 2026-09-15 | Live-tested đúng. |
| `get_sequence_in_out_points` | 2026-09-14 | get/set_sequence_in_out_points đã code + live-tested đúng 2026-09-14 (bao gồm partial-update giữ nguyên outSeconds khi chỉ set inSeconds). clear_sequence_in_out riêng biệt chưa có (đạt được qua set sentinel) |
| `get_sequence_settings` | 2026-09-10 | Live-tested đầy đủ, chỉ hoạt động từ Premiere 26.2+ |
| `get_timeline_gaps` | 2026-09-14 | get_timeline_gaps đã code + live-tested đúng |
| `get_total_clip_count` | 2026-09-15 | Live-tested đúng. |
| `get_track_info` | 2026-09-14 | Đã code + live-tested đúng |
| `get_transcript_languages_uxp` | 2026-09-15 | Cả 2 đã code + live-tested đúng (get_transcript_languages_uxp trả đúng 18 ngôn ngữ thật) |
| `get_unused_media` | 2026-09-14 | Bug fix (getId() phải cast ngược ProjectItem trước khi gọi) + live-tested đúng. get_used_media_report chưa làm riêng |
| `get_value_at_time` | 2026-09-14 | Đã code + live-tested đúng (verify nội suy linear) |
| `get_zero_point` | 2026-09-15 | Live-test đúng cùng set_zero_point |
| `has_transcript_uxp` | 2026-09-15 | Cả 2 đã code + live-tested đúng (get_transcript_languages_uxp trả đúng 18 ngôn ngữ thật) |
| `import_files` | 2026-09-14 | Live-tested nhiều lần (Mic Check 64 ảnh, icon.png test) |
| `import_image_sequence` | 2026-09-15 | Đã code + live-tested đúng (verify qua durationSeconds=0.1668s ≈ 5 frame@30fps, khác still image thường 43200s) |
| `import_srt` | 2026-09-14 | Xác nhận hoạt động đúng — import vào Project panel đúng |
| `insert_clip` | 2026-09-10 | Fix vị trí + duration 2026-09-10, live-tested nhiều lần |
| `inspect_caption_tracks_uxp` | 2026-09-15 | Đã code + live-tested đúng (đọc đúng trackCount:0 khi chưa có caption) |
| `invert_selection` | 2026-09-15 | BUG ĐÃ FIX: sequence.setSelection() cộng dồn thay vì thay thế selection cũ (_buildSelectionObject lấy getSelection() hiện tại rồi addItem thêm vào) — invert ban đầu chọn nhầm cả 2 tập. Fix: clearSelection() trước khi set. Cùng fix áp dụng cho select_all_clips/select_clips_in_range. |
| `lift_selection` | 2026-09-14 | Đã code + live-tested đúng |
| `list_available_transitions` | 2026-09-14 | Xác nhận hoạt động đúng — 155 kết quả LIVE THẬT (không phải database tĩnh dù mô tả tool ghi "offline") |
| `list_sequence_tracks` | 2026-09-14 | Đã code + live-tested đúng |
| `match_frame` | 2026-09-15 | Bug fix: dùng trackItem.getProjectItem() trực tiếp thay vì search theo tên clip trên timeline. Live-tested xác nhận đúng |
| `move_clip` | 2026-09-14 | Unblock + live-tested lần đầu, sau khi fix select_all_clips |
| `move_item_to_bin` | 2026-09-15 | BUG MỚI đã fix (2026-09-15, ngoài fix cũ 2026-09-14): hàm chỉ scan rootItem.getItems() LITERAL, bỏ sót item nằm trong bin con — trong khi import_files không truyền binName thường đặt item vào "insertion bin" hiện tại (không phải luôn root). Đã fix dùng findProjectItemInBin đệ quy. |
| `move_items_to_bin` | 2026-09-15 | Wrapper batch trên move_item_to_bin — logic đúng (báo lỗi riêng từng item, không crash cả batch). Verify đúng sau khi fix bug gốc move_item_to_bin (xem dòng move_item_to_bin). |
| `move_playhead_to_edit` | 2026-09-15 | get_next_edit_point live-tested 2026-09-14; move_playhead_to_edit live-tested 2026-09-15. go_to_next_edit/go_to_previous_edit riêng biệt chưa rõ có tách tool hay gộp chung |
| `mute_track` | 2026-09-14 | Bug fix: track.createSetMuteAction() không tồn tại, sửa dùng track.setMute() trực tiếp. Live-tested mute/unmute cả 2 chiều |
| `overwrite_clip` | 2026-09-10 | Cùng fix với insert_clip, live-tested + idempotent (gọi lại 2-3 lần vẫn đúng) |
| `refresh_media` | 2026-09-15 | Live-tested, không lỗi. |
| `remove_all_effects` | 2026-09-14 | Cả 2 đã code + live-tested đúng. remove_all_effects có bug an toàn đã fix (mặc định bỏ qua Motion/Opacity) |
| `remove_effect` | 2026-09-14 | Xác nhận hoạt động đúng, không cần sửa |
| `remove_effect_by_name` | 2026-09-14 | Cả 2 đã code + live-tested đúng. remove_all_effects có bug an toàn đã fix (mặc định bỏ qua Motion/Opacity) |
| `remove_keyframe` | 2026-09-14 | Đã code + fix bug crash "start time should be less than stoptime" (pad ±1ms) + live-tested |
| `remove_keyframe_range` | 2026-09-14 | Đã code + live-tested đúng |
| `remove_selected_clips` | 2026-09-14 | Bug fix mediaType comparison (getMediaType() trả object enum, không phải string) + live-tested đúng |
| `rename_clip` | 2026-09-15 | rename_clip live-tested 2026-09-14; batch_rename_clips live-tested 2026-09-15 |
| `rename_project_item` | 2026-09-15 | Live-tested đúng, verify qua find_project_item_by_name. |
| `rename_track` | 2026-09-14 | Đã code (createSetNameAction) + live-tested đúng, verify read-back |
| `replace_clip` | 2026-09-15 | Đã code + live-tested đúng (đợt 6) |
| `replace_clip_media` | 2026-09-15 | Fix changeMediaFilePath (thay changeMediaSource cũ sai) verify đúng — cũng có tác dụng phụ đưa clip online lại nếu media path mới hợp lệ. |
| `ripple_delete` | 2026-09-14 | Cùng fix với delete_clip. Live-tested: clip sau tự dịch trái đúng khi ripple |
| `roll_edit` | 2026-09-14 | Đã code + live-tested đúng (verify actualLeftEnd/actualRightStart khớp thật) |
| `save_project` | 2026-09-14 | Đã code (project.save()) + live-tested đúng |
| `save_project_as` | 2026-09-14 | Đã code (project.saveAs()) + live-tested đúng. LƯU Ý hành vi: sau khi gọi, project active chuyển hẳn sang file mới (giống Premiere thật) |
| `search_effects` | 2026-09-15 | Dùng thành công nhiều lần xuyên suốt dự án (tìm matchName đúng cho crop_clip "AE.ADBE AECrop", stabilize_clip "AE.ADBE SubspaceStabilizer") — xác nhận hoạt động đúng qua sử dụng thực tế. Bug crash "Cannot read properties of null" đã fix (effect audio matchName null) |
| `select_all_clips` | 2026-09-14 | FIX LẦN 2 2026-09-14: setSelection() cần object TrackItemSelection (lấy qua getSelection()+addItem), không phải mảng thô như fix lần 1 (09-10) tưởng đúng |
| `select_clips_by_color` | 2026-09-15 | Live-tested đúng. |
| `select_clips_by_name` | 2026-09-15 | Live-tested đúng. |
| `select_clips_in_range` | 2026-09-14 | Cùng fix với select_all_clips - live-tested đúng theo range |
| `select_disabled_clips` | 2026-09-15 | Live-tested đúng. |
| `set_active_sequence` | 2026-09-09 | Xác nhận hoạt động đúng |
| `set_clip_anchor_point` | 2026-09-14 | Đã code + live-tested đúng |
| `set_clip_color_label` | 2026-09-15 | Bug fix: logic if/else bị đảo ngược + tham số đúng là {color:"iris"} (tên string), không phải {colorLabelIndex:N}. Live-tested: "iris" → actualColorIndex:2 đúng |
| `set_clip_metadata` | 2026-09-14 | FIX 2026-09-14: ppro.Metadata.createSetXMPMetadataAction(). Sửa thêm bug phụ: field ghi thiếu khai báo xmlns:dc bị Premiere âm thầm bỏ qua - tạo rdf:Description riêng có khai báo dc. Live-tested |
| `set_clip_mute` | 2026-09-14 | Đã code + live-tested đúng cả 2 chiều mute/unmute |
| `set_clip_opacity` | 2026-09-14 | Đã code + live-tested đúng |
| `set_clip_position` | 2026-09-14 | set_clip_position/set_clip_scale đã code + live-tested đúng (sau fix bug đơn vị pixel↔chuẩn hoá 0-1). set_scale_width_height/set_uniform_scale riêng chưa tách tool |
| `set_clip_properties_batch` | 2026-09-15 | set_clip_properties_batch đã code + live-tested đúng (đợt 6) |
| `set_clip_rotation` | 2026-09-14 | Đã code + live-tested đúng |
| `set_clip_scale` | 2026-09-14 | set_clip_position/set_clip_scale đã code + live-tested đúng (sau fix bug đơn vị pixel↔chuẩn hoá 0-1). set_scale_width_height/set_uniform_scale riêng chưa tách tool |
| `set_clip_selection` | 2026-09-15 | Live-tested cả 2 chiều true/false đều đúng, không ảnh hưởng clip khác. |
| `set_clip_transform` | 2026-09-15 | Đã code + live-tested đúng (cả 5 field position/scale/rotation/opacity/anchor khớp) |
| `set_clip_volume` | 2026-09-14 | Xác nhận hoạt động đúng (1 lần đọc "0" là fluke, retry 2 lần đều đúng) |
| `set_clips_volume` | 2026-09-14 | Đã code + live-tested đúng |
| `set_effect_param` | 2026-09-14 | Bug fix: thiếu bật createSetTimeVaryingAction(true) trước khi add keyframe nên chỉ ghi giá trị tĩnh, không tạo animation thật. Đã fix + live-tested |
| `set_footage_interpretation` | 2026-09-15 | BUG ĐÃ FIX: setFrameRate() nhận SỐ THÔ (không phải object FrameRate như Sequence). Partial-update (chỉ 1 field) cho kết quả sai khó lường qua nhiều lần gọi — giờ BẮT BUỘC truyền cả 2 field cùng lúc, verify ổn định. |
| `set_item_start_time` | 2026-09-15 | Fix Promise property, live-test đúng |
| `set_keyframe_interpolation` | 2026-09-14 | Đã code + live-tested đúng |
| `set_override_frame_rate` | 2026-09-15 | Cả 2 đã live-test đúng sau khi tìm ra chữ ký thật: createSetOverridePixelAspectRatioAction(numerator, denominator) — 2 số riêng biệt, không phải string "N:M" |
| `set_override_pixel_aspect_ratio` | 2026-09-15 | Cả 2 đã live-test đúng sau khi tìm ra chữ ký thật: createSetOverridePixelAspectRatioAction(numerator, denominator) — 2 số riêng biệt, không phải string "N:M" |
| `set_playhead_position` | 2026-09-14 | Live-test đúng |
| `set_scale_to_frame_size` | 2026-09-15 | Live-tested, không lỗi. |
| `set_sequence_display_format` | 2026-09-15 | BUG ĐÃ FIX: setVideoFrameRect() cần object ĐÃ ĐỌC RA (getVideoFrameRect()) rồi mutate .width/.height — object phẳng mới dựng bị âm thầm bỏ qua, không lỗi nhưng không đổi gì. |
| `set_sequence_field_type` | 2026-09-15 | BUG ĐÃ FIX: setVideoFrameRect() cần object ĐÃ ĐỌC RA (getVideoFrameRect()) rồi mutate .width/.height — object phẳng mới dựng bị âm thầm bỏ qua, không lỗi nhưng không đổi gì. |
| `set_sequence_frame_rate` | 2026-09-10 | Live-tested 60↔23.976fps. Còn thiếu test 24/25/29.97/30/50/59.94 |
| `set_sequence_in_out_points` | 2026-09-14 | get/set_sequence_in_out_points đã code + live-tested đúng 2026-09-14 (bao gồm partial-update giữ nguyên outSeconds khi chỉ set inSeconds). clear_sequence_in_out riêng biệt chưa có (đạt được qua set sentinel) |
| `set_sequence_pixel_aspect_ratio` | 2026-09-15 | BUG ĐÃ FIX: setVideoFrameRect() cần object ĐÃ ĐỌC RA (getVideoFrameRect()) rồi mutate .width/.height — object phẳng mới dựng bị âm thầm bỏ qua, không lỗi nhưng không đổi gì. |
| `set_sequence_resolution` | 2026-09-15 | BUG ĐÃ FIX: setVideoFrameRect() cần object ĐÃ ĐỌC RA (getVideoFrameRect()) rồi mutate .width/.height — object phẳng mới dựng bị âm thầm bỏ qua, không lỗi nhưng không đổi gì. |
| `set_xmp_metadata` | 2026-09-15 | set_xmp_metadata (ghi RAW toàn bộ XMP) đã code + live-tested đúng (verify qua get_clip_metadata khớp 100%). Đọc RAW XMP dùng lại get_clip_metadata đã có sẵn |
| `set_zero_point` | 2026-09-15 | Live-tested đúng, verify độc lập. |
| `slip_edit` | 2026-09-14 | Bug fix: createSetInPointAction/createSetOutPointAction âm thầm dịch cả vị trí timeline — fix bằng đo drift rồi bù createMoveAction(-drift). Live-tested với clip video thật |
| `stabilize_clip` | 2026-09-15 | stabilize_clip bug fix matchName ("AE.ADBE SubspaceStabilizer") + live-tested xác nhận đúng sau restart lần 2 (32 param). inspect_stabilizer_status riêng chưa làm |
| `trim_clip` | 2026-09-14 | FIX 2026-09-14: đổi sang createSetStartAction/createSetEndAction - code cũ dùng nhầm source-trim API gây crash native "nullptr" |

## ◐ Một phần (13)

| Tool | Ngày test | Ghi chú |
|---|---|---|
| `analyze_loudness` | 2026-09-15 | Đã code nhưng KHÔNG PHẢI EBU R128 LUFS thật (chỉ Peak/RMS dBFS xấp xỉ, thiếu K-weighting filter) — đã cảnh báo rõ trong tool. CHƯA đủ data live-test (thiếu clip audio thuần/Source Monitor mở). normalize_loudness_file chưa làm |
| `apply_lut` | 2026-09-14 | XÁC NHẬN THIẾT KẾ SAI (không phải bug nhỏ): InputLUTID là GUID tham chiếu catalog nội bộ Premiere, không phải path file .cube — set path trực tiếp không lỗi nhưng cũng không đổi gì |
| `attach_proxy` | 2026-09-15 | FIX chữ ký: cpi.attachProxy(path) thiếu tham số — đúng cần 2 tham số (path, boolean isHiRes). Không lỗi khi gọi nhưng test bằng ảnh PNG giả (không phải proxy video hợp lệ) nên get_proxy_info đọc lại vẫn hasProxy:false — CHƯA xác nhận end-to-end với file .mp4 thật. |
| `clear_item_in_out` | 2026-09-15 | ĐÍNH CHÍNH so với sheet cũ (từng ghi ✅): clear_item_in_out ổn định đúng, nhưng set_item_in_out phát hiện 2026-09-15 KHÔNG ỔN ĐỊNH — lỗi "Illegal Parameter type" trên ảnh tĩnh không nhất quán giữa các lần gọi; cũng lộ bug tìm kiếm ưu tiên BIN trùng tên trước ITEM khi tên trùng — cần sửa trước khi test lại với video thật |
| `create_caption_track` | 2026-09-14 | Chưa test trực tiếp tool này. Sequence.createCaptionTrack đã xác nhận KHÔNG tồn tại trong UXP - audit 2026-09-14 cross-check thêm với sample Transcript chính thức Adobe (chỉ có import/export JSON, không có API tạo Caption Track) + cả 4 repo cộng đồng còn lại claim làm được đều dùng CEP/ExtendScript - xác nhận GIỚI HẠN THẬT của hệ sinh thái, không phải do thiếu tìm |
| `create_subclip` | 2026-09-15 | Chữ ký ĐÚNG là 4 tham số (name, TickTime, TickTime, boolean) — thiếu tham số 4 ném lỗi, phải gọi trong project.lockedAccess(). Nhưng trên ẢNH TĨNH: executeTransaction không lỗi mà KHÔNG tạo ra subclip thật (verify find_project_item_by_name = false). Nghi ngờ chỉ hoạt động với video thật (MasterClip). Cần test lại với .mp4. |
| `get_source_monitor_clip` | 2026-09-15 | ĐÍNH CHÍNH so với sheet cũ (từng ghi ✅ toàn bộ): open_in_source_monitor/get_source_monitor_clip live-tested đúng, nhưng set_source_in_out phụ thuộc set_item_in_out (xem STT 117) hiện KHÔNG ỔN ĐỊNH — chưa live-test thành công độc lập |
| `insert_mogrt_caption` | 2026-09-14 | Vị trí/thời lượng ĐÚNG (live-tested), nhưng set TEXT không được - component Graphic Group không có API drill xuống text layer con. Audit 2026-09-14 cross-check: sample effects.ts Adobe official cũng chỉ dùng getComponentChain() để thêm/xoá component, không đọc/ghi param; cả 5 repo cộng đồng không repo nào cite được API text thật (CaYatur tự đánh dấu tool tương tự của họ là "possibly broken") - xác nhận GIỚI HẠN THẬT của cả hệ sinh thái UXP |
| `open_in_source_monitor` | 2026-09-15 | ĐÍNH CHÍNH so với sheet cũ (từng ghi ✅ toàn bộ): open_in_source_monitor/get_source_monitor_clip live-tested đúng, nhưng set_source_in_out phụ thuộc set_item_in_out (xem STT 117) hiện KHÔNG ỔN ĐỊNH — chưa live-test thành công độc lập |
| `set_item_in_out` | 2026-09-15 | ĐÍNH CHÍNH so với sheet cũ (từng ghi ✅): clear_item_in_out ổn định đúng, nhưng set_item_in_out phát hiện 2026-09-15 KHÔNG ỔN ĐỊNH — lỗi "Illegal Parameter type" trên ảnh tĩnh không nhất quán giữa các lần gọi; cũng lộ bug tìm kiếm ưu tiên BIN trùng tên trước ITEM khi tên trùng — cần sửa trước khi test lại với video thật |
| `set_offline` | 2026-09-15 | GIỚI HẠN THẬT (không phải bug): offline:true hoạt động đúng, nhưng offline:false KHÔNG khôi phục online được (verify qua object cpi hoàn toàn mới, loại trừ cache). Phải dùng relink_offline_media hoặc Link Media thủ công để khôi phục. |
| `set_source_in_out` | 2026-09-15 | ĐÍNH CHÍNH so với sheet cũ (từng ghi ✅ toàn bộ): open_in_source_monitor/get_source_monitor_clip live-tested đúng, nhưng set_source_in_out phụ thuộc set_item_in_out (xem STT 117) hiện KHÔNG ỔN ĐỊNH — chưa live-test thành công độc lập |
| `srt_to_mogrt_captions` | 2026-09-14 | Cùng giới hạn với insert_mogrt_caption - vị trí đúng nhưng text không set được (xem cross-check chi tiết ở dòng insert_mogrt_caption) |

## ⚠️ Chưa xác nhận (6)

| Tool | Ngày test | Ghi chú |
|---|---|---|
| `add_custom_metadata_field` | 2026-09-15 | Đã code (Metadata.addPropertyToProjectMetadataSchema) nhưng CHƯA live-test (rủi ro thay đổi schema project khó dọn) + chữ ký tham số thứ 3 CHƯA xác nhận |
| `get_clip_transcript_uxp` | 2026-09-15 | Đã code (Transcript.exportToJSON) nhưng KHÔNG tìm ra chữ ký đúng dù thử nhiều biến thể — không loại trừ do thiếu clip có transcript thật để test |
| `import_ae_comps` | 2026-09-15 | Đã code (đoán theo pattern importFiles) nhưng CHƯA đủ dữ liệu test — không có file .aep thật trong máy |
| `import_mogrt_from_library` | 2026-09-15 | Đã code (SequenceEditor.insertMogrtFromLibrary) nhưng CHƯA verify được — không có Creative Cloud Library MOGRT thật để test với ID hợp lệ |
| `import_sequences` | 2026-09-15 | Đã code + thử với .prproj THẬT nhưng KHÔNG tìm ra chữ ký đúng ("Not Enough Parameters"/"Illegal Parameter type" dù thử nhiều biến thể) |
| `import_transcript_uxp` | 2026-09-15 | Đã code (alias import_transcript_json đã có) nhưng CHƯA đủ data live-test — không có transcript thật sẵn trong sequence test |

## ⏳ Chưa test (16)

| Tool | Ngày test | Ghi chú |
|---|---|---|
| `add_marker` | - | Chưa test qua tool MCP (marker dùng nhiều bên dự án Beat Shake khác - chưa xác nhận riêng cho premiere-mcp) |
| `auto_caption_from_speech` | - | Chưa test |
| `capture_frame` | - | Chưa test |
| `cut_clip_at_time` | - | Chưa test - cần QE DOM. Audit 2026-09-14 cross-check: cả 2 repo UXP-first (nepfaff, CaYatur) đều không né được QE DOM cho thao tác cắt/trim nâng cao - QE DOM legacy nhưng vẫn hoạt động, không phải bug của mình, chấp nhận dùng tiếp |
| `export_to_media_encoder` | - | Chưa test |
| `generate_and_import_srt` | - | Chưa test |
| `import_mogrt` | - | Chưa test |
| `import_transcript_json` | - | Chưa test (đánh dấu "thử nghiệm" trong TODO gốc) |
| `open_project` | - | KHÔNG phải stub thật (khác add_text_overlay) - có gọi API thật ppro.Project.openDocument(), chỉ là chưa bao giờ live-test trên máy thật. TODO gốc 2026-09-10 xếp nhầm chung nhóm "stub" với add_text_overlay |
| `read_sequence_captions` | - | Chưa test |
| `relink_offline_media` | - | Đọc code: hiện chỉ trả message hướng dẫn thủ công, chưa tự relink thật - nghi ngờ là stub |
| `remove_marker` | - | Chưa test |
| `remove_transition` | - | CHƯA live-test — không có transition sẵn trên sequence test, và không dùng add_transition để tạo data test (rủi ro treo Premiere đã biết). Cần user tự kéo tay 1 transition vào clip test qua UI trước khi test tool này. |
| `setup_audio_ducking` | - | Chưa test |
| `transcribe_clip` | - | Chưa test |
| `update_marker` | - | Chưa test |

## ⛔ Stub cố ý (8)

| Tool | Ngày test | Ghi chú |
|---|---|---|
| `add_text_overlay` | - | Stub THẬT: code luôn trả cứng added:false + câu nhắc làm tay, KHÔNG gọi API Premiere nào bất kể input - không cần test |
| `add_transition` | 2026-09-14 | Xác nhận là stub cố định CÓ CHỦ ĐÍCH (không phải bug): createAddVideoTransitionAction đã làm TREO Premiere thật khi probe (2026-09-14) — quyết định không thử lại, giữ nguyên stub báo hướng dẫn làm tay |
| `batch_add_transitions` | 2026-09-14 | Cùng lý do với add_transition — rủi ro treo máy |
| `detect_scene_edits` | 2026-09-14 | Xác nhận là stub cố định, API UXP chưa hỗ trợ |
| `export_as_xml` | 2026-09-14 | Xác nhận là stub cố định, API UXP chưa hỗ trợ |
| `freeze_frame` | 2026-09-14 | Cùng lý do với set_clip_speed |
| `reverse_clip` | 2026-09-14 | Cùng lý do với set_clip_speed |
| `set_clip_speed` | 2026-09-14 | Xác nhận là stub cố định: API UXP chưa hỗ trợ ở bản Premiere này, code trả applied:false kèm hướng dẫn làm tay, không throw lỗi mù mờ |

## ❌ Không khả thi (3)

| Tool | Ngày test | Ghi chú |
|---|---|---|
| `detect_silence_regions` | 2026-09-14 | Đường đọc file đã fix (lỗi double-encode URL pathToRawFileUrl), nhưng lộ giới hạn: thiếu hàm decode audio (decodeAudioDataFromUint8/decodeToFloat32Mono) — chưa từng viết ở đâu trong repo, chỉ được gọi. Không dùng được cho tới khi viết decoder WAV/MP3 riêng cho UXP |
| `remove_silence_gaps` | 2026-09-14 | Cùng giới hạn với detect_silence_regions — thiếu audio decoder |
| `set_clip_pan` | 2026-09-14 | GIỚI HẠN THẬT đã xác nhận kỹ (7+ biến thể qua 2 vòng điều tra): thêm effect "Balance" qua AudioFilterFactory.createComponentByDisplayName("Balance", clip) (2 tham số) thành công, nhưng ghi giá trị vào param "Balance" hoàn toàn không có tác dụng — không phải do sai API, là giới hạn thật của component audio filter loại này |
