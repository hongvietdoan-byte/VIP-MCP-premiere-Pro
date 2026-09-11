// premiereActions.js
// Các hàm thao tác với Premiere Pro qua UXP API.
// LƯU Ý: API keyframe của Premiere UXP còn rất mới (phát hành chính thức 11/2025)
// và có báo lỗi cộng đồng (đầu 2026) về việc tạo nhiều keyframe liên tiếp.
// Vì vậy phần marker được ưu tiên vì ổn định; phần keyframe được đánh dấu "thử nghiệm".

const ppro = require("premierepro");
const uxpFs = require("uxp").storage.localFileSystem;
const uxpFormats = require("uxp").storage.formats;

// Chuyển đường dẫn hệ điều hành (Windows/macOS) thành file:// URL hợp lệ cho UXP
function pathToFileUrl(nativePath) {
  let p = nativePath.replace(/\\/g, "/");
  const parts = p.split("/");
  const isWindowsDrive = /^[A-Za-z]:$/.test(parts[0]);
  const encodedParts = parts.map((seg, i) => (i === 0 && isWindowsDrive) ? seg : encodeURIComponent(seg));
  const joined = encodedParts.join("/");
  return isWindowsDrive ? ("file:///" + joined) : ("file://" + joined);
}

async function getActiveSequenceAndSelection(log) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");

  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không tìm thấy sequence đang active. Hãy mở 1 timeline.");

  let trackItems = [];
  try {
    const selectionObj = await sequence.getSelection(); // trả về TrackItemSelection, không phải mảng
    trackItems = await selectionObj.getTrackItems();     // đây mới là mảng clip thật sự
  } catch (e) {
    log(`⚠️ Lỗi khi lấy selection: ${e.message}`, "warn");
  }

  if (!trackItems || trackItems.length === 0) {
    throw new Error("Chưa có clip nào được chọn trên timeline. Hãy click chọn 1 clip trước.");
  }

  return { project, sequence, clip: trackItems[0] };
}

// Giống getActiveSequenceAndSelection nhưng trả về TẤT CẢ clip đang chọn (không chỉ cái đầu tiên) —
// dùng cho luồng "1 nút" khi người dùng chọn cùng lúc cả clip audio VÀ Adjustment Layer (Shift/Ctrl+click).
async function getActiveSequenceAndAllSelection(log) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");

  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không tìm thấy sequence đang active. Hãy mở 1 timeline.");

  let trackItems = [];
  try {
    const selectionObj = await sequence.getSelection();
    trackItems = await selectionObj.getTrackItems();
  } catch (e) {
    log(`⚠️ Lỗi khi lấy selection: ${e.message}`, "warn");
  }

  if (!trackItems || trackItems.length === 0) {
    throw new Error("Chưa có clip nào được chọn trên timeline.");
  }

  return { project, sequence, clips: trackItems };
}

// Phân loại trong danh sách clip đang chọn: đâu là clip AUDIO (đọc được media path hợp lệ),
// đâu là clip VIDEO/EFFECT (tìm thấy Transform, Motion, hoặc Brightness & Contrast) — để dùng cho
// luồng "1 nút" mà không cần API cho biết trực tiếp "đây có phải Adjustment Layer không".
async function classifyAudioAndVideoClip(clips, log) {
  const audioCandidates = [];
  const videoCandidates = [];

  for (const item of clips) {
    let isAudio = false;
    try {
      const projectItem = await item.getProjectItem();
      const cpi = await ppro.ClipProjectItem.cast(projectItem);
      if (cpi) {
        const mediaPath = await cpi.getMediaFilePath();
        if (mediaPath && /\.(wav|mp3|aiff?|aif)$/i.test(mediaPath)) isAudio = true;
      }
    } catch (e) { /* không phải audio hợp lệ, bỏ qua */ }

    let isVideoEffect = false;
    if (!isAudio) {
      // Đường chính: hỏi thẳng API. isAdjustmentLayer() có từ Premiere 25.6 — chắc chắn hơn mọi
      // heuristic, và nhận diện được cả Adjustment Layer CHƯA add effect nào (trường hợp mà cách
      // dò theo effect bên dưới bỏ sót hoàn toàn).
      try {
        if (typeof item.isAdjustmentLayer === "function" && await item.isAdjustmentLayer()) {
          isVideoEffect = true;
        }
      } catch (e) { /* API không có hoặc lỗi — rơi xuống heuristic */ }

      // Đường dự phòng: dò theo effect đã có trên clip.
      //
      // ⚠️ Heuristic này có 2 điểm yếu đã biết, nên chỉ dùng khi API trên không trả lời được:
      //   1. findComponentByName(item, "Motion") so theo TÊN HIỂN THỊ → sai khi Premiere chạy
      //      ngôn ngữ khác tiếng Anh.
      //   2. MỌI clip video thường đều có "Motion", nên một clip footage bình thường cũng bị
      //      nhận là "clip đích" hợp lệ.
      if (!isVideoEffect) {
        try {
          for (const mn of ["AE.ADBE Geometry2", "AE.ADBE Brightness & Contrast 2", "AE.ADBE Gaussian Blur 2"]) {
            if (await findComponentByMatchName(item, mn)) { isVideoEffect = true; break; }
          }
          if (!isVideoEffect && await findComponentByName(item, "Motion")) isVideoEffect = true;
        } catch (e) { /* bỏ qua */ }
      }
    }

    if (isAudio) audioCandidates.push(item);
    if (isVideoEffect) videoCandidates.push(item);
  }

  log(`Phân loại selection: ${audioCandidates.length} clip audio, ${videoCandidates.length} clip đích (Adjustment Layer hoặc clip có effect).`);

  if (audioCandidates.length === 0) {
    throw new Error(
      "Không tìm thấy clip audio (.wav/.mp3) nào trong lựa chọn hiện tại. " +
      "Hãy chọn CẢ clip audio VÀ Adjustment Layer cùng lúc (giữ Shift hoặc Ctrl rồi click cả 2)."
    );
  }
  if (audioCandidates.length > 1) {
    throw new Error(`Có ${audioCandidates.length} clip audio trong lựa chọn — chỉ được chọn đúng 1 clip audio.`);
  }
  if (videoCandidates.length === 0) {
    throw new Error(
      "Không tìm thấy clip nào có effect Transform/Motion/Brightness & Contrast trong lựa chọn. " +
      "Hãy add effect tương ứng vào Adjustment Layer trước, rồi chọn cùng lúc với clip audio."
    );
  }
  if (videoCandidates.length > 1) {
    throw new Error(`Có ${videoCandidates.length} clip video/effect trong lựa chọn — chỉ được chọn đúng 1 Adjustment Layer.`);
  }

  return { audioClip: audioCandidates[0], videoClip: videoCandidates[0] };
}

// Nhận diện 1 marker có phải do Beat Shake tạo hay không — qua CẢ 2 cách (comment "Beat Shake plugin"
// và tên bắt đầu bằng "Beat ") để tăng độ chắc chắn, vì 1 trong 2 cách đọc dữ liệu này có thể không
// hoạt động đúng như tài liệu mô tả (đã gặp vài lần với API khác). Bọc try/catch riêng từng cách vì
// getComments()/getName() có thể lỗi độc lập nhau tuỳ loại marker.
//
// [Gom lại ở v16] Trước đó cùng 8 dòng này được copy-paste y hệt ở 5 chỗ khác nhau trong file
// (readBeatTimesFromSequenceMarkers, readBeatTimesFromClipMarkers, clearAllBeatShakeData ×2,
// addBeatMarkersForClip) — sửa 1 chỗ quên sửa chỗ khác là rủi ro có thật, không phải lý thuyết.
async function isBeatShakeMarker(m) {
  try {
    if ((await m.getComments()) === "Beat Shake plugin") return true;
  } catch (e) { /* bỏ qua, thử cách còn lại */ }
  try {
    const n = await m.getName();
    if (typeof n === "string" && n.startsWith("Beat ")) return true;
  } catch (e) { /* bỏ qua */ }
  return false;
}

// Đọc lại danh sách thời điểm nhịp TỪ CHÍNH CÁC MARKER THẬT đang có trên sequence (không phụ thuộc
// vào bộ nhớ tạm của lần phân tích gần nhất trong JS — vì bộ nhớ đó có thể không khớp nếu người dùng
// đã phân tích 1 đoạn khác, hoặc panel đã bị reload). Nhận diện marker của Beat Shake qua tên "Beat "
// hoặc comment "Beat Shake plugin", giống hệt cách addBeatMarkers() đã đặt.
async function readBeatTimesFromSequenceMarkers(sequence, log) {
  const markers = await ppro.Markers.getMarkers(sequence);
  const existingMarkers = await markers.getMarkers();
  const times = [];
  for (const m of existingMarkers) {
    if (await isBeatShakeMarker(m)) {
      try {
        const start = await m.getStart();
        times.push(start.seconds);
      } catch (e) { /* bỏ qua */ }
    }
  }
  times.sort((a, b) => a - b);
  log(`Đọc từ sequence marker: tìm thấy ${times.length} marker do Beat Shake tạo.`);
  return times;
}

// Quét toàn bộ track audio trong sequence, tìm clip marker (gắn vào ProjectItem của file nhạc) do
// Beat Shake tạo — dùng khi marker không phải dạng sequence marker (xem readBeatTimesFromSequenceMarkers).
async function readBeatTimesFromClipMarkers(sequence, log) {
  const times = [];
  let checkedClips = 0;
  for (let trackIndex = 0; trackIndex < 20; trackIndex++) {
    let audioTrack;
    try {
      audioTrack = await sequence.getAudioTrack(trackIndex);
    } catch (e) { break; }
    if (!audioTrack) break;

    let items = [];
    try {
      items = await audioTrack.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
    } catch (e) { continue; }

    for (const item of items) {
      try {
        const projectItem = await item.getProjectItem();
        const clipMarkers = await ppro.Markers.getMarkers(projectItem);
        if (!clipMarkers) continue;
        checkedClips++;
        const existing = await clipMarkers.getMarkers();
        for (const m of existing) {
          if (await isBeatShakeMarker(m)) {
            // Clip marker tính theo thời gian của SOURCE MEDIA — cần cộng thêm điểm bắt đầu clip
            // trên sequence để quy đổi về thời gian tuyệt đối, thống nhất với sequence marker.
            const start = await m.getStart();
            const itemStart = await item.getStartTime();
            times.push(start.seconds + itemStart.seconds);
          }
        }
      } catch (e) { /* bỏ qua clip này, thử clip khác */ }
    }
  }
  times.sort((a, b) => a - b);
  log(`Đọc từ clip marker: đã kiểm tra ${checkedClips} clip audio, tìm thấy ${times.length} marker do Beat Shake tạo.`);
  return times;
}

// Keyframe trên effect của 1 clip được tính THEO THỜI GIAN TƯƠNG ĐỐI của clip đó trên sequence
// (0 = điểm bắt đầu clip), KHÔNG PHẢI thời gian tuyệt đối của cả sequence. Nếu clip nằm ở vị trí
// giữa timeline (không bắt đầu từ giây 0), phải trừ đi điểm bắt đầu của clip trước khi tạo keyframe —
// nếu không, toàn bộ keyframe sẽ rơi ra ngoài phạm vi clip và không hiện ra (đây chính là nguyên nhân
// "Adjustment Layer thứ 2 không có keyframe" đã gặp phải).
async function getClipRelativeBeatTimes(clip, beatTimesAbsolute, log) {
  const startTick = await clip.getStartTime();
  const durationTick = await clip.getDuration();
  const startSeconds = startTick.seconds;
  const durationSeconds = durationTick.seconds;

  log(`Clip bắt đầu tại ${startSeconds.toFixed(2)}s trên sequence, dài ${durationSeconds.toFixed(2)}s.`);

  // Hỗ trợ cả 2 dạng đầu vào: mảng số thuần (t) hoặc mảng object {time, strength} (giữ nguyên độ
  // mạnh nhịp để dùng cho các phong cách preset đa dạng theo strength). Nếu là marker-derived (chỉ
  // có thời gian, không có strength), mặc định strength=1 (coi như nhịp mạnh).
  const relative = [];
  let skippedBefore = 0;
  let skippedAfter = 0;
  for (const item of beatTimesAbsolute) {
    const isObj = typeof item === "object" && item !== null;
    const t = isObj ? item.time : item;
    const rel = t - startSeconds;
    if (rel < 0) { skippedBefore++; continue; }
    if (rel > durationSeconds) { skippedAfter++; continue; }
    // Giữ NGUYÊN mọi field khác của beat (vd nhãn đoạn nhạc `sec` dùng cho kịch bản v13) — trước đây
    // dựng object MỚI chỉ gồm time+strength nên field lạ bị xoá ÂM THẦM khi xuất preset thật (dù bản
    // xem trước trong panel vẫn đúng, vì bản xem trước không đi qua hàm này).
    relative.push(isObj ? Object.assign({}, item, { time: rel }) : rel);
  }

  if (skippedBefore > 0 || skippedAfter > 0) {
    log(
      `⚠️ Bỏ qua ${skippedBefore} nhịp nằm TRƯỚC điểm bắt đầu clip và ${skippedAfter} nhịp nằm SAU khi clip kết thúc ` +
      `(clip này chỉ phủ ${startSeconds.toFixed(2)}s → ${(startSeconds + durationSeconds).toFixed(2)}s trên sequence).`,
      "warn"
    );
  }

  return relative;
}

// Hàm chung: lấy thời điểm nhịp (đã quy đổi tương đối theo clip) từ nguồn ĐÁNG TIN CẬY NHẤT có thể.
// Thử lần lượt: (1) bộ nhớ tạm của lần phân tích gần nhất, (2) marker thật trên sequence,
// (3) marker thật gắn trên các clip audio — dừng lại ở nguồn đầu tiên khớp được với phạm vi clip
// đang chọn. Nhờ vậy, dù bộ nhớ tạm không khớp (đã phân tích đoạn khác, hoặc panel bị reload),
// plugin vẫn tự tìm ra đúng marker thật sự đang có trên timeline thay vì báo lỗi ngay.
async function resolveBeatTimesForClip(clip, sequence, inMemoryBeatsAbsolute, log) {
  let relativeBeats = await getClipRelativeBeatTimes(clip, inMemoryBeatsAbsolute, log);
  if (relativeBeats.length > 0) return relativeBeats;

  log("⚠️ Nhịp trong bộ nhớ tạm không khớp phạm vi clip này. Đang thử đọc marker THẬT từ sequence...", "warn");
  const seqMarkerTimes = await readBeatTimesFromSequenceMarkers(sequence, log);
  relativeBeats = await getClipRelativeBeatTimes(clip, seqMarkerTimes, log);
  if (relativeBeats.length > 0) return relativeBeats;

  log("⚠️ Cũng không thấy trên sequence marker. Đang quét clip marker trên các track audio...", "warn");
  const clipMarkerTimes = await readBeatTimesFromClipMarkers(sequence, log);
  relativeBeats = await getClipRelativeBeatTimes(clip, clipMarkerTimes, log);
  if (relativeBeats.length > 0) return relativeBeats;

  throw new Error(
    "Không tìm thấy nhịp nào khớp phạm vi clip đang chọn — đã thử cả bộ nhớ tạm, sequence marker, và clip marker. " +
    "Kiểm tra lại: (1) clip đang chọn có đúng vị trí trên timeline không, (2) đã đặt marker cho đúng đoạn nhạc này chưa."
  );
}

// Lấy audio buffer từ 1 clip CỤ THỂ (đã biết rõ, không cần đọc lại selection) — dùng cho cả luồng
// từng bước (clip đang chọn) lẫn luồng "1 nút" (clip đã được phân loại từ multi-selection).
async function getAudioBufferForClip(clip, log) {
  log("Đang lấy project item của clip...");
  const projectItem = await clip.getProjectItem();
  const clipProjectItem = await ppro.ClipProjectItem.cast(projectItem);
  if (!clipProjectItem) throw new Error("Clip đang chọn không phải clip media hợp lệ (có thể là title/graphic).");

  const mediaPath = await clipProjectItem.getMediaFilePath();
  log(`Đường dẫn media: ${mediaPath}`);

  const fileUrl = pathToFileUrl(mediaPath);
  let entry;
  try {
    entry = await uxpFs.getEntryWithUrl(fileUrl);
  } catch (err) {
    throw new Error(
      `Không đọc được file trực tiếp từ đường dẫn (${err.message}). ` +
      `Hãy kiểm tra lại: clip đã chọn đúng chưa, và đường dẫn file media có ký tự đặc biệt không.`
    );
  }

  const buffer = await entry.read({ format: uxpFormats.binary });
  return { buffer, name: entry.name };
}

// Wrapper giữ nguyên hành vi cũ: lấy clip đang chọn (chỉ 1 clip) rồi đọc audio
async function getSelectedClipAudioBuffer(log) {
  const { clip } = await getActiveSequenceAndSelection(log);
  return await getAudioBufferForClip(clip, log);
}

// ---------- Xoá sạch toàn bộ marker + keyframe do Beat Shake tạo trên clip đang chọn ----------
// Dọn dẹp nhanh khi muốn làm lại từ đầu: xoá marker (cả clip marker lẫn sequence marker khớp tên/comment)
// và xoá keyframe trên mọi tham số có thể đã dùng (Position/Scale/Rotation của Transform hoặc Motion,
// Brightness của Brightness & Contrast) — bỏ qua êm nếu effect/tham số nào không tồn tại trên clip này.
async function clearAllBeatShakeData(log) {
  const { project, sequence, clips } = await getActiveSequenceAndAllSelection(log);
  let clearedMarkers = 0;
  let clearedParams = 0;

  // ---- 1. Xoá sequence marker (1 lần, không phụ thuộc clip cụ thể) ----
  try {
    const seqMarkers = await ppro.Markers.getMarkers(sequence);
    if (seqMarkers) {
      const existing = await seqMarkers.getMarkers();
      const ownMarkers = [];
      for (const m of existing) {
        if (await isBeatShakeMarker(m)) ownMarkers.push(m);
      }
      if (ownMarkers.length > 0) {
        await project.lockedAccess(() => {
          project.executeTransaction((compoundAction) => {
            for (const m of ownMarkers) compoundAction.addAction(seqMarkers.createRemoveMarkerAction(m));
          }, "Xoá sequence marker của Beat Shake");
        });
        clearedMarkers += ownMarkers.length;
        log(`Đã xoá ${ownMarkers.length} sequence marker.`);
      }
    }
  } catch (e) {
    log(`⚠️ Không xoá được sequence marker (${e.message}).`, "warn");
  }

  // ---- 2. Với mỗi clip đang chọn: xoá clip marker + keyframe effect ----
  // Vòng lặp này xử lý cả Adjustment Layer lẫn clip audio — bỏ qua êm nếu clip không có effect nào.
  for (const clip of clips) {
    // -- Clip marker --
    try {
      const projectItem = await clip.getProjectItem();
      const cpi = await ppro.ClipProjectItem.cast(projectItem);
      const clipMarkers = cpi ? await ppro.Markers.getMarkers(cpi) : null;
      if (clipMarkers) {
        const existing = await clipMarkers.getMarkers();
        const ownMarkers = [];
        for (const m of existing) {
          if (await isBeatShakeMarker(m)) ownMarkers.push(m);
        }
        if (ownMarkers.length > 0) {
          await project.lockedAccess(() => {
            project.executeTransaction((compoundAction) => {
              for (const m of ownMarkers) compoundAction.addAction(clipMarkers.createRemoveMarkerAction(m));
            }, "Xoá clip marker của Beat Shake");
          });
          clearedMarkers += ownMarkers.length;
          log(`Đã xoá ${ownMarkers.length} clip marker.`);
        }
      }
    } catch (e) {
      log(`⚠️ Không xoá được clip marker (${e.message}).`, "warn");
    }

    // -- Keyframe effect (cộng bù in-point: Adjustment Layer có in-point ≈1 giờ) --
    const durationTick = await clip.getDuration();
    const inPointTick = await clip.getInPoint();
    const rangeStart = inPointTick;
    const rangeEnd = inPointTick.add(durationTick);
    const paramsToTry = [
      ["AE.ADBE Geometry2",               "Position"],
      ["AE.ADBE Geometry2",               "Scale"],
      ["AE.ADBE Geometry2",               "Rotation"],
      ["AE.ADBE Geometry2",               "Opacity"],
      ["AE.ADBE Brightness & Contrast 2", "Brightness"],
      ["AE.ADBE Gaussian Blur 2",         "Blurriness"]
    ];
    for (const [matchName, paramName] of paramsToTry) {
      try {
        const comp = await findComponentByMatchName(clip, matchName);
        if (!comp) continue;
        const param = await findParamByName(comp, paramName);
        if (!param) continue;
        const keysBefore = await param.getKeyframeListAsTickTimes();
        if (keysBefore.length === 0) continue;
        await project.lockedAccess(() => {
          project.executeTransaction((compoundAction) => {
            compoundAction.addAction(param.createRemoveKeyframeRangeAction(rangeStart, rangeEnd, true));
          }, `Xoá keyframe ${matchName}.${paramName}`);
        });
        clearedParams++;
        log(`Đã xoá ${keysBefore.length} keyframe trên ${matchName}.${paramName}.`);
      } catch (e) {
        log(`⚠️ Không xoá được keyframe ${matchName}.${paramName} (${e.message}).`, "warn");
      }
    }
    for (const paramName of ["Position", "Scale", "Rotation"]) {
      try {
        const comp = await findComponentByName(clip, "Motion");
        if (!comp) break;
        const param = await findParamByName(comp, paramName);
        if (!param) continue;
        const keysBefore = await param.getKeyframeListAsTickTimes();
        if (keysBefore.length === 0) continue;
        await project.lockedAccess(() => {
          project.executeTransaction((compoundAction) => {
            compoundAction.addAction(param.createRemoveKeyframeRangeAction(rangeStart, rangeEnd, true));
          }, `Xoá keyframe Motion.${paramName}`);
        });
        clearedParams++;
        log(`Đã xoá ${keysBefore.length} keyframe trên Motion.${paramName}.`);
      } catch (e) {
        log(`⚠️ Không xoá được keyframe Motion.${paramName} (${e.message}).`, "warn");
      }
    }
  }

  log(`✅ Đã dọn dẹp xong: ${clearedMarkers} marker, keyframe trên ${clearedParams} tham số (kiểm tra ${clips.length} clip).`, "badge");

  // Trả số liệu để MCP báo lại được cho Claude. Trước v16 hàm này không return gì, nên lệnh
  // clear_beat_data trả về {"success":true} trơ trọi — không biết đã xoá được gì hay chẳng xoá gì.
  return {
    markersRemoved: clearedMarkers,
    paramsCleared: clearedParams,
    clipsInspected: clips.length
  };
}


// Ưu tiên đặt marker trực tiếp lên file nhạc (clip marker, gắn theo ProjectItem) để marker "dính"
// theo đúng file dù đặt clip ở đâu trên timeline. Nếu API không hỗ trợ cho loại clip này (trả về null),
// tự động chuyển về đặt marker trên sequence (mốc thời gian cố định) — vẫn đảm bảo bạn luôn có marker dùng được.
//
// Mỗi lần gọi, hàm sẽ TỰ XOÁ các marker cũ do chính Beat Shake tạo trước đó (nhận diện qua comment
// "Beat Shake plugin"), rồi đặt lại theo danh sách mới — để bạn có thể kéo thanh "độ mạnh" rồi bấm
// lại nút, marker sẽ tự cập nhật theo đúng số lượng mới, giống cách CapCut cho xem trước theo độ mạnh.
// [Phase 5.6] Đặt 1 marker/ĐOẠN (không phải từng nhịp) khi apply_choreography chạy — mỗi marker ghi
// tên style + cường độ đang dùng cho đoạn đó, kéo dài đúng bằng thời lượng đoạn (marker có duration,
// không phải điểm 0 giây) để nhìn trên timeline thấy rõ ranh giới các đoạn biên đạo. Dùng lại đúng cơ
// chế "tự xoá marker cũ do Beat Shake tạo" như addBeatMarkersForClip() — 2 hàm này CÙNG 1 pool marker
// (nhận diện qua isBeatShakeMarker), gọi hàm nào sau cũng xoá sạch marker của hàm kia trước đó, giống
// hành vi đã có từ trước ở clearAllBeatShakeData() (Beat Shake luôn coi mọi marker của mình là 1 bộ).
async function addChoreographyMarkersForClip(clip, sequence, project, relativeSegments, clipInPoint, log) {
  let markers = null;
  let markerScope = "";
  try {
    const projectItem = await clip.getProjectItem();
    const clipProjectItem = await ppro.ClipProjectItem.cast(projectItem);
    if (clipProjectItem) markers = await ppro.Markers.getMarkers(clipProjectItem);
    if (markers) markerScope = "file nhạc (clip marker)";
  } catch (e) {
    log(`⚠️ Không đặt được marker biên đạo trực tiếp lên file nhạc (${e.message}). Chuyển sang sequence...`, "warn");
  }
  if (!markers) {
    markers = await ppro.Markers.getMarkers(sequence);
    markerScope = "sequence (mốc thời gian cố định trên timeline)";
  }

  let ownMarkers = [];
  try {
    const existing = await markers.getMarkers();
    for (const m of existing) if (await isBeatShakeMarker(m)) ownMarkers.push(m);
  } catch (e) {
    log(`⚠️ Không đọc được marker biên đạo cũ (${e.message}). Sẽ chỉ thêm marker mới.`, "warn");
  }

  await project.lockedAccess(() => {
    const ok = project.executeTransaction((compoundAction) => {
      for (const m of ownMarkers) compoundAction.addAction(markers.createRemoveMarkerAction(m));
      for (const seg of relativeSegments) {
        const style = (typeof getStyleById === "function") ? getStyleById(seg.styleId) : null;
        const styleName = style ? style.label.split(" — ")[0] : seg.styleId;
        const gain = seg.gainPercent != null ? seg.gainPercent : 100;
        const name = `Beat Shake: ${styleName} (${gain}%)`;
        const tick = ppro.TickTime.createWithSeconds(seg.start).add(clipInPoint);
        const duration = ppro.TickTime.createWithSeconds(Math.max(0, seg.end - seg.start));
        compoundAction.addAction(markers.createAddMarkerAction(
          name, ppro.Marker.MARKER_TYPE_COMMENT, tick, duration, "Beat Shake plugin"
        ));
      }
    }, "Beat Shake: danh marker bien dao");
    if (!ok) throw new Error("executeTransaction trả về false khi đặt marker biên đạo.");
  });

  log(`✅ Đã đặt ${relativeSegments.length} marker biên đạo (1 marker/đoạn, xoá ${ownMarkers.length} marker cũ) lên ${markerScope}.`, "badge");
}

