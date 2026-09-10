#!/usr/bin/env node
// docx_to_json.js — Chuyển file .docx bảng "Time Stamp | Player | EN | Ảnh" (mẫu Mic Check) thành
// cues.json chuẩn hoá cho workflow Mic Check (xem TODO.md, mục "Workflow Mic Check tối ưu").
//
// Chạy NGOÀI Premiere (Node.js thuần) — không phụ thuộc UXP, không cần Claude cho các lần chạy lại.
//
// LƯU Ý bảo mật: chỉ dùng adm-zip để ĐỌC nội dung trong bộ nhớ (getEntry + getData), KHÔNG BAO GIỜ
// gọi extractAllTo() — lỗ hổng CVE đã biết của adm-zip (theo symlink khi ghi ra ổ đĩa) không áp
// dụng được với cách dùng này.
//
// Usage:
//   node docx_to_json.js --docx <path.docx> --images <thư mục ảnh> --out <cues.json>
//
// Số lượng ảnh KHÔNG hardcode — script tự đọc bất kỳ giá trị nào xuất hiện ở cột "Ảnh" trong docx
// (vd "Ảnh 1".."Ảnh N"), rồi validate khớp với file thật trong --images (quy ước tên file:
// "Ảnh N" trong docx ↔ file "ảnh N.png" trong thư mục, không phân biệt hoa/thường).

import AdmZip from "adm-zip";
import { readFileSync, existsSync, readdirSync, writeFileSync } from "fs";
import { basename } from "path";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      out[key] = argv[i + 1];
      i++;
    }
  }
  return out;
}

function readDocxParagraphs(docxPath) {
  const zip = new AdmZip(docxPath); // đọc trong bộ nhớ, không extract ra ổ đĩa
  const entry = zip.getEntry("word/document.xml");
  if (!entry) throw new Error(`Không tìm thấy word/document.xml trong "${docxPath}" — file có đúng là .docx không?`);
  const xml = entry.getData().toString("utf8");

  const paraBlocks = xml.split(/<w:p[ >]/).slice(1);
  const paragraphs = [];
  for (const block of paraBlocks) {
    const texts = [...block.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/gs)].map((m) =>
      m[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
    );
    paragraphs.push(texts.join(""));
  }
  return paragraphs;
}

