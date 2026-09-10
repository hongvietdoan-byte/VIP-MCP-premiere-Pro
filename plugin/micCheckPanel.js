// micCheckPanel.js — UI logic cho nút "Mic Check" trong panel (xem TODO.md mục "Workflow Mic Check
// tối ưu, Phương án B"). Gọi TRỰC TIẾP các hàm trong premiereActions.js (runMicCheckWorkflow,
// verifyMicCheckWorkflow) — KHÔNG qua WS bridge/MCP server/Claude.
//
// Chỉ cần chọn 1 THƯ MỤC DỰ ÁN duy nhất (chứa cues.json + video nền + ảnh nằm phẳng cùng cấp, đúng
// quy ước output của scripts/docx_to_mic_check.py) — panel tự dò file bên trong, không bắt user
// chọn từng file riêng.

(function () {
  const uxpFsPanel = require("uxp").storage.localFileSystem;
  const VIDEO_EXT = [".mp4", ".mov", ".mxf", ".avi"];

  let state = {
    folderPath: null,
    cuesCandidates: [], // [{name, nativePath}]
    videoCandidates: [],
    selectedCuesPath: null,
    selectedVideoPath: null // null hợp lệ = không có video nền
  };

  function $(id) { return document.getElementById(id); }

  function logLine(msg) {
    const el = $("mcLog");
    const time = new Date().toLocaleTimeString();
    el.textContent += `[${time}] ${msg}\n`;
    el.scrollTop = el.scrollHeight;
  }

  function updateRunEnabled() {
    const canRun = !!(state.selectedCuesPath && state.folderPath && $("mcSequenceName").value.trim());
    $("mcRunBtn").disabled = !canRun;
    $("mcVerifyBtn").disabled = !state.selectedCuesPath;
  }

  function baseName(nativePath) {
    return nativePath.split(/[\\/]/).pop();
  }

  function suggestSequenceName(cuesFileName) {
    return cuesFileName.replace(/\.cues\.json$/i, "").replace(/[_-]+/g, " ").trim();
  }

  async function scanFolder(folderEntry) {
    const entries = await folderEntry.getEntries();
    const cuesCandidates = [];
    const videoCandidates = [];
    for (const e of entries) {
      if (!e.isFile) continue;
      const name = e.name;
      if (/\.cues\.json$/i.test(name)) {
        cuesCandidates.push({ name, nativePath: e.nativePath });
      } else if (VIDEO_EXT.some((ext) => name.toLowerCase().endsWith(ext))) {
        videoCandidates.push({ name, nativePath: e.nativePath });
      }
    }
    return { cuesCandidates, videoCandidates };
  }

  function renderDetected() {
    const el = $("mcDetected");
    const rows = [];

    // cues.json
    if (state.cuesCandidates.length === 0) {
      rows.push(`<div class="mc-detected-row"><span class="mc-detected-icon mc-err">✕</span>
        <span>Không thấy file *.cues.json — chạy scripts/docx_to_mic_check.py trước.</span></div>`);
    } else if (state.cuesCandidates.length === 1) {
      rows.push(`<div class="mc-detected-row"><span class="mc-detected-icon mc-ok">✓</span>
        <span>cues.json: ${state.cuesCandidates[0].name}</span></div>`);
    } else {
      rows.push(`<div class="mc-detected-row"><span class="mc-detected-icon mc-warn">?</span>
        <span>${state.cuesCandidates.length} file cues.json — chọn 1:</span></div>
        <div class="mc-detected-row"><select id="mcCuesSelect" style="flex:1">
          ${state.cuesCandidates.map((c, i) => `<option value="${i}">${c.name}</option>`).join("")}
        </select></div>`);
    }

    // video nền
    if (state.videoCandidates.length === 0) {
      rows.push(`<div class="mc-detected-row"><span class="mc-detected-icon mc-warn">–</span>
        <span>Không thấy video nền (tuỳ chọn, bỏ qua nếu không cần).</span></div>`);
    } else if (state.videoCandidates.length === 1) {
      rows.push(`<div class="mc-detected-row"><span class="mc-detected-icon mc-ok">✓</span>
        <span>Video nền: ${state.videoCandidates[0].name}</span></div>`);
    } else {
      rows.push(`<div class="mc-detected-row"><span class="mc-detected-icon mc-warn">?</span>
        <span>${state.videoCandidates.length} video — chọn 1 (hoặc để trống nếu không cần):</span></div>
        <div class="mc-detected-row"><select id="mcVideoSelect" style="flex:1">
          <option value="-1">(không dùng video nền)</option>
          ${state.videoCandidates.map((c, i) => `<option value="${i}">${c.name}</option>`).join("")}
        </select></div>`);
    }

    el.innerHTML = rows.join("");

    const cuesSelect = $("mcCuesSelect");
    if (cuesSelect) {
      cuesSelect.addEventListener("change", () => {
        state.selectedCuesPath = state.cuesCandidates[+cuesSelect.value].nativePath;
        updateRunEnabled();
      });
    }
    const videoSelect = $("mcVideoSelect");
    if (videoSelect) {
      videoSelect.addEventListener("change", () => {
        const idx = +videoSelect.value;
        state.selectedVideoPath = idx >= 0 ? state.videoCandidates[idx].nativePath : null;
      });
    }
  }

  function shortenPath(p) {
    if (!p) return "(chưa chọn)";
    const parts = p.split(/[\\/]/);
    return parts.length > 2 ? "…\\" + parts.slice(-2).join("\\") : p;
  }

  $("mcPickFolder").addEventListener("click", async () => {
    let folderEntry;
    try {
      folderEntry = await uxpFsPanel.getFolderForOpening();
    } catch (e) {
      logLine(`Lỗi chọn thư mục: ${e.message}`);
      return;
    }
    if (!folderEntry) return; // user bấm Cancel

    state.folderPath = folderEntry.nativePath;
    $("mcFolderPath").textContent = shortenPath(state.folderPath);
    $("mcFolderPath").title = state.folderPath;
    logLine(`Đã chọn thư mục: ${state.folderPath}`);

    const { cuesCandidates, videoCandidates } = await scanFolder(folderEntry);
    state.cuesCandidates = cuesCandidates;
    state.videoCandidates = videoCandidates;
    state.selectedCuesPath = cuesCandidates.length === 1 ? cuesCandidates[0].nativePath : null;
    state.selectedVideoPath = videoCandidates.length === 1 ? videoCandidates[0].nativePath : null;

    logLine(`Dò được: ${cuesCandidates.length} cues.json, ${videoCandidates.length} video.`);
    renderDetected();

    if (state.selectedCuesPath && !$("mcSequenceName").value.trim()) {
      $("mcSequenceName").value = suggestSequenceName(baseName(state.selectedCuesPath));
    }
    updateRunEnabled();
  });

  $("mcSequenceName").addEventListener("input", updateRunEnabled);

  $("mcRunBtn").addEventListener("click", async () => {
    $("mcRunBtn").disabled = true;
    $("mcVerifyBtn").disabled = true;
    const sequenceName = $("mcSequenceName").value.trim();
    const orientation = $("mcOrientation").value;
    logLine(`▶ Bắt đầu Mic Check: "${sequenceName}" (${orientation})...`);
    try {
      const result = await runMicCheckWorkflow({
        cuesJsonPath: state.selectedCuesPath,
        backgroundVideoPath: state.selectedVideoPath || undefined,
        imagesDir: state.folderPath, // ảnh nằm phẳng ngay trong thư mục dự án đã chọn
        sequenceName,
        orientation
      }, (msg) => logLine(msg));

      logLine(`✅ Xong. Sequence "${result.sequenceName}" (${result.actualFps}fps).`);
      logLine(`   Ảnh: ${result.images.placed}/${result.images.total} đặt thành công.`);
      if (result.images.failed.length > 0) {
        logLine(`   ⚠️ ${result.images.failed.length} ảnh lỗi — xem chi tiết bên dưới.`);
        for (const f of result.images.failed) logLine(`     - index ${f.index} "${f.itemName}": ${f.error}`);
      }
      logLine(`   ${result.nextStep}`);
    } catch (e) {
      logLine(`❌ Lỗi: ${e.message}`);
    } finally {
      updateRunEnabled();
    }
  });

  $("mcVerifyBtn").addEventListener("click", async () => {
    $("mcVerifyBtn").disabled = true;
    logLine("🔍 Đang verify timeline so với cues.json...");
    try {
      const result = await verifyMicCheckWorkflow({ cuesJsonPath: state.selectedCuesPath });
      logLine(`Ảnh: mong đợi ${result.imageCuesExpected}, tìm thấy ${result.imageClipsFound} trên timeline.`);
      if (result.allImagesOk) {
        logLine("✅ Tất cả ảnh khớp đúng vị trí + thời lượng.");
      } else {
        logLine(`⚠️ ${result.mismatches.length} chỗ lệch:`);
        for (const m of result.mismatches.slice(0, 10)) {
          logLine(`   - index ${m.index}: ${m.issue}`);
        }
        if (result.mismatches.length > 10) logLine(`   ...và ${result.mismatches.length - 10} chỗ khác.`);
      }
      logLine(`Caption: track=${result.captionTrackCount}, item=${result.captionItemCount}/${result.captionCuesExpected}. ${result.captionNote}`);
    } catch (e) {
      logLine(`❌ Lỗi verify: ${e.message}`);
    } finally {
      updateRunEnabled();
    }
  });

  updateRunEnabled();
})();