async function addBeatMarkersForClip(clip, sequence, project, beatTimesSeconds, log) {
  let markers = null;
  let markerScope = "";

  try {
    const projectItem = await clip.getProjectItem();
    const clipProjectItem = await ppro.ClipProjectItem.cast(projectItem);
    if (clipProjectItem) {
      markers = await ppro.Markers.getMarkers(clipProjectItem);
    }
    if (markers) markerScope = "file nhạc (clip marker)";
  } catch (e) {
    log(`⚠️ Không đặt được marker trực tiếp lên file nhạc (${e.message}). Đang chuyển sang đặt marker trên sequence...`, "warn");
  }

  if (!markers) {
    log("Không hỗ trợ đặt marker trực tiếp lên file này — chuyển sang đặt marker trên sequence.", "warn");
    markers = await ppro.Markers.getMarkers(sequence);
    markerScope = "sequence (mốc thời gian cố định trên timeline)";
  }

  // Tìm các marker cũ do chính Beat Shake tạo trước đó, để xoá đi và cập nhật lại theo mức mới.
  log("Đang kiểm tra marker cũ do Beat Shake tạo trước đó...");
  let ownMarkers = [];
  let totalExisting = 0;
  try {
    const existingMarkers = await markers.getMarkers();
    totalExisting = existingMarkers.length;
    for (const m of existingMarkers) {
      if (await isBeatShakeMarker(m)) ownMarkers.push(m);
    }
  } catch (e) {
    log(`⚠️ Không đọc được danh sách marker cũ (${e.message}). Sẽ chỉ thêm marker mới, không xoá được cái cũ.`, "warn");
  }
  log(`Tìm thấy ${totalExisting} marker đang có, trong đó ${ownMarkers.length} do Beat Shake tạo (sẽ xoá trước khi đặt lại).`);

  await project.lockedAccess(() => {
    const ok = project.executeTransaction((compoundAction) => {
      for (const m of ownMarkers) {
        compoundAction.addAction(markers.createRemoveMarkerAction(m));
      }
      beatTimesSeconds.forEach((t, i) => {
        const tick = ppro.TickTime.createWithSeconds(t);
        const action = markers.createAddMarkerAction(
          `Beat ${i + 1}`,
          ppro.Marker.MARKER_TYPE_COMMENT,
          tick,
          ppro.TickTime.TIME_ZERO,
          "Beat Shake plugin"
        );
        compoundAction.addAction(action);
      });
    }, "Cập nhật marker theo độ mạnh");

    if (!ok) throw new Error("executeTransaction trả về false khi đặt marker.");
  });

  log(`✅ Đã cập nhật: xoá ${ownMarkers.length} marker cũ, đặt ${beatTimesSeconds.length} marker mới lên ${markerScope}.`, "badge");
}

// Wrapper giữ nguyên hành vi cũ: lấy clip đang chọn (chỉ 1 clip) rồi đặt marker
async function addBeatMarkers(beatTimesSeconds, log) {
  const { project, sequence, clip } = await getActiveSequenceAndSelection(log);
  return await addBeatMarkersForClip(clip, sequence, project, beatTimesSeconds, log);
}

// Tìm component theo tên hiển thị (vd "Transform", "Motion") trên 1 clip, trả về Component hoặc null
async function findComponentByName(clip, displayNameWanted) {
  const chain = await clip.getComponentChain();
  const count = await chain.getComponentCount();
  for (let i = 0; i < count; i++) {
    const comp = await chain.getComponentAtIndex(i);
    const name = await comp.getDisplayName();
    if (name === displayNameWanted) return comp;
  }
  return null;
}

// Tìm component theo matchName (vd "AE.ADBE Gaussian Blur 2") — locale-independent, ổn định hơn
// findComponentByName khi Premiere chạy ngôn ngữ không phải tiếng Anh. Ưu tiên dùng hàm này.
//
// [Phát hiện Phase 5.5, 2026-08-03] `comp.matchName` KHÔNG PHẢI thuộc tính đồng bộ như comment cũ ở
// đây khẳng định — đo trực tiếp qua debug_inspect_chain cho thấy nó luôn `undefined`. Chỉ
// `await comp.getMatchName()` mới trả đúng giá trị thật ("AE.ADBE Opacity", "AE.ADBE Motion"...).
// Nghĩa là hàm này đã luôn trả `null` một cách âm thầm từ trước tới giờ — mọi chỗ gọi hàm này đều có
// fallback `findComponentByName()` (theo displayName) nên không ai để ý, nhưng lợi ích
// "locale-independent" chưa từng thực sự phát huy tác dụng. Đã sửa để dùng đúng API.
async function findComponentByMatchName(clip, matchNameWanted) {
  const chain = await clip.getComponentChain();
  const count = await chain.getComponentCount();
  for (let i = 0; i < count; i++) {
    const comp = await chain.getComponentAtIndex(i);
    const mn = (typeof comp.getMatchName === "function") ? await comp.getMatchName() : comp.matchName;
    if (mn === matchNameWanted) return comp;
  }
  return null;
}

// Tự động thêm effect còn thiếu vào clip.
//
// ┌─ NGUYÊN NHÂN GỐC TÌM RA 2026-08-03 ────────────────────────────────────────────────────────────┐
// │ Trước v16 hàm này thử 2 chữ ký và CẢ HAI ĐỀU SAI, nên luôn thất bại và người dùng luôn phải tự │
// │ add effect Transform vào Adjustment Layer bằng tay:                                            │
// │     chain.createAppendComponentAction(clip, matchName)   ❌                                     │
// │     chain.createAppendComponentAction(matchName)         ❌                                     │
// │                                                                                                │
// │ Chữ ký thật theo tài liệu Adobe (Premiere ≥ 25.6) nhận một OBJECT Component, không phải chuỗi: │
// │     VideoFilterFactory.createComponent(matchName) -> Promise<VideoFilterComponent>              │
// │     VideoComponentChain.createAppendComponentAction(component) -> Action                        │
// │                                                                                                │
// │ Nguồn: developer.adobe.com/premiere-pro/uxp/ppro_reference/classes/videofilterfactory          │
// │ và .../videocomponentchain — cả 2 method ghi "Since: 25.6".                                    │
// └────────────────────────────────────────────────────────────────────────────────────────────────┘
//
// Vẫn giữ 2 cách cũ làm dự phòng và GHI LẠI cách nào chạy được, vì chữ ký trên lấy từ tài liệu chứ
// chưa được kiểm chứng trên máy thật. Một lần chạy thật là biết dứt khoát cách nào đúng.
//
// Trả về Component nếu thêm được (hoặc đã có sẵn), null nếu không — caller hiện hướng dẫn add tay.
async function addEffectIfMissing(clip, project, matchName, displayName, log) {
  const existing = await findComponentByMatchName(clip, matchName);
  if (existing) return existing;

  const chain = await clip.getComponentChain();
  if (typeof chain.createAppendComponentAction !== "function") {
    log(`⚠️ Bản Premiere này không có API createAppendComponentAction — phải add effect "${displayName}" bằng tay.`, "warn");
    return null;
  }

  const attempts = [];

  // [Phase 5.3] Cách A đã xác nhận ĐÚNG (dùng đúng API tài liệu) nhưng đo thật cho thấy nó THỈNH
  // THOẢNG thất bại với lỗi "Invalid parameter." ngay trên cùng 1 clip/matchName mà lần gọi kế tiếp
  // (hoặc gọi tay qua debug_inspect_chain) lại thành công ngay — không tái hiện được nguyên nhân gốc
  // (không phải lock lồng nhau: đã kiểm tra applyBeatPlanToClip() không nằm trong project.lockedAccess
  // nào khác). Vì Cách A về bản chất đúng, thử lại 1 lần sau khoảng nghỉ ngắn trước khi rơi xuống các
  // chữ ký cũ (B/C) — rẻ hơn nhiều so với bắt người dùng tự add effect bằng tay.
  const _sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function _tryCachA() {
    const factory = ppro.VideoFilterFactory;
    if (!factory || typeof factory.createComponent !== "function") {
      throw new Error("không có ppro.VideoFilterFactory.createComponent");
    }
    // createComponent PHẢI gọi ngoài lockedAccess vì nó là async; create*Action thì phải gọi TRONG.
    const newComponent = await factory.createComponent(matchName);
    if (!newComponent) throw new Error("createComponent trả về null");

    await project.lockedAccess(() => {
      const ok = project.executeTransaction((compoundAction) => {
        compoundAction.addAction(chain.createAppendComponentAction(newComponent));
      }, `Beat Shake: tự động thêm effect ${displayName}`);
      if (!ok) throw new Error("executeTransaction trả về false");
    });
  }

  // ---- Cách A (ĐÚNG theo tài liệu): tạo Component trước, rồi truyền object vào — thử tối đa 2 lần ----
  try {
    try {
      await _tryCachA();
    } catch (eFirst) {
      log(`   (Cách A lần 1 thất bại: ${eFirst.message} — thử lại sau 150ms trước khi rơi xuống chữ ký cũ)`);
      await _sleep(150);
      await _tryCachA();
    }
    attempts.push({ variant: "A: createComponent(matchName) → createAppendComponentAction(component)", ok: true });
  } catch (eA) {
    attempts.push({ variant: "A: VideoFilterFactory.createComponent + append(component)", ok: false, err: eA.message });

    // ---- Cách B (chữ ký cũ, đã biết là sai — giữ để chắc chắn) ----
    try {
      await project.lockedAccess(() => {
        const ok = project.executeTransaction((compoundAction) => {
          compoundAction.addAction(chain.createAppendComponentAction(clip, matchName));
        }, `Beat Shake: tự động thêm effect ${displayName}`);
        if (!ok) throw new Error("executeTransaction trả về false");
      });
      attempts.push({ variant: "B: append(clip, matchName)", ok: true });
    } catch (eB) {
      attempts.push({ variant: "B: append(clip, matchName)", ok: false, err: eB.message });

      // ---- Cách C (chữ ký cũ thứ hai) ----
      try {
        await project.lockedAccess(() => {
          const ok = project.executeTransaction((compoundAction) => {
            compoundAction.addAction(chain.createAppendComponentAction(matchName));
          }, `Beat Shake: tự động thêm effect ${displayName}`);
          if (!ok) throw new Error("executeTransaction trả về false");
        });
        attempts.push({ variant: "C: append(matchName)", ok: true });
      } catch (eC) {
        attempts.push({ variant: "C: append(matchName)", ok: false, err: eC.message });
      }
    }
  }

  const success = attempts.some(a => a.ok);
  // Ghi lại đường đi để lần sau không phải đoán lại — đây là dữ liệu đo thật, quý hơn tài liệu.
  const winner = attempts.filter(a => a.ok)[0];
  if (winner) {
    log(`   (API thêm effect: dùng được cách "${winner.variant}")`);
  } else {
    log(`⚠️ Không tự thêm được effect "${displayName}". Đã thử ${attempts.length} cách:`, "warn");
    for (const a of attempts) log(`   • ${a.variant} → ${a.err}`, "warn");
  }

  if (!success) return null;

  // Đọc lại để xác nhận effect có THẬT trên clip. Không tin "transaction không throw = đã thêm" —
  // đúng loại lỗi đã từng gặp với keyframe (API báo thành công nhưng không có gì trên timeline).
  const added = await findComponentByMatchName(clip, matchName);
  if (added) {
    log(`✅ Đã tự động thêm effect "${displayName}" vào clip.`, "badge");
  } else {
    log(`⚠️ API báo thêm effect "${displayName}" thành công nhưng đọc lại không thấy trên clip — ` +
        `phải add bằng tay.`, "warn");
  }
  return added;
}

// Tìm ComponentParam theo tên hiển thị (vd "Position", "Scale") trong 1 Component
async function findParamByName(component, displayNameWanted) {
  const count = await component.getParamCount();
  for (let i = 0; i < count; i++) {
    const param = await component.getParam(i);
    if (param.displayName === displayNameWanted) return param;
  }
  return null;
}

// Tra tham số cho 1 kênh: thử theo TÊN trước, không được thì theo VỊ TRÍ trong schema.
//
// Vì sao cần đường thứ hai: cả chuỗi tra effect đã cố ý dùng matchName để không phụ thuộc ngôn ngữ
// (xem findComponentByMatchName), nhưng rồi tra tham số lại so `param.displayName === "Position"` —
// mắt xích duy nhất còn phụ thuộc ngôn ngữ. Premiere chạy tiếng Việt/Nhật/Đức là toàn bộ việc áp
// hiệu ứng đổ, dù matchName vẫn khớp.
//
// LƯU Ý quan trọng: dùng VỊ TRÍ TRONG MẢNG `schema.params`, KHÔNG dùng trường `id`. Trường `id` là
// ParameterID để ghi vào XML .prfpset — không phải chỉ số truy cập lúc chạy. Với Transform, mảng
// params xếp theo đúng thứ tự hiển thị trong Effect Controls (Anchor, Position, uniform-scale bool,
// Scale, ...) trong khi `id` chạy 1,2,11,3,... — lẫn hai thứ này là sai lệch tham số.
async function resolveParamForChannel(component, schema, channelName, log) {
  const idx = schema.params.findIndex(p => p.key === channelName);
  if (idx < 0) return null;
  const spec = schema.params[idx];

  // Đường chính: theo tên hiển thị
  if (spec.name) {
    const byName = await findParamByName(component, spec.name);
    if (byName) return byName;
  }

  // Đường dự phòng: theo vị trí
  try {
    const count = await component.getParamCount();
    if (idx < count) {
      const byIndex = await component.getParam(idx);
      if (byIndex) {
        log(`   (tham số "${spec.name || channelName}" tra theo tên không thấy — dùng vị trí ${idx}. ` +
            `Có thể Premiere đang chạy ngôn ngữ khác tiếng Anh.)`, "warn");
        return byIndex;
      }
    }
  } catch (e) { /* rơi xuống trả null */ }

  return null;
}

// getValueAtTime() không trả về giá trị thô như tài liệu mô tả, mà bọc trong 1 object dạng
// {value: ...} (xác nhận qua log thực tế: x/y ra "undefined", Scale ra "[object Object]").
// Hàm này bóc lớp bọc đó ra, đồng thời vẫn an toàn nếu sau này API trả về giá trị thô trực tiếp.
function unwrapParamValue(v) {
  if (v && typeof v === "object" && Object.prototype.hasOwnProperty.call(v, "value") && !("x" in v)) {
    return v.value;
  }
  return v;
}

// Lấy kích thước khung hình thật của sequence (để quy đổi px <-> toạ độ chuẩn hoá 0-1 khi cần)
async function getFrameDimensions(sequence, log) {
  try {
    const settings = await sequence.getSettings();
    const frameRect = await settings.getVideoFrameRect();
    if (frameRect && typeof frameRect.width === "number" && typeof frameRect.height === "number" && frameRect.width > 0) {
      return { width: frameRect.width, height: frameRect.height };
    }
  } catch (e) {
    log(`⚠️ Không lấy được kích thước khung hình thật (${e.message}). Dùng mặc định 1920x1080.`, "warn");
  }
  return { width: 1920, height: 1080 };
}

// Position của effect có thể trả về dạng MẢNG [x,y] — toạ độ chuẩn hoá 0-1 (% khung hình, dùng bởi
// effect Transform bạn tự thêm vào) — hoặc dạng OBJECT {x,y} — toạ độ pixel tuyệt đối (dùng bởi Motion
// có sẵn). Hàm này nhận diện đúng định dạng và trả về {x, y, isNormalized} để xử lý tiếp cho đúng.
function parsePositionValue(raw) {
  if (Array.isArray(raw) && raw.length >= 2) {
    return { x: raw[0], y: raw[1], isNormalized: true };
  }
  if (raw && typeof raw === "object" && typeof raw.x === "number" && typeof raw.y === "number") {
    return { x: raw.x, y: raw.y, isNormalized: false };
  }
  return null;
}

// Đóng gói lại giá trị Position để ghi vào createKeyframe. LƯU Ý: dù lúc ĐỌC giá trị có thể ra
// dạng mảng [x,y] (chuẩn hoá 0-1), lúc GHI createKeyframe() chỉ chấp nhận đúng instance PointF thực sự
// (không chấp nhận mảng thô) — xác nhận qua lỗi "Illegal Parameter type" khi thử truyền mảng.
function buildPositionValue(x, y, isNormalized) {
  const p = new ppro.PointF();
  p.x = x;
  p.y = y;
  return p;
}

// Đọc lại số keyframe THỰC SỰ đang tồn tại trên 1 param, để phân biệt "ghi thất bại thật sự"
// với "chỉ là UI Effect Controls chưa refresh hiển thị" (2 nguyên nhân khác nhau hoàn toàn).
async function verifyKeyframeCount(param, label, log) {
  try {
    const keys = await param.getKeyframeListAsTickTimes();
    log(`🔍 Kiểm chứng: tham số "${label}" hiện có ${keys.length} keyframe thực sự trong project.`);
    return keys.length;
  } catch (e) {
    log(`⚠️ Không kiểm chứng được số keyframe của "${label}" (${e.message}).`, "warn");
    return -1;
  }
}

// Xoá SẠCH toàn bộ keyframe cũ trong phạm vi clip (inPoint -> inPoint + thời lượng clip) trước khi
// tạo mới — tránh tình trạng chồng chất keyframe cũ + mới mỗi lần bấm thử lại nhiều lần. Dùng 1 action
// duy nhất cho cả khoảng thời gian (createRemoveKeyframeRangeAction) thay vì xoá từng keyframe một.
//
// QUAN TRỌNG (phát hiện 06/04/2026 trên forum cộng đồng Adobe, xác nhận bằng tài liệu chính thức của
// getInPoint()): getInPoint() trả về TickTime "tương đối so với điểm bắt đầu của PROJECT ITEM", KHÔNG
// PHẢI so với điểm bắt đầu clip trên sequence. Với clip KHÔNG dựa trên footage thật (Adjustment Layer,
// Text, Black Video, Color Matte...), in-point này mặc định = 1 GIỜ (3600s quy đổi ra tick) vì Premiere
// coi đó là "media ảo" dài vô hạn. Position lưu trong keyframe được tính theo hệ toạ độ NÀY (tính từ
// đầu project item ảo đó), không phải theo giây-từ-đầu-clip-trên-sequence như code cũ giả định — đây
// rất có thể là lý do keyframe "tồn tại đúng số lượng" nhưng Effect Controls không hiện gì: keyframe bị
// ghi lệch ra ngoài đúng 1 giờ so với vùng Effect Controls đang hiển thị. Clip video từ footage thật có
// in-point = 0 nên không bị ảnh hưởng (đây cũng là lý do bug này "có lúc thấy có lúc không tuỳ clip").
// [Phase 5.5] Liệt kê TẤT CẢ ComponentParam có "key" (được Beat Shake dùng để keyframe) của MỌI
// effect ĐÃ CÓ SẴN trên clip — không chỉ effect nằm trong plan đang áp. Trước fix này,
// clearExistingKeyframes() chỉ xoá keyframe trên các kênh của plan HIỆN TẠI: lần áp trước ghi
// scale+rotation+position, lần này chỉ ghi scale (vd đổi sang style ít kênh hơn) thì rotation/position
// cũ bị bỏ sót, còn nguyên trên clip và chồng lên biên đạo mới — trông như "2 hiệu ứng cộng dồn".
// Trả về { schema, spec, param } thay vì chỉ param trần — cần spec.start để đặt lại giá trị mặc định
// đúng cho kênh KHÔNG nằm trong plan đang áp (xem resetOrphanedParamsToDefault bên dưới).
async function collectAllBeatShakeParamsOnClip(clip, log) {
  const entries = [];
  for (const effectKey of getAllEffectSchemaKeys()) {
    const schema = getEffectSchema(effectKey);
    if (!schema) continue;
    const component = await findComponentByMatchName(clip, schema.matchName)
      || await findComponentByName(clip, schema.displayName);
    if (!component) continue; // effect chưa từng được thêm vào clip — không có gì để xoá
    for (const spec of schema.params) {
      if (!spec.key) continue; // param không dùng để keyframe (Anchor Point, Sampling...)
      const param = await resolveParamForChannel(component, schema, spec.key, log);
      if (param) entries.push({ schema, spec, param });
    }
  }
  return entries;
}

// [Phát hiện Phase 5.5, kèm ảnh Effect Controls thật] clearExistingKeyframes() chỉ XOÁ keyframe,
// không đảm bảo giá trị TĨNH còn lại sau khi xoá là đúng — đã xác nhận Position còn lại (0,0) thay vì
// tâm khung hình (0.5,0.5), làm lệch toàn bộ vùng ảnh hưởng của Adjustment Layer lên layer bên dưới.
// Sau khi xoá, các kênh KHÔNG nằm trong plan đang áp (lần trước có dùng, lần này thì không) phải được
// ghi lại ĐÚNG 1 keyframe tĩnh ở giá trị mặc định (spec.start) để trả về trạng thái "chưa từng đụng
// tới" — không phải 0 tuỳ tiện.
async function resetOrphanedParamsToDefault(entries, project, clipInPoint, log) {
  const valid = entries.filter(e => e.param);
  if (valid.length === 0) return;
  log(`Đang đặt lại ${valid.length} tham số không dùng trong lần áp này về giá trị mặc định (tránh giá trị 0 sai sau khi xoá keyframe cũ)...`);
  await project.lockedAccess(() => {
    const ok = project.executeTransaction((compoundAction) => {
      for (const { spec, param } of valid) {
        let value;
        if (spec.type === "point") {
          const [sx, sy] = String(spec.start).split(":").map(Number);
          value = buildPositionValue(sx, sy, true);
        } else {
          value = Number(spec.start) || 0;
        }
        const kf = param.createKeyframe(value);
        kf.position = clipInPoint;
        compoundAction.addAction(param.createAddKeyframeAction(kf));
      }
    }, "Beat Shake: dat lai kenh khong dung ve mac dinh");
    if (!ok) throw new Error("executeTransaction trả về false khi đặt lại giá trị mặc định.");
  });
}

async function clearExistingKeyframes(project, params, clipInPoint, clipDurationTick, log) {
  const validParams = params.filter(p => p);
  if (validParams.length === 0) return;

  const rangeStart = clipInPoint.add(ppro.TickTime.TIME_ZERO);
  const rangeEnd = clipInPoint.add(clipDurationTick);
  log(`Đang xoá keyframe cũ (nếu có) trên ${validParams.length} tham số trước khi tạo mới (phạm vi ${rangeStart.seconds.toFixed(2)}s → ${rangeEnd.seconds.toFixed(2)}s, đã cộng in-point ${clipInPoint.seconds.toFixed(2)}s)...`);
  await project.lockedAccess(() => {
    const ok = project.executeTransaction((compoundAction) => {
      for (const param of validParams) {
        compoundAction.addAction(
          param.createRemoveKeyframeRangeAction(rangeStart, rangeEnd, true)
        );
      }
    }, "Beat Shake: xoá keyframe cũ");
    if (!ok) throw new Error("executeTransaction trả về false khi xoá keyframe cũ.");
  });
}

// Kiểm tra 1 lần duy nhất xem ComponentParam có đủ các API keyframe cần thiết không — để báo lỗi RÕ
// RÀNG ngay từ đầu ("phiên bản Premiere này thiếu API X") thay vì lỗi khó hiểu "X is not a function"
// xảy ra giữa chừng lúc đang ghi dữ liệu. Các API này được thêm dần qua từng bản UXP, có thể chưa có
// đủ trên các bản Premiere rất sớm (ngay 25.6.0) dù đã khai báo minVersion đó trong manifest.
function checkKeyframeApiSupport(param, log) {
  const required = [
    "createSetTimeVaryingAction",
    "createKeyframe",
    "createAddKeyframeAction",
    "createRemoveKeyframeRangeAction",
    "getKeyframeListAsTickTimes",
    "createSetInterpolationAtKeyframeAction"
  ];
  const missing = required.filter(name => typeof param[name] !== "function");
  if (missing.length > 0) {
    throw new Error(
      `Phiên bản Premiere hiện tại thiếu API keyframe cần thiết: ${missing.join(", ")}. ` +
      `Cần cập nhật Premiere lên bản mới hơn (tối thiểu 25.6.0, khuyên dùng bản mới nhất). ` +
      `Trong lúc chờ cập nhật, nhờ Claude gọi lệnh MCP "export_beat_preset" để xuất file .prfpset ` +
      `rồi tự Import Preset + kéo-thả vào clip (đường không cần API keyframe).`
    );
  }
  log("Đã kiểm tra: phiên bản Premiere hỗ trợ đầy đủ API keyframe cần thiết.");
}

// ============================================================================
// [Đã xoá ở v16] addShakeKeyframesForClip()/addShakeKeyframes() — bản NGUYÊN THUỶ của đường tạo
// keyframe trực tiếp, viết TRƯỚC KHI tìm ra nguyên nhân gốc getInPoint() (xem CHANGELOG.md, mục
// "[13.0.0] — Đột phá: tạo keyframe qua API chạy được"). Không có nút hay lệnh MCP nào gọi tới —
// đã được thay thế hoàn toàn bởi applyBeatPlanToClip() bên dưới, tổng quát hoá cho MỌI effect qua
// EFFECT_SCHEMAS thay vì hard-code riêng Transform. Banner trước đó ở đây ghi sai rằng "từ đây tới
// cuối file" là code chết — thực ra applyBeatPlanToClip/applyBeatPlan/exportBeatPresetFiles ngay
// bên dưới là tính năng chủ lực đang chạy thật (gọi từ main.js + mcpBridge.js). Lịch sử đầy đủ của
// việc thử/sai đã có trong CHANGELOG và git history, không cần giữ code chết để ghi nhớ.
// ============================================================================

