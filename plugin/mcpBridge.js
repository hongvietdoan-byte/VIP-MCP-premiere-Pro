// mcpBridge.js — Premiere MCP Standalone
// UXP WebSocket client — bridges Claude (MCP server) commands to premiereActions.js functions.
// Standalone plugin, no dependency on Beat Shake. Loaded as a <script> tag after premiereActions.js.

const _ppro = require("premierepro");

let _stateRef = null; // set by initMcpBridge()
let _ws = null;
let _reconnectTimer = null;
let _reconnectAttempt = 0;
let _statusCb = null;  // (text, ok) → updates MCP status indicator in UI
let _loggedWaiting = false; // đã nói "sẽ tự thử lại" chưa — để không ghi lặp mỗi 5s
let _wasOpen = false;       // đã từng nối THÀNH CÔNG chưa — để phân biệt "mất kết nối" (đáng báo)
                            // với "thử lần nữa vẫn chưa có server" (không đáng báo)

const PLUGIN_VERSION = "1.0.0";

const WS_URL = "ws://localhost:3005"; // Port riêng, khác 3001 (Beat Shake) để không xung đột nếu cài lại

// Thử lại sau đúng 5s, KHÔNG tăng dần. Trước v16 dùng backoff [5s,10s,30s] rồi kẹt ở 30s vĩnh viễn,
// nên khi MCP server bật lên sau (vd Claude mở sau Premiere) người dùng phải chờ tới 30s mới thấy
// kết nối. Nối tới localhost mà port đóng thì thất bại tức thì (ECONNREFUSED), chi phí ~0 — backoff
// ở đây không mua được gì mà chỉ làm chậm.
const RECONNECT_DELAY_MS = 5000;

// ============================================================================
// PUBLIC API
// ============================================================================
function initMcpBridge(stateRef) {
  _stateRef = stateRef;
  _connect();
}

function setMcpStatusCallback(fn) {
  _statusCb = fn;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================
function _log(msg) {
  if (_stateRef && typeof _stateRef.log === "function") {
    _stateRef.log("[MCP] " + msg);
  }
}

function _setStatus(text, ok) {
  if (_statusCb) try { _statusCb(text, ok); } catch {}
}

function _sendResult(id, data) {
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify({ id, success: true, data }));
  }
}

function _sendError(id, error) {
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify({ id, success: false, error: String(error) }));
  }
}