// Bảng docx có dạng: [header 6 dòng] rồi lặp lại nhóm 4 dòng (Time Stamp, Player, EN, Ảnh) cho mỗi
// caption. Một số dòng Player/Ảnh có thể rỗng (caption không gắn ảnh) — vẫn giữ đúng vị trí 4-dòng.
function parseCuesFromParagraphs(paragraphs) {
  // Tìm dòng đầu tiên khớp định dạng timestamp SRT — đó là điểm bắt đầu dữ liệu thật, bỏ qua toàn
  // bộ phần header phía trước (không hardcode "bỏ 6 dòng" vì tiêu đề bảng có thể khác nhau).
  const timestampRe = /(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/;
  const firstDataIdx = paragraphs.findIndex((p) => timestampRe.test(p));
  if (firstDataIdx < 0) {
    throw new Error("Không tìm thấy dòng timestamp nào (HH:MM:SS,mmm --> HH:MM:SS,mmm) trong docx — kiểm tra lại định dạng bảng.");
  }

  const data = paragraphs.slice(firstDataIdx);
  const toSeconds = (h, m, s, ms) => (+h) * 3600 + (+m) * 60 + (+s) + (+ms) / 1000;
  const cues = [];

  for (let i = 0; i + 3 < data.length; i += 4) {
    const tsLine = data[i];
    const m = tsLine.match(timestampRe);
    if (!m) {
      // Dòng không khớp timestamp ở đúng vị trí kỳ vọng — dữ liệu có thể lệch cấu trúc 4-dòng.
      throw new Error(
        `Dòng thứ ${firstDataIdx + i + 1} trong docx không phải timestamp hợp lệ ("${tsLine}") — ` +
        `cấu trúc bảng có thể không đúng dạng 4 cột/dòng (Time Stamp, Player, EN, Ảnh) như mong đợi.`
      );
    }
    const start = toSeconds(m[1], m[2], m[3], m[4]);
    const end = toSeconds(m[5], m[6], m[7], m[8]);
    const text = (data[i + 2] || "").trim();
    const imageRaw = (data[i + 3] || "").trim();

    if (start >= end) {
      throw new Error(`Cue tại dòng ${firstDataIdx + i + 1}: start (${start}s) phải nhỏ hơn end (${end}s).`);
    }

    cues.push({
      index: cues.length,
      start: Math.round(start * 1000) / 1000,
      end: Math.round(end * 1000) / 1000,
      text,
      image: imageRaw || null // null = caption không gắn ảnh (hợp lệ, giữ nguyên khoảng trống)
    });
  }

  if (cues.length === 0) throw new Error("Parse xong nhưng không ra cue nào — kiểm tra lại file docx.");
  return cues;
}

// "Ảnh 1" → tên file kỳ vọng "ảnh 1.png" (không phân biệt hoa/thường, đuôi file linh hoạt).
function imageLabelToExpectedNames(label) {
  const num = label.replace(/^Ảnh\s*/i, "").trim();
  const base = `ảnh ${num}`;
  return [".png", ".jpg", ".jpeg"].map((ext) => base + ext);
}

function validateImages(cues, imagesDir) {
  if (!existsSync(imagesDir)) throw new Error(`Thư mục ảnh không tồn tại: "${imagesDir}"`);
  const filesOnDisk = readdirSync(imagesDir);
  const filesLower = new Set(filesOnDisk.map((f) => f.toLowerCase()));

  const uniqueLabels = [...new Set(cues.map((c) => c.image).filter(Boolean))];
  const missing = [];
  const resolved = new Map(); // label -> tên file thật trên đĩa

  for (const label of uniqueLabels) {
    const candidates = imageLabelToExpectedNames(label);
    const found = candidates.find((c) => filesLower.has(c.toLowerCase()));
    if (found) {
      // Lấy đúng tên file thật trên đĩa (giữ nguyên hoa/thường) để ghi vào JSON.
      const realName = filesOnDisk.find((f) => f.toLowerCase() === found.toLowerCase());
      resolved.set(label, realName);
    } else {
      missing.push({ label, expected: candidates });
    }
  }

  if (missing.length > 0) {
    const lines = missing.map((m) => `  - docx nhắc tới "${m.label}" nhưng không thấy file nào trong [${m.expected.join(", ")}]`);
    throw new Error(`Thiếu ${missing.length} ảnh trong "${imagesDir}":\n${lines.join("\n")}`);
  }

  const usedFiles = new Set([...resolved.values()].map((f) => f.toLowerCase()));
  const unusedFiles = filesOnDisk.filter((f) => !usedFiles.has(f.toLowerCase()) && /\.(png|jpe?g)$/i.test(f));
  if (unusedFiles.length > 0) {
    console.warn(`⚠️  Cảnh báo: ${unusedFiles.length} ảnh trong thư mục không được docx nhắc tới (không chặn, chỉ để bạn biết): ${unusedFiles.join(", ")}`);
  }

  return resolved;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.docx || !args.images || !args.out) {
    console.error("Usage: node docx_to_json.js --docx <path.docx> --images <thư mục ảnh> --out <cues.json>");
    process.exit(1);
  }

  console.log(`Đọc docx: ${args.docx}`);
  const paragraphs = readDocxParagraphs(args.docx);
  const cues = parseCuesFromParagraphs(paragraphs);
  console.log(`Parse được ${cues.length} cue.`);

  console.log(`Validate ảnh trong: ${args.images}`);
  const resolvedImages = validateImages(cues, args.images);

  const cuesWithRealFilenames = cues.map((c) => ({
    ...c,
    image: c.image ? resolvedImages.get(c.image) : null
  }));

  const output = {
    sourceDocx: basename(args.docx),
    generatedAt: new Date().toISOString(),
    cueCount: cuesWithRealFilenames.length,
    cues: cuesWithRealFilenames
  };

  writeFileSync(args.out, JSON.stringify(output, null, 2), "utf8");
  console.log(`✅ Đã ghi ${args.out} (${cuesWithRealFilenames.length} cue, ${resolvedImages.size} ảnh khác nhau).`);
}

main();