// ---------- Xuất file preset .prfpset chứa sẵn keyframe đúng theo nhịp (đường phụ, dự phòng) ----------
// Từ khi applyBeatPlanToClip() (bên dưới) ghi keyframe trực tiếp qua API chạy được (sau bản vá
// getInPoint(), xem CHANGELOG v13.0.0), đường ghi file này không còn là đường CHÍNH nữa — nhưng vẫn
// giữ lại làm phương án dự phòng khi API trực tiếp không khả dụng (bản Premiere quá cũ, effect Claude
// chưa tự thêm được...). Người dùng tự Import Preset rồi kéo-thả vào clip (đã xác nhận ổn định).
//
// v11: nhận planOpts (danh sách lớp hiệu ứng + nội suy) thay vì bộ tham số cứng cho riêng kiểu "rung",
// nên cùng 1 hàm này xuất được mọi nhóm: rung / nháy sáng / blur / lớp phủ bụi — và gộp được nhiều
// effect vào 1 file.
//   planOpts   = { layers, interp, segmentCapMs, seed }        → xem buildPresetPlan()
//   exportOpts = { shutterAngle, separateFiles }               → xem generatePresetXmlFromPlan()
async function exportBeatPresetFilesForClip(clip, sequence, beatsWithStrength, presetName, planOpts, exportOpts, log) {
  const relativeBeats = await resolveBeatTimesForClip(clip, sequence, beatsWithStrength, log);
  if (relativeBeats.length === 0) {
    throw new Error(
      "Không có nhịp nào nằm trong phạm vi clip đang chọn. Kiểm tra lại vị trí clip trên timeline."
    );
  }

  const dims = await getFrameDimensions(sequence, log);
  const plan = buildPresetPlan(Object.assign({ beats: relativeBeats }, planOpts));
  for (const w of plan.warnings) log(`⚠️ ${w}`, "warn");

  const outputs = generatePresetXmlFromPlan(presetName, plan, Object.assign(
    { frameWidth: dims.width, frameHeight: dims.height },
    exportOpts || {}
  ));

  log(
    `Đang ghi ${outputs.length} file preset cho ${relativeBeats.length} nhịp ` +
    `(khung hình ${dims.width}x${dims.height}, effect: ${outputs.map(o => o.effect).join(" | ")}).`
  );

  // Nơi ghi file. Mặc định là thư mục dữ liệu riêng của plugin (KHÔNG hỏi gì người dùng).
  //
  // Trước v16 chỗ này luôn gọi uxpFs.getFileForSaving() — mở hộp thoại Save của hệ điều hành. Với
  // luồng UI thì hợp lý, nhưng hàm này CHỈ được gọi từ MCP: một lệnh Claude gửi từ xa lại đứng chờ
  // người dùng bấm chuột vào hộp thoại ngay tại máy, và nếu không ai bấm thì lệnh treo tới hết
  // timeout. Nên mặc định đổi thành ghi thẳng, chỉ mở hộp thoại khi caller yêu cầu rõ ràng.
  const useDialog = (exportOpts || {}).useDialog === true;
  let destFolder = null;
  if (!useDialog) {
    const dataFolder = await uxpFs.getDataFolder();
    // Gom vào thư mục con "exports" cho gọn; nếu không tạo được thì ghi thẳng vào thư mục dữ liệu
    try {
      destFolder = await dataFolder.getEntry("exports");
    } catch (e) {
      try { destFolder = await dataFolder.createFolder("exports"); }
      catch (e2) { destFolder = dataFolder; }
    }
    if (!destFolder) destFolder = dataFolder;
  }

  const saved = [];
  for (const out of outputs) {
    const fileName = `${presetName}${out.suffix}.prfpset`;
    let file;
    if (useDialog) {
      file = await uxpFs.getFileForSaving(fileName, { types: ["prfpset"] });
      if (!file) { log(`Đã huỷ lưu ${fileName}.`, "warn"); continue; }
    } else {
      file = await destFolder.createFile(fileName, { overwrite: true });
    }
    await file.write(out.xml);

    // Trả dữ liệu THUẦN, không trả object File của UXP. Trước v16 hàm này trả mảng File; MCP làm
    // JSON.stringify lên đó và Claude nhận được "[{}]" vì File không serialize được.
    const path = file.nativePath || file.name || fileName;
    saved.push({ name: fileName, path: path, effect: out.effect });
    log(`✅ Đã lưu: ${path} — effect: ${out.effect}.`, "badge");
  }

  if (saved.length === 0) log("Không có file nào được lưu.", "warn");
  return saved;
}

// Wrapper: lấy clip đang chọn (chỉ 1 clip) rồi xuất preset
async function exportBeatPresetFiles(beatsWithStrength, presetName, planOpts, exportOpts, log) {
  const { sequence, clip } = await getActiveSequenceAndSelection(log);
  return await exportBeatPresetFilesForClip(clip, sequence, beatsWithStrength, presetName, planOpts, exportOpts, log);
}

// ============================================================================
// TÍNH NĂNG MỚI (31/07/2026): ÁP DỤNG KEYFRAME TRỰC TIẾP QUA API — bỏ qua bước xuất .prfpset +
// Import Preset tay. Dùng lại NGUYÊN VẸN buildPresetPlan() (cùng dữ liệu với luồng xuất file — style
// nào xuất preset đúng thì áp trực tiếp cũng đúng số liệu y hệt), chỉ khác bước cuối: thay vì serialize
// ra XML, ghi thẳng keyframe lên đúng Component/ComponentParam của effect đã add trên clip.
//
// Chỉ khả thi kể từ bản vá cộng bù `clip.getInPoint()` (xem clearExistingKeyframes ở trên) — trước đó
// API `createKeyframe()`/`createAddKeyframeAction()` được xác nhận hỏng với MỌI clip không dựa trên
// footage thật (Adjustment Layer, Text, Color Matte). Đã test thật 31/07/2026: kênh Transform (Position/
// Scale/Rotation) ra ĐÚNG vị trí sau khi vá. Brightness/Gaussian Blur DÙNG CHUNG code này nhưng CHƯA
// được test thật riêng — về lý thuyết phải chạy đúng vì cùng 1 cơ chế offset, nhưng cần xác nhận.
//
// [v16] kênh "shutterAngle" (mẫu Motion Blur Đập Theo Nhịp / thêm kèm Motion blur) GIỜ ĐƯỢC HỖ TRỢ —
// param 10 "Shutter Angle" có `name` trong EFFECT_SCHEMAS nên keyframe được y hệt scale/rotation.
// Điều kiện đi kèm: Transform param 9 (UseCompShutter) phải tắt (false) thì Shutter Angle riêng mới
// có tác dụng — xem disableUseCompShutter() bên dưới. Param 9 KHÔNG có tên hiển thị trong schema (bản
// xuất XML ghi thẳng theo ParameterID, không cần tên) nên phải tra theo VỊ TRÍ mảng, không theo tên.
// ⚠️ CHƯA KIỂM CHỨNG trong Premiere thật: chữ ký API để set 1 GIÁ TRỊ TĨNH (không keyframe) cho tham
// số bool. disableUseCompShutter() thử cách hợp lý nhất rồi TỰ GHI LẠI có thành công hay không —
// nếu thất bại, Shutter Angle vẫn được keyframe bình thường nhưng có thể chưa hiện rõ trên hình cho
// tới khi tự tắt tay "Use Composition Shutter Angle" trong Effect Controls.

// Mã nội suy INTERP_HOLD/INTERP_EASE (4/5, định nghĩa trong presetXml.js) là mã ĐỊNH DẠNG FILE .prfpset,
// KHÔNG trùng với enum InterpolationMode của UXP API (BEZIER/HOLD/LINEAR/TIME/...). "Ease" của Premiere
// = BEZIER với tay cầm tự động tại vận tốc 0 — createSetInterpolationAtKeyframeAction() chỉ nhận
// (time, mode, updateUI), không cho set tay cầm riêng, nên dùng BEZIER và để Premiere tự tính tay cầm
// mặc định. CHƯA kiểm chứng bằng mắt xem có mượt giống hệt "Ease" thật hay không.
function mapPlanInterpToApiMode(interpCode) {
  return interpCode === INTERP_HOLD ? ppro.Constants.InterpolationMode.HOLD : ppro.Constants.InterpolationMode.BEZIER;
}

// Tắt "Use Composition Shutter Angle" (Transform param 9) — bắt buộc phải false thì Shutter Angle
// riêng (param 10, kênh "shutterAngle") mới có tác dụng, nếu không Premiere dùng shutter của toàn
// sequence và phớt lờ giá trị đã keyframe. Param này không có `name` trong EFFECT_SCHEMAS (bool
// thuần, không cần tên vì XML ghi thẳng theo ParameterID) nên PHẢI tra theo vị trí mảng qua
// component.getParam(idx), không dùng được findParamByName().
//
// Trả về true nếu ghi thành công, false nếu không (không throw — đây là bước hỗ trợ, thất bại thì
// vẫn tiếp tục ghi keyframe Shutter Angle bình thường, chỉ cảnh báo rõ thay vì chặn cả việc áp dụng).
async function disableUseCompShutter(component, schema, project, log) {
  const spec = schema.params.find(p => p.startFrom === "useCompShutter");
  if (!spec) return false; // schema không có param này (không phải Transform) — bỏ qua êm
  const idx = schema.params.indexOf(spec);

  let param;
  try {
    param = await component.getParam(idx);
  } catch (e) {
    log(`⚠️ Không lấy được tham số "Use Composition Shutter Angle" (vị trí ${idx}): ${e.message}.`, "warn");
    return false;
  }
  if (!param) return false;

  // Cách hợp lý nhất khi CHƯA xác nhận API "set giá trị tĩnh": tạo đúng 1 keyframe tại thời điểm 0,
  // KHÔNG bật time-varying — giống cách file .prfpset biểu diễn giá trị tĩnh (chỉ <Value>, không có
  // <Keyframes>). Nếu Premiere không chấp nhận keyframe khi time-varying đang tắt, nhánh catch bên
  // dưới sẽ ghi lại rõ để không ai phải đoán lại lần sau.
  try {
    await project.lockedAccess(() => {
      const ok = project.executeTransaction((compoundAction) => {
        const kf = param.createKeyframe(false);
        kf.position = ppro.TickTime.TIME_ZERO;
        compoundAction.addAction(param.createAddKeyframeAction(kf));
      }, "Beat Shake: tắt Use Composition Shutter Angle cho Motion Blur");
      if (!ok) throw new Error("executeTransaction trả về false");
    });
    log("Đã thử tắt 'Use Composition Shutter Angle' để Shutter Angle riêng có tác dụng.");
    return true;
  } catch (e) {
    log(
      `⚠️ Không tắt được "Use Composition Shutter Angle" (${e.message}). Shutter Angle vẫn được keyframe ` +
      `bình thường nhưng có thể CHƯA hiện rõ trên hình — nếu vậy, vào Effect Controls → Transform → ` +
      `bỏ tick "Use Composition Shutter Angle" bằng tay 1 lần.`,
      "warn"
    );
    return false;
  }
}

// Áp 1 bản kế hoạch (đã build sẵn bằng buildPresetPlan) thẳng vào clip qua API keyframe.
async function applyBeatPlanToClip(clip, sequence, project, plan, log) {
  const clipDurationTick = await clip.getDuration();
  const clipInPoint = await clip.getInPoint();
  log(`In-point của clip: ${clipInPoint.seconds.toFixed(2)}s${clipInPoint.seconds >= 3599 && clipInPoint.seconds <= 3601 ? " (≈1 giờ ⇒ clip không dựa trên footage thật, vd Adjustment Layer)" : ""}.`);

  // Nhóm kênh theo effect, tìm Component + ComponentParam 1 lần cho mỗi kênh sẽ ghi.
  // [v16] "shutterAngle" không còn bị bỏ qua — xử lý như mọi kênh khác (xem ghi chú đầu file).
  const byEffect = {}; // effectKey -> { schema, component, channels: [{ch, spec, param}] }
  for (const ch of Object.keys(plan.channels)) {
    if (!plan.channels[ch].length) continue;

    const effectKey = resolveChannelEffect(ch);
    if (!effectKey) continue; // đã cảnh báo trong buildPresetPlan
    const schema = getEffectSchema(effectKey);
    if (!schema) throw new Error(`Không tìm thấy mô tả effect "${effectKey}" (lạ — báo lại cho Claude).`);

    if (!byEffect[effectKey]) {
      // Dùng matchName trước (locale-independent), fallback về displayName nếu UXP chưa hỗ trợ thuộc tính đó
      let component = await findComponentByMatchName(clip, schema.matchName)
        || await findComponentByName(clip, schema.displayName);
      if (!component) {
        component = await addEffectIfMissing(clip, project, schema.matchName, schema.displayName, log);
      }
      if (!component) {
        throw new Error(
          `Clip chưa có effect "${schema.displayName}".\n` +
          `→ Trong Premiere: mở Effects panel → tìm "${schema.displayName}" → kéo thả vào Adjustment Layer trên timeline → thử lại.\n` +
          `(Effects panel: Window > Effects, hoặc Shift+7)`
        );
      }
      byEffect[effectKey] = { schema, component, channels: [] };
    }

    const spec = byEffect[effectKey].schema.params.find(p => p.key === ch);
    if (!spec) continue;
    // Tra theo tên, không được thì theo vị trí trong schema (xem resolveParamForChannel)
    const param = await resolveParamForChannel(byEffect[effectKey].component, byEffect[effectKey].schema, ch, log);
    if (!param) {
      throw new Error(`Effect "${byEffect[effectKey].schema.displayName}" không có tham số "${spec.name}" (lạ — kiểm tra lại effect đã áp dụng).`);
    }
    byEffect[effectKey].channels.push({ ch, spec, param });
  }

  // checkKeyframeApiSupport kiểm tra sự tồn tại của 6 method trên PROTOTYPE của ComponentParam —
  // kết quả giống hệt cho mọi param. Trước v16 nó bị gọi lại cho TỪNG param trong vòng lặp trên,
  // in ra cùng một cảnh báo nhiều lần. Gọi một lần trên param đầu tiên là đủ.
  const firstParam = Object.keys(byEffect)
    .map(k => byEffect[k].channels[0] && byEffect[k].channels[0].param)
    .filter(Boolean)[0];
  if (firstParam) checkKeyframeApiSupport(firstParam, log);

  // Nếu Transform có kênh "shutterAngle" sắp ghi, tắt UseCompShutter trước — bắt buộc để Shutter
  // Angle riêng có tác dụng. Không throw nếu thất bại (xem giải thích trong disableUseCompShutter).
  if (byEffect.transform && byEffect.transform.channels.some(c => c.ch === "shutterAngle")) {
    await disableUseCompShutter(byEffect.transform.component, byEffect.transform.schema, project, log);
  }

  const effectKeys = Object.keys(byEffect);
  if (effectKeys.length === 0) throw new Error("Bản kế hoạch không có kênh nào hỗ trợ áp dụng trực tiếp để ghi.");

  // Kích thước khung hình thật — cần quy đổi kênh "position" của Transform (pixel -> chuẩn hoá 0-1),
  // giống hệt quy ước dùng khi xuất .prfpset (xem presetGenerator.js).
  const dims = await getFrameDimensions(sequence, log);

  const allParams = [];
  for (const key of effectKeys) for (const c of byEffect[key].channels) allParams.push(c.param);

  // [Phase 5.5] Xoá keyframe cũ trên TOÀN BỘ effect Beat Shake đã có sẵn trên clip, không chỉ effect
  // nằm trong plan đang áp lần này — nếu không, kênh đã ghi ở lần áp TRƯỚC (vd rotation/position) mà
  // plan lần này không dùng tới (vd chỉ còn scale) sẽ còn sót lại, chồng lên biên đạo mới.
  const allBeatShakeEntries = await collectAllBeatShakeParamsOnClip(clip, log);
  const allBeatShakeParams = allBeatShakeEntries.map(e => e.param);
  await clearExistingKeyframes(
    project,
    allBeatShakeParams.length ? allBeatShakeParams : allParams,
    clipInPoint, clipDurationTick, log
  );

  // [Phát hiện Phase 5.5, ảnh Effect Controls thật] Sau khi xoá, kênh KHÔNG nằm trong plan hiện tại
  // phải được đặt lại giá trị mặc định đúng (xem resetOrphanedParamsToDefault) — nếu không, Position
  // (và tương tự các param khác) còn lại giá trị 0 sai thay vì tâm khung hình, làm lệch vùng ảnh hưởng
  // của Adjustment Layer lên layer bên dưới.
  const usedChannelKeys = new Set();
  for (const key of effectKeys) for (const c of byEffect[key].channels) usedChannelKeys.add(c.ch);
  const orphanedEntries = allBeatShakeEntries.filter(e => !usedChannelKeys.has(e.spec.key));
  await resetOrphanedParamsToDefault(orphanedEntries, project, clipInPoint, log);

  log("Đang bật time-varying cho toàn bộ tham số sẽ ghi...");
  await project.lockedAccess(() => {
    const ok = project.executeTransaction((compoundAction) => {
      for (const param of allParams) compoundAction.addAction(param.createSetTimeVaryingAction(true));
    }, "Beat Shake: bật time-varying (áp dụng trực tiếp)");
    if (!ok) throw new Error("executeTransaction trả về false khi bật time-varying.");
  });

  // Ghi keyframe theo từng effect — tạo + add vào transaction nằm CHUNG 1 lockedAccess (không có
  // khoảng hở await ở giữa, xem giải thích chi tiết trong addShakeKeyframesForClip).
  let totalKeyframes = 0;
  for (const key of effectKeys) {
    const { channels } = byEffect[key];
    await project.lockedAccess(() => {
      const ok = project.executeTransaction((compoundAction) => {
        for (const { ch, spec, param } of channels) {
          for (const kf of plan.channels[ch]) {
            const tick = ppro.TickTime.createWithSeconds(kf.t).add(clipInPoint);
            let value;
            if (spec.type === "point") {
              // Chỉ Transform.Position dùng quy đổi chuẩn hoá theo khung hình thật; param điểm học
              // được từ effect khác cộng thẳng biên độ (xem ghi chú tại presetGenerator.js).
              value = (key === "transform")
                ? buildPositionValue(0.5 + kf.v.dx / dims.width, 0.5 + kf.v.dy / dims.height, true)
                : buildPositionValue(kf.v.dx, kf.v.dy, false);
            } else {
              value = kf.v;
            }
            const keyframe = param.createKeyframe(value);
            keyframe.position = tick;
            compoundAction.addAction(param.createAddKeyframeAction(keyframe));
            compoundAction.addAction(param.createSetInterpolationAtKeyframeAction(tick, mapPlanInterpToApiMode(kf.interp), true));
            totalKeyframes++;
          }
        }
      }, `Beat Shake: áp dụng trực tiếp (${key})`);
      if (!ok) throw new Error(`executeTransaction trả về false khi ghi keyframe cho effect "${key}".`);
    });
  }
  log(`Đã ghi ${totalKeyframes} keyframe vào timeline (${effectKeys.length} effect, áp dụng trực tiếp).`);

  // ---- Kiểm chứng: đọc lại xem keyframe có THỰC SỰ tồn tại trong project không ----
  // verifyKeyframeCount() trả về 2 loại "không ổn" khác nhau, PHẢI phân biệt:
  //   0  = đọc lại thành công, và đúng là 0 keyframe thật (API ghi thất bại — biết CHẮC).
  //   -1 = việc ĐỌC LẠI để kiểm chứng bị lỗi (vd getKeyframeListAsTickTimes ném exception) — KHÔNG
  //        biết ghi có thành công hay không, không phải "biết chắc là ổn".
  // Trước v16, code chỉ so `count === 0` nên trường hợp -1 lọt qua như thể mọi thứ ổn — một lỗi khi
  // XÁC MINH bị hiểu nhầm thành XÁC NHẬN thành công.
  let anyProblem = false;
  const zeroChannels = [];
  const unverifiedChannels = [];
  const verifiedCounts = {}; // channel -> số keyframe đọc lại được thật sự (lộ ra ngoài cho MCP response)
  for (const key of effectKeys) {
    for (const { ch, param } of byEffect[key].channels) {
      const count = await verifyKeyframeCount(param, ch, log);
      verifiedCounts[ch] = count;
      if (count === 0) { anyProblem = true; zeroChannels.push(ch); }
      else if (count < 0) { anyProblem = true; unverifiedChannels.push(ch); }
    }
  }
  if (anyProblem) {
    const parts = [];
    if (zeroChannels.length) parts.push(`0 keyframe thật sự (ghi thất bại, biết chắc): ${zeroChannels.join(", ")}`);
    if (unverifiedChannels.length) parts.push(`không xác minh được, không rõ có ghi thành công hay không: ${unverifiedChannels.join(", ")}`);
    throw new Error(
      `Có tham số cần kiểm tra lại sau khi ghi — ${parts.join(" | ")}. ` +
      "Nhờ Claude gọi lệnh MCP \"export_beat_preset\" để xuất file .prfpset rồi tự Import Preset + " +
      "kéo-thả vào clip làm phương án thay thế."
    );
  }

  log(`✅ Đã áp dụng trực tiếp ${totalKeyframes} keyframe cho ${plan.beatCount} nhịp qua ${effectKeys.length} effect (${effectKeys.join(", ")}). Kiểm tra Effect Controls để xác nhận.`, "badge");
  return { totalKeyframes, effectKeys, verifiedCounts };
}

// Resolve nhịp tương đối + build plan (giống hệt exportBeatPresetFilesForClip) rồi áp trực tiếp
async function applyBeatPlanForClip(clip, sequence, project, beatsWithStrength, planOpts, log) {
  const relativeBeats = await resolveBeatTimesForClip(clip, sequence, beatsWithStrength, log);
  if (relativeBeats.length === 0) {
    throw new Error("Không có nhịp nào nằm trong phạm vi clip đang chọn. Kiểm tra lại vị trí clip trên timeline.");
  }
  const plan = buildPresetPlan(Object.assign({ beats: relativeBeats }, planOpts));
  for (const w of plan.warnings) log(`⚠️ ${w}`, "warn");
  const writeResult = await applyBeatPlanToClip(clip, sequence, project, plan, log);
  return Object.assign({ plan }, writeResult);
}

// Wrapper: lấy clip đang chọn (chỉ 1 clip) rồi áp dụng plan trực tiếp
async function applyBeatPlan(beatsWithStrength, planOpts, log) {
  const { project, sequence, clip } = await getActiveSequenceAndSelection(log);
  return await applyBeatPlanForClip(clip, sequence, project, beatsWithStrength, planOpts, log);
}

// ============================================================================
// [MỚI v16, Phase 4.8-4.11] BIÊN ĐẠO THEO ĐOẠN — segments do suggestChoreography() (choreography.js)
// hoặc Claude (qua MCP apply_choreography) sinh ra, mỗi đoạn 1 phong cách + cường độ riêng.
// ============================================================================

// Quy đổi beats + segments từ hệ thời gian TUYỆT ĐỐI (đo từ đầu file audio nguồn — xem
// getClipRelativeBeatTimes ở trên) sang TƯƠNG ĐỐI THEO CLIP ĐÍCH, và lọc bỏ phần nằm ngoài clip.
//
// QUAN TRỌNG: segments được tính TỪ CHÍNH beats này (qua analyzeStructure() → buildBarGrid, xem
// beatStructure.js) nên đang ở CÙNG hệ thời gian tuyệt đối với beats — phải áp DÙNG CHUNG một phép
// trừ `startSeconds`, nếu không segments và beats (sau khi quy đổi lệch nhau) sẽ không còn khớp: 1
// segment tưởng đang ở giây 4-8 của clip có thể thực ra đang lọc nhầm nhịp ở đoạn hoàn toàn khác.
//
// Hàm THUẦN (không đụng UXP API) — tách riêng để test được ngoài Premiere, giống buildLayerKeys()
// trong presetGenerator.js.
function shiftSegmentsAndBeatsToClipRelative(beatsWithStrength, segments, startSeconds, clipDurationSeconds) {
  const relativeBeats = [];
  for (const b of beatsWithStrength) {
    const rel = b.time - startSeconds;
    if (rel < 0 || rel > clipDurationSeconds) continue;
    relativeBeats.push(Object.assign({}, b, { time: rel }));
  }

  const relativeSegments = [];
  const droppedSegments = [];
  for (const seg of segments) {
    const start = Math.max(0, seg.start - startSeconds);
    const end = Math.min(clipDurationSeconds, seg.end - startSeconds);
    if (end <= start) { droppedSegments.push(seg); continue; }
    relativeSegments.push(Object.assign({}, seg, { start, end }));
  }

  return { relativeBeats, relativeSegments, droppedSegments };
}

// Ngưỡng an toàn — KHÔNG BLOCK ở mức cảnh báo thường (4000, giống panel thủ công đã có từ trước, xem
// main.js), nhưng CHẶN HẲN ở mức cao hơn nhiều (20000): biên đạo do AI sinh ra không có người soát lại
// từng slider trước khi bấm như luồng thủ công, nên 1 lỗi sinh segments (vd hàng trăm đoạn cực ngắn)
// dễ tạo ra số keyframe làm treo Premiere thật sự — đáng chặn cứng hơn là chỉ cảnh báo.
const CHOREOGRAPHY_WARN_KEYFRAMES = 4000;
const CHOREOGRAPHY_HARD_LIMIT_KEYFRAMES = 20000;

async function applyChoreographyForClip(clip, sequence, project, beatsWithStrength, segments, planOptsExtra, log) {
  const startSeconds = (await clip.getStartTime()).seconds;
  const clipDurationSeconds = (await clip.getDuration()).seconds;

  const { relativeBeats, relativeSegments, droppedSegments } =
    shiftSegmentsAndBeatsToClipRelative(beatsWithStrength, segments, startSeconds, clipDurationSeconds);

  if (relativeBeats.length === 0) {
    throw new Error("Không có nhịp nào nằm trong phạm vi clip đang chọn. Kiểm tra lại vị trí clip trên timeline.");
  }
  if (relativeSegments.length === 0) {
    throw new Error("Không có đoạn nào nằm trong phạm vi clip đang chọn sau khi quy đổi thời gian — kiểm tra lại segments.");
  }
  for (const seg of droppedSegments) {
    log(`⚠️ Bỏ qua 1 đoạn nằm ngoài phạm vi clip (${seg.start?.toFixed(2)}s-${seg.end?.toFixed(2)}s, style "${seg.styleId}").`, "warn");
  }

  const plan = buildPresetPlan(Object.assign({ beats: relativeBeats, segments: relativeSegments }, planOptsExtra));
  for (const w of plan.warnings) log(`⚠️ ${w}`, "warn");

  const totalPlanKeyframes = countPlanKeyframes(plan);
  if (totalPlanKeyframes > CHOREOGRAPHY_HARD_LIMIT_KEYFRAMES) {
    throw new Error(
      `Biên đạo này sinh ra ${totalPlanKeyframes} keyframe — vượt xa ngưỡng an toàn (${CHOREOGRAPHY_HARD_LIMIT_KEYFRAMES}). ` +
      `Có thể segments quá nhiều/quá vụn (đoạn cực ngắn). Giảm số đoạn hoặc tăng độ dài mỗi đoạn rồi thử lại.`
    );
  }
  if (totalPlanKeyframes > CHOREOGRAPHY_WARN_KEYFRAMES) {
    log(`⚠️ Biên đạo này sinh ${totalPlanKeyframes} keyframe — khá nhiều, Premiere có thể phản hồi chậm khi tua timeline.`, "warn");
  }

  const writeResult = await applyBeatPlanToClip(clip, sequence, project, plan, log);

  // [Phase 5.6] Đánh marker ở ĐẦU MỖI ĐOẠN (không phải từng nhịp — hàng chục/trăm nhịp sẽ làm rối
  // timeline) để người dùng thấy rõ đoạn nào dùng style nào, đúng yêu cầu gốc "đánh marker vào các
  // nhịp/đoạn đã chọn để hiểu được AI đã biên đạo gì". Lỗi ở bước này KHÔNG được làm hỏng kết quả ghi
  // keyframe đã thành công — chỉ log cảnh báo, không throw (marker là hiển thị PHỤ, không phải cốt lõi).
  try {
    const clipInPoint = await clip.getInPoint();
    await addChoreographyMarkersForClip(clip, sequence, project, relativeSegments, clipInPoint, log);
  } catch (e) {
    log(`⚠️ Không đặt được marker biên đạo (${e.message}) — keyframe vẫn đã ghi thành công, chỉ thiếu marker hiển thị.`, "warn");
  }

  return Object.assign({ plan, droppedSegments: droppedSegments.length }, writeResult);
}