// ============================================================================
// CONNECTION
// ============================================================================
function _connect() {
  if (_ws && _ws.readyState !== WebSocket.CLOSED) return;

  _setStatus("🟡 MCP", false); // đang thử nối — trước v16 chỉ có 🟢/⚫, không phân biệt được
                               // "chưa bật server" với "đang nối dở"
  try {
    _ws = new WebSocket(WS_URL);
  } catch (e) {
    // Chỉ báo lỗi tạo socket ở lần đầu — lặp mỗi 5s sẽ ngập log
    if (_reconnectAttempt === 0) _log("Không tạo được WebSocket: " + e.message);
    _ws = null;
    _scheduleReconnect();
    return;
  }

  _ws.onopen = function () {
    const retries = _reconnectAttempt;
    _reconnectAttempt = 0;
    _loggedWaiting = false;
    _wasOpen = true;
    _log(retries > 0
      ? "Đã kết nối MCP server (sau " + retries + " lần thử lại)."
      : "Đã kết nối MCP server.");
    _setStatus("🟢 MCP", true);
    _sendReadyMessage();
  };

  // UXP giao event.data dưới dạng ArrayBuffer (nhị phân) cho message nhận qua WS, KHÔNG phải
  // string như trên browser thường — String(arrayBuffer) chỉ ra "[object ArrayBuffer]" chứ không
  // giải mã nội dung, khiến JSON.parse luôn thất bại và bị nuốt lỗi âm thầm (không bao giờ phản
  // hồi). Đây là nguyên nhân gốc khiến mọi lệnh gửi vào plugin (kể cả ping) bị treo vô thời hạn dù
  // handshake "ready" (chiều gửi đi) vẫn hoạt động bình thường — phát hiện 2026-09-09.
  // KHÔNG dùng TextDecoder — UXP không có global này ("TextDecoder is not defined", xác nhận qua
  // console thật). Tự giải mã UTF-8 tay từ byte thay vì phụ thuộc Web API không có trong UXP.
  function _utf8BytesToString(bytes) {
    let result = "";
    let i = 0;
    while (i < bytes.length) {
      const b0 = bytes[i];
      if (b0 < 0x80) { result += String.fromCharCode(b0); i += 1; }
      else if ((b0 & 0xE0) === 0xC0) {
        result += String.fromCharCode(((b0 & 0x1F) << 6) | (bytes[i + 1] & 0x3F));
        i += 2;
      } else if ((b0 & 0xF0) === 0xE0) {
        result += String.fromCharCode(((b0 & 0x0F) << 12) | ((bytes[i + 1] & 0x3F) << 6) | (bytes[i + 2] & 0x3F));
        i += 3;
      } else if ((b0 & 0xF8) === 0xF0) {
        let cp = ((b0 & 0x07) << 18) | ((bytes[i + 1] & 0x3F) << 12) | ((bytes[i + 2] & 0x3F) << 6) | (bytes[i + 3] & 0x3F);
        cp -= 0x10000;
        result += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
        i += 4;
      } else { result += String.fromCharCode(b0); i += 1; }
    }
    return result;
  }

  function _decodeMessageData(data) {
    if (typeof data === "string") return data;
    if (data instanceof ArrayBuffer) return _utf8BytesToString(new Uint8Array(data));
    if (ArrayBuffer.isView(data)) return _utf8BytesToString(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    return String(data);
  }

  // Dùng addEventListener thay vì onmessage = — UXP có thể chỉ hỗ trợ 1 trong 2 dạng
  _ws.addEventListener("message", function (event) {
    const raw = (event.data !== undefined) ? event.data : event.detail;
    let msg;
    try {
      msg = JSON.parse(_decodeMessageData(raw));
    } catch (e) {
      console.error("[MCP] Không parse được message đến: " + (e && e.message));
      return;
    }
    _dispatchCommand(msg).catch(function (e) {
      console.error("[MCP] _dispatchCommand lỗi cho tool=" + msg.tool + ": " + (e && e.message));
    });
  });

  _ws.onclose = function () {
    const wasConnected = _wasOpen;
    _wasOpen = false;
    _setStatus("⚫ MCP", false);
    _ws = null;
    // Chỉ nói "mất kết nối" khi TRƯỚC ĐÓ đang nối được thật. Nếu vốn chưa nối được thì đây chỉ là
    // một lần thử thất bại, không phải sự cố — nói ra mỗi 5s là ngập log.
    if (wasConnected) _log("Mất kết nối MCP server.");
    _scheduleReconnect();
  };

  _ws.onerror = function () {}; // onclose luôn nổ sau onerror, xử lý ở đó là đủ
}

function _scheduleReconnect() {
  if (_reconnectTimer) return;
  _reconnectAttempt++;

  // Nói MỘT lần rằng sẽ tiếp tục thử ngầm, rồi im lặng. Trước v16 mỗi lần thất bại đều ghi 1 dòng
  // "Mất kết nối MCP server." — với chu kỳ 5s thì log sẽ bị đẩy trôi hết thông tin hữu ích.
  if (!_loggedWaiting) {
    _loggedWaiting = true;
    _log("Chưa thấy MCP server. Sẽ tự thử lại mỗi " + (RECONNECT_DELAY_MS / 1000) +
         "s — mở Claude ở thư mục dự án là tự nối, không cần bấm gì.");
  }

  _reconnectTimer = setTimeout(function () {
    _reconnectTimer = null;
    _connect();
  }, RECONNECT_DELAY_MS);
}

function _sendReadyMessage() {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
  _ws.send(JSON.stringify({
    type: "ready",
    version: PLUGIN_VERSION,
    styles: [],
    capabilities: ["get_sequence_info", "get_selected_clips",
                   "ping", "get_plugin_status", "debug_get_element", "debug_inspect_chain",
                   "debug_probe_api", "debug_list_markers",
                   "get_project_info", "import_files", "open_project",
                   "cut_clip_at_time", "trim_clip", "delete_clip", "ripple_delete", "move_clip",
                   "detect_silence_regions", "remove_silence_gaps",
                   "apply_effect", "get_clip_effects", "set_effect_param", "remove_effect",
                   "list_installed_effects", "list_installed_transitions",
                   "set_clip_volume", "set_clip_pan", "mute_track", "setup_audio_ducking",
                   "add_transition", "batch_add_transitions",
                   "apply_lumetri_preset", "set_clip_color_label", "adjust_color_values",
                   "create_caption_track", "import_srt", "read_sequence_captions",
                   "set_clip_speed", "reverse_clip", "freeze_frame",
                   "create_bin", "move_item_to_bin", "replace_clip_media", "relink_offline_media",
                   "select_clips_in_range", "select_all_clips", "deselect_all_clips",
                   "detect_scene_edits",
                   "get_clip_metadata", "set_clip_metadata",
                   "import_mogrt", "add_text_overlay",
                   "capture_frame", "export_as_xml", "export_to_media_encoder",
                   "transcribe_clip", "auto_caption_from_speech",
                   // MỚI 2026-09-09 — Timeline placement, sequence mgmt, generic markers, subtitle sync
                   "insert_clip", "overwrite_clip", "batch_place_clips", "duplicate_clip",
                   "create_sequence", "duplicate_sequence", "set_active_sequence", "delete_sequence",
                   "get_sequence_settings", "set_sequence_frame_rate",
                   "insert_mogrt_caption", "srt_to_mogrt_captions",
                   "add_marker", "remove_marker", "update_marker",
                   "generate_and_import_srt", "import_transcript_json"]
  }));
}

// ============================================================================
// COMMAND DISPATCH
// ============================================================================
async function _dispatchCommand(msg) {
  const id = msg.id;
  const tool = msg.tool;
  const params = msg.params || {};
  if (!id || !tool) return;

  const bLog = function (m) { _log(m); };

  try {
    let result;
    switch (tool) {
      case "get_sequence_info":    result = await _cmdGetSequenceInfo();              break;
      case "get_selected_clips":   result = await _cmdGetSelectedClips(bLog);         break;
      case "ping":
        // _log() đã tự thêm tiền tố "[MCP] " — viết thêm ở đây nữa sẽ ra "[MCP] [MCP] ping..."
        _log("ping nhận được → gửi pong");
        result = { pong: true, ts: Date.now() };
        break;
      case "get_plugin_status":
        result = { version: PLUGIN_VERSION, hasLastAnalysis: false };
        break;
      case "debug_get_element":    result = await _cmdDebugGetElement(params);              break;
      case "debug_inspect_chain":  result = await _cmdDebugInspectChain(params, bLog);     break;
      case "debug_probe_api":      result = await _cmdDebugProbeApi(params);                break;
      case "debug_list_markers":   result = await _cmdDebugListMarkers(bLog);               break;

      // ====================================================================
      // PREMIERE GENERAL EDITING — v17.x (BIG UPDATE BEAT SHAKE)
      // ====================================================================

      // Group 1: Project & File
      case "get_project_info":       result = await getProjectInfo();                             break;
      case "import_files":           result = await importFilesToProject(params);                  break;
      case "open_project":           result = await openProject(params);                           break;

      // Group 2: Timeline Editing
      case "cut_clip_at_time":       result = await cutClipAtTime(params);                        break;
      case "trim_clip":              result = await trimClip(params);                              break;
      case "delete_clip":            result = await deleteClip(params);                            break;
      case "ripple_delete":          result = await rippleDelete(params);                          break;
      case "move_clip":              result = await moveClip(params);                              break;

      // Group 3: Voice Cleanup
      case "detect_silence_regions": result = await detectSilenceRegions(params, bLog);           break;
      case "remove_silence_gaps":    result = await removeSilenceGaps(params, bLog);              break;

      // Group 4: FX Console
      case "apply_effect":           result = await applyEffect(params, bLog);                    break;
      case "get_clip_effects":       result = await getClipEffects();                             break;
      case "set_effect_param":       result = await setEffectParam(params, bLog);                 break;
      case "remove_effect":          result = await removeEffect(params, bLog);                   break;
      case "list_installed_effects":     result = await listInstalledEffects();                   break;
      case "list_installed_transitions": result = await listInstalledTransitions();               break;

      // Group 5: Audio Mixing
      case "set_clip_volume":        result = await setClipVolume(params, bLog);                  break;
      case "set_clip_pan":           result = await setClipPan(params, bLog);                     break;
      case "mute_track":             result = await muteTrack(params, bLog);                      break;
      case "setup_audio_ducking":    result = await setupAudioDucking(params, bLog);              break;

      // Group 6: Transitions
      case "add_transition":         result = await addTransition(params, bLog);                  break;
      case "batch_add_transitions":  result = await batchAddTransitions(params, bLog);            break;

      // Group 7: Color Grading
      case "apply_lumetri_preset":   result = await applyLumetriPreset(params, bLog);             break;
      case "set_clip_color_label":   result = await setClipColorLabel(params, bLog);              break;
      case "adjust_color_values":    result = await adjustColorValues(params, bLog);              break;

      // Group 8: Captions
      case "create_caption_track":   result = await createCaptionTrack(params);                   break;
      case "import_srt":             result = await importSrt(params);                            break;
      case "read_sequence_captions": result = await readSequenceCaptions(params);                 break;

      // Group 9: Clip Speed
      case "set_clip_speed":         result = await setClipSpeed(params, bLog);                   break;
      case "reverse_clip":           result = await reverseClip(bLog);                            break;
      case "freeze_frame":           result = await freezeFrame(params, bLog);                    break;

      // Group 10: Bin Management
      case "create_bin":             result = await createBin(params);                            break;
      case "move_item_to_bin":       result = await moveItemToBin(params);                        break;
      case "replace_clip_media":     result = await replaceClipMedia(params, bLog);               break;
      case "relink_offline_media":   result = await relinkOfflineMedia(params);                   break;

      // Group 11: Selection
      case "select_clips_in_range":  result = await selectClipsInRange(params);                   break;
      case "select_all_clips":       result = await selectAllClips(params);                       break;
      case "deselect_all_clips":     result = await deselectAllClips();                           break;

      // Group 12: Scene Detection
      case "detect_scene_edits":     result = await detectSceneEdits(params, bLog);               break;

      // Group 13: Metadata
      case "get_clip_metadata":      result = await getClipMetadata(params);                      break;
      case "set_clip_metadata":      result = await setClipMetadata(params, bLog);                break;

      // Group 14: MOGRT
      case "import_mogrt":           result = await importMogrt(params, bLog);                    break;
      case "add_text_overlay":       result = await addTextOverlay(params);                       break;

      // Group 15: Export
      case "capture_frame":          result = await captureFrame(params);                         break;
      case "export_as_xml":          result = await exportAsXml(params);                          break;
      case "export_to_media_encoder": result = await exportToMediaEncoder(params, bLog);          break;

      // Group 16: AI
      case "transcribe_clip":        result = await transcribeClip(params, bLog);                 break;
      case "auto_caption_from_speech": result = await autoCaptionFromSpeech(params, bLog);        break;

      // Group 17: Timeline Placement & Sequence Management (2026-09-09)
      case "insert_clip":            result = await insertClip(params, bLog);                     break;
      case "overwrite_clip":         result = await overwriteClip(params, bLog);                  break;
      case "batch_place_clips":      result = await batchPlaceClips(params, bLog);                break;
      case "duplicate_clip":         result = await duplicateClip(params, bLog);                  break;
      case "create_sequence":        result = await createSequence(params);                       break;
      case "duplicate_sequence":     result = await duplicateSequence(params);                    break;
      case "set_active_sequence":    result = await setActiveSequenceTool(params);                break;
      case "delete_sequence":        result = await deleteSequenceTool(params);                   break;

      // Group 17c: Sequence Settings / Frame Rate — chỉ hoạt động Premiere Pro 26.2+ (2026-09-10)
      case "get_sequence_settings":  result = await getSequenceSettings(params);                  break;
      case "set_sequence_frame_rate": result = await setSequenceFrameRate(params);                break;
      case "insert_mogrt_caption":   result = await insertMogrtCaption(params);                   break;
      case "srt_to_mogrt_captions":  result = await srtToMogrtCaptions(params, bLog);              break;

      // Group 17b: Generic Markers (2026-09-09)
      case "add_marker":             result = await addMarker(params, bLog);                      break;
      case "remove_marker":          result = await removeMarker(params, bLog);                   break;
      case "update_marker":          result = await updateMarker(params, bLog);                   break;

      // Group 18: Subtitle sync (2026-09-09)
      case "generate_and_import_srt": result = await generateAndImportSrt(params);                break;

      // Group 19: THỬ NGHIỆM — chưa test trên Premiere thật (2026-09-09)
      case "import_transcript_json": result = await importTranscriptJson(params, bLog);            break;

      default:
        throw new Error("Tool không được hỗ trợ: " + tool + ". Dùng get_beat_styles để xem danh sách.");
    }
    _sendResult(id, result);
  } catch (err) {
    _sendError(id, err.message || String(err));
  }
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================
async function _cmdGetSequenceInfo() {
  const project = await _ppro.Project.getActiveProject();
  if (!project) throw new Error("Không tìm thấy project đang mở.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Không có sequence active. Hãy mở 1 timeline.");

  let name = "Active Sequence";
  try { name = sequence.name || (await sequence.getName()) || name; } catch {}

  let frameWidth = 1920, frameHeight = 1080, frameRate = 25;
  let _fpsDebug = {};
  try {
    const settings = await sequence.getSettings();
    const rect = await settings.getVideoFrameRect();
    if (rect && rect.width > 0) { frameWidth = rect.width; frameHeight = rect.height; }

    // Gọi getVideoDisplayFormat — timecode format, encode fps
    try { _fpsDebug.videoDisplayFormat = await settings.getVideoDisplayFormat(); } catch (e) { _fpsDebug.vdfErr = e.message; }
    try { _fpsDebug.editingMode = await settings.getEditingMode(); } catch (e) { _fpsDebug.emErr = e.message; }
    try {
      const tb = await sequence.getTimebase();
      _fpsDebug.timebaseRaw = tb;
      const ticksPerSecond = 254016000000;
      const tbNum = Number(tb);
      if (tbNum > 0) _fpsDebug.timebaseFpsGuess = Math.round((ticksPerSecond / tbNum) * 1000) / 1000;
    } catch (e) { _fpsDebug.tbErr = e.message; }
    try { _fpsDebug.settingsProto = Object.getOwnPropertyNames(Object.getPrototypeOf(settings)); } catch {}
    try {
      if (typeof settings.getVideoFrameRate === "function") {
        const fr = await settings.getVideoFrameRate();
        _fpsDebug.getVideoFrameRateValue = fr && fr.value;
      } else {
        _fpsDebug.getVideoFrameRateMissing = true;
      }
    } catch (e) { _fpsDebug.gvfrErr = e.message; }
    // Probe sequence prototype để tìm method fps
    try { _fpsDebug.seqProto = Object.getOwnPropertyNames(Object.getPrototypeOf(sequence)); } catch {}
  } catch (e) { _fpsDebug.outerErr = e.message; }

  return { name, frameWidth, frameHeight, frameRate, _fpsDebug };
}

async function _cmdGetSelectedClips(log) {
  const { clips } = await getActiveSequenceAndAllSelection(log);
  const result = [];
  for (const item of clips) {
    let type = "unknown", name = "", mediaPath = "";
    let startSeconds = 0, durationSeconds = 0;
    try {
      const pi = await item.getProjectItem();
      const cpi = await _ppro.ClipProjectItem.cast(pi);
      if (cpi) {
        try { name = await cpi.getDisplayName() || ""; } catch {}
        try { mediaPath = await cpi.getMediaFilePath() || ""; } catch {}
        type = /\.(wav|mp3|aiff?|aif)$/i.test(mediaPath) ? "audio" : "video";
      }
    } catch {}
    try { startSeconds = (await item.getStartTime()).seconds; } catch {}
    try { durationSeconds = (await item.getDuration()).seconds; } catch {}
    result.push({ type, name, mediaPath, startSeconds, durationSeconds });
  }
  return { clips: result };
}

async function _cmdAnalyzeAudioBeats(params, log) {
  const threshold = (typeof params.threshold === "number") ? params.threshold : 5;

  log("Đang lấy audio từ clip đang chọn...");
  const { buffer } = await getSelectedClipAudioBuffer(log);

  log("Đang phân tích nhịp (có thể mất 30–60 giây với file MP3 dài)...");
  const result = await detectBeats(buffer, log, function () {});

  // [v16] Cache audioFeatures + bpm cho get_beat_analysis/suggest_choreography (Phase 4.8) — trước
  // đây result.audioFeatures bị vứt đi ngay sau dòng này, phải giải mã + FFT lại từ đầu nếu cần dùng.
  _lastAudioFeatures = result.audioFeatures;
  _lastBpm = result.bpm;

  // Update plugin UI state
  if (_stateRef) {
    _stateRef.setAllBeats(result.beats);
    _stateRef.setBpm(result.bpm);
    _stateRef.setThreshold(threshold);
    _stateRef.refilterBeats();
    _lastBeats = _stateRef.getFilteredBeats();
  } else {
    _lastBeats = (typeof filterBeatsByPercent === "function")
      ? filterBeatsByPercent(result.beats, threshold)
      : result.beats;
  }

  return {
    bpm: result.bpm,
    count: _lastBeats.length,
    beats: _lastBeats.map(function (b) { return b.time; }),
    duration: _lastBeats.length > 0 ? _lastBeats[_lastBeats.length - 1].time : 0
  };
}

async function _cmdAddBeatMarkers(params, log) {
  let times;
  if (Array.isArray(params.beats) && params.beats.length > 0) {
    times = params.beats;
  } else if (_lastBeats && _lastBeats.length > 0) {
    times = _lastBeats.map(function (b) { return b.time; });
  } else {
    throw new Error("Chưa có beat nào. Hãy gọi analyze_audio_beats trước.");
  }
  await addBeatMarkers(times, log);
  return { added: times.length };
}

// Dựng planOpts cho một lệnh MCP. Ưu tiên đi qua panel (planOptsForOverride) để thừa hưởng
// tunOverrides / addFlash / segmentCapMs / seed người dùng đang dùng; chỉ khi panel không cung cấp
// hàm đó (bản cũ, hoặc window.beatShakeState rỗng) mới dựng tối thiểu như trước.
function _buildPlanOptsFromPanel(styleObj, intensity, motionBlur) {
  if (_stateRef && typeof _stateRef.planOptsForOverride === "function") {
    return _stateRef.planOptsForOverride({
      styleId: styleObj.id,
      gainPercent: intensity,
      motionBlurMode: motionBlur
    });
  }

  // --- Đường dự phòng: không có panel thì dựng thủ công ---
  const planOpts = {
    layers: [{ styleId: styleObj.id, tun: defaultTunables(styleObj), gainPercent: intensity }],
    segmentCapMs: 500,
    seed: 20260729
  };
  const usesShutter = !!(styleObj.channels && styleObj.channels.indexOf("shutterAngle") >= 0);
  if (motionBlur === "pulse" && !usesShutter) {
    const shutterStyle = (typeof getStyleById === "function") ? getStyleById("shutter_pulse") : null;
    if (shutterStyle) {
      planOpts.layers.push({
        styleId: "shutter_pulse",
        tun: defaultTunables(shutterStyle),
        gainPercent: intensity
      });
    }
  }
  return planOpts;
}

async function _cmdApplyBeatSync(params, log) {
  const style = params.style;
  const intensity = (typeof params.intensity === "number") ? params.intensity : 100;
  const motionBlur = params.motionBlur || "off";

  if (!_lastBeats || _lastBeats.length === 0) {
    throw new Error("Chưa có beat nào. Hãy gọi analyze_audio_beats trước.");
  }
  if (!style) throw new Error("Thiếu tham số: style. Dùng get_beat_styles để xem danh sách.");

  const styleObj = (typeof getStyleById === "function") ? getStyleById(style) : null;
  if (!styleObj) throw new Error("Style không tồn tại: " + style + ". Dùng get_beat_styles để xem danh sách.");

  const planOpts = _buildPlanOptsFromPanel(styleObj, intensity, motionBlur);

  log("Đang áp dụng " + styleObj.label + " (" + intensity + "%) cho " + _lastBeats.length + " nhịp...");
  const result = await applyBeatPlan(_lastBeats, planOpts, log);

  // verifiedCounts: đọc lại THẬT SỰ từ Premiere sau khi ghi (không phải số dự kiến) — Claude biết ngay
  // nếu có kênh nào ghi ra 0 keyframe thay vì chỉ tin vào "không throw = thành công".
  return {
    style, intensity, motionBlur, beatsCount: _lastBeats.length,
    totalKeyframesWritten: result.totalKeyframes,
    verifiedCounts: result.verifiedCounts
  };
}

async function _cmdExportBeatPreset(params, log) {
  const style = params.style;
  const intensity = (typeof params.intensity === "number") ? params.intensity : 100;

  if (!_lastBeats || _lastBeats.length === 0) {
    throw new Error("Chưa có beat nào. Hãy gọi analyze_audio_beats trước.");
  }
  if (!style) throw new Error("Thiếu tham số: style.");

  const styleObj = (typeof getStyleById === "function") ? getStyleById(style) : null;
  if (!styleObj) throw new Error("Style không tồn tại: " + style);

  const planOpts = _buildPlanOptsFromPanel(styleObj, intensity, "off");
  const presetName = params.name || (styleObj.label.split(" — ")[0].replace(/\s+/g, "_") + "_" + intensity + "pct");

  // useDialog KHÔNG bật: ghi thẳng vào thư mục dữ liệu plugin. Mở hộp thoại Save ở đây sẽ làm lệnh
  // MCP treo chờ người dùng bấm chuột tại máy (xem giải thích trong exportBeatPresetFilesForClip).
  const exportOpts = { useDialog: false };

  log("Đang xuất preset " + presetName + "...");
  const files = await exportBeatPresetFiles(_lastBeats, presetName, planOpts, exportOpts, log);
  return {
    presetName: presetName,
    fileCount: files.length,
    files: files, // mỗi phần tử: { name, path, effect } — dữ liệu thuần, serialize được
    note: "Import trong Premiere: Effects panel → menu ⋯ → Import Presets → chọn file trên."
  };
}

// ============================================================================
// [MỚI v16, Phase 4.8-4.10] BIÊN ĐẠO THEO CẤU TRÚC BÀI — get_beat_analysis / suggest_choreography /
// apply_choreography. Cả 3 đều yêu cầu đã gọi analyze_audio_beats trước (cần _lastBeats +
// _lastAudioFeatures). analyzeStructure()/suggestChoreography() là hàm THUẦN (beatStructure.js,
// choreography.js) nên 2 tool đầu KHÔNG cần async thật — chỉ apply_choreography mới đụng Premiere API.
// ============================================================================

function _requireAnalysisReady() {
  if (!_lastBeats || _lastBeats.length === 0 || !_lastAudioFeatures) {
    throw new Error("Chưa có dữ liệu phân tích nhịp. Hãy gọi analyze_audio_beats trước.");
  }
}

function _round2(x) { return Math.round(x * 100) / 100; }

function _cmdGetBeatAnalysis(params) {
  _requireAnalysisReady();
  const beatsForAnalysis = _lastBeats.map(function (b) { return { time: b.time, strength: b.strength }; });
  const structure = analyzeStructure(_lastAudioFeatures, beatsForAnalysis, _lastBpm || 120);

  // Mặc định trả TÓM TẮT, không kèm từng nhịp — bài 3 phút ở 130 BPM có ~390 nhịp, trả hết mỗi lần
  // gọi sẽ phình context của Claude vô ích. Chỉ trả từng nhịp khi caller CHỦ ĐỘNG cần (includeBeats).
  const result = {
    bpm: _lastBpm,
    beatCount: _lastBeats.length,
    durationSeconds: beatsForAnalysis.length ? _round2(beatsForAnalysis[beatsForAnalysis.length - 1].time) : 0,
    sections: structure.sections.map(function (s) {
      return { label: s.label, start: _round2(s.start), end: _round2(s.end), bars: s.endBar - s.startBar + 1 };
    }),
    phrases: structure.phrases.map(function (p) {
      return { label: p.label, start: _round2(p.start), end: _round2(p.end) };
    })
  };
  if (params && params.includeBeats === true) {
    result.beats = beatsForAnalysis.map(function (b) { return { time: _round2(b.time), strength: _round2(b.strength) }; });
  }

  // [Phase 4.13] Đẩy sang panel để người dùng THẤY được cấu trúc Claude vừa đọc, không chỉ Claude biết.
  if (_stateRef && typeof _stateRef.showChoreographySummary === "function") {
    _stateRef.showChoreographySummary(structure.sections, "get_beat_analysis — " + structure.sections.length + " đoạn (chỉ xem, chưa áp dụng)");
  }
  return result;
}

function _cmdSuggestChoreography(params) {
  _requireAnalysisReady();
  const granularity = (params && params.granularity === "phrase") ? "phrase" : "section";
  const beatsForAnalysis = _lastBeats.map(function (b) { return { time: b.time, strength: b.strength }; });
  const structure = analyzeStructure(_lastAudioFeatures, beatsForAnalysis, _lastBpm || 120);
  const suggestion = suggestChoreography(structure, granularity);
  const segmentsOut = suggestion.segments.map(function (s) {
    return { start: _round2(s.start), end: _round2(s.end), styleId: s.styleId, gainPercent: s.gainPercent, label: s.label };
  });

  if (_stateRef && typeof _stateRef.showChoreographySummary === "function") {
    _stateRef.showChoreographySummary(segmentsOut, "Gợi ý (" + granularity + ") — " + segmentsOut.length + " đoạn, CHƯA áp dụng, xem apply_choreography");
  }
  return { granularity: suggestion.granularity, segments: segmentsOut };
}

async function _cmdApplyChoreography(params, log) {
  _requireAnalysisReady();
  const segments = params && params.segments;

  // ---- Validate KỸ trước khi ghi gì lên timeline — đây là dữ liệu do Claude tự sinh, không phải
  // người dùng chỉnh tay từng slider như luồng panel thông thường, nên không thể tin là luôn đúng. ----
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error("Thiếu tham số: segments (phải là mảng khác rỗng). Dùng suggest_choreography để lấy gợi ý.");
  }

  const problems = [];
  segments.forEach(function (seg, i) {
    if (!seg || typeof seg !== "object") { problems.push("đoạn #" + (i + 1) + ": không phải object"); return; }
    if (typeof seg.start !== "number" || typeof seg.end !== "number" || !(seg.end > seg.start)) {
      problems.push("đoạn #" + (i + 1) + ": start/end không hợp lệ (start=" + seg.start + ", end=" + seg.end + ")");
    }
    if (typeof seg.styleId !== "string" || !seg.styleId) {
      problems.push("đoạn #" + (i + 1) + ": thiếu styleId");
    } else if (typeof getStyleById === "function" && !getStyleById(seg.styleId)) {
      problems.push("đoạn #" + (i + 1) + ": styleId \"" + seg.styleId + "\" không tồn tại — dùng get_beat_styles để xem danh sách");
    }
  });

  // Kiểm tra chồng lấn giữa CÁC ĐOẠN VỚI NHAU (không phải chồng lấn kênh — buildPresetPlan tự lo phần
  // đó) — 2 đoạn chồng thời gian nghĩa là Claude/rule engine sinh dữ liệu mâu thuẫn, cần báo ngay thay
  // vì để appendKeys() âm thầm quyết định "giữ cái ghi sau".
  const sorted = segments
    .map(function (s, i) { return { s: s, i: i }; })
    .filter(function (x) { return x.s && typeof x.s.start === "number" && typeof x.s.end === "number"; })
    .sort(function (a, b) { return a.s.start - b.s.start; });
  for (let k = 1; k < sorted.length; k++) {
    const prev = sorted[k - 1].s, cur = sorted[k].s;
    if (cur.start < prev.end) {
      problems.push(
        "đoạn #" + (sorted[k - 1].i + 1) + " (" + prev.start + "-" + prev.end + "s) và đoạn #" +
        (sorted[k].i + 1) + " (" + cur.start + "-" + cur.end + "s) chồng thời gian lên nhau"
      );
    }
  }

  if (problems.length > 0) {
    throw new Error("segments không hợp lệ:\n- " + problems.join("\n- "));
  }

  log("Đang áp dụng biên đạo " + segments.length + " đoạn...");
  const planOptsExtra = {
    segmentCapMs: 500,
    seed: 20260729
  };
  const result = await applyChoreography(_lastBeats, segments, planOptsExtra, log);

  // [Phase 4.13] Đẩy kết quả ĐÃ ÁP THẬT vào panel — khác câu chữ với get_beat_analysis/
  // suggest_choreography (chỉ xem trước) để người dùng phân biệt được cái nào đã thật sự lên timeline.
  if (_stateRef && typeof _stateRef.showChoreographySummary === "function") {
    _stateRef.showChoreographySummary(
      segments,
      "✅ Đã áp dụng " + segments.length + " đoạn — " + result.totalKeyframes + " keyframe"
    );
  }

  return {
    segmentCount: segments.length,
    totalKeyframesWritten: result.totalKeyframes,
    verifiedCounts: result.verifiedCounts,
    droppedSegments: result.droppedSegments
  };
}

// ============================================================================
// DEBUG / DIAGNOSTIC COMMANDS
// ============================================================================

// Kiểm kê API: bản Premiere đang chạy CÓ những API nào. CHỈ ĐỌC — không tạo, không sửa, không xoá
// bất cứ thứ gì, nên an toàn để chạy trên project thật.
//
// Mục đích: dự án này có một tài liệu "API matrix" mà nhiều dòng đã lạc hậu, và đã từng mất nhiều
// công vì code theo giả định sai về chữ ký API (xem addEffectIfMissing trong premiereActions.js).
// Tool này thay việc đoán bằng việc đo.
async function _cmdDebugProbeApi() {
  const out = { premiereVersion: null, pluginVersion: PLUGIN_VERSION, apis: {}, notes: [] };

  try { out.premiereVersion = _ppro.version || null; } catch (e) {}

  function probe(name, fn) {
    try { out.apis[name] = fn(); }
    catch (e) { out.apis[name] = "lỗi khi kiểm tra: " + e.message; }
  }

  // --- Tự thêm effect (mục 1.11) ---
  probe("VideoFilterFactory", () => (_ppro.VideoFilterFactory ? "có" : "KHÔNG có"));
  probe("VideoFilterFactory.createComponent", () =>
    (_ppro.VideoFilterFactory && typeof _ppro.VideoFilterFactory.createComponent === "function") ? "có" : "KHÔNG có");
  probe("VideoFilterFactory.getMatchNames", () =>
    (_ppro.VideoFilterFactory && typeof _ppro.VideoFilterFactory.getMatchNames === "function") ? "có" : "KHÔNG có");

  // Đếm số effect Premiere đang cài — vừa xác nhận API chạy, vừa là đầu vào cho tính năng
  // "tự học effect" (không cần bảng ParameterID từ web nữa).
  try {
    if (_ppro.VideoFilterFactory && typeof _ppro.VideoFilterFactory.getMatchNames === "function") {
      const names = await _ppro.VideoFilterFactory.getMatchNames();
      out.apis["số effect Premiere đang cài"] = Array.isArray(names) ? names.length : "không phải mảng";
      if (Array.isArray(names)) {
        out.apis["ví dụ 5 matchName"] = names.slice(0, 5);
        // [Phase 5.7] Spike: dò effect kiểu RGB-split/glitch/grain trong toàn bộ danh sách matchName
        // đang cài — trả thẳng ra thay vì đoán, để quyết định "làm được hay bỏ" dựa trên đo thật.
        const KEYWORDS = ["rgb", "channel", "chroma", "split", "offset", "glitch", "grain", "noise", "displac", "shift"];
        out.apis["dò RGB-split/glitch/grain (Phase 5.7)"] = names.filter(n =>
          KEYWORDS.some(k => String(n).toLowerCase().includes(k)));
      }
    }
  } catch (e) { out.apis["số effect Premiere đang cài"] = "lỗi: " + e.message; }

  // --- Tự chèn Adjustment Layer (mục 1.14) ---
  probe("Sequence.createInsertProjectItemAction", () => {
    const p = _ppro.Sequence && _ppro.Sequence.prototype;
    return (p && typeof p.createInsertProjectItemAction === "function") ? "có" : "KHÔNG có";
  });
  probe("ProjectItem/Project: tạo Adjustment Layer", () => {
    const cands = ["createAdjustmentLayer", "createAdjustmentLayerAction", "createNewAdjustmentLayer"];
    const found = [];
    for (const obj of [_ppro.Project && _ppro.Project.prototype, _ppro.ProjectItem && _ppro.ProjectItem.prototype]) {
      if (!obj) continue;
      for (const c of cands) if (typeof obj[c] === "function") found.push(c);
    }
    return found.length ? found.join(", ") : "KHÔNG có API nào trong " + cands.join("/");
  });

  // --- Nhận diện Adjustment Layer (mục 1.12) ---
  probe("TrackItem.isAdjustmentLayer", () => {
    const p = _ppro.TrackItem && _ppro.TrackItem.prototype;
    return (p && typeof p.isAdjustmentLayer === "function") ? "có" : "KHÔNG có";
  });

  // --- Keyframe (nền của toàn bộ tính năng áp trực tiếp) ---
  probe("ComponentParam.createKeyframe", () => {
    const p = _ppro.ComponentParam && _ppro.ComponentParam.prototype;
    return (p && typeof p.createKeyframe === "function") ? "có" : "KHÔNG có";
  });

  // --- Capability flags cho SRT→timeline (PLAN_MCP_PREMIERE_SRT_TO_*.docx, 2026-09-10) — giữ lại
  // dạng cờ ngắn gọn cho tool general-purpose này, chi tiết đầy đủ xem TODO.md/memory ---
  probe("SequenceEditor.insertMogrtFromPath", () => {
    const p = _ppro.SequenceEditor && _ppro.SequenceEditor.prototype;
    return (p && typeof p.insertMogrtFromPath === "function") ? "có" : "KHÔNG có";
  });
  probe("Sequence.createCaptionTrack (API ExtendScript, đã xác nhận KHÔNG có trong UXP)", () => {
    const p = _ppro.Sequence && _ppro.Sequence.prototype;
    return (p && typeof p.createCaptionTrack === "function") ? "có" : "KHÔNG có";
  });



  // LƯU Ý 2026-09-10 (kết luận điều tra SRT→Caption Track, xem TODO.md): đã probe trực tiếp và xác
  // nhận: (1) không có API command/menu execution nào trong module premierepro — loại phương án
  // command automation; (2) SequenceEditor.createInsertProjectItemAction() với SRT ProjectItem
  // KHÔNG tạo/tăng caption track (test qua getCaptionTrackCount() trước/sau) — loại phương án
  // generic insert. Đường duy nhất tạo native Caption Track thật vẫn là kéo tay SRT từ Project
  // panel vào timeline (Premiere tự làm) — đã xác nhận hoạt động (sequence FFWS SEA Fall 2026 Week2
  // có 65 caption item khớp đúng số cue SRT).

  // Đọc trạng thái clip đang chọn nếu có — không bắt buộc phải chọn gì
  try {
    const project = await _ppro.Project.getActiveProject();
    const sequence = project ? await project.getActiveSequence() : null;
    if (sequence) {
      const sel = await sequence.getSelection();
      const clips = sel ? await sel.getTrackItems() : [];
      out.selectedClips = [];
      for (const c of clips) {
        const info = {};
        try { info.isAdjustmentLayer = await c.isAdjustmentLayer(); }
        catch (e) { info.isAdjustmentLayer = "gọi lỗi: " + e.message; }
        try { info.inPointSeconds = (await c.getInPoint()).seconds; } catch (e) {}
        try {
          const chain = await c.getComponentChain();
          const n = await chain.getComponentCount();
          info.effects = [];
          for (let i = 0; i < n; i++) {
            const comp = await chain.getComponentAtIndex(i);
            // [Phát hiện Phase 5.5] comp.matchName là undefined — phải dùng await comp.getMatchName()
            const mn = (typeof comp.getMatchName === "function") ? await comp.getMatchName() : comp.matchName;
            info.effects.push(mn || "(không có matchName)");
          }
        } catch (e) { info.effects = "đọc lỗi: " + e.message; }
        out.selectedClips.push(info);
      }
    } else {
      out.notes.push("Không có sequence active — phần selectedClips bị bỏ qua.");
    }
  } catch (e) {
    out.notes.push("Không đọc được selection: " + e.message);
  }

  out.notes.push("Tool này CHỈ ĐỌC — không tạo/sửa/xoá gì trong project.");
  return out;
}

// Đọc trạng thái DOM thật của một phần tử trong panel — để chẩn đoán CSS rendering trong UXP.
async function _cmdDebugGetElement(params) {
  const selector = params.selector || "#effectGrid";
  const el = document.querySelector(selector);
  if (!el) return { found: false, selector, message: "Không tìm thấy phần tử: " + selector };

  let rect = {};
  try { rect = el.getBoundingClientRect(); } catch {}

  const styleKeys = ["display", "width", "height", "minHeight", "overflow", "visibility",
                     "opacity", "position", "aspectRatio", "flexDirection", "animation",
                     // [Phase 5.2] Thêm các thuộc tính animation dạng dài — nghi ngờ UXP không hỗ trợ
                     // cú pháp rút gọn "animation: name duration timing infinite" dù CSS Grid/Flexbox
                     // cũng từng có tiền lệ tương tự (xem LESSONS.md mục effect-grid).
                     "animationName", "animationDuration", "animationPlayState",
                     "animationIterationCount", "animationTimingFunction", "transform"];
  const computed = {};
  try {
    const cs = window.getComputedStyle(el);
    for (const k of styleKeys) {
      try { computed[k] = cs.getPropertyValue(k.replace(/([A-Z])/g, "-$1").toLowerCase()); } catch {}
    }
  } catch {}

  // [Phase 5.2] Dò xem UXP có thật sự PARSE @keyframes thành CSSKeyframesRule không — phân biệt
  // "engine không hỗ trợ CSS Animations" (không có rule nào cả) với "chỉ getComputedStyle bị giới
  // hạn" (rule có tồn tại, animation vẫn không chạy). Chỉ chạy khi selector nhắm tới <style>, tránh
  // lãng phí khi kiểm tra phần tử thường.
  let keyframesRuleInfo = null;
  if (el.tagName === "STYLE") {
    try {
      const sheet = el.sheet;
      const rules = sheet ? Array.from(sheet.cssRules || []) : [];
      keyframesRuleInfo = {
        sheetFound: !!sheet,
        totalRules: rules.length,
        ruleTypes: rules.slice(0, 5).map(r => (r.constructor && r.constructor.name) || typeof r),
        firstRuleCssText: rules.length ? String(rules[0].cssText).slice(0, 200) : null
      };
    } catch (e) {
      keyframesRuleInfo = { error: e.message };
    }
  }

  return {
    found: true,
    selector,
    tagName: el.tagName,
    childCount: el.children.length,
    innerHTMLPreview: el.innerHTML.slice(0, 300),
    outerHTMLPreview: el.outerHTML.slice(0, 300),
    rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
    computedStyle: computed,
    inlineStyle: el.getAttribute("style") || "",
    keyframesRuleInfo
  };
}

// [Phase 5.6 debug] Đọc lại TOÀN BỘ marker thật đang có trên clip đang chọn — cả clip marker lẫn
// sequence marker — để biết CHẮC bao nhiêu marker thật sự tồn tại, thay vì đoán qua ảnh chụp UI.
// Không lọc theo isBeatShakeMarker() — liệt kê hết để thấy rõ có bị marker khác che/trộn không.
async function _cmdDebugListMarkers(log) {
  const { clips } = await getActiveSequenceAndAllSelection(log);
  if (!clips || clips.length === 0) return { error: "Không có clip nào đang chọn." };
  const clip = clips[0];

  const out = { clipMarkers: null, sequenceMarkers: null };

  try {
    const projectItem = await clip.getProjectItem();
    const clipProjectItem = await _ppro.ClipProjectItem.cast(projectItem);
    if (clipProjectItem) {
      const markers = await _ppro.Markers.getMarkers(clipProjectItem);
      const list = await markers.getMarkers();
      out.clipMarkers = [];
      for (const m of list) {
        const name = await _safeCall(() => m.getName());
        const comment = await _safeCall(() => m.getComments());
        const start = await _safeCall(() => m.getStart());
        const duration = await _safeCall(() => m.getDuration());
        out.clipMarkers.push({
          name, comment,
          startSeconds: start ? start.seconds : null,
          durationSeconds: duration ? duration.seconds : null,
          isOwn: (typeof isBeatShakeMarker === "function") ? await isBeatShakeMarker(m) : null
        });
      }
    }
  } catch (e) {
    out.clipMarkers = { error: e.message };
  }

  try {
    const project = await _ppro.Project.getActiveProject();
    const sequence = await project.getActiveSequence();
    const markers = await _ppro.Markers.getMarkers(sequence);
    const list = await markers.getMarkers();
    out.sequenceMarkers = [];
    for (const m of list) {
      const name = await _safeCall(() => m.getName());
      const comment = await _safeCall(() => m.getComments());
      const start = await _safeCall(() => m.getStart());
      const duration = await _safeCall(() => m.getDuration());
      out.sequenceMarkers.push({
        name, comment,
        startSeconds: start ? start.seconds : null,
        durationSeconds: duration ? duration.seconds : null,
        isOwn: (typeof isBeatShakeMarker === "function") ? await isBeatShakeMarker(m) : null
      });
    }
  } catch (e) {
    out.sequenceMarkers = { error: e.message };
  }

  return out;
}

// Chẩn đoán ComponentChain API trong Premiere — liệt kê methods có trên chain,
// danh sách effects hiện có, và thử add effect nếu tryAdd=true.
async function _cmdDebugInspectChain(params, log) {
  const matchName = params.matchName || "AE.ADBE Geometry2";
  const tryAdd = params.tryAdd === true;

  // Lấy clip đang chọn
  const { clips } = await getActiveSequenceAndAllSelection(log);
  if (!clips || clips.length === 0) {
    return { error: "Không có clip nào đang chọn. Hãy chọn clip (Adjustment Layer) trên timeline." };
  }
  const clip = clips[0];

  // Liệt kê methods trên ComponentChain
  const chain = await clip.getComponentChain();
  const chainKeys = [];
  try {
    for (const key in chain) { chainKeys.push(key); }
    // Thêm prototype methods
    const proto = Object.getPrototypeOf(chain);
    if (proto) {
      for (const key of Object.getOwnPropertyNames(proto)) { chainKeys.push("proto." + key); }
    }
  } catch {}

  // Danh sách effects hiện có
  // [Phát hiện Phase 5.5] comp.matchName (thuộc tính đồng bộ) luôn undefined — đã đo xác nhận qua
  // MCP thật. Chỉ await comp.getMatchName() mới đúng (xem findComponentByMatchName trong
  // premiereActions.js, đã sửa cùng phát hiện này).
  const existingComponents = [];
  let matchedComponent = null;
  try {
    const count = await chain.getComponentCount();
    for (let i = 0; i < count; i++) {
      const comp = await chain.getComponentAtIndex(i);
      const compMatchName = typeof comp.getMatchName === "function" ? await comp.getMatchName() : null;
      const compDisplayName = typeof comp.getDisplayName === "function" ? await comp.getDisplayName() : null;
      existingComponents.push({ index: i, matchName: compMatchName, displayName: compDisplayName });
      if (compMatchName === matchName) matchedComponent = comp;
    }
  } catch (e) {
    existingComponents.push({ error: e.message });
  }

  // [Phase 5.5] Đếm keyframe THẬT trên từng kênh của effect đang xét — dùng để kiểm chứng
  // clearExistingKeyframes()/collectAllBeatShakeParamsOnClip() có xoá sạch kênh KHÔNG nằm trong plan
  // hiện tại hay không, thay vì chỉ tin vào verifiedCounts (chỉ báo cáo kênh của plan đang áp).
  let channelKeyframeCounts = null;
  if (matchedComponent && typeof getAllEffectSchemaKeys === "function") {
    const effectKey = getAllEffectSchemaKeys().find(k => {
      const s = getEffectSchema(k);
      return s && s.matchName === matchName;
    });
    const schema = effectKey ? getEffectSchema(effectKey) : null;
    if (schema) {
      channelKeyframeCounts = {};
      for (const spec of schema.params) {
        if (!spec.key) continue;
        try {
          const param = await resolveParamForChannel(matchedComponent, schema, spec.key, log);
          channelKeyframeCounts[spec.key] = param ? await verifyKeyframeCount(param, spec.key, log) : "khong resolve duoc param";
        } catch (e) {
          channelKeyframeCounts[spec.key] = "loi: " + e.message;
        }
      }
    }
  }

  const trialResults = [];

  if (tryAdd) {
    const project = await _ppro.Project.getActiveProject();

    // [Phase 5.3] Cách 0: VideoFilterFactory.createComponent(matchName) rồi chain.createAppendComponentAction(component)
    // — đây là chữ ký addEffectIfMissing() thật đang dùng trong premiereActions.js. Test riêng ở đây
    // để biết CHÍNH XÁC nó thất bại ở bước tạo component hay ở bước append, thay vì chỉ thấy
    // "Invalid parameter" chung chung từ log panel.
    try {
      const factory = _ppro.VideoFilterFactory;
      let newComponent = null;
      try {
        newComponent = await factory.createComponent(matchName);
        trialResults.push({ variant: "0a: createComponent(matchName)", success: !!newComponent,
          error: newComponent ? undefined : "trả về null/undefined" });
      } catch (eCreate) {
        trialResults.push({ variant: "0a: createComponent(matchName)", success: false, error: eCreate.message });
      }
      if (newComponent) {
        try {
          await project.lockedAccess(() => {
            project.executeTransaction((ca) => {
              ca.addAction(chain.createAppendComponentAction(newComponent));
            }, "debug: add effect v0b");
          });
          trialResults.push({ variant: "0b: createAppendComponentAction(component)", success: true });
        } catch (e0b) {
          trialResults.push({ variant: "0b: createAppendComponentAction(component)", success: false, error: e0b.message });
        }
        // Cách D: createInsertComponentAction(component, index) — method khác cũng tồn tại trên chain,
        // có thể đây mới là API đúng để chèn 1 Component OBJECT (thay vì append theo chuỗi/matchName).
        if (typeof chain.createInsertComponentAction === "function") {
          try {
            const count = await chain.getComponentCount();
            await project.lockedAccess(() => {
              project.executeTransaction((ca) => {
                ca.addAction(chain.createInsertComponentAction(newComponent, count));
              }, "debug: add effect vD");
            });
            trialResults.push({ variant: "D: createInsertComponentAction(component, count)", success: true });
          } catch (eD) {
            trialResults.push({ variant: "D: createInsertComponentAction(component, count)", success: false, error: eD.message });
          }
        }
      }
    } catch (e0) {
      trialResults.push({ variant: "0: createComponent+append tổng quát", success: false, error: e0.message });
    }

    // Cách 1: chain.createAppendComponentAction(clip, matchName)
    try {
      await project.lockedAccess(() => {
        project.executeTransaction((ca) => {
          ca.addAction(chain.createAppendComponentAction(clip, matchName));
        }, "debug: add effect v1");
      });
      trialResults.push({ variant: "createAppendComponentAction(clip, matchName)", success: true });
    } catch (e) {
      trialResults.push({ variant: "createAppendComponentAction(clip, matchName)", success: false, error: e.message });
    }

    // Cách 2: chain.createAppendComponentAction(matchName) — chỉ nếu cách 1 fail
    if (!trialResults[0]?.success) {
      try {
        await project.lockedAccess(() => {
          project.executeTransaction((ca) => {
            ca.addAction(chain.createAppendComponentAction(matchName));
          }, "debug: add effect v2");
        });
        trialResults.push({ variant: "createAppendComponentAction(matchName)", success: true });
      } catch (e) {
        trialResults.push({ variant: "createAppendComponentAction(matchName)", success: false, error: e.message });
      }
    }

    // Cách 3: project.createAppendComponentAction trực tiếp (thử trên project)
    try {
      const hasProjectFn = typeof project.createAppendComponentAction === "function";
      if (hasProjectFn) {
        await project.lockedAccess(() => {
          project.executeTransaction((ca) => {
            ca.addAction(project.createAppendComponentAction(clip, matchName));
          }, "debug: add effect v3");
        });
        trialResults.push({ variant: "project.createAppendComponentAction(clip, matchName)", success: true });
      } else {
        trialResults.push({ variant: "project.createAppendComponentAction", success: false, error: "method không tồn tại trên project" });
      }
    } catch (e) {
      trialResults.push({ variant: "project.createAppendComponentAction(clip, matchName)", success: false, error: e.message });
    }
  }

  return {
    clipType: clip.type,
    matchNameTarget: matchName,
    tryAdd,
    chainMethodKeys: chainKeys.slice(0, 60), // giới hạn để tránh response quá lớn
    existingComponents,
    channelKeyframeCounts,
    trialResults
  };
}

// ============================================================================
// AUTO-INIT (main.js exposes window.beatShakeState before this script loads)
// ============================================================================
(function () {
  try {
    // THỨ TỰ QUAN TRỌNG: đăng ký callback trạng thái TRƯỚC khi gọi initMcpBridge().
    // initMcpBridge() gọi _connect() ngay, mà _connect() đặt trạng thái 🟡 một cách ĐỒNG BỘ —
    // nếu callback chưa đăng ký thì lần cập nhật đầu tiên đó rơi vào hư không và ô chỉ báo đứng
    // im ở ⚫ cho tới sự kiện WS kế tiếp. Trước v16 thứ tự này bị ngược.
    setMcpStatusCallback(function (text, ok) {
      const el = document.getElementById("mcpStatus");
      if (el) {
        el.textContent = text;
        el.style.color = ok ? "#4caf50" : "#888";
      }
    });
    initMcpBridge(window.beatShakeState || {});
  } catch (e) {
    // Bridge init failed — plugin still works normally via UI
  }
}());
