// micCheckPanel.js — UI logic cho nút "Mic Check" trong panel (xem TODO.md mục "Workflow Mic Check
// tối ưu, Phương án B"). Gọi TRỰC TIẾP các hàm trong premiereActions.js (runMicCheckWorkflow,
// verifyMicCheckWorkflow) — KHÔNG qua WS bridge/MCP server/Claude. Không cần server chạy nền, không
// cần mạng, hoạt động độc lập ngay trong panel Premiere.

(function () {
  const uxpFsPanel = require("uxp").storage.localFileSystem;

  let state = {
    cuesJsonPath: null,
    videoPath: null,
    imagesPath: null
  };

  function $(id) { return document.getElementById(id); }

  function logLine(msg) {
    const el = $("mcLog");
    const time = new Date().toLocaleTimeString();
    el.textContent += `[${time}] ${msg}\n`;
    el.scrollTop = el.scrollHeight;
  }

  function updateRunEnabled() {
    const canRun = !!(state.cuesJsonPath && state.imagesPath && $("mcSequenceName").value.trim());
    $("mcRunBtn").disabled = !canRun;
    $("mcVerifyBtn").disabled = !state.cuesJsonPath;
  }

  async function pickFile(label, extensions) {
    try {
      const entry = await uxpFsPanel.getFileForOpening({ types: extensions });
      if (!entry) return null; // user bấm Cancel
      return entry.nativePath;
    } catch (e) {
      logLine(`Lỗi chọn ${label}: ${e.message}`);
      return null;
    }
  }

  async function pickFolder(label) {
    try {
      const entry = await uxpFsPanel.getFolderForOpening();
      if (!entry) return null;
      return entry.nativePath;
    } catch (e) {
      logLine(`Lỗi chọn ${label}: ${e.message}`);
      return null;
    }
  }

  function shortenPath(p) {
    if (!p) return "(chưa chọn)";
    const parts = p.split(/[\\/]/);
    return parts.length > 2 ? "…\\" + parts.slice(-2).join("\\") : p;
  }

  $("mcPickCues").addEventListener("click", async () => {
    const path = await pickFile("cues.json", ["json"]);
    if (path) {
      state.cuesJsonPath = path;
      $("mcCuesPath").textContent = shortenPath(path);
      $("mcCuesPath").title = path;
      logLine(`Đã chọn cues.json: ${path}`);
    }
    updateRunEnabled();
  });

  $("mcPickVideo").addEventListener("click", async () => {
    const path = await pickFile("video nền", ["mp4", "mov", "mxf", "avi"]);
    if (path) {
      state.videoPath = path;
      $("mcVideoPath").textContent = shortenPath(path);
      $("mcVideoPath").title = path;
      logLine(`Đã chọn video nền: ${path}`);
    }
    updateRunEnabled();
  });

  $("mcPickImages").addEventListener("click", async () => {
    const path = await pickFolder("thư mục ảnh");
    if (path) {
      state.imagesPath = path;
      $("mcImagesPath").textContent = shortenPath(path);
      $("mcImagesPath").title = path;
      logLine(`Đã chọn thư mục ảnh: ${path}`);
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
        cuesJsonPath: state.cuesJsonPath,
        backgroundVideoPath: state.videoPath || undefined,
        imagesDir: state.imagesPath,
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
      const result = await verifyMicCheckWorkflow({ cuesJsonPath: state.cuesJsonPath });
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