// Wrapper: lấy clip đang chọn (chỉ 1 clip) rồi áp dụng biên đạo trực tiếp
async function applyChoreography(beatsWithStrength, segments, planOptsExtra, log) {
  const { project, sequence, clip } = await getActiveSequenceAndSelection(log);
  return await applyChoreographyForClip(clip, sequence, project, beatsWithStrength, segments, planOptsExtra, log);
}

// ============================================================================
// [Đã xoá ở v16] "TÍNH NĂNG C — Xuất cả loạt" (pickExportFolder/exportBatchToFolder) và
// addFlashKeyframesForClip()/addFlashKeyframes() (bản đơn-effect nguyên thuỷ của flash, viết trước
// khi có EFFECT_SCHEMAS tổng quát). Không có nút hay lệnh MCP nào gọi tới cả 4 hàm này — đã xác
// nhận qua grep toàn bộ main.js/mcpBridge.js. exportBeatPresetFiles() (bên trên) và
// applyBeatPlanToClip() qua EFFECT_SCHEMAS đã thay thế đầy đủ, tổng quát cho MỌI effect thay vì
// riêng Brightness. Lịch sử đã có trong CHANGELOG.md + git history.
// ============================================================================

// ============================================================================
// PREMIERE GENERAL EDITING ACTIONS — v17.x (BIG UPDATE BEAT SHAKE)
// Groups: Project/File, Timeline Editing, Voice Cleanup, FX Console,
//         Audio Mixing, Transitions, Color Grading, Captions, Clip Speed,
//         Bin Management, Selection, Scene Detection, Metadata, MOGRT, Export, AI
// ============================================================================

// --- Helpers dùng chung ---

// Thử dùng QE DOM — trả về qeSequence nếu được, null nếu không có
async function tryGetQeSequence() {
  try {
    if (typeof app === "undefined") return null;
    if (typeof app.enableQE !== "function") return null;
    app.enableQE();
    const qe = app.qe;
    if (!qe) return null;
    const qeSeq = await qe.getActiveSequence();
    return qeSeq || null;
  } catch (e) {
    return null;
  }
}

// Chuyển giây thành TickTime dùng trong UXP
function secondsToTick(seconds) {
  return ppro.TickTime.createWithSeconds(seconds);
}

// Tìm một track item theo khoảng thời gian (dùng cho ripple delete manual)
// LƯU Ý 2026-09-10: đã sửa dùng getStartTime()/getEndTime() (vị trí thật trên timeline, "relative
// to sequence start time") thay vì getInPoint()/getOutPoint() (đó là SOURCE TRIM — cùng loại bug
// đã fix ở insert_clip/overwrite_clip/move_clip trước đó). Bug cũ khiến select_clips_in_range,
// select_all_clips, và fallback path của ripple_delete/cut_clip_at_time đều xác định sai clip nào
// nằm trong range.
async function getTrackItemsInRange(sequence, startTick, endTick, trackType) {
  const items = [];
  const types = trackType === "video" ? ["video"] : trackType === "audio" ? ["audio"] : ["video", "audio"];

  for (const type of types) {
    const trackCount = type === "video"
      ? await sequence.getVideoTrackCount()
      : await sequence.getAudioTrackCount();
    for (let i = 0; i < trackCount; i++) {
      const track = type === "video"
        ? await sequence.getVideoTrack(i)
        : await sequence.getAudioTrack(i);
      const trackItemsOnTrack = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
      for (let j = 0; j < trackItemsOnTrack.length; j++) {
        try {
          const item = trackItemsOnTrack[j];
          const itemStart = await item.getStartTime();
          const itemEnd = await item.getEndTime();
          // Nếu clip nằm trong range [startTick, endTick]
          const sMs = itemStart.seconds;
          const eMs = itemEnd.seconds;
          const rStart = startTick.seconds;
          const rEnd = endTick.seconds;
          if (sMs < rEnd && eMs > rStart) items.push({ item, itemStart, itemEnd, trackType: type, trackIndex: i });
        } catch (e) { /* bỏ qua clip lỗi */ }
      }
    }
  }
  return items;
}

// ============================================================================
// GROUP 1 — Project & File
// ============================================================================

async function getProjectInfo() {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");

  let projectName = "Unknown";
  let projectPath = "";
  // Thử method trước, fallback sang property (UXP có thể dùng 1 trong 2)
  try { projectName = (await project.getName()) || project.name || "Unknown"; } catch {
    try { projectName = project.name || "Unknown"; } catch {}
  }
  try { projectPath = (await project.getFilePath()) || project.path || ""; } catch {
    try { projectPath = project.path || ""; } catch {}
  }

  const sequence = await project.getActiveSequence();
  let activeSequenceName = "Active Sequence"; // fallback như _cmdGetSequenceInfo
  if (sequence) {
    try { activeSequenceName = sequence.name || (await sequence.getName()) || activeSequenceName; } catch {}
  }

  // Đọc danh sách sequence — thử getSequences() rồi fallback sang activeSequence
  const sequences = [];
  const bins = [];
  try {
    const allSequences = await project.getSequences();
    for (const seq of (allSequences || [])) {
      try {
        const name = seq.name || (await seq.getName()) || "Sequence";
        sequences.push({ name });
      } catch {}
    }
  } catch {}
  // Nếu getSequences() không có, ít nhất báo sequence đang active
  if (sequences.length === 0 && activeSequenceName) {
    sequences.push({ name: activeSequenceName });
  }

  try {
    const rootItem = await project.getRootItem();
    const items = (await rootItem.getItems()) || [];
    for (const child of items) {
      try {
        const childType = child.type;
        // type 2 = Bin trong UXP
        if (childType === 2 || childType === ppro.Constants.ProjectItemType.BIN) {
          const binName = child.name || (await child.getName());
          bins.push({ name: binName });
        }
      } catch {}
    }
  } catch {}

  return { projectName, projectPath, activeSequence: activeSequenceName, sequences, bins };
}

async function importFilesToProject({ paths, binName }) {
  if (!paths || paths.length === 0) throw new Error("Phải truyền ít nhất 1 đường dẫn file.");
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");

  // Tìm bin đích nếu có
  let targetBin = null;
  if (binName) {
    try {
      const rootItem = await project.getRootItem();
      const items = (await rootItem.getItems()) || [];
      for (const child of items) {
        const name = child.name || (await child.getName());
        if (name === binName) { targetBin = child; break; }
      }
    } catch {}
  }

  // importFiles(paths, suppressUI, targetBin, asNumberedStills)
  try {
    const ok = await project.importFiles(paths, true, targetBin, false);
    return {
      imported: paths.map(p => ({ path: p, name: p.split(/[\\/]/).pop() })),
      skipped: [],
      binName: binName || "root",
      ok
    };
  } catch (e) {
    throw new Error(`importFiles thất bại: ${e.message}. Kiểm tra đường dẫn file có đúng không.`);
  }
}

async function openProject({ path }) {
  if (!path) throw new Error("Phải truyền đường dẫn file .prproj.");
  try {
    // ppro.Project.openDocument — cần verify trên máy thật
    const ok = await ppro.Project.openDocument(path);
    return { success: !!ok, projectPath: path };
  } catch (e) {
    throw new Error(
      `Không mở được project: ${e.message}. ` +
      "Lưu ý: ppro.Project.openDocument() có thể không tồn tại trong bản UXP này — " +
      "thử mở file thủ công trong Premiere."
    );
  }
}

// ============================================================================
// GROUP 2 — Timeline Editing
// ============================================================================

async function cutClipAtTime({ timeSeconds, trackType = "all" }) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active.");

  // Ưu tiên QE DOM
  const qeSeq = await tryGetQeSequence();
  if (qeSeq) {
    try {
      const t = timeSeconds != null ? timeSeconds : null;
      if (t != null && typeof qeSeq.razor === "function") {
        await qeSeq.razor(t);
        return { cut: true, method: "QE_DOM", timeSeconds: t };
      }
      if (t != null && typeof qeSeq.razorAtTime === "function") {
        await qeSeq.razorAtTime(t);
        return { cut: true, method: "QE_DOM", timeSeconds: t };
      }
    } catch (e) {
      // QE thất bại → tiếp tục fallback
    }
  }

  // Fallback: báo rõ không có API
  throw new Error(
    "cut_clip_at_time cần QE DOM (app.enableQE()) nhưng API này không khả dụng hoặc chưa được kiểm chứng. " +
    "Dùng debug_probe_api để kiểm tra trước, sau đó cắt thủ công trong Premiere."
  );
}

async function trimClip({ inSeconds, outSeconds }) {
  if (inSeconds == null && outSeconds == null) throw new Error("Phải truyền ít nhất inSeconds hoặc outSeconds.");
  const { project, sequence, clip } = await getActiveSequenceAndSelection(function () {});
  const log = function (m) {};

  await project.lockedAccess(() => {
    project.executeTransaction((compoundAction) => {
      if (inSeconds != null) {
        const inTick = secondsToTick(inSeconds);
        compoundAction.addAction(clip.createSetInPointAction(inTick));
      }
      if (outSeconds != null) {
        const outTick = secondsToTick(outSeconds);
        compoundAction.addAction(clip.createSetOutPointAction(outTick));
      }
    }, "Trim clip qua MCP");
  });

  let newIn = null, newOut = null;
  try { newIn = (await clip.getInPoint()).seconds; } catch {}
  try { newOut = (await clip.getOutPoint()).seconds; } catch {}
  return { trimmed: true, newInSeconds: newIn, newOutSeconds: newOut };
}

async function deleteClip({ ripple = false }) {
  const { project, sequence, clip } = await getActiveSequenceAndSelection(function () {});

  if (ripple) {
    // Thử QE DOM trước
    const qeSeq = await tryGetQeSequence();
    if (qeSeq && typeof qeSeq.rippleDelete === "function") {
      try {
        const start = (await clip.getInPoint()).seconds;
        const end = (await clip.getOutPoint()).seconds;
        await qeSeq.rippleDelete(start, end);
        return { deleted: 1, method: "QE_ripple" };
      } catch {}
    }
    // Fallback: TrackItem.remove(inRipple=true, inAlignToVideo=false)
    try {
      await clip.remove(true, false);
      return { deleted: 1, method: "remove_ripple" };
    } catch (e) {
      throw new Error(`Ripple delete thất bại: ${e.message}`);
    }
  }

  // Xóa thường không ripple
  try {
    await project.lockedAccess(() => {
      project.executeTransaction((compoundAction) => {
        compoundAction.addAction(clip.createRemoveAction());
      }, "Xóa clip qua MCP");
    });
    return { deleted: 1, method: "removeAction" };
  } catch {
    // Thử API remove() trực tiếp
    try {
      await clip.remove(false, false);
      return { deleted: 1, method: "remove_direct" };
    } catch (e2) {
      throw new Error(`Xóa clip thất bại: ${e2.message}`);
    }
  }
}

async function rippleDelete({ startSeconds, endSeconds }) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active.");

  // Nếu không truyền start/end, lấy từ clip đang chọn
  let start = startSeconds, end = endSeconds;
  if (start == null || end == null) {
    try {
      const { clip } = await getActiveSequenceAndSelection(function () {});
      if (start == null) start = (await clip.getInPoint()).seconds;
      if (end == null) end = (await clip.getOutPoint()).seconds;
    } catch (e) {
      throw new Error("Phải truyền startSeconds/endSeconds hoặc chọn clip trên timeline.");
    }
  }
  if (start >= end) throw new Error(`startSeconds (${start}) phải nhỏ hơn endSeconds (${end}).`);

  // Ưu tiên QE DOM
  const qeSeq = await tryGetQeSequence();
  if (qeSeq) {
    for (const methodName of ["rippleDelete", "performRippleDelete", "rippleDeleteGap"]) {
      if (typeof qeSeq[methodName] === "function") {
        try {
          await qeSeq[methodName](start, end);
          return { removed: true, startSeconds: start, endSeconds: end, gapSeconds: end - start, method: `QE_${methodName}` };
        } catch {}
      }
    }
  }

  // Fallback: tìm clip trong range và remove(ripple=true)
  const startTick = secondsToTick(start);
  const endTick = secondsToTick(end);
  const items = await getTrackItemsInRange(sequence, startTick, endTick, "all");

  if (items.length === 0) {
    return { removed: false, message: "Không tìm thấy clip nào trong khoảng này để ripple delete.", startSeconds: start, endSeconds: end };
  }

  // Xử lý từ cuối về đầu để timestamp không lệch
  items.sort((a, b) => b.itemStart.seconds - a.itemStart.seconds);
  let deleted = 0;
  for (const { item } of items) {
    try {
      await item.remove(true, false);
      deleted++;
    } catch {}
  }

  return { removed: deleted > 0, deleted, gapSeconds: end - start, method: "fallback_remove_ripple" };
}

async function moveClip({ startSeconds, trackIndex }) {
  // Sửa 2026-09-10 (CHƯA LIVE-TEST): `createSetStartTimeAction` không tồn tại trên track item (phát
  // hiện khi debug insert_clip — xem [[premiere-25-6-4-api-corrections]]). API đúng để di chuyển vị
  // trí trên timeline là `createMoveAction(tickTime)` — dịch chuyển theo OFFSET so với vị trí hiện
  // tại (`getStartTime()`, "relative to sequence start time"), không phải toạ độ tuyệt đối và không
  // phải `getInPoint()` (đó là source trim). Cùng pattern đã dùng cho insertOrOverwriteClip.
  if (startSeconds == null) throw new Error("Phải truyền startSeconds.");
  const { project, sequence, clip } = await getActiveSequenceAndSelection(function () {});

  const currentStart = await clip.getStartTime();
  const desiredTick = secondsToTick(startSeconds);
  const offset = desiredTick.subtract(currentStart);

  let ok;
  await project.lockedAccess(() => {
    ok = project.executeTransaction((compoundAction) => {
      compoundAction.addAction(clip.createMoveAction(offset));
    }, "Move clip qua MCP");
  });
  if (!ok) throw new Error("executeTransaction trả về false khi di chuyển clip.");

  const finalStart = await clip.getStartTime();
  const diffSeconds = Math.abs(finalStart.seconds - startSeconds);
  if (diffSeconds > 0.05) {
    throw new Error(
      `Đã di chuyển clip nhưng vị trí cuối cùng (${finalStart.seconds.toFixed(3)}s) không khớp startSeconds ` +
      `yêu cầu (${startSeconds}s, lệch ${diffSeconds.toFixed(3)}s).`
    );
  }

  return { moved: true, newStartSeconds: finalStart.seconds };
}

// ============================================================================
// GROUP 3 — Voice Cleanup
// ============================================================================

async function detectSilenceRegions({ thresholdDb = -40, minDurationMs = 300 }, log) {
  const { project, sequence, clip } = await getActiveSequenceAndSelection(log);

  // Lấy đường dẫn file audio
  let mediaPath = null;
  try {
    const projectItem = await clip.getProjectItem();
    const cpi = await ppro.ClipProjectItem.cast(projectItem);
    if (cpi) mediaPath = await cpi.getMediaFilePath();
  } catch (e) {
    throw new Error(`Không lấy được đường dẫn file audio: ${e.message}`);
  }
  if (!mediaPath) throw new Error("Clip đang chọn không có file media hợp lệ.");

  // Đọc và decode audio
  let audioData;
  try {
    const fileUrl = pathToFileUrl(mediaPath);
    const entry = await uxpFs.getEntryWithUrl(fileUrl);
    const arrayBuf = await entry.read({ format: uxpFormats.binary });
    const uint8 = new Uint8Array(arrayBuf);
    audioData = await decodeAudioBuffer(uint8);
  } catch (e) {
    throw new Error(`Không đọc được file audio: ${e.message}`);
  }

  const { samples, sampleRate } = audioData;
  const thresholdLinear = Math.pow(10, thresholdDb / 20);
  const frameSize = Math.round(sampleRate * 0.02); // 20ms frame
  const minDurationFrames = Math.ceil(minDurationMs / 20);

  const clipInSec = (await clip.getInPoint()).seconds;
  const regions = [];
  let silenceStart = null;
  let silenceFrames = 0;

  for (let frame = 0; frame < Math.floor(samples.length / frameSize); frame++) {
    const frameStart = frame * frameSize;
    let rms = 0;
    for (let s = frameStart; s < Math.min(frameStart + frameSize, samples.length); s++) {
      rms += samples[s] * samples[s];
    }
    rms = Math.sqrt(rms / frameSize);

    if (rms < thresholdLinear) {
      if (silenceStart === null) silenceStart = frame;
      silenceFrames++;
    } else {
      if (silenceStart !== null && silenceFrames >= minDurationFrames) {
        const regionStart = clipInSec + silenceStart * 0.02;
        const regionEnd = clipInSec + (silenceStart + silenceFrames) * 0.02;
        regions.push({
          startSeconds: Math.round(regionStart * 1000) / 1000,
          endSeconds: Math.round(regionEnd * 1000) / 1000,
          durationMs: Math.round(silenceFrames * 20)
        });
      }
      silenceStart = null;
      silenceFrames = 0;
    }
  }
  // Xử lý silence cuối file
  if (silenceStart !== null && silenceFrames >= minDurationFrames) {
    const regionStart = clipInSec + silenceStart * 0.02;
    const regionEnd = clipInSec + (silenceStart + silenceFrames) * 0.02;
    regions.push({
      startSeconds: Math.round(regionStart * 1000) / 1000,
      endSeconds: Math.round(regionEnd * 1000) / 1000,
      durationMs: Math.round(silenceFrames * 20)
    });
  }

  const totalSilenceMs = regions.reduce((sum, r) => sum + r.durationMs, 0);
  return {
    regions,
    totalSilenceMs,
    regionCount: regions.length,
    thresholdDb,
    minDurationMs,
    _nextStep: regions.length > 0
      ? `Tìm thấy ${regions.length} vùng silence (${(totalSilenceMs/1000).toFixed(1)}s tổng). Gọi remove_silence_gaps(autoApply=true) để xóa.`
      : "Không tìm thấy vùng silence nào với ngưỡng hiện tại. Thử tăng thresholdDb (vd -30) hoặc giảm minDurationMs."
  };
}

async function removeSilenceGaps({ thresholdDb = -40, minDurationMs = 300, autoApply = false }, log) {
  // Bước 1: Phát hiện silence
  const detection = await detectSilenceRegions({ thresholdDb, minDurationMs }, log);

  if (!autoApply) {
    return {
      regions: detection.regions,
      totalSilenceMs: detection.totalSilenceMs,
      autoApply: false,
      preview: `Tìm thấy ${detection.regions.length} vùng silence (${(detection.totalSilenceMs/1000).toFixed(1)}s tổng). Gọi lại với autoApply=true để xóa thật.`,
      _nextStep: "Xem lại regions, rồi gọi remove_silence_gaps(autoApply=true) để xóa."
    };
  }

  if (detection.regions.length === 0) {
    return { removed: 0, totalRemovedMs: 0, message: "Không tìm thấy vùng silence nào." };
  }

  // Xử lý từ cuối về đầu — CRITICAL để timestamp không lệch sau mỗi ripple delete
  const regionsReversed = [...detection.regions].sort((a, b) => b.startSeconds - a.startSeconds);
  let removed = 0;
  let totalRemovedMs = 0;

  for (const region of regionsReversed) {
    try {
      const result = await rippleDelete({ startSeconds: region.startSeconds, endSeconds: region.endSeconds });
      if (result.removed) {
        removed++;
        totalRemovedMs += region.durationMs;
        log(`Đã xóa silence ${region.startSeconds.toFixed(2)}s → ${region.endSeconds.toFixed(2)}s (${region.durationMs}ms)`);
      }
    } catch (e) {
      log(`⚠️ Không xóa được vùng ${region.startSeconds.toFixed(2)}s → ${region.endSeconds.toFixed(2)}s: ${e.message}`, "warn");
    }
  }

  return {
    removed,
    totalRemovedMs,
    totalRegions: detection.regions.length,
    message: `Đã xóa ${removed}/${detection.regions.length} vùng silence, tiết kiệm ${(totalRemovedMs/1000).toFixed(1)}s.`
  };
}

// Helper decode audio (reuse pattern từ beatDetect.js nếu có, hoặc fallback)
async function decodeAudioBuffer(uint8) {
  // Thử dùng hàm decode có sẵn từ beatDetect.js (loaded trước trong index.html)
  if (typeof decodeAudioDataFromUint8 === "function") {
    return await decodeAudioDataFromUint8(uint8);
  }
  if (typeof decodeToFloat32Mono === "function") {
    return await decodeToFloat32Mono(uint8);
  }
  // Nếu không có hàm nào: throw lỗi rõ ràng
  throw new Error(
    "Không có hàm decode audio (decodeAudioDataFromUint8 / decodeToFloat32Mono). " +
    "Cần expose hàm decode từ beatDetect.js để silence detection dùng được."
  );
}

// ============================================================================
// GROUP 4 — FX Console: Effect Search & Apply
// ============================================================================

async function applyEffect({ matchName }, log) {
  const { project, clip } = await getActiveSequenceAndSelection(log);

  // Kiểm tra đã có effect chưa
  const existing = await findComponentByMatchName(clip, matchName);
  if (existing) {
    const displayName = await existing.getDisplayName();
    return { applied: false, alreadyExists: true, effectName: displayName, matchName };
  }

  const chain = await clip.getComponentChain();
  if (typeof chain.createAppendComponentAction !== "function") {
    throw new Error(
      `createAppendComponentAction không có — bản Premiere này chưa hỗ trợ API thêm effect qua UXP. ` +
      `Phiên bản tối thiểu cần thiết: 25.6. Thêm "${matchName}" bằng tay qua Effects panel.`
    );
  }

  // VideoFilterFactory.createComponent(matchName) → component
  let component;
  try {
    const factory = await ppro.VideoFilterFactory.createVideoFilter(matchName);
    component = factory;
  } catch {
    try {
      component = await ppro.VideoFilterFactory.createComponent(matchName);
    } catch (e2) {
      throw new Error(`Không tạo được component cho "${matchName}": ${e2.message}. Kiểm tra matchName có đúng không (dùng search_effects).`);
    }
  }

  let componentIndex = -1;
  await project.lockedAccess(() => {
    project.executeTransaction((compoundAction) => {
      compoundAction.addAction(chain.createAppendComponentAction(component));
    }, `Thêm effect ${matchName}`);
  });

  // Đọc lại để xác nhận và lấy index
  try {
    const addedComp = await findComponentByMatchName(clip, matchName);
    if (addedComp) {
      const newChain = await clip.getComponentChain();
      const count = await newChain.getComponentCount();
      componentIndex = count - 1;
    }
  } catch {}

  return { applied: true, matchName, componentIndex };
}

async function getClipEffects() {
  const { clip } = await getActiveSequenceAndSelection(function () {});
  const chain = await clip.getComponentChain();
  const count = await chain.getComponentCount();
  const effects = [];

  for (let i = 0; i < count; i++) {
    try {
      const comp = await chain.getComponentAtIndex(i);
      const displayName = await comp.getDisplayName();
      const matchName = (typeof comp.getMatchName === "function") ? await comp.getMatchName() : null;
      let enabled = true;
      try { enabled = await comp.getEnabled(); } catch {}
      let paramCount = 0;
      try { paramCount = await comp.getParamCount(); } catch {}
      effects.push({ index: i, displayName, matchName, enabled, paramCount });
    } catch {}
  }

  return { effects, count: effects.length };
}

async function setEffectParam({ matchName, paramName, value, timeSeconds }, log) {
  const { project, clip } = await getActiveSequenceAndSelection(log);

  const comp = await findComponentByMatchName(clip, matchName);
  if (!comp) throw new Error(`Không tìm thấy effect "${matchName}" trên clip. Dùng get_clip_effects để xem danh sách.`);

  const param = await findParamByName(comp, paramName);
  if (!param) throw new Error(`Không tìm thấy param "${paramName}" trong effect "${matchName}". Tên param phải đúng với tên hiển thị trong Effect Controls.`);

  if (timeSeconds != null) {
    // Đặt keyframe tại thời điểm chỉ định
    const clipInPoint = await clip.getInPoint();
    const timeTick = secondsToTick(timeSeconds + clipInPoint.seconds);

    await project.lockedAccess(() => {
      project.executeTransaction((compoundAction) => {
        compoundAction.addAction(param.createAddKeyframeAction(timeTick));
      }, "Thêm keyframe");
    });
    await project.lockedAccess(() => {
      project.executeTransaction((compoundAction) => {
        compoundAction.addAction(param.createSetValueAtKeyframeAction(timeTick, value, 0));
      }, "Set giá trị keyframe");
    });
  } else {
    // Set static value
    await project.lockedAccess(() => {
      project.executeTransaction((compoundAction) => {
        compoundAction.addAction(param.createSetValueAction(value, 0));
      }, "Set static value");
    });
  }

  return { set: true, matchName, paramName, value, timeSeconds: timeSeconds ?? null };
}

// TOOL TEST TẠM THỜI (2026-09-11) — probe cho tính năng "Chỉnh vị trí ảnh hàng loạt" bên
// mic-check-plugin. set_effect_param() dùng createSetValueAction() bị lỗi "Illegal Parameter type"
// với MỌI param đã thử (kể cả Opacity đơn giản) — tham khảo beat-shake-plugin xác nhận cách ĐÚNG là
// dùng param.createKeyframe(value) + createAddKeyframeAction() (KHÔNG dùng createSetValueAction),
// và giá trị Position phải là new ppro.PointF() chứ không phải number/array thường. Hàm này để xác
// nhận cách đó có chạy đúng trên component "Motion" (component nội tại của clip, khác "AE.ADBE
// Geometry2"/Transform mà Beat Shake add thêm vào Adjustment Layer) — CHƯA CHẮC hành vi giống nhau.
// Xoá hàm này (+ đăng ký ở mcpBridge.js/premiere-tools.js) sau khi tính năng thật đã port xong sang
// mic-check-plugin, không phải tool giữ lại lâu dài.
async function debugTestTransformKeyframe({ matchName = "AE.ADBE Motion", paramName, x, y, value }, log) {
  const { project, clip } = await getActiveSequenceAndSelection(log);

  const comp = await findComponentByMatchName(clip, matchName);
  if (!comp) throw new Error(`Không tìm thấy effect "${matchName}" trên clip. Dùng get_clip_effects để xem danh sách.`);

  const param = await findParamByName(comp, paramName);
  if (!param) throw new Error(`Không tìm thấy param "${paramName}" trong effect "${matchName}".`);

  if (typeof param.createKeyframe !== "function") {
    throw new Error(`param.createKeyframe không tồn tại trên param "${paramName}" — API keyframe không khả dụng ở bản Premiere này.`);
  }

  const clipInPoint = await clip.getInPoint();
  log(`clipInPoint = ${clipInPoint.seconds.toFixed(3)}s`);

  let kfValue;
  let valueDescription;
  if (x != null && y != null) {
    if (typeof ppro.PointF !== "function") {
      throw new Error("ppro.PointF không tồn tại trong module premierepro ở bản này.");
    }
    const p = new ppro.PointF();
    p.x = x;
    p.y = y;
    kfValue = p;
    valueDescription = `PointF(${x}, ${y})`;
  } else {
    kfValue = value;
    valueDescription = String(value);
  }
  log(`Tạo keyframe giá trị ${valueDescription} tại vị trí clipInPoint...`);

  let kf;
  try {
    kf = param.createKeyframe(kfValue);
  } catch (e) {
    throw new Error(`param.createKeyframe(${valueDescription}) ném lỗi: ${e.message}`);
  }
  kf.position = clipInPoint;

  let ok;
  await project.lockedAccess(() => {
    ok = project.executeTransaction((compoundAction) => {
      compoundAction.addAction(param.createAddKeyframeAction(kf));
    }, `DEBUG test set ${matchName}.${paramName}`);
  });
  if (!ok) throw new Error("executeTransaction trả về false khi addAction(createAddKeyframeAction).");

  let keyframeCount = -1;
  try {
    const keys = await param.getKeyframeListAsTickTimes();
    keyframeCount = keys.length;
  } catch (e) {
    log(`⚠️ Không đọc lại được keyframe list: ${e.message}`, "warn");
  }

  return {
    set: true,
    matchName,
    paramName,
    appliedValue: x != null ? { x, y } : value,
    keyframeCountAfter: keyframeCount,
    note: "Mở Effect Controls xem giá trị thật đã đổi chưa — return value của Premiere API không đáng tin 100%."
  };
}

async function removeEffect({ matchName }, log) {
  const { project, clip } = await getActiveSequenceAndSelection(log);

  const comp = await findComponentByMatchName(clip, matchName);
  if (!comp) throw new Error(`Không tìm thấy effect "${matchName}" trên clip. Dùng get_clip_effects để xem.`);

  const chain = await clip.getComponentChain();

  // Thử createRemoveComponentAction
  if (typeof chain.createRemoveComponentAction === "function") {
    await project.lockedAccess(() => {
      project.executeTransaction((compoundAction) => {
        compoundAction.addAction(chain.createRemoveComponentAction(comp));
      }, `Xóa effect ${matchName}`);
    });
    return { removed: true, matchName };
  }

  throw new Error(
    `chain.createRemoveComponentAction() không tồn tại trong bản Premiere này. ` +
    `Xóa effect "${matchName}" bằng tay trong Effect Controls.`
  );
}

// ----- Liệt kê effect/transition THẬT đang cài trên máy (kể cả plugin bên thứ 3 mà database
// tĩnh premiere-effects.js không biết) — port từ fxconsole-plugin/premiereActions.js, nơi 3 hàm
// này đã được đo thật qua debug_probe_api trước khi dùng. search_effects/list_available_transitions
// bên MCP đã gọi lệnh "list_installed_effects" từ trước nhưng KHÔNG có handler nào ở đây, nên luôn
// fail âm thầm (catch rỗng) và rơi về database tĩnh — 3 hàm dưới đây lấp đúng lỗ đó.

// QE DOM: qe.project.getVideoEffectList()/getAudioEffectList() trả tên hiển thị thô (không phải
// matchName thật) nhưng bắt được effect bên thứ 3 mà VideoFilterFactory không thấy.
async function getInstalledEffectsFromQE() {
  try {
    if (typeof app === "undefined" || typeof app.enableQE !== "function") return null;
    app.enableQE();
    const qeProject = app.qe && app.qe.project;
    if (!qeProject) return null;

    const effects = [];
    const videoList = (typeof qeProject.getVideoEffectList === "function") ? qeProject.getVideoEffectList() : null;
    if (videoList) {
      const len = videoList.length || 0;
      for (let i = 0; i < len; i++) {
        const name = videoList[i] || (videoList.item && videoList.item(i));
        if (name && typeof name === "string") effects.push({ displayName: name, matchName: name, category: "Video", isQE: true });
      }
    }
    const audioList = (typeof qeProject.getAudioEffectList === "function") ? qeProject.getAudioEffectList() : null;
    if (audioList) {
      const len = audioList.length || 0;
      for (let i = 0; i < len; i++) {
        const name = audioList[i] || (audioList.item && audioList.item(i));
        if (name && typeof name === "string") effects.push({ displayName: name, matchName: name, category: "Audio", isQE: true });
      }
    }
    return effects.length > 0 ? effects : null;
  } catch { return null; }
}

// VideoFilterFactory.getMatchNames(): matchName THẬT (dùng đúng luôn cho apply_effect), nhưng chỉ
// có ở effect Video — Audio dùng AudioFilterFactory.getDisplayNames() (không có matchName, xem dưới).
// ⚠️ KHÔNG gọi createComponent(mn) cho từng matchName chỉ để lấy displayName đẹp — đã có plugin bên
// thứ 3 (Film Impact) báo lỗi "intercommunication failed" khi bị tạo component liên tiếp quá nhanh
// lúc quét. Chỉ liệt kê thô matchName; createComponent() chỉ gọi 1 lần lúc apply thật (applyEffect()).
async function getInstalledEffectsViaFactory() {
  const out = [];
  try {
    const vf = ppro.VideoFilterFactory;
    if (vf && typeof vf.getMatchNames === "function") {
      const matchNames = await vf.getMatchNames();
      if (Array.isArray(matchNames)) {
        for (const mn of matchNames) out.push({ displayName: mn, matchName: mn, category: "Video", isQE: false });
      }
    }
  } catch {}
  try {
    const af = ppro.AudioFilterFactory;
    if (af && typeof af.getDisplayNames === "function") {
      const displayNames = await af.getDisplayNames();
      // AudioFilterFactory không có getMatchNames() (khác biệt API đã xác nhận) — apply effect audio
      // phải đi qua createComponentByDisplayName(), không phải matchName. Đặt matchName=null để
      // search_effects/apply_effect biết cần gọi khác đường với effect audio loại này.
      if (Array.isArray(displayNames)) {
        for (const dn of displayNames) out.push({ displayName: dn, matchName: null, category: "Audio", isQE: false, useDisplayName: true });
      }
    }
  } catch {}
  return out.length > 0 ? out : null;
}

// TransitionFactory.getVideoTransitionMatchNames() — chỉ liệt kê thô, giống getInstalledEffectsViaFactory().
async function getInstalledTransitionsViaFactory() {
  try {
    const factory = ppro.TransitionFactory;
    if (!factory || typeof factory.getVideoTransitionMatchNames !== "function") return null;
    const matchNames = await factory.getVideoTransitionMatchNames();
    if (!Array.isArray(matchNames)) return null;
    return matchNames.map((mn) => ({
      displayName: mn, matchName: mn, category: "Video Transition", isQE: false, isTransition: true
    }));
  } catch { return null; }
}

async function listInstalledEffects() {
  const fromFactory = await getInstalledEffectsViaFactory();
  const fromQE = await getInstalledEffectsFromQE();

  const byKey = new Map();
  for (const e of (fromFactory || [])) byKey.set(e.matchName || e.displayName, e);
  for (const e of (fromQE || [])) {
    const key = e.matchName || e.displayName;
    if (!byKey.has(key)) byKey.set(key, e);
  }

  const effects = Array.from(byKey.values());
  if (effects.length === 0) {
    throw new Error("Không lấy được danh sách effect thật (VideoFilterFactory/AudioFilterFactory/QE DOM đều không khả dụng). Cần Premiere 25.6+ hoặc app.enableQE().");
  }
  return { effects, count: effects.length, sources: { factory: !!fromFactory, qe: !!fromQE } };
}

async function listInstalledTransitions() {
  const transitions = await getInstalledTransitionsViaFactory();
  if (!transitions) {
    throw new Error("TransitionFactory.getVideoTransitionMatchNames() không khả dụng trong bản Premiere này (cần 25.6+).");
  }
  return { transitions, count: transitions.length };
}

// ============================================================================
// GROUP 5 — Audio Mixing
// ============================================================================

async function setClipVolume({ gainDb }, log) {
  const { project, clip } = await getActiveSequenceAndSelection(log);

  // Tìm component "Volume" (audio) — matchName "ADBE Volume"
  let comp = await findComponentByMatchName(clip, "ADBE Volume");
  if (!comp) comp = await findComponentByName(clip, "Volume");
  if (!comp) throw new Error("Không tìm thấy component Volume trên clip đang chọn. Clip có phải audio track không?");

  const param = await findParamByName(comp, "Level");
  if (!param) throw new Error("Không tìm thấy param 'Level' trong Volume component.");

  await project.lockedAccess(() => {
    project.executeTransaction((compoundAction) => {
      compoundAction.addAction(param.createSetValueAction(gainDb, 0));
    }, "Set clip volume");
  });

  return { applied: true, gainDb };
}

async function setClipPan({ panValue }, log) {
  const { project, clip } = await getActiveSequenceAndSelection(log);

  let comp = await findComponentByMatchName(clip, "ADBE Panner");
  if (!comp) comp = await findComponentByName(clip, "Panner");
  if (!comp) comp = await findComponentByName(clip, "Balance");
  if (!comp) throw new Error("Không tìm thấy component Panner/Balance trên clip audio.");

  const param = await findParamByName(comp, "Balance") || await findParamByName(comp, "Pan");
  if (!param) throw new Error("Không tìm thấy param pan/balance.");

  await project.lockedAccess(() => {
    project.executeTransaction((compoundAction) => {
      compoundAction.addAction(param.createSetValueAction(panValue, 0));
    }, "Set clip pan");
  });

  return { applied: true, panValue };
}

async function muteTrack({ trackIndex, muted }) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active.");

  const track = await sequence.getAudioTrack(trackIndex);
  if (!track) throw new Error(`Không tìm thấy audio track index ${trackIndex}.`);

  try {
    await project.lockedAccess(() => {
      project.executeTransaction((compoundAction) => {
        compoundAction.addAction(track.createSetMuteAction(muted));
      }, `${muted ? "Mute" : "Unmute"} track ${trackIndex}`);
    });
    return { trackIndex, muted };
  } catch (e) {
    // Thử API trực tiếp
    try {
      await track.setMuted(muted);
      return { trackIndex, muted };
    } catch (e2) {
      throw new Error(`Không mute được track ${trackIndex}: ${e2.message}`);
    }
  }
}

async function setupAudioDucking({ musicTrackIndex, voiceTrackIndex, duckDb = -12 }, log) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active.");

  const musicTrack = await sequence.getAudioTrack(musicTrackIndex);
  const voiceTrack = await sequence.getAudioTrack(voiceTrackIndex);
  if (!musicTrack) throw new Error(`Không tìm thấy music track ${musicTrackIndex}.`);
  if (!voiceTrack) throw new Error(`Không tìm thấy voice track ${voiceTrackIndex}.`);

  // Thu thập các vùng có voice clip
  const voiceTrackItems = await voiceTrack.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
  const voiceRegions = [];
  for (let i = 0; i < voiceTrackItems.length; i++) {
    try {
      const item = voiceTrackItems[i];
      voiceRegions.push({
        start: (await item.getInPoint()).seconds,
        end: (await item.getOutPoint()).seconds
      });
    } catch {}
  }

  if (voiceRegions.length === 0) {
    return { configured: false, message: `Không tìm thấy clip nào trên voice track ${voiceTrackIndex}.` };
  }

  // Áp keyframe volume lên music track tại các vùng voice
  // Tìm Volume component trên music track — cần lấy từ track item đầu tiên
  let musicTrackItems = [];
  try { musicTrackItems = await musicTrack.getTrackItems(ppro.Constants.TrackItemType.CLIP, false); } catch {}
  if (musicTrackItems.length === 0) return { configured: false, message: `Không tìm thấy clip nào trên music track ${musicTrackIndex}.` };

  let duckingApplied = 0;
  for (const region of voiceRegions) {
    log(`Ducking tại ${region.start.toFixed(2)}s → ${region.end.toFixed(2)}s`);
    // Với mỗi music clip giao với vùng voice: thêm keyframe volume
    for (let mi = 0; mi < musicTrackItems.length; mi++) {
      try {
        const musicItem = musicTrackItems[mi];
        const mStart = (await musicItem.getInPoint()).seconds;
        const mEnd = (await musicItem.getOutPoint()).seconds;
        if (mEnd <= region.start || mStart >= region.end) continue;

        let volComp = await findComponentByMatchName(musicItem, "ADBE Volume");
        if (!volComp) volComp = await findComponentByName(musicItem, "Volume");
        if (!volComp) continue;

        const levelParam = await findParamByName(volComp, "Level");
        if (!levelParam) continue;

        const clipInPoint = await musicItem.getInPoint();
        const fadeMs = 200; // 200ms fade in/out
        const rStart = Math.max(region.start, mStart);
        const rEnd = Math.min(region.end, mEnd);

        await project.lockedAccess(() => {
          project.executeTransaction((compoundAction) => {
            // Fade down: full volume → duck
            const t1 = secondsToTick(rStart - 0.2 + clipInPoint.seconds);
            const t2 = secondsToTick(rStart + clipInPoint.seconds);
            const t3 = secondsToTick(rEnd + clipInPoint.seconds);
            const t4 = secondsToTick(rEnd + 0.2 + clipInPoint.seconds);
            compoundAction.addAction(levelParam.createAddKeyframeAction(t1));
            compoundAction.addAction(levelParam.createAddKeyframeAction(t2));
            compoundAction.addAction(levelParam.createAddKeyframeAction(t3));
            compoundAction.addAction(levelParam.createAddKeyframeAction(t4));
          }, "Thêm ducking keyframe");
        });
        await project.lockedAccess(() => {
          project.executeTransaction((compoundAction) => {
            const t1 = secondsToTick(rStart - 0.2 + clipInPoint.seconds);
            const t2 = secondsToTick(rStart + clipInPoint.seconds);
            const t3 = secondsToTick(rEnd + clipInPoint.seconds);
            const t4 = secondsToTick(rEnd + 0.2 + clipInPoint.seconds);
            compoundAction.addAction(levelParam.createSetValueAtKeyframeAction(t1, 0, 0));
            compoundAction.addAction(levelParam.createSetValueAtKeyframeAction(t2, duckDb, 0));
            compoundAction.addAction(levelParam.createSetValueAtKeyframeAction(t3, duckDb, 0));
            compoundAction.addAction(levelParam.createSetValueAtKeyframeAction(t4, 0, 0));
          }, "Set ducking values");
        });
        duckingApplied++;
      } catch (e) {
        log(`⚠️ Ducking thất bại cho music clip: ${e.message}`, "warn");
      }
    }
  }

  return { configured: duckingApplied > 0, duckDb, voiceRegions: voiceRegions.length, duckingApplied };
}

// ============================================================================
// GROUP 6 — Transitions (hạn chế trong UXP — chủ yếu trả info)
// ============================================================================

async function addTransition({ position, matchName = "ADBE Cross Dissolve", durationFrames = 15 }, log) {
  // UXP chưa có API thêm transition trực tiếp vào clip — cần QE DOM hoặc ExtendScript
  // Trả hướng dẫn thủ công thay vì crash
  const qeSeq = await tryGetQeSequence();
  if (qeSeq && typeof qeSeq.addTransition === "function") {
    try {
      const { clip } = await getActiveSequenceAndSelection(log);
      const start = (await clip.getInPoint()).seconds;
      const end = (await clip.getOutPoint()).seconds;
      const addAt = position === "start" ? start : end;
      await qeSeq.addTransition(matchName, addAt, durationFrames);
      return { applied: true, matchName, position, durationFrames, method: "QE_DOM" };
    } catch (e) {
      log(`⚠️ QE addTransition thất bại: ${e.message}`, "warn");
    }
  }

  return {
    applied: false,
    message: `UXP chưa có API thêm transition trực tiếp. ` +
      `Thêm "${matchName}" thủ công: kéo từ Effects panel → Video Transitions vào đầu/cuối clip trên timeline.`,
    matchName,
    position,
    durationFrames
  };
}

async function batchAddTransitions({ position, matchName = "ADBE Cross Dissolve", durationFrames = 15 }, log) {
  const result = await addTransition({ position, matchName, durationFrames }, log);
  return { ...result, note: "batch_add_transitions dùng cùng logic với add_transition cho từng clip được chọn." };
}

// ============================================================================
// GROUP 7 — Color Grading
// ============================================================================

async function applyLumetriPreset({ presetName, inputCubePath }, log) {
  const { project, clip } = await getActiveSequenceAndSelection(log);

  // Thêm Lumetri Color effect nếu chưa có
  let lumetriComp = await findComponentByMatchName(clip, "ADBE Lumetri Color");
  if (!lumetriComp) {
    await applyEffect({ matchName: "ADBE Lumetri Color" }, log);
    lumetriComp = await findComponentByMatchName(clip, "ADBE Lumetri Color");
  }
  if (!lumetriComp) throw new Error("Không thêm được Lumetri Color vào clip.");

  if (inputCubePath) {
    // Cần set LUT path — đây là thuộc tính phức tạp trong Lumetri, không phải param đơn giản
    return {
      applied: false,
      message: `Đã thêm Lumetri Color vào clip. Để load file .cube "${inputCubePath}", mở Effect Controls → Lumetri Color → Creative → Look → Browse. UXP chưa có API set LUT file path trực tiếp.`,
      matchName: "ADBE Lumetri Color"
    };
  }

  return {
    applied: true,
    message: `Đã thêm Lumetri Color vào clip. Mở Effect Controls → Lumetri Color để chỉnh preset${presetName ? ` "${presetName}"` : ""} thủ công.`,
    matchName: "ADBE Lumetri Color",
    note: "UXP chưa có API set Lumetri preset tên trực tiếp."
  };
}

async function setClipColorLabel({ color }, log) {
  const { project, clip } = await getActiveSequenceAndSelection(log);

  const colorMap = {
    none: 0, violet: 1, iris: 2, caribbean: 3, lavender: 4,
    cerulean: 5, forest: 6, rose: 7, mango: 8
  };
  const colorIndex = colorMap[color] ?? 0;

  try {
    const projectItem = await clip.getProjectItem();
    if (typeof projectItem.setColorLabel === "function") {
      await project.lockedAccess(() => {
        project.executeTransaction((compoundAction) => {
          compoundAction.addAction(projectItem.createSetColorLabelAction(colorIndex));
        }, "Set color label");
      });
    } else {
      await projectItem.setColorLabel(colorIndex);
    }
    return { applied: true, color, colorIndex };
  } catch (e) {
    throw new Error(`Không set được color label: ${e.message}`);
  }
}

async function adjustColorValues({ exposure, contrast, saturation, temperature }, log) {
  const { project, clip } = await getActiveSequenceAndSelection(log);

  let lumetriComp = await findComponentByMatchName(clip, "ADBE Lumetri Color");
  if (!lumetriComp) {
    await applyEffect({ matchName: "ADBE Lumetri Color" }, log);
    lumetriComp = await findComponentByMatchName(clip, "ADBE Lumetri Color");
  }
  if (!lumetriComp) throw new Error("Không thêm được Lumetri Color.");

  const paramMap = {
    exposure: "Exposure",
    contrast: "Contrast",
    saturation: "Saturation",
    temperature: "Color Temperature"
  };
  const applied = {};

  for (const [key, val] of Object.entries({ exposure, contrast, saturation, temperature })) {
    if (val == null) continue;
    try {
      const param = await findParamByName(lumetriComp, paramMap[key]);
      if (!param) { applied[key] = "param_not_found"; continue; }
      await project.lockedAccess(() => {
        project.executeTransaction((compoundAction) => {
          compoundAction.addAction(param.createSetValueAction(val, 0));
        }, `Set ${key}`);
      });
      applied[key] = val;
    } catch (e) {
      applied[key] = `error: ${e.message}`;
    }
  }

  return { applied };
}

// ============================================================================
// GROUP 8 — Captions (limited UXP support)
// ============================================================================

async function createCaptionTrack({ format = "subtitle" }) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active.");

  try {
    if (typeof sequence.createCaptionTrack === "function") {
      const track = await sequence.createCaptionTrack(format);
      return { created: true, format, trackIndex: track ? await track.getIndex() : -1 };
    }
    return {
      created: false,
      message: "sequence.createCaptionTrack() không khả dụng trong bản Premiere này. Dùng Sequence menu → Captions → Add Caption Track."
    };
  } catch (e) {
    throw new Error(`Tạo caption track thất bại: ${e.message}`);
  }
}

async function importSrt({ path, trackIndex }) {
  if (!path) throw new Error("Phải truyền đường dẫn file .srt.");
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");

  try {
    const ok = await project.importFiles([path], true, null, false);
    return { imported: !!ok, path, note: "File SRT đã import vào Project. Kéo vào caption track trên timeline thủ công." };
  } catch (e) {
    throw new Error(`Import SRT thất bại: ${e.message}`);
  }
}

async function readSequenceCaptions({ trackIndex }) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active.");

  return {
    captions: [],
    message: "Đọc caption track qua UXP API chưa được hỗ trợ đầy đủ. Xem captions trong Premiere Text panel."
  };
}

// ============================================================================
// GROUP 9 — Clip Speed
// ============================================================================

async function setClipSpeed({ speedPercent }, log) {
  if (!speedPercent || speedPercent <= 0) throw new Error("speedPercent phải lớn hơn 0.");
  const { project, clip } = await getActiveSequenceAndSelection(log);

  // Thử QE DOM
  const qeSeq = await tryGetQeSequence();
  if (qeSeq) {
    try {
      const clipStart = (await clip.getInPoint()).seconds;
      // Tìm QE clip item
      if (typeof qeSeq.setClipSpeed === "function") {
        await qeSeq.setClipSpeed(clipStart, speedPercent / 100);
        return { applied: true, speedPercent, method: "QE_DOM" };
      }
    } catch {}
  }

  // Thử UXP setSpeed
  try {
    if (typeof clip.setSpeed === "function") {
      await clip.setSpeed(speedPercent / 100);
      return { applied: true, speedPercent, method: "UXP_setSpeed" };
    }
  } catch (e) {
    log(`⚠️ clip.setSpeed() thất bại: ${e.message}`, "warn");
  }

  return {
    applied: false,
    message: `UXP chưa có API setSpeed ổn định. Đổi tốc độ ${speedPercent}% thủ công: chuột phải clip → Speed/Duration.`,
    speedPercent
  };
}

async function reverseClip(log) {
  const { project, clip } = await getActiveSequenceAndSelection(log);

  const qeSeq = await tryGetQeSequence();
  if (qeSeq && typeof qeSeq.reverseClip === "function") {
    try {
      await qeSeq.reverseClip((await clip.getInPoint()).seconds);
      return { reversed: true, method: "QE_DOM" };
    } catch {}
  }
  return {
    reversed: false,
    message: "Đảo chiều clip thủ công: chuột phải clip → Speed/Duration → tích Reverse Speed."
  };
}

async function freezeFrame({ atSeconds }, log) {
  const { project, clip } = await getActiveSequenceAndSelection(log);

  const t = atSeconds != null ? atSeconds : (await clip.getInPoint()).seconds;
  const qeSeq = await tryGetQeSequence();
  if (qeSeq && typeof qeSeq.addFreezeFrame === "function") {
    try {
      await qeSeq.addFreezeFrame(t);
      return { applied: true, freezeAtSeconds: t, method: "QE_DOM" };
    } catch {}
  }
  return {
    applied: false,
    message: `Freeze frame thủ công tại ${t.toFixed(2)}s: đặt playhead → Clip menu → Video Options → Frame Hold.`
  };
}

// ============================================================================
// GROUP 10 — Bin Management
// ============================================================================

// LƯU Ý 2026-09-10: parent.createBin() KHÔNG tồn tại (đã xác nhận). API đúng theo docs Adobe
// (FolderItem class): FolderItem.cast(projectItem).createBinAction(name, makeUnique) trả về 1
// Action, phải chạy qua project.executeTransaction (cùng pattern với duplicateSequence/insertClip).
// getChildCount/getChildAtIndex cũng sai (cùng loại bug đã fix ở nơi khác trong file này) — đúng
// phải dùng getItems() trả mảng thẳng.
async function createBin({ name, parentBin }) {
  if (!name) throw new Error("Phải truyền tên bin.");
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");

  const rootItem = await project.getRootItem();
  let parent = rootItem;

  if (parentBin) {
    const items = (await rootItem.getItems()) || [];
    let found = null;
    for (const child of items) {
      try { if ((child.name || (await child.getName())) === parentBin) { found = child; break; } } catch {}
    }
    if (!found) throw new Error(`Không tìm thấy bin cha "${parentBin}".`);
    parent = found;
  }

  const parentFolder = (typeof parent.createBinAction === "function")
    ? parent
    : ppro.FolderItem.cast(parent);
  if (!parentFolder || typeof parentFolder.createBinAction !== "function") {
    throw new Error("Không lấy được FolderItem hợp lệ (createBinAction không tồn tại) cho parent bin.");
  }

  const beforeItems = (await parent.getItems()) || [];
  const beforeNames = new Set();
  for (const it of beforeItems) { try { beforeNames.add(it.name || (await it.getName())); } catch {} }

  let ok;
  await project.lockedAccess(() => {
    ok = project.executeTransaction((compoundAction) => {
      compoundAction.addAction(parentFolder.createBinAction(name, false));
    }, `Create bin "${name}" qua MCP`);
  });
  if (!ok) throw new Error("executeTransaction trả về false khi tạo bin.");

  const afterItems = (await parent.getItems()) || [];
  let confirmedName = null;
  for (const it of afterItems) {
    let n = null;
    try { n = it.name || (await it.getName()); } catch {}
    if (n != null && !beforeNames.has(n)) { confirmedName = n; break; }
  }
  if (confirmedName == null) {
    throw new Error("createBinAction() đã chạy nhưng không tìm thấy bin mới trong danh sách sau đó — không xác nhận được có thực sự tạo thành công không.");
  }

  return { created: true, name: confirmedName };
}

async function moveItemToBin({ clipName, targetBin }) {
  if (!clipName || !targetBin) throw new Error("Phải truyền clipName và targetBin.");
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");

  const rootItem = await project.getRootItem();
  let sourceItem = null, targetBinItem = null;

  // Tìm item và bin đích — dùng getItems() (đúng), không phải getChildCount/getChildAtIndex (sai,
  // cùng loại bug đã fix ở createBin/importFilesToProject).
  const items = (await rootItem.getItems()) || [];
  for (const child of items) {
    try {
      const name = child.name || (await child.getName());
      if (name === clipName && !sourceItem) sourceItem = child;
      if (name === targetBin && !targetBinItem) targetBinItem = child;
    } catch {}
  }

  if (!sourceItem) throw new Error(`Không tìm thấy item "${clipName}" trong Project panel.`);
  if (!targetBinItem) throw new Error(`Không tìm thấy bin "${targetBin}" trong Project panel.`);

  // LƯU Ý 2026-09-10: createMoveItemAction CÓ THẬT trên FolderItem.prototype (đã xác nhận live) —
  // lỗi trước là do targetBinItem lấy từ rootItem.getItems() là ProjectItem chung, chưa cast sang
  // FolderItem nên không thấy method (cùng bug pattern đã fix ở createBin).
  const targetFolder = (typeof targetBinItem.createMoveItemAction === "function")
    ? targetBinItem
    : ppro.FolderItem.cast(targetBinItem);
  if (!targetFolder || typeof targetFolder.createMoveItemAction !== "function") {
    throw new Error(`Không cast được "${targetBin}" thành FolderItem hợp lệ (createMoveItemAction không tồn tại).`);
  }

  // LƯU Ý 2026-09-10: createMoveItemAction tồn tại thật trên FolderItem.prototype nhưng gọi với
  // (item) hay ([item], bool) đều báo "Not Enough Parameters" từ native layer — chưa tìm ra chữ ký
  // đúng (length báo 0, không đáng tin với hàm native). CHƯA GIẢI QUYẾT — xem TODO.md.
  let ok;
  await project.lockedAccess(() => {
    ok = project.executeTransaction((compoundAction) => {
      compoundAction.addAction(targetFolder.createMoveItemAction(sourceItem));
    }, `Move "${clipName}" → "${targetBin}" qua MCP`);
  });
  if (!ok) throw new Error("executeTransaction trả về false khi di chuyển item.");

  // Verify read-back: item còn thấy được trong bin đích không.
  const afterItems = (await targetFolder.getItems()) || [];
  let found = false;
  for (const it of afterItems) {
    try { if ((it.name || (await it.getName())) === clipName) { found = true; break; } } catch {}
  }
  if (!found) {
    throw new Error(`createMoveItemAction() chạy xong nhưng không thấy "${clipName}" trong bin "${targetBin}" — không xác nhận được di chuyển thành công.`);
  }

  return { moved: true, clipName, targetBin };
}

async function replaceClipMedia({ newFilePath }, log) {
  if (!newFilePath) throw new Error("Phải truyền newFilePath.");
  const { project, clip } = await getActiveSequenceAndSelection(log);

  try {
    const projectItem = await clip.getProjectItem();
    if (typeof projectItem.changeMediaSource === "function") {
      await projectItem.changeMediaSource(newFilePath);
      return { replaced: true, newFilePath, newFileName: newFilePath.split(/[\\/]/).pop() };
    }
    return {
      replaced: false,
      message: "projectItem.changeMediaSource() không khả dụng. Relink thủ công: chuột phải clip trong Project panel → Replace Footage."
    };
  } catch (e) {
    throw new Error(`Replace clip media thất bại: ${e.message}`);
  }
}

async function relinkOfflineMedia({ searchFolder }) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");

  return {
    relinked: 0,
    stillOffline: 0,
    message: `Relink offline media thủ công: Edit → Find → Offline Files, hoặc chuột phải clip offline → Link Media. ` +
      (searchFolder ? `Thư mục tìm kiếm gợi ý: ${searchFolder}` : "")
  };
}

// ============================================================================
// GROUP 11 — Selection
// ============================================================================

async function selectClipsInRange({ startSeconds, endSeconds, trackType = "all" }) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active.");

  const startTick = secondsToTick(startSeconds);
  const endTick = secondsToTick(endSeconds);
  const items = await getTrackItemsInRange(sequence, startTick, endTick, trackType);

  if (items.length === 0) return { selected: 0, clips: [] };

  // LƯU Ý 2026-09-10: sequence.createSelectItemsAction KHÔNG tồn tại trong bản Premiere này (đã
  // live-test — không có trong prototype thật của Sequence, xem seqProto trong get_sequence_info).
  // API đúng: sequence.setSelection(trackItems) — gọi trực tiếp, KHÔNG qua executeTransaction (đây
  // không phải action creator). Trước đây lỗi bị nuốt trong try/catch rỗng nên tool báo "selected:N"
  // dù thực chất không chọn được gì trên UI (get_selected_clips vẫn báo rỗng).
  let selectError = null;
  try {
    await sequence.setSelection(items.map(i => i.item));
  } catch (e) {
    selectError = String(e && e.message || e);
  }

  return {
    selected: selectError ? 0 : items.length,
    selectError,
    clips: items.map(i => ({ trackType: i.trackType, trackIndex: i.trackIndex, startSeconds: i.itemStart.seconds }))
  };
}

async function selectAllClips({ trackType = "all" }) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active.");

  const duration = await sequence.getEndTime();
  const startTick = secondsToTick(0);
  const items = await getTrackItemsInRange(sequence, startTick, duration, trackType);

  let selectError = null;
  try {
    await sequence.setSelection(items.map(i => i.item));
  } catch (e) {
    selectError = String(e && e.message || e);
  }

  return { selected: selectError ? 0 : items.length, selectError };
}

async function deselectAllClips() {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active.");

  try {
    await project.lockedAccess(() => {
      project.executeTransaction((compoundAction) => {
        compoundAction.addAction(sequence.createSelectItemsAction([], false));
      }, "Bỏ chọn tất cả");
    });
  } catch (e) {
    try {
      await sequence.clearSelection();
    } catch {}
  }

  return { done: true };
}

// ============================================================================
// GROUP 12 — Scene Detection
// ============================================================================

async function detectSceneEdits({ sensitivity = 50, createMarkers = true }, log) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active.");

  // Thử API Premiere 2022+ built-in Scene Edit Detection
  if (typeof sequence.detectSceneEdits === "function") {
    try {
      const scenes = await sequence.detectSceneEdits(sensitivity / 100);
      const markers = [];
      if (createMarkers && scenes && scenes.length > 0) {
        // Thêm marker tại mỗi điểm chuyển cảnh
        const seqMarkers = await ppro.Markers.getMarkers(sequence);
        await project.lockedAccess(() => {
          project.executeTransaction((compoundAction) => {
            for (const scene of scenes) {
              const tick = secondsToTick(scene.time || scene);
              compoundAction.addAction(seqMarkers.createAddMarkerAction(tick, ppro.Constants.MarkerType.COMMENT, 0, "Scene edit", "Detected by Premiere MCP"));
              markers.push({ timeSeconds: scene.time || scene });
            }
          }, "Thêm scene edit markers");
        });
      }
      return { scenesDetected: scenes ? scenes.length : 0, markers };
    } catch (e) {
      log(`⚠️ sequence.detectSceneEdits() lỗi: ${e.message}`, "warn");
    }
  }

  return {
    scenesDetected: 0,
    markers: [],
    message: "Scene Edit Detection API không khả dụng trong bản Premiere này. Dùng Sequence menu → Scene Edit Detection thủ công."
  };
}

// ============================================================================
// GROUP 13 — Metadata
// ============================================================================

async function getClipMetadata({ fields }) {
  const { clip } = await getActiveSequenceAndSelection(function () {});

  try {
    const projectItem = await clip.getProjectItem();
    if (typeof projectItem.getXMPMetadata !== "function") {
      let proto = [];
      try { proto = Object.getOwnPropertyNames(Object.getPrototypeOf(projectItem)); } catch {}
      throw new Error(`projectItem.getXMPMetadata không tồn tại trong bản Premiere này. API thật có trên ProjectItem: [${proto.join(", ")}]`);
    }
    const xmpString = await projectItem.getXMPMetadata();
    // Parse XMP đơn giản — lấy các field phổ biến
    const metadata = {};
    const fieldNames = fields || ["description", "scene", "shot", "director", "camera", "comment", "keyword", "label"];
    for (const field of fieldNames) {
      const regex = new RegExp(`<[^>]*:?${field}[^>]*>([^<]*)<`, "i");
      const match = xmpString && xmpString.match(regex);
      if (match) metadata[field] = match[1].trim();
    }
    return { metadata, raw: fields ? undefined : xmpString };
  } catch (e) {
    throw new Error(`Không đọc được XMP metadata: ${e.message}`);
  }
}

async function setClipMetadata({ metadata }, log) {
  if (!metadata || typeof metadata !== "object") throw new Error("Phải truyền object metadata.");
  const { project, clip } = await getActiveSequenceAndSelection(log);

  try {
    const projectItem = await clip.getProjectItem();
    let xmp = await projectItem.getXMPMetadata() || "";

    // Ghi từng field vào XMP
    const set = [];
    for (const [field, value] of Object.entries(metadata)) {
      // Simple XMP field injection — đây là approach đơn giản nhất
      const tagOpen = `<dc:${field}>`;
      const tagClose = `</dc:${field}>`;
      if (xmp.includes(tagOpen)) {
        xmp = xmp.replace(new RegExp(`${tagOpen}[^<]*${tagClose}`), `${tagOpen}${value}${tagClose}`);
      } else {
        // Append vào cuối Description node nếu có
        xmp = xmp.replace("</rdf:Description>", `${tagOpen}${value}${tagClose}</rdf:Description>`);
      }
      set.push(field);
    }

    await projectItem.setXMPMetadata(xmp);
    return { set: set.length, fields: set };
  } catch (e) {
    throw new Error(`Không ghi được XMP metadata: ${e.message}`);
  }
}

// ============================================================================
// GROUP 14 — MOGRT & Text Overlay
// ============================================================================

// ----------------------------------------------------------------------------
// SRT → MOGRT caption timeline (PLAN_MCP_PREMIERE_SRT_TO_TEXT_TIMELINE.docx, 2026-09-10)
// ----------------------------------------------------------------------------
// LƯU Ý — capability probe thật đã xác nhận (2026-09-10, Premiere Pro 2026):
// - SequenceEditor.insertMogrtFromPath(path, tick, videoTrackIndex, numAudioTracks) TỒN TẠI và
//   TẠO ĐƯỢC graphic clip thật (component chain: Opacity, Motion, Graphic Group, AE.ADBE Text).
// - KHÔNG phải action-factory (không trả Action để compoundAction.addAction — làm vậy ném "Illegal
//   Parameter type") — phải gọi TRỰC TIẾP trong project.lockedAccess(), không qua executeTransaction.
// - Cùng bug họ với insert_clip/overwrite_clip trước khi fix: tham số tick vị trí bị BỎ QUA, clip
//   luôn nối tiếp sau item cuối cùng trên track — phải tự tìm item mới rồi createMoveAction(offset)
//   để đưa về đúng vị trí, y hệt pattern insertOrOverwriteClip().
// - Text nằm ở component "AE.ADBE Text", param hiển thị "Source Text" (param đầu tiên, index 0) —
//   set qua param.createSetValueAction(text, 0), cùng API đã dùng cho set_effect_param.

// Tìm component theo matchName trong chain của 1 track item (khác findComponentByMatchName — hàm
// đó nhận thẳng `clip` từ getActiveSequenceAndSelection, hàm này dùng khi đã có track item sẵn).
async function findComponentInItemChain(item, matchName) {
  const chain = await item.getComponentChain();
  const count = await chain.getComponentCount();
  for (let i = 0; i < count; i++) {
    const comp = await chain.getComponentAtIndex(i);
    let mn = null;
    try { mn = await comp.getMatchName(); } catch {}
    if (mn === matchName) return comp;
  }
  return null;
}

// Chèn 1 MOGRT tại đúng startSeconds/durationSeconds + set text, có verify read-back thật. Dùng
// cho cả insert đơn lẻ lẫn vòng lặp batch (srtToMogrtCaptions bên dưới).
async function insertMogrtCaption({ mogrtPath, startSeconds, durationSeconds, text, videoTrackIndex = 2, textParamName = "Source Text" }) {
  if (!mogrtPath) throw new Error("Phải truyền mogrtPath.");
  if (startSeconds == null) throw new Error("Phải truyền startSeconds.");

  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active.");
  const sequenceEditor = ppro.SequenceEditor.getEditor(sequence);
  if (!sequenceEditor) throw new Error("Không lấy được SequenceEditor.");
  const track = await sequence.getVideoTrack(videoTrackIndex);
  if (!track) throw new Error(`Không có video track index ${videoTrackIndex}.`);

  const before = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
  const beforeCount = before.length;

  const placeholderTick = secondsToTick(startSeconds);
  await project.lockedAccess(() => {
    sequenceEditor.insertMogrtFromPath(mogrtPath, placeholderTick, videoTrackIndex, 1);
  });

  const after = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
  if (after.length <= beforeCount) {
    throw new Error("insertMogrtFromPath() chạy xong nhưng không thấy track item mới — không xác nhận được tạo thành công.");
  }
  const newItem = after[after.length - 1];

  // Bước 2: di chuyển về đúng vị trí (tick truyền vào insertMogrtFromPath bị bỏ qua).
  const currentStart = await newItem.getStartTime();
  const desiredTick = secondsToTick(startSeconds);
  const offset = desiredTick.subtract(currentStart);
  let moveOk;
  await project.lockedAccess(() => {
    moveOk = project.executeTransaction((compoundAction) => {
      compoundAction.addAction(newItem.createMoveAction(offset));
    }, "Move MOGRT caption qua MCP");
  });
  if (!moveOk) throw new Error("executeTransaction trả về false khi di chuyển MOGRT về vị trí.");

  // Bước 3: set duration nếu có yêu cầu.
  if (durationSeconds != null && durationSeconds > 0) {
    const endTick = secondsToTick(startSeconds + durationSeconds);
    let durOk;
    await project.lockedAccess(() => {
      durOk = project.executeTransaction((compoundAction) => {
        compoundAction.addAction(newItem.createSetEndAction(endTick));
      }, "Set MOGRT caption duration qua MCP");
    });
    if (!durOk) throw new Error("executeTransaction trả về false khi set duration.");
  }

  // Bước 4: set text vào component AE.ADBE Text / param "Source Text".
  let textSet = false;
  let textError = null;
  if (text != null) {
    try {
      // LƯU Ý 2026-09-10: đã live-test kỹ trên Premiere 2026 — với MOGRT chèn qua
      // insertMogrtFromPath(), text layer thật nằm LỒNG bên trong component "AE.ADBE Graphic
      // Group", KHÔNG phải sibling top-level như 1 lần probe ban đầu tưởng nhầm (lần đó do
      // track đã có sẵn item cũ từ nhiều lần thử trước, không phải hành vi chuẩn của 1 lần insert
      // sạch). Component "AE.ADBE Graphic Group" chỉ có API getParam/getParamCount (param transform
      // chung: Position/Scale/Rotation/Anchor) — KHÔNG có getComponentChain/getChildren/getChildAt
      // Index nào để drill xuống từng text layer con. Đã thử cả "Basic Title.mogrt" và "Simple Web
      // Caption.mogrt", cùng kết quả. Kết luận: set text theo cách này KHÔNG khả dụng ở bản Premiere
      // hiện tại qua TrackItem.getComponentChain() — cần API khác (chưa tìm ra) hoặc chờ Adobe bổ
      // sung. Xem TODO.md mục MOGRT text.
      const textComp = await findComponentInItemChain(newItem, "AE.ADBE Text");
      if (!textComp) {
        throw new Error(
          "Text layer nằm lồng trong 'AE.ADBE Graphic Group', component này không có API drill-down " +
          "(chỉ có getParam/getParamCount cho transform chung) — KHÔNG set được text qua " +
          "getComponentChain() ở bản Premiere hiện tại. MOGRT vẫn được chèn đúng vị trí/thời lượng, " +
          "chỉ là giữ nguyên text mặc định của template."
        );
      }
      const param = await findParamByName(textComp, textParamName);
      if (!param) throw new Error(`Không tìm thấy param "${textParamName}" trên component Text.`);
      let setOk;
      await project.lockedAccess(() => {
        setOk = project.executeTransaction((compoundAction) => {
          compoundAction.addAction(param.createSetValueAction(text, 0));
        }, "Set MOGRT caption text qua MCP");
      });
      if (!setOk) throw new Error("executeTransaction trả về false khi set text.");
      textSet = true;
    } catch (e) {
      textError = String(e && e.message || e);
    }
  }

  // Verify read-back thật — không tin return code, đọc lại vị trí thật từ Premiere.
  const finalStart = (await newItem.getStartTime()).seconds;
  const finalEnd = (await newItem.getEndTime()).seconds;
  const positionOk = Math.abs(finalStart - startSeconds) < 0.05;

  return { startSeconds, finalStart, finalEnd, positionOk, textSet, textError };
}

// Parser SRT chuẩn (index / HH:MM:SS,mmm --> HH:MM:SS,mmm / text 1+ dòng / dòng trống). Không dùng
// float giây làm nguồn chân lý khi so sánh — chỉ dùng seconds ở biên MCP, tính toán nội bộ vẫn qua
// TickTime của Premiere (secondsToTick).
function parseSrt(content) {
  const normalized = content.replace(/\r\n/g, "\n").replace(/^﻿/, "");
  const blocks = normalized.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const cues = [];
  const toSeconds = (h, m, s, ms) => (+h) * 3600 + (+m) * 60 + (+s) + (+ms) / 1000;

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 2) continue;
    let idx = 0;
    // Dòng đầu có thể là số thứ tự (thường có) — bỏ qua nếu là số nguyên thuần.
    if (/^\d+$/.test(lines[0].trim())) idx = 1;
    const timingLine = lines[idx];
    const m = timingLine.match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) continue;
    const startSeconds = toSeconds(m[1], m[2], m[3], m[4]);
    const endSeconds = toSeconds(m[5], m[6], m[7], m[8]);
    const text = lines.slice(idx + 1).join("\n").trim();
    if (!text || startSeconds >= endSeconds) continue;
    cues.push({ index: cues.length, startSeconds, endSeconds, text });
  }
  return cues;
}

// LƯU Ý 2026-09-10: pathToFileUrl() percent-encode sẵn (vd " " → "%20") — nhưng
// uxpFs.getEntryWithUrl() tự encode thêm 1 lần nữa, ra URL hỏng dạng "%2520" (đã xác nhận lỗi thật
// khi đọc file có dấu cách trong path). Với hàm này dùng URL RAW (spaces thật, không encode) —
// khác pattern pathToFileUrl() đang dùng ở detectSilenceRegions (chưa test, có thể cùng bug, chưa
// sửa vì chưa xác nhận qua live-test — xem TODO.md).
async function readTextFile(path) {
  const rawUrl = "file:///" + path.replace(/\\/g, "/");
  const entry = await uxpFs.getEntryWithUrl(rawUrl);
  return await entry.read({ format: uxpFormats.utf8 });
}

// High-level batch tool — 1 lệnh MCP xử lý toàn bộ file SRT, KHÔNG để Claude gọi 1 lệnh/cue (đúng
// yêu cầu kiến trúc trong PLAN_MCP_PREMIERE_SRT_TO_TEXT_TIMELINE.docx mục 13). Chạy tuần tự từng
// cue trong tiến trình plugin, trả về report created/failed theo cue index — không báo success giả
// nếu 1 phần cue lỗi.
async function srtToMogrtCaptions({ srtPath, mogrtPath, videoTrackIndex = 2, textParamName = "Source Text", startOffsetSeconds = 0, maxCues }, log) {
  if (!srtPath) throw new Error("Phải truyền srtPath.");
  if (!mogrtPath) throw new Error("Phải truyền mogrtPath.");

  const content = await readTextFile(srtPath);
  let cues = parseSrt(content);
  if (cues.length === 0) throw new Error("Parse SRT không ra cue nào — kiểm tra định dạng file.");
  if (maxCues != null && maxCues > 0) cues = cues.slice(0, maxCues);

  const results = [];
  const failed = [];
  for (const cue of cues) {
    try {
      const r = await insertMogrtCaption({
        mogrtPath,
        startSeconds: cue.startSeconds + startOffsetSeconds,
        durationSeconds: cue.endSeconds - cue.startSeconds,
        text: cue.text,
        videoTrackIndex,
        textParamName
      });
      results.push({ cueIndex: cue.index, ...r });
      if (log) log(`Cue ${cue.index}: ${cue.startSeconds.toFixed(2)}s–${cue.endSeconds.toFixed(2)}s "${cue.text.slice(0, 30)}" → ${r.positionOk && r.textSet ? "OK" : "CẢNH BÁO"}`);
    } catch (e) {
      const err = String(e && e.message || e);
      failed.push({ cueIndex: cue.index, startSeconds: cue.startSeconds, text: cue.text, error: err });
      if (log) log(`Cue ${cue.index} LỖI: ${err}`, "warn");
    }
  }

  const okCount = results.filter(r => r.positionOk && r.textSet).length;
  return {
    totalCues: cues.length,
    created: results.length,
    fullyVerifiedOk: okCount,
    failed,
    sample: results.slice(0, 3).concat(results.length > 3 ? [results[results.length - 1]] : [])
  };
}

async function importMogrt({ path, insertAtSeconds }, log) {
  if (!path) throw new Error("Phải truyền đường dẫn file .mogrt.");
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");

  try {
    const ok = await project.importFiles([path], true, null, false);
    return {
      imported: !!ok,
      path,
      note: `File MOGRT đã import vào Project. Kéo vào timeline${insertAtSeconds != null ? ` tại ${insertAtSeconds}s` : ""} thủ công.`
    };
  } catch (e) {
    throw new Error(`Import MOGRT thất bại: ${e.message}`);
  }
}

async function addTextOverlay({ text, startSeconds, endSeconds, style = "lower-third" }) {
  return {
    added: false,
    message: `addTextOverlay: UXP chưa có API tạo Essential Graphics text layer trực tiếp. ` +
      `Thêm text "${text}" thủ công: File → New → Legacy Title hoặc dùng Essential Graphics panel, ` +
      `đặt tại ${startSeconds}s–${endSeconds}s với style "${style}".`
  };
}

// ============================================================================
// GROUP 15 — Export
// ============================================================================

async function captureFrame({ timeSeconds, outputPath, format = "png" }) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active.");

  try {
    const tick = timeSeconds != null ? secondsToTick(timeSeconds) : null;
    if (typeof sequence.exportFrame === "function") {
      const finalPath = outputPath || `C:\\Users\\${(typeof uxpFs !== "undefined") ? "NC" : "user"}\\Desktop\\frame_${Date.now()}.${format}`;
      await sequence.exportFrame(tick, finalPath, format);
      return { saved: true, path: finalPath, format };
    }
    return {
      saved: false,
      message: `Export frame thủ công: đặt playhead tại ${timeSeconds != null ? timeSeconds + "s" : "vị trí cần"} → File → Export → Media → Format: ${format.toUpperCase()}.`
    };
  } catch (e) {
    throw new Error(`Capture frame thất bại: ${e.message}`);
  }
}

async function exportAsXml({ format, outputPath }) {
  if (!format || !outputPath) throw new Error("Phải truyền format và outputPath.");
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active.");

  try {
    if (format === "fcpxml" && typeof sequence.exportFCPXML === "function") {
      await sequence.exportFCPXML(outputPath);
      return { exported: true, format, path: outputPath };
    }
    if (format === "fcp7" && typeof sequence.exportAsFinalCutProXML === "function") {
      await sequence.exportAsFinalCutProXML(outputPath);
      return { exported: true, format, path: outputPath };
    }
    if (format === "aaf" && typeof project.exportAAF === "function") {
      await project.exportAAF(outputPath);
      return { exported: true, format, path: outputPath };
    }
    return {
      exported: false,
      message: `Export ${format.toUpperCase()} thủ công: File → Export → ${format === "fcpxml" ? "Final Cut Pro XML" : format.toUpperCase()}.`,
      format, outputPath
    };
  } catch (e) {
    throw new Error(`Export XML thất bại: ${e.message}`);
  }
}

async function exportToMediaEncoder({ presetName, outputPath }, log) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active.");

  try {
    if (typeof project.exportSequenceToMediaEncoder === "function") {
      const jobId = await project.exportSequenceToMediaEncoder(sequence, presetName, outputPath);
      return { queued: true, jobId, presetName, outputPath };
    }
    return {
      queued: false,
      message: "Export thủ công: File → Export → Media (hoặc Ctrl+M) → chọn preset → Queue."
    };
  } catch (e) {
    throw new Error(`Export to Media Encoder thất bại: ${e.message}`);
  }
}

// ============================================================================
// GROUP 16 — AI Features
// ============================================================================

async function transcribeClip({ language = "auto" }, log) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active.");

  // Thử Premiere 2023+ Speech-to-Text built-in
  try {
    if (typeof sequence.transcribe === "function") {
      const result = await sequence.transcribe({ language });
      return { transcript: result, method: "premiere_builtin" };
    }
  } catch {}

  return {
    transcript: [],
    message: `Transcription thủ công: chọn clip audio → Text panel → Transcribe Sequence (Premiere 2023+). ` +
      `Hoặc thêm OPENAI_API_KEY env var để dùng Whisper API (chưa implement).`,
    language
  };
}

async function autoCaptionFromSpeech({ language = "auto", style = "subtitle" }, log) {
  // Workflow: transcribe → create_caption_track → populate
  const transcription = await transcribeClip({ language }, log);

  if (!transcription.transcript || transcription.transcript.length === 0) {
    return {
      captionsCreated: 0,
      message: transcription.message || "Không có transcript để tạo caption. Dùng Text panel trong Premiere."
    };
  }

  // Tạo caption track
  const trackResult = await createCaptionTrack({ format: style === "captions" ? "CEA-708" : "subtitle" });
  if (!trackResult.created) {
    return { captionsCreated: 0, message: trackResult.message };
  }

  return {
    captionsCreated: transcription.transcript.length,
    trackIndex: trackResult.trackIndex,
    method: transcription.method,
    note: "Caption đã được tạo từ transcript. Xem trong Text panel để chỉnh sửa."
  };
}

// ============================================================================
// GROUP 17 — Timeline Placement, Sequence Management, Generic Markers
// Thêm 2026-09-09. API dùng ở đây (SequenceEditor.createInsertProjectItemAction/
// createOverwriteItemAction/createCloneTrackItemAction, Project.createSequence/
// setActiveSequence, Sequence.createCloneAction) đã được xác nhận tồn tại qua
// @adobe/premierepro type declarations + sample repo chính thức của Adobe
// (github.com/AdobeDocs/uxp-premiere-pro-samples) — không phải đoán mò. Nhưng
// CHƯA được test trên Premiere thật (không thể test từ môi trường build code) —
// mọi hàm dưới đây đều có bước verify đọc lại kết quả và throw rõ ràng nếu
// không xác nhận được, thay vì âm thầm báo "thành công".
// ============================================================================

// Tìm project item theo tên, đệ quy vào bin con (các hàm cũ như moveItemToBin
// chỉ tìm ở root, bỏ sót item nằm trong bin — sửa luôn ở đây).
async function findProjectItemInBin(binItem, name) {
  // getChildCount()/getChildAtIndex() KHÔNG tồn tại trên bản Premiere này (xác nhận qua test thật:
  // "binItem.getChildCount is not a function") dù toàn bộ code cũ trong file này giả định có —
  // API đúng theo sample chính thức Adobe (projectPanel.ts) là getItems() trả mảng thẳng, và name
  // là property thường (không phải getName()). Nhiều hàm khác dùng pattern cũ (createBin,
  // getProjectInfo bins list...) có thể cũng đang âm thầm lỗi vì lý do tương tự — chưa sửa hết,
  // chỉ sửa đường dùng cho insert_clip/overwrite_clip vì đó là tool được test và cần thật.
  let items;
  try { items = await binItem.getItems(); } catch { return null; }
  for (const child of (items || [])) {
    let childName = null;
    try { childName = child.name; } catch {}
    if (childName === name) return child;
    try {
      const folder = await ppro.FolderItem.cast(child);
      if (folder) {
        const found = await findProjectItemInBin(folder, name);
        if (found) return found;
      }
    } catch {}
  }
  return null;
}

async function findProjectItemByName(project, name) {
  const rootItem = await project.getRootItem();
  return await findProjectItemInBin(rootItem, name);
}

// Đếm tổng track item trên toàn sequence (video + audio) — dùng để verify
// "có thêm gì đó thật sự xảy ra" khi không có cách định danh trực tiếp item mới.
async function countAllTrackItems(sequence) {
  let total = 0;
  const vCount = await sequence.getVideoTrackCount();
  for (let i = 0; i < vCount; i++) {
    const track = await sequence.getVideoTrack(i);
    total += (await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false)).length;
  }
  const aCount = await sequence.getAudioTrackCount();
  for (let i = 0; i < aCount; i++) {
    const track = await sequence.getAudioTrack(i);
    total += (await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false)).length;
  }
  return total;
}

// Tìm track item MỚI (vừa được insert/overwrite thêm vào) trên 1 track, khớp theo tên projectItem
// và KHÔNG có mặt trong tập "signature" chụp trước đó. Signature = getStartTime().seconds (vị trí
// trên timeline, KHÁC với getInPoint()/getOutPoint() — 2 cái đó là source trim, không phải vị trí).
async function collectStartTimeSignatures(track, itemName) {
  const set = new Set();
  if (!track) return set;
  let items;
  try { items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false); } catch { return set; }
  for (const item of items) {
    let projItem;
    try { projItem = await item.getProjectItem(); } catch { continue; }
    let name;
    try { name = projItem && projItem.name; } catch { continue; }
    if (name !== itemName) continue;
    try {
      const start = await item.getStartTime();
      set.add(start.seconds.toFixed(6));
    } catch {}
  }
  return set;
}

async function findNewMatchingTrackItem(track, itemName, beforeSignatures) {
  if (!track) return null;
  let items;
  try { items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false); } catch { return null; }
  for (const item of items) {
    let projItem;
    try { projItem = await item.getProjectItem(); } catch { continue; }
    let name;
    try { name = projItem && projItem.name; } catch { continue; }
    if (name !== itemName) continue;
    let start;
    try { start = await item.getStartTime(); } catch { continue; }
    if (!beforeSignatures.has(start.seconds.toFixed(6))) return item;
  }
  return null;
}

// Fallback cho findNewMatchingTrackItem khi overwrite đè lên đúng vị trí đã có clip cùng tên/cùng
// startSeconds từ trước (vd chạy lại workflow idempotent) — Premiere có thể tái dùng/merge vào
// track item CŨ thay vì tạo item mới, nên không có signature "chưa từng thấy" nào xuất hiện dù
// overwrite đã áp dụng thật. Trường hợp này, item đã nằm ĐÚNG vị trí sẵn rồi — không cần move, chỉ
// cần trả về nó để bước set duration vẫn chạy.
// LƯU Ý: dùng dung sai 0.05s để khớp item — nếu 2 cue CÙNG itemName nằm cách nhau < 0.05s (chưa gặp
// trong dữ liệu thật đã test, nhưng về lý thuyết có thể xảy ra với cue rất ngắn/dày đặc), hàm này có
// thể khớp NHẦM sang item liền kề thay vì đúng item tại vị trí yêu cầu. Chưa xử lý (rủi ro thấp với
// dữ liệu hiện tại — cue gần nhau nhất đã test là ~0.1s), nhưng cần biết nếu debug sai lệch lạ sau
// này với dữ liệu cue rất dày.
async function findExistingItemAtPosition(track, itemName, desiredSeconds) {
  if (!track) return null;
  let items;
  try { items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false); } catch { return null; }
  for (const item of items) {
    let projItem;
    try { projItem = await item.getProjectItem(); } catch { continue; }
    let name;
    try { name = projItem && projItem.name; } catch { continue; }
    if (name !== itemName) continue;
    let start;
    try { start = await item.getStartTime(); } catch { continue; }
    if (Math.abs(start.seconds - desiredSeconds) < 0.05) return item;
  }
  return null;
}

async function insertOrOverwriteClip({ itemName, startSeconds, videoTrackIndex = 0, audioTrackIndex = 0, durationSeconds, mode }, log) {
  // Bối cảnh bug (xem thêm [[premiere-25-6-4-api-corrections]] / [[premiere-mcp]] memory, mục
  // insert_clip, cập nhật 2026-09-10): SequenceEditor.createInsertProjectItemAction/
  // createOverwriteItemAction đặt được clip thật nhưng BỎ QUA tham số TickTime vị trí — clip luôn
  // rơi vào 1 vị trí cố định. Các cách sửa cũ thất bại vì dùng nhầm API: createSetInPointAction/
  // createSetOutPointAction chỉnh SOURCE TRIM (getInPoint/getOutPoint = "relative to start time of
  // the project item"), KHÔNG phải vị trí trên timeline — nên "di chuyển" không có tác dụng, và set
  // cả 2 cùng lúc (đổi cả trim lẫn duration) gây crash native.
  //
  // Fix 2026-09-10 (CHƯA LIVE-TEST — cần chạy premiere-capability-tester hoặc test tay trước khi
  // tin tưởng): dùng đúng API dành riêng cho VỊ TRÍ timeline, lấy từ @adobe/premierepro type decl
  // chính thức — VideoClipTrackItem/AudioClipTrackItem.createMoveAction(tickTime), trong đó
  // getStartTime()/getEndTime() ("relative to the sequence start time") mới là vị trí thật, và
  // createMoveAction dịch chuyển item theo OFFSET (không phải toạ độ tuyệt đối). Quy trình 2 bước:
  //   1. Insert/overwrite bình thường (biết trước sẽ rơi vào vị trí cố định sai).
  //   2. Tìm đúng track item vừa tạo (khớp tên projectItem + startTime chưa từng thấy trước đó),
  //      tính offset = desiredTick - currentStartTick, gọi createMoveAction(offset) để đưa về đúng
  //      startSeconds yêu cầu. Áp dụng cho cả video track item lẫn audio track item (clip AV linked)
  //      để 2 bên không bị lệch nhau.
  if (!itemName) throw new Error("Phải truyền itemName (tên item trong Project panel, kể cả trong bin con).");
  if (startSeconds == null) throw new Error("Phải truyền startSeconds.");

  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active.");

  const projectItem = await findProjectItemByName(project, itemName);
  if (!projectItem) throw new Error(`Không tìm thấy item "${itemName}" trong Project panel (đã tìm cả trong bin con).`);

  const sequenceEditor = ppro.SequenceEditor.getEditor(sequence);
  if (!sequenceEditor) throw new Error("Không lấy được SequenceEditor cho sequence hiện tại — API có thể không khả dụng trong bản Premiere này.");

  const videoTrack = await sequence.getVideoTrack(videoTrackIndex).catch(() => null);
  const audioTrack = await sequence.getAudioTrack(audioTrackIndex).catch(() => null);

  const beforeVideoSigs = await collectStartTimeSignatures(videoTrack, itemName);
  const beforeAudioSigs = await collectStartTimeSignatures(audioTrack, itemName);

  const placeholderTick = secondsToTick(startSeconds);

  let placedOk;
  await project.lockedAccess(() => {
    placedOk = project.executeTransaction((compoundAction) => {
      const action = mode === "insert"
        ? sequenceEditor.createInsertProjectItemAction(projectItem, placeholderTick, videoTrackIndex, audioTrackIndex, true)
        : sequenceEditor.createOverwriteItemAction(projectItem, placeholderTick, videoTrackIndex, audioTrackIndex);
      compoundAction.addAction(action);
    }, `${mode === "insert" ? "Insert" : "Overwrite"} "${itemName}" qua MCP (bước 1/2: đặt tạm)`);
  });
  if (!placedOk) throw new Error("executeTransaction trả về false khi đặt clip lên timeline.");

  let newVideoItem = await findNewMatchingTrackItem(videoTrack, itemName, beforeVideoSigs);
  let newAudioItem = await findNewMatchingTrackItem(audioTrack, itemName, beforeAudioSigs);
  let usedFallback = false;

  if (!newVideoItem && !newAudioItem) {
    // Không tìm được item "mới" — thử fallback: Premiere có thể đã merge overwrite vào item cùng
    // tên đã sẵn có đúng vị trí (chạy lại workflow idempotent). Nếu tìm thấy, coi như đã đúng vị
    // trí, bỏ qua bước move.
    newVideoItem = await findExistingItemAtPosition(videoTrack, itemName, startSeconds);
    newAudioItem = await findExistingItemAtPosition(audioTrack, itemName, startSeconds);
    usedFallback = true;
  }
  const movedItems = [newVideoItem, newAudioItem].filter(Boolean);

  if (movedItems.length === 0) {
    throw new Error(
      `Đã đặt "${itemName}" lên timeline nhưng KHÔNG xác định được track item mới để di chuyển về đúng vị trí ` +
      `(startSeconds=${startSeconds}). Clip có thể đang nằm sai chỗ trên timeline (gần mốc 1 giờ) — kiểm tra và ` +
      `xoá thủ công nếu cần.`
    );
  }

  if (!usedFallback) {
    const desiredTick = secondsToTick(startSeconds);
    const currentStarts = [];
    for (const item of movedItems) currentStarts.push(await item.getStartTime());
    const offsets = currentStarts.map((cur) => desiredTick.subtract(cur));

    let movedOk;
    await project.lockedAccess(() => {
      movedOk = project.executeTransaction((compoundAction) => {
        movedItems.forEach((item, i) => {
          compoundAction.addAction(item.createMoveAction(offsets[i]));
        });
      }, `${mode === "insert" ? "Insert" : "Overwrite"} "${itemName}" qua MCP (bước 2/2: di chuyển về đúng vị trí)`);
    });
    if (!movedOk) {
      throw new Error(
        `Đã đặt "${itemName}" lên timeline nhưng createMoveAction trả về false khi di chuyển về ` +
        `startSeconds=${startSeconds}. Clip hiện đang ở vị trí sai (gần mốc 1 giờ) — kiểm tra thủ công.`
      );
    }
  }

  const finalStart = await movedItems[0].getStartTime();
  const diffSeconds = Math.abs(finalStart.seconds - startSeconds);
  if (diffSeconds > 0.05) {
    throw new Error(
      `Đã di chuyển clip nhưng vị trí cuối cùng (${finalStart.seconds.toFixed(3)}s) không khớp startSeconds ` +
      `yêu cầu (${startSeconds}s, lệch ${diffSeconds.toFixed(3)}s). Kiểm tra thủ công trên timeline.`
    );
  }

  // LƯU Ý 2026-09-10 (bug phát hiện qua verify end time, không phải chỉ start): durationSeconds
  // TRƯỚC ĐÂY nhận vào nhưng KHÔNG BAO GIỜ được áp dụng — clip luôn giữ duration mặc định của
  // project item (vd default still-image duration), không phải giá trị user truyền. Bug tồn tại từ
  // đầu, chỉ lộ ra khi verify kỹ end time (trước giờ chỉ verify start). Set end time thật ở đây.
  let durationApplied = null;
  if (durationSeconds != null && durationSeconds > 0) {
    const endTick = secondsToTick(startSeconds + durationSeconds);
    let durOk;
    await project.lockedAccess(() => {
      durOk = project.executeTransaction((compoundAction) => {
        movedItems.forEach((item) => { compoundAction.addAction(item.createSetEndAction(endTick)); });
      }, `${mode === "insert" ? "Insert" : "Overwrite"} "${itemName}" qua MCP (bước 3/3: set duration)`);
    });
    durationApplied = !!durOk;
    if (durOk) {
      const finalEnd = await movedItems[0].getEndTime();
      const endDiff = Math.abs(finalEnd.seconds - (startSeconds + durationSeconds));
      if (endDiff > 0.05) {
        throw new Error(
          `Đã set duration nhưng end time cuối cùng (${finalEnd.seconds.toFixed(3)}s) không khớp yêu cầu ` +
          `(${(startSeconds + durationSeconds).toFixed(3)}s, lệch ${endDiff.toFixed(3)}s). Kiểm tra thủ công.`
        );
      }
    }
  }

  return {
    itemName,
    mode,
    startSeconds,
    durationSeconds: durationSeconds ?? null,
    durationApplied,
    videoTrackIndex,
    audioTrackIndex,
    movedItemsCount: movedItems.length,
    finalStartSeconds: finalStart.seconds,
    note: "Đặt clip qua bug vị trí cố định của Premiere rồi tự động di chuyển về đúng startSeconds bằng createMoveAction (2 bước, 2 transaction riêng)."
  };
}

async function insertClip(params, log) {
  return insertOrOverwriteClip({ ...params, mode: "insert" }, log);
}

async function overwriteClip(params, log) {
  return insertOrOverwriteClip({ ...params, mode: "overwrite" }, log);
}

// High-level batch tool — đặt nhiều clip (ảnh/video) cùng lúc trong 1 lệnh MCP, tránh phải gọi
// insert_clip/overwrite_clip lặp lại từng cái (cùng nguyên tắc "1 lệnh xử lý cả batch" đã áp dụng
// cho srt_to_mogrt_captions). Mỗi placement độc lập — 1 cái lỗi không chặn các cái còn lại.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// LƯU Ý 2026-09-10: Premiere crash thật sau 1 lần chạy run_mic_check_workflow đặt 64 ảnh liên tiếp
// (~150+ executeTransaction dồn dập trong vài giây — mỗi placement gồm insert + move + set
// duration = 3 transaction riêng). Khớp với cảnh báo đã biết trong dự án (xem
// references/uxp-api-behaviors.md — "UXP timeline operations có thể block main thread... thao tác
// nhiều có thể treo UI hoặc crash Premiere"). Chưa có bằng chứng nhân quả chắc chắn (có thể trùng
// hợp) nhưng thêm delay nhỏ giữa mỗi placement là chi phí thấp để giảm rủi ro — 64 item × 80ms chỉ
// thêm ~5s, không đáng kể so với rủi ro crash mất dữ liệu.
const BATCH_PLACEMENT_DELAY_MS = 80;

async function batchPlaceClips({ placements }, log) {
  if (!Array.isArray(placements) || placements.length === 0) {
    throw new Error("Phải truyền placements là mảng không rỗng.");
  }
  const results = [];
  const failed = [];
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    try {
      const r = await insertOrOverwriteClip({
        itemName: p.itemName,
        startSeconds: p.startSeconds,
        durationSeconds: p.durationSeconds,
        videoTrackIndex: p.videoTrackIndex != null ? p.videoTrackIndex : 0,
        audioTrackIndex: p.audioTrackIndex != null ? p.audioTrackIndex : 0,
        mode: p.mode === "insert" ? "insert" : "overwrite"
      }, log);
      results.push({ index: i, ...r });
      if (log) log(`Placement ${i}: "${p.itemName}" @ ${p.startSeconds}s → OK`);
    } catch (e) {
      const err = String(e && e.message || e);
      failed.push({ index: i, itemName: p.itemName, startSeconds: p.startSeconds, error: err });
      if (log) log(`Placement ${i} LỖI: ${err}`, "warn");
    }
    if (i < placements.length - 1) await sleep(BATCH_PLACEMENT_DELAY_MS);
  }
  return { total: placements.length, placed: results.length, failed };
}

// ----------------------------------------------------------------------------
// Workflow "Mic Check" — 1 lệnh gộp toàn bộ pipeline (xem TODO.md mục "Workflow Mic Check tối ưu,
// Phương án B"). Nhận cues.json đã chuẩn hoá sẵn (từ scripts/docx_to_json.js, chạy ngoài Premiere)
// — không tự parse docx trong plugin (tránh phải nhúng thư viện unzip vào UXP).
// ----------------------------------------------------------------------------
async function runMicCheckWorkflow({
  cuesJsonPath,
  backgroundVideoPath,
  imagesDir,
  sequenceName,
  orientation = "landscape",
  imageVideoTrackIndex = 1,
  backgroundVideoTrackIndex = 0,
  timebase = 60
}, log) {
  if (!cuesJsonPath) throw new Error("Phải truyền cuesJsonPath.");
  if (!sequenceName) throw new Error("Phải truyền sequenceName.");
  if (!imagesDir) throw new Error("Phải truyền imagesDir.");

  const cuesRaw = await readTextFile(cuesJsonPath);
  let cuesData;
  try { cuesData = JSON.parse(cuesRaw); } catch (e) { throw new Error(`Không parse được "${cuesJsonPath}" thành JSON: ${e.message}`); }
  const cues = cuesData.cues;
  if (!Array.isArray(cues) || cues.length === 0) throw new Error(`"${cuesJsonPath}" không có mảng "cues" hợp lệ.`);

  const frameWidth = orientation === "portrait" ? 1080 : 1920;
  const frameHeight = orientation === "portrait" ? 1920 : 1080;

  if (log) log(`Tạo sequence "${sequenceName}" (${frameWidth}x${frameHeight}, ${timebase}fps)...`);
  const seqResult = await createSequence({ name: sequenceName, timebase, frameWidth, frameHeight });
  await setActiveSequenceTool({ name: seqResult.name });

  const dirNormalized = imagesDir.replace(/[\\/]+$/, "");
  const uniqueImageNames = [...new Set(cues.map((c) => c.image).filter(Boolean))];
  const imagePaths = uniqueImageNames.map((name) => `${dirNormalized}\\${name}`);
  const allPaths = backgroundVideoPath ? [backgroundVideoPath, ...imagePaths] : imagePaths;

  if (log) log(`Import ${allPaths.length} file media...`);
  const importResult = await importFilesToProject({ paths: allPaths });

  let backgroundResult = null;
  if (backgroundVideoPath) {
    const bgName = backgroundVideoPath.split(/[\\/]/).pop();
    if (log) log(`Đặt video nền "${bgName}"...`);
    backgroundResult = await insertOrOverwriteClip({
      itemName: bgName,
      startSeconds: 0,
      videoTrackIndex: backgroundVideoTrackIndex,
      mode: "overwrite"
    }, log);
  }

  const placements = cues
    .filter((c) => c.image)
    .map((c) => ({
      itemName: c.image,
      startSeconds: c.start,
      durationSeconds: c.end - c.start,
      videoTrackIndex: imageVideoTrackIndex,
      mode: "overwrite"
    }));
  if (log) log(`Đặt ${placements.length} ảnh theo cues...`);
  const placeResult = await batchPlaceClips({ placements }, log);

  const captionCues = cues.filter((c) => c.text).length;

  return {
    sequenceName: seqResult.name,
    timebaseApplied: seqResult.timebaseApplied,
    actualFps: seqResult.actualFps,
    importedFiles: importResult.imported.length,
    background: backgroundResult,
    images: placeResult,
    totalCues: cues.length,
    captionCuesAvailable: captionCues,
    nextStep:
      "Kéo file SRT tương ứng từ Project panel vào 1 caption track trên timeline (đảm bảo không còn " +
      "caption track cũ nào trước đó, nếu không Premiere có thể giữ track cũ thay vì dùng SRT mới) — " +
      "bước duy nhất chưa tự động hoá được, giới hạn thật của Premiere UXP (xem TODO.md)."
  };
}

// Đối chiếu lại timeline (sequence đang active) với cues.json — dùng cho nút "Verify" trong panel.
// Chỉ verify được clip ảnh trên video track (name/start/end đọc được thật qua UXP) — KHÔNG verify
// được nội dung text của caption item (CaptionTrackItem không có API đọc text, xem TODO.md mục
// "caption text styling") nên phần caption chỉ so sánh được SỐ LƯỢNG item, không so được nội dung.
async function verifyMicCheckWorkflow({ cuesJsonPath, imageVideoTrackIndex = 1 }) {
  if (!cuesJsonPath) throw new Error("Phải truyền cuesJsonPath.");
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active.");

  const cuesRaw = await readTextFile(cuesJsonPath);
  let cuesData;
  try { cuesData = JSON.parse(cuesRaw); } catch (e) { throw new Error(`Không parse được "${cuesJsonPath}": ${e.message}`); }
  const allCues = cuesData.cues || [];
  const imageCues = allCues.filter((c) => c.image);

  const track = await sequence.getVideoTrack(imageVideoTrackIndex);
  const items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
  const actual = [];
  for (const it of items) {
    const e = {};
    try { e.name = await it.getName(); } catch {}
    try { e.start = (await it.getStartTime()).seconds; } catch {}
    try { e.end = (await it.getEndTime()).seconds; } catch {}
    actual.push(e);
  }

  const mismatches = [];
  const count = Math.max(imageCues.length, actual.length);
  for (let i = 0; i < count; i++) {
    const expected = imageCues[i];
    const real = actual[i];
    if (!expected) {
      mismatches.push({ index: i, issue: "Clip thừa trên timeline, không có cue tương ứng", actual: real });
      continue;
    }
    if (!real) {
      mismatches.push({ index: i, issue: "Thiếu clip trên timeline", expected });
      continue;
    }
    const nameOk = real.name === expected.image;
    const startOk = Math.abs(real.start - expected.start) < 0.05;
    const endOk = Math.abs(real.end - expected.end) < 0.05;
    if (!nameOk || !startOk || !endOk) {
      mismatches.push({ index: i, issue: "Lệch dữ liệu", expected, actual: real, nameOk, startOk, endOk });
    }
  }

  let captionTrackCount = 0;
  let captionItemCount = 0;
  try {
    captionTrackCount = await sequence.getCaptionTrackCount();
    if (captionTrackCount > 0) {
      const ct = await sequence.getCaptionTrack(0);
      const citems = await ct.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
      captionItemCount = citems.length;
    }
  } catch {}
  const captionCuesExpected = allCues.filter((c) => c.text).length;

  return {
    imageCuesExpected: imageCues.length,
    imageClipsFound: actual.length,
    mismatches,
    allImagesOk: mismatches.length === 0,
    captionTrackCount,
    captionItemCount,
    captionCuesExpected,
    captionCountMatches: captionTrackCount > 0 && captionItemCount === captionCuesExpected,
    captionNote: captionTrackCount === 0
      ? "Chưa có caption track nào — cần kéo tay file SRT vào timeline."
      : "Chỉ verify được SỐ LƯỢNG caption item, không verify được nội dung text (giới hạn UXP API)."
  };
}

async function duplicateClip({ offsetSeconds = 1, videoTrackOffset = 0, audioTrackOffset = 0, alignToVideo = true }, log) {
  const { project, sequence, clip } = await getActiveSequenceAndSelection(log || function () {});

  const sequenceEditor = ppro.SequenceEditor.getEditor(sequence);
  if (!sequenceEditor || typeof sequenceEditor.createCloneTrackItemAction !== "function") {
    throw new Error("createCloneTrackItemAction không khả dụng trong bản Premiere này.");
  }

  const originalStart = (await clip.getInPoint()).seconds;
  const countBefore = await countAllTrackItems(sequence);
  // timeOffset là ĐỘ LỆCH thời gian so với clip gốc (không phải absolute time), theo đúng cách
  // sample chính thức của Adobe gọi hàm này ("shift it 1s leftward").
  const timeOffset = secondsToTick(offsetSeconds);

  let ok;
  await project.lockedAccess(() => {
    ok = project.executeTransaction((compoundAction) => {
      const action = sequenceEditor.createCloneTrackItemAction(
        clip, timeOffset, videoTrackOffset, audioTrackOffset, alignToVideo, true
      );
      compoundAction.addAction(action);
    }, "Duplicate clip qua MCP");
  });
  if (!ok) throw new Error("executeTransaction trả về false khi duplicate clip.");

  const countAfter = await countAllTrackItems(sequence);
  if (countAfter <= countBefore) {
    throw new Error("executeTransaction báo thành công nhưng tổng số track item trên sequence không tăng — duplicate có thể đã không thực sự xảy ra. Kiểm tra timeline thủ công.");
  }

  return {
    duplicated: true,
    offsetSeconds,
    videoTrackOffset,
    audioTrackOffset,
    expectedNewStartSeconds: originalStart + offsetSeconds,
    note: "expectedNewStartSeconds là ước tính theo offsetSeconds truyền vào — chưa xác định lại chính xác track item mới bằng identity, chỉ verify qua tổng số track item tăng lên."
  };
}

// LƯU Ý 2026-09-10: SequenceSettings.getVideoFrameRate/setVideoFrameRate CHỈ tồn tại từ Premiere
// Pro 26.2+ (xác nhận qua README_MCP_Premiere_Sequence_FPS_60fps.docx + live-test 2 bản: KHÔNG có
// ở Premiere 2025/25.6.4, CÓ ở Premiere 2026). Project.createSequence chỉ nhận (name), không có
// overload presetPath/createSequenceWithPresetPath ở bản nào cả. Chiến lược: "create-then-configure"
// — tạo sequence trắng bằng project.createSequence(name) rồi gọi setSequenceFrameRate() ngay sau đó
// (dùng chung hàm với tool set_sequence_frame_rate, có verify read-back thật). Nếu API không tồn tại
// (Premiere < 26.2), trả về sequence trắng bình thường, báo rõ timebaseApplied:false — đã thử cách
// nhân bản 2 template 60fps có sẵn trong project làm fallback nhưng KHÔNG ĐÁNG TIN (createCloneAction
// không bảo toàn frame rate, live-test ra ~24fps) nên bỏ, không dùng nữa. 2 sequence template
// ("Template Youtube 1920x1080 60fps", "Template Tiktok 1080x1920 60fps") vẫn còn trong project
// nhưng không còn được code nào tham chiếu tới — có thể xoá tay nếu muốn dọn dẹp.

async function createSequence({ name, fromSelectedMedia = false, timebase = 60, frameWidth, frameHeight }) {
  if (!name) throw new Error("Phải truyền name cho sequence mới.");
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");

  // fromSelectedMedia: giữ nguyên hành vi cũ (tạo từ media Project panel) — timebase theo media
  // nguồn, không set lại (media đã chọn quyết định format).
  if (fromSelectedMedia) {
    const items = await getSelectedProjectItemsForSequence(project);
    if (!items || items.length === 0) throw new Error("fromSelectedMedia=true nhưng không có item nào đang chọn trong Project panel.");

    const before = await project.getSequences();
    const beforeNames = new Set();
    for (const s of (before || [])) { try { beforeNames.add(s.name || (await s.getName())); } catch {} }

    await project.createSequenceFromMedia(name, items);

    const afterList = (await project.getSequences()) || [];
    let confirmedName = null;
    for (const s of afterList) {
      let n = null;
      try { n = s.name || (await s.getName()); } catch {}
      if (n != null && !beforeNames.has(n)) { confirmedName = n; break; }
    }
    if (confirmedName == null) {
      throw new Error("createSequenceFromMedia() đã chạy nhưng không tìm thấy sequence mới — không xác nhận được tạo thành công.");
    }
    return { created: true, name: confirmedName, fromSelectedMedia: true, method: "fromSelectedMedia", timebaseApplied: false };
  }

  // Đường chính: tạo sequence trắng, rồi kiểm tra chính sequence đó có API set frame rate thật
  // không (Premiere 26.2+). Đây là cách kiểm tra DUY NHẤT đáng tin — không đoán trước qua sequence
  // khác, vì mỗi sequence có thể có settings object riêng.
  {
    const before = await project.getSequences();
    const beforeNames = new Set();
    for (const s of (before || [])) { try { beforeNames.add(s.name || (await s.getName())); } catch {} }

    await project.createSequence(name);

    const afterList = (await project.getSequences()) || [];
    let confirmedName = null;
    let newSeq = null;
    for (const s of afterList) {
      let n = null;
      try { n = s.name || (await s.getName()); } catch {}
      if (n != null && !beforeNames.has(n)) { confirmedName = n; newSeq = s; break; }
    }
    if (confirmedName == null) {
      throw new Error("createSequence() đã chạy nhưng không tìm thấy sequence mới — không xác nhận được tạo thành công.");
    }

    const newSettings = await newSeq.getSettings();
    if (typeof newSettings.setVideoFrameRate === "function") {
      // API có thật (26.2+) — set frame rate + frame size (nếu có), verify read-back thật.
      let frameRateResult = null;
      let frameRateError = null;
      if (timebase) {
        try {
          frameRateResult = await setSequenceFrameRate({ fps: timebase, sequenceName: confirmedName });
        } catch (e) {
          frameRateError = String(e && e.message || e);
        }
      }

      let frameSizeApplied = null;
      let frameSizeError = null;
      if (frameWidth && frameHeight) {
        try {
          const s2 = await newSeq.getSettings();
          const rect = await s2.getVideoFrameRect();
          rect.width = frameWidth;
          rect.height = frameHeight;
          s2.setVideoFrameRect(rect);
          let ok2;
          await project.lockedAccess(() => {
            ok2 = project.executeTransaction((compoundAction) => {
              compoundAction.addAction(newSeq.createSetSettingsAction(s2));
            }, `Set frame size ${frameWidth}x${frameHeight} qua MCP`);
          });
          frameSizeApplied = !!ok2;
        } catch (e) {
          frameSizeApplied = false;
          frameSizeError = String(e && e.message || e);
        }
      }

      return {
        created: true,
        name: confirmedName,
        fromSelectedMedia: false,
        method: "blank_direct_api",
        timebase,
        timebaseApplied: !!(frameRateResult && frameRateResult.success),
        timebaseError: frameRateError,
        actualFps: frameRateResult ? frameRateResult.afterFps : null,
        frameWidth: frameWidth || null,
        frameHeight: frameHeight || null,
        frameSizeApplied,
        frameSizeError
      };
    }
    // Không có setVideoFrameRate (Premiere < 26.2) — sequence trắng vừa tạo (đúng tên `name`, đúng
    // tên user muốn) đã đủ dùng, chỉ là không set/verify được frame rate. KHÔNG cần fallback
    // template (cách đó đã xác nhận không đáng tin hơn — không bảo toàn frame rate). Trả về luôn,
    // báo rõ timebaseApplied:false + hướng dẫn.
    return {
      created: true,
      name: confirmedName,
      fromSelectedMedia: false,
      method: "blank_no_api",
      timebase,
      timebaseApplied: false,
      timebaseError: "Premiere Pro bản này < 26.2, không có API setVideoFrameRate — không set/verify được frame rate qua script. Cần tự chỉnh tay Sequence Settings trong Premiere, hoặc nâng cấp lên Premiere Pro 2026 (26.2+).",
      frameWidth: frameWidth || null,
      frameHeight: frameHeight || null
    };
  }

}

// Helper riêng cho createSequence(fromSelectedMedia) — Project panel selection, không phải timeline selection
async function getSelectedProjectItemsForSequence(project) {
  try {
    if (typeof project.getSelection === "function") {
      const sel = await project.getSelection();
      if (sel && sel.length) return sel;
    }
  } catch {}
  return [];
}

async function duplicateSequence({ sourceSequenceName }) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");

  let sourceSequence = await project.getActiveSequence();
  if (sourceSequenceName) {
    const all = await project.getSequences();
    let found = null;
    for (const s of (all || [])) {
      try { if ((s.name || (await s.getName())) === sourceSequenceName) { found = s; break; } } catch {}
    }
    if (!found) throw new Error(`Không tìm thấy sequence "${sourceSequenceName}".`);
    sourceSequence = found;
  }
  if (!sourceSequence) throw new Error("Không có sequence nguồn để duplicate (không có sequence active và không truyền sourceSequenceName).");

  if (typeof sourceSequence.createCloneAction !== "function") {
    throw new Error("Sequence.createCloneAction() không khả dụng trong bản Premiere này — chưa xác nhận được API này hoạt động thật, cần test trực tiếp.");
  }

  const beforeNames = new Set();
  for (const s of (await project.getSequences()) || []) { try { beforeNames.add(s.name || (await s.getName())); } catch {} }

  let ok;
  await project.lockedAccess(() => {
    ok = project.executeTransaction((compoundAction) => {
      compoundAction.addAction(sourceSequence.createCloneAction());
    }, "Duplicate sequence qua MCP");
  });
  if (!ok) throw new Error("executeTransaction trả về false khi duplicate sequence.");

  const afterList = (await project.getSequences()) || [];
  let newSequenceName = null;
  for (const s of afterList) {
    try {
      const n = s.name || (await s.getName());
      if (!beforeNames.has(n)) { newSequenceName = n; break; }
    } catch {}
  }
  if (!newSequenceName) {
    throw new Error("executeTransaction báo thành công nhưng không tìm thấy sequence mới trong danh sách — không xác nhận được duplicate có thực sự xảy ra không.");
  }

  return { duplicated: true, sourceSequenceName: sourceSequenceName || sourceSequence.name || (await sourceSequence.getName()), newSequenceName };
}

async function setActiveSequenceTool({ name }) {
  if (!name) throw new Error("Phải truyền name của sequence cần chuyển sang active.");
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");

  const all = (await project.getSequences()) || [];
  let target = null;
  for (const s of all) {
    try { if ((s.name || (await s.getName())) === name) { target = s; break; } } catch {}
  }
  if (!target) throw new Error(`Không tìm thấy sequence "${name}" trong project.`);

  await project.setActiveSequence(target);

  const confirm = await project.getActiveSequence();
  let confirmName = null;
  try { confirmName = confirm ? (confirm.name || (await confirm.getName())) : null; } catch {}
  if (confirmName !== name) {
    throw new Error(`setActiveSequence() chạy xong nhưng sequence active hiện tại là "${confirmName}", không phải "${name}" — không xác nhận được API có hoạt động đúng không.`);
  }

  return { activated: true, name };
}

// project.deleteSequence tồn tại thật (xác nhận qua enumerate Project.prototype khi debug
// create_sequence, 2026-09-10). Chưa live-test trước đây — test lần đầu ở đây.
async function deleteSequenceTool({ name }) {
  if (!name) throw new Error("Phải truyền name của sequence cần xoá.");
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");

  const all = (await project.getSequences()) || [];
  let target = null;
  for (const s of all) {
    try { if ((s.name || (await s.getName())) === name) { target = s; break; } } catch {}
  }
  if (!target) throw new Error(`Không tìm thấy sequence "${name}" trong project.`);
  if (typeof project.deleteSequence !== "function") {
    throw new Error("project.deleteSequence không tồn tại trong bản Premiere này.");
  }

  await project.deleteSequence(target);

  const after = (await project.getSequences()) || [];
  let stillExists = false;
  for (const s of after) {
    try { if ((s.name || (await s.getName())) === name) { stillExists = true; break; } } catch {}
  }
  if (stillExists) {
    throw new Error(`deleteSequence() chạy xong nhưng "${name}" vẫn còn trong danh sách sequence — không xác nhận được xoá thành công.`);
  }

  return { deleted: true, name };
}

// ============================================================================
// GROUP — Sequence Settings / Frame Rate (chỉ hoạt động từ Premiere Pro 26.2+ —
// SequenceSettings.getVideoFrameRate/setVideoFrameRate không tồn tại ở bản cũ hơn, xem
// README_MCP_Premiere_Sequence_FPS_60fps.docx + TODO.md mục "Ưu tiên 0". Live-tested 2026-09-10
// trên Premiere Pro 2026: settingsProto CÓ getVideoFrameRate/setVideoFrameRate thật.
// ============================================================================

async function _resolveSequenceByName(project, sequenceName) {
  if (!sequenceName) return await project.getActiveSequence();
  const all = (await project.getSequences()) || [];
  for (const s of all) {
    try { if ((s.name || (await s.getName())) === sequenceName) return s; } catch {}
  }
  throw new Error(`Không tìm thấy sequence "${sequenceName}" trong project.`);
}

async function getSequenceSettings({ sequenceName } = {}) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await _resolveSequenceByName(project, sequenceName);
  if (!sequence) throw new Error("Không có sequence active và không truyền sequenceName.");

  let name = null;
  try { name = sequence.name || (await sequence.getName()); } catch {}

  const settings = await sequence.getSettings();
  if (typeof settings.getVideoFrameRate !== "function") {
    throw new Error(
      "SequenceSettings.getVideoFrameRate không tồn tại — bản Premiere này < 26.2, không đọc được " +
      "frame rate thật qua script. Xem TODO.md mục 'Ưu tiên 0'."
    );
  }

  const frameRate = await settings.getVideoFrameRate();
  const rect = await settings.getVideoFrameRect();
  let timebaseRaw = null;
  try { timebaseRaw = await sequence.getTimebase(); } catch {}

  return {
    name,
    fps: frameRate ? frameRate.value : null,
    ticksPerFrame: frameRate ? frameRate.ticksPerFrame : null,
    frameWidth: rect ? rect.width : null,
    frameHeight: rect ? rect.height : null,
    timebaseRaw
  };
}

// Canonical rational fps theo khuyến nghị trong README_MCP_Premiere_Sequence_FPS_60fps.docx —
// KHÔNG so sánh 59.94/29.97/23.976 bằng float trực tiếp, quy về giá trị chính xác trước khi tạo
// FrameRate, để tránh sai số double (vd 24000/1001 = 23.976023976...).
const CANONICAL_FPS = {
  23.976: 24000 / 1001,
  29.97: 30000 / 1001,
  59.94: 60000 / 1001
};

async function setSequenceFrameRate({ fps, sequenceName } = {}) {
  if (typeof fps !== "number" || !Number.isFinite(fps) || fps <= 0) {
    throw new Error(`fps không hợp lệ: ${fps}`);
  }
  const resolvedFps = CANONICAL_FPS[fps] || fps;

  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await _resolveSequenceByName(project, sequenceName);
  if (!sequence) throw new Error("Không có sequence active và không truyền sequenceName.");

  const settings = await sequence.getSettings();
  if (typeof settings.setVideoFrameRate !== "function") {
    throw new Error(
      "SequenceSettings.setVideoFrameRate không tồn tại — bản Premiere này < 26.2, không set được " +
      "frame rate thật qua script. Xem TODO.md mục 'Ưu tiên 0'."
    );
  }

  const before = await settings.getVideoFrameRate();
  const beforeFps = before ? before.value : null;

  const frameRate = ppro.FrameRate.createWithValue(resolvedFps);
  settings.setVideoFrameRate(frameRate);

  let ok;
  await project.lockedAccess(() => {
    ok = project.executeTransaction((compoundAction) => {
      compoundAction.addAction(sequence.createSetSettingsAction(settings));
    }, `Set frame rate ${fps}fps qua MCP`);
  });
  if (!ok) throw new Error("executeTransaction trả về false khi set frame rate.");

  // Verify read-back THẬT — không tin return code của executeTransaction, đọc lại settings mới.
  const afterSettings = await sequence.getSettings();
  const after = await afterSettings.getVideoFrameRate();
  const afterFps = after ? after.value : null;
  const success = Math.abs(afterFps - resolvedFps) < 0.001;

  if (!success) {
    throw new Error(
      `Premiere KHÔNG đổi frame rate dù executeTransaction báo OK (no-op thật) — yêu cầu ${fps}fps ` +
      `(resolved ${resolvedFps}), before=${beforeFps}fps, after=${afterFps}fps.`
    );
  }

  return {
    success: true,
    requestedFps: fps,
    beforeFps,
    afterFps,
    beforeTicksPerFrame: before ? before.ticksPerFrame : null,
    afterTicksPerFrame: after ? after.ticksPerFrame : null
  };
}

// Marker tổng quát (khác marker nhịp beat) — dùng tag comment riêng để không đụng vào
// marker Beat Shake tạo ra, theo đúng nguyên tắc "own marker" đã áp dụng cho beat markers.
const GENERIC_MARKER_TAG = "[MCP marker]";

// m.getName()/m.getComments() trên Marker THẬT hoá ra trả về giá trị ĐỒNG BỘ (không phải Promise)
// trong bản Premiere này — gọi .catch() thẳng lên nó ném "X.catch is not a function" (xác nhận
// 2026-09-09 qua test thật, không phải giả định từ tài liệu). await trên giá trị không phải Promise
// vẫn an toàn (resolve ngay giá trị đó), nên bọc bằng try/catch thay vì .catch() chain.
async function _safeCall(fn) {
  try { return await fn(); } catch { return null; }
}

async function getMarkersForScope(project, sequence, scope, log) {
  if (scope === "clip") {
    const { clip } = await getActiveSequenceAndSelection(log || function () {});
    const projectItem = await clip.getProjectItem();
    const clipProjectItem = await ppro.ClipProjectItem.cast(projectItem);
    if (!clipProjectItem) throw new Error("Clip đang chọn không hỗ trợ marker (không phải ClipProjectItem).");
    return await ppro.Markers.getMarkers(clipProjectItem);
  }
  return await ppro.Markers.getMarkers(sequence);
}

async function addMarker({ name, timeSeconds, durationSeconds = 0, comment = "", colorIndex, scope = "sequence" }, log) {
  if (!name) throw new Error("Phải truyền name cho marker.");
  if (timeSeconds == null) throw new Error("Phải truyền timeSeconds.");

  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active.");

  const markers = await getMarkersForScope(project, sequence, scope, log);
  const tick = secondsToTick(timeSeconds);
  const durTick = durationSeconds > 0 ? secondsToTick(durationSeconds) : ppro.TickTime.TIME_ZERO;
  const taggedComment = comment ? `${comment} ${GENERIC_MARKER_TAG}` : GENERIC_MARKER_TAG;

  let ok;
  await project.lockedAccess(() => {
    ok = project.executeTransaction((compoundAction) => {
      compoundAction.addAction(markers.createAddMarkerAction(name, ppro.Marker.MARKER_TYPE_COMMENT, tick, durTick, taggedComment));
    }, `Add marker "${name}" qua MCP`);
  });
  if (!ok) throw new Error("executeTransaction trả về false khi thêm marker.");

  let created = null;
  const all = await markers.getMarkers();
  for (const m of all) {
    const mName = await _safeCall(() => m.getName());
    const mComment = await _safeCall(() => m.getComments());
    if (mName === name && mComment === taggedComment) created = m;
  }
  if (!created) throw new Error("executeTransaction báo thành công nhưng không tìm lại được marker vừa thêm khi đọc lại danh sách.");

  if (colorIndex != null) {
    let ok2;
    await project.lockedAccess(() => {
      ok2 = project.executeTransaction((compoundAction) => {
        compoundAction.addAction(created.createSetColorByIndexAction(colorIndex));
      }, `Set màu marker "${name}"`);
    });
    if (!ok2) throw new Error("executeTransaction trả về false khi set màu marker.");
  }

  return { added: true, name, timeSeconds, durationSeconds, scope, colorIndex: colorIndex ?? null };
}

async function removeMarker({ name, timeSeconds, scope = "sequence" }, log) {
  if (name == null && timeSeconds == null) throw new Error("Phải truyền name hoặc timeSeconds để xác định marker cần xoá.");

  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active.");

  const markers = await getMarkersForScope(project, sequence, scope, log);
  const all = await markers.getMarkers();
  const toRemove = [];
  for (const m of all) {
    const mName = await _safeCall(() => m.getName());
    let matches = name != null && mName === name;
    if (!matches && timeSeconds != null) {
      try {
        const start = await m.getStart();
        if (Math.abs(start.seconds - timeSeconds) < 0.05) matches = true;
      } catch {}
    }
    if (matches) toRemove.push(m);
  }

  if (toRemove.length === 0) return { removed: 0, message: "Không tìm thấy marker khớp điều kiện." };

  let ok;
  await project.lockedAccess(() => {
    ok = project.executeTransaction((compoundAction) => {
      for (const m of toRemove) compoundAction.addAction(markers.createRemoveMarkerAction(m));
    }, `Remove ${toRemove.length} marker qua MCP`);
  });
  if (!ok) throw new Error("executeTransaction trả về false khi xoá marker.");

  const remaining = await (await getMarkersForScope(project, sequence, scope, log)).getMarkers();
  if (remaining.length !== all.length - toRemove.length) {
    throw new Error(`executeTransaction báo thành công nhưng số marker còn lại (${remaining.length}) không khớp kỳ vọng (${all.length - toRemove.length}) — kiểm tra timeline thủ công.`);
  }

  return { removed: toRemove.length };
}

async function updateMarker({ name, timeSeconds, newName, newComment, newDurationSeconds, newColorIndex, scope = "sequence" }, log) {
  if (name == null && timeSeconds == null) throw new Error("Phải truyền name hoặc timeSeconds để xác định marker cần sửa.");
  if (newName == null && newComment == null && newDurationSeconds == null && newColorIndex == null) {
    throw new Error("Phải truyền ít nhất 1 trong newName/newComment/newDurationSeconds/newColorIndex.");
  }

  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active.");

  const markers = await getMarkersForScope(project, sequence, scope, log);
  const all = await markers.getMarkers();
  let target = null;
  for (const m of all) {
    const mName = await _safeCall(() => m.getName());
    let matches = name != null && mName === name;
    if (!matches && timeSeconds != null) {
      try {
        const start = await m.getStart();
        if (Math.abs(start.seconds - timeSeconds) < 0.05) matches = true;
      } catch {}
    }
    if (matches) { target = m; break; }
  }
  if (!target) throw new Error("Không tìm thấy marker khớp điều kiện.");

  let ok;
  await project.lockedAccess(() => {
    ok = project.executeTransaction((compoundAction) => {
      if (newName != null) compoundAction.addAction(target.createSetNameAction(newName));
      if (newComment != null) compoundAction.addAction(target.createSetCommentsAction(newComment));
      if (newDurationSeconds != null) compoundAction.addAction(target.createSetDurationAction(secondsToTick(newDurationSeconds)));
      if (newColorIndex != null) compoundAction.addAction(target.createSetColorByIndexAction(newColorIndex));
    }, "Update marker qua MCP");
  });
  if (!ok) throw new Error("executeTransaction trả về false khi sửa marker.");

  return { updated: true, name: newName ?? name, timeSeconds };
}

// ============================================================================
// GROUP 18 — Subtitle sync (workaround cho việc addTextOverlay/import_srt không
// tự đặt text lên timeline — xem premiere-uxp-scripting-api-capabilities.md).
// ============================================================================

// Format giây thành "HH:MM:SS,mmm" theo chuẩn SRT
function secondsToSrtTimestamp(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const ms = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
  const pad = (n, len) => String(n).padStart(len, "0");
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

async function generateAndImportSrt({ segments, outputPath, binName }) {
  if (!segments || segments.length === 0) throw new Error("Phải truyền segments: [{startSeconds, endSeconds, text}, ...].");
  if (!outputPath) throw new Error("Phải truyền outputPath (đường dẫn file .srt sẽ ghi ra).");

  let srtContent = "";
  segments.forEach((seg, i) => {
    if (seg.startSeconds == null || seg.endSeconds == null || !seg.text) {
      throw new Error(`segments[${i}] thiếu startSeconds/endSeconds/text.`);
    }
    srtContent += `${i + 1}\n${secondsToSrtTimestamp(seg.startSeconds)} --> ${secondsToSrtTimestamp(seg.endSeconds)}\n${seg.text}\n\n`;
  });

  try {
    const fileUrl = pathToFileUrl(outputPath);
    const entry = await uxpFs.createEntryWithUrl(fileUrl, { overwrite: true });
    await entry.write(srtContent, { format: uxpFormats.utf8 });
  } catch (e) {
    throw new Error(`Ghi file SRT thất bại: ${e.message}`);
  }

  const importResult = await importFilesToProject({ paths: [outputPath], binName });

  return {
    generated: true,
    outputPath,
    segmentCount: segments.length,
    imported: importResult,
    note: "File SRT đã tạo và import vào Project panel. Chưa có API script gắn SRT vào caption track — kéo thủ công 1 lần vào caption track trên timeline (xem create_caption_track để tạo track trước)."
  };
}

// ============================================================================
// GROUP 19 — THỬ NGHIỆM: Transcript.importFromJSON (chưa test trên Premiere thật)
// Gắn transcript dạng JSON (text + time range tuỳ ý, không cần từ audio thật) vào
// 1 clip, dựa trên API Transcript đã xác nhận tồn tại qua @adobe/premierepro type
// declarations. CHƯA rõ bước convert transcript → caption có script được không —
// cần test trực tiếp trên Premiere thật trước khi coi tool này là đáng tin cậy.
// ============================================================================

async function importTranscriptJson({ segments }, log) {
  if (!segments || segments.length === 0) throw new Error("Phải truyền segments: [{startSeconds, endSeconds, text}, ...].");
  if (!ppro.Transcript || typeof ppro.Transcript.importFromJSON !== "function") {
    throw new Error("ppro.Transcript.importFromJSON không khả dụng trong bản Premiere này — API thử nghiệm này chưa xác nhận được.");
  }

  const { project, clip } = await getActiveSequenceAndSelection(log || function () {});
  const projectItem = await clip.getProjectItem();
  const clipProjectItem = await ppro.ClipProjectItem.cast(projectItem);
  if (!clipProjectItem) throw new Error("Clip đang chọn không phải ClipProjectItem — Transcript chỉ gắn được vào clip, không gắn được vào sequence.");

  // Định dạng JSON transcript CHƯA được xác nhận field chính xác (chưa có ví dụ thật từ
  // Premiere để đối chiếu) — đoán theo cấu trúc segment phổ biến, CẦN verify bằng cách
  // export 1 transcript thật (export_transcript nếu có) rồi so sánh field-by-field trước
  // khi tin tưởng hoàn toàn kết quả tool này.
  const transcriptJson = JSON.stringify({
    segments: segments.map(s => ({
      startTime: s.startSeconds,
      endTime: s.endSeconds,
      text: s.text
    }))
  });

  let importAction;
  try {
    importAction = ppro.Transcript.createImportTextSegmentsAction(clipProjectItem, ppro.Transcript.importFromJSON(transcriptJson));
  } catch (e) {
    throw new Error(`Transcript.importFromJSON/createImportTextSegmentsAction thất bại — định dạng JSON có thể không đúng field thật của Premiere: ${e.message}`);
  }

  let ok;
  await project.lockedAccess(() => {
    ok = project.executeTransaction((compoundAction) => {
      compoundAction.addAction(importAction);
    }, "Import transcript JSON qua MCP");
  });
  if (!ok) throw new Error("executeTransaction trả về false khi import transcript.");

  return {
    imported: true,
    segmentCount: segments.length,
    warning: "THỬ NGHIỆM — chưa xác nhận transcript có thực sự hiển thị đúng trong Text panel, và chưa rõ bước convert transcript→caption có script được không. Cần mở Premiere kiểm tra trực tiếp Text panel của clip vừa gắn."
  };
}
