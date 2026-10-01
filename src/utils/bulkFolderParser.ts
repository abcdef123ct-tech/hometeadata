import { SourceStatusType, ProcessingStatusType } from "../types";

export interface BulkImageItem {
  id: string;
  file: File;
  fileName: string;
  previewUrl: string;
  width?: number;
  height?: number;
  selected: boolean;
  isAvatar: boolean;
  autoExcluded: boolean;
  excludeReason?: string;
  uploadedUrl?: string;
  uploadError?: string;
}

export type BulkRowPreviewStatus = "moi" | "da_co" | "thieu_thong_tin" | "loi_doc";

export interface ParsedAreaResult {
  dien_tich: string;
  dien_tich_so: number | null;
  dien_tich_thuc_te: number | null;
}

export interface AreaCrossCheckResult {
  needsReview: boolean; // Lệch > 30% giữa (rộng x dài) và dien_tich_thuc_te -> gắn cờ "Cần xem lại"
  needsLightCheck: boolean; // dien_tich_thuc_te < dien_tich_so -> gắn cờ nhẹ để kiểm tra
  calcArea: number | null; // rộng x dài
  deviationPercent: number | null; // % lệch so với dien_tich_thuc_te
  reviewReason?: string;
  lightCheckReason?: string;
}

export interface BulkPropertyItem {
  id: string; // internal row id
  selected: boolean; // whether row is ticked for import
  ten_thu_muc_goc: string;
  parent_folder_name: string;

  // Parsed fields matching SPEC
  ma_tk: string;
  ma_tk_source?: "folder" | "txt" | "generated_nt";
  so_nha: string;
  duong: string;
  dia_chi: string;
  phuong: string;
  dien_tich: string;
  dien_tich_so: number | null; // Diện tích đất công nhận trên sổ
  dien_tich_thuc_te: number | null; // Diện tích đất sử dụng thực tế
  so_tang: string;
  rong: string;
  dai: string;
  gia: number | null; // integer VND
  gia_text: string; // human-readable e.g. "20 tỷ"
  loai_hinh: string;
  trang_thai_nguon: SourceStatusType;
  trang_thai_xu_ly: ProcessingStatusType;
  mo_ta_tho: string; // internal only
  moi_gioi_nguon: string; // internal only
  sdt_nguon: string; // internal only
  hoa_hong: string;
  toa_do: string;
  ngay_lay?: string | null; // ISO date parsed from "Ngay lay" in .txt
  ngay_lay_raw?: string;

  // Images
  images: BulkImageItem[];
  txtFileName?: string;

  // Status & Diagnostics
  previewStatus: BulkRowPreviewStatus;
  statusNote?: string;
  needsReview?: boolean; // Cờ "Cần xem lại" (rộng x dài lệch > 30% so với dien_tich_thuc_te)
  needsLightCheck?: boolean; // Cờ nhẹ (dien_tich_thuc_te < dien_tich_so)
  reviewNote?: string;
  lightCheckNote?: string;
  calcArea?: number | null;
  deviationPercent?: number | null;
  existingRecord?: any | null;

  // Upload queue progress state
  queueState?: "idle" | "uploading_images" | "saving_db" | "done" | "skipped" | "error";
  queueMessage?: string;
  uploadedImagesCount?: number;
}

/**
 * Check if a string is a valid real TK or NT primary key code (e.g. TK2JLH4L, NT-8A9F12).
 * Strictly rejects pure numbers or numeric prefixes like "01", "10", "#10".
 */
export function isValidRealMaTk(code: string | null | undefined): boolean {
  if (!code) return false;
  const clean = code.trim().toUpperCase();
  if (!clean) return false;
  if (/^#?[0-9]+$/.test(clean)) return false;
  return /^(?:TK[A-Z0-9]{3,16}|NT-[A-Z0-9]{4,16})$/.test(clean);
}

/**
 * Generate a deterministic `NT-xxxxxx` code when neither folder name nor .txt has a TKxxxxxx code.
 * Uses a deterministic hash of the stripped folder name so re-importing the same folder produces
 * the exact same `NT-xxxxxx` code and does not create duplicates.
 */
export function generateFallbackNtCode(
  folderName: string,
  usedCodes?: Set<string>
): string {
  // Strip any leading numeric index prefix like "01_", "10.", "#12_" before hashing
  const normalizedSeed = (folderName || "")
    .trim()
    .replace(/^#?[0-9]{1,4}\s*[_.-]+\s*/, "")
    .toLowerCase()
    .replace(/\s+/g, " ");

  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < normalizedSeed.length; i++) {
    const ch = normalizedSeed.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + i;
    h2 = Math.imul(h2, 0x5bd1e995);
  }

  const alphabet = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const combined = Math.abs(h1) * 4096 + (Math.abs(h2) & 0xfff);
  let chars = "";
  let val = combined || Date.now();
  for (let i = 0; i < 6; i++) {
    chars += alphabet[val % alphabet.length];
    val = Math.floor(val / alphabet.length) ^ (Math.abs(h2) >> (i * 2));
  }

  let candidate = `NT-${chars}`;
  let suffix = 1;
  while (usedCodes && usedCodes.has(candidate)) {
    const tail = suffix.toString(36).toUpperCase().padStart(2, "0");
    candidate = `NT-${chars.slice(0, 4)}${tail}`;
    suffix++;
  }
  if (usedCodes) usedCodes.add(candidate);
  return candidate;
}

/**
 * Resolve real primary key `ma_tk` according to strict priority:
 * (a) Real TK code at start of folder name
 * (b) "Mã nguồn hàng: TKxxxxxx" inside .txt
 * (c) Deterministic "NT-xxxxxx"
 * Never uses numeric folder prefix as code.
 */
export function resolveRealMaTk(
  folderMaTk: string | undefined,
  txtMaTk: string | undefined,
  folderName: string,
  usedCodes?: Set<string>
): { ma_tk: string; ma_tk_source: "folder" | "txt" | "generated_nt" } {
  const cleanFolder = (folderMaTk || "").trim().toUpperCase();
  if (isValidRealMaTk(cleanFolder)) {
    if (usedCodes) usedCodes.add(cleanFolder);
    return { ma_tk: cleanFolder, ma_tk_source: "folder" };
  }

  const cleanTxt = (txtMaTk || "").trim().toUpperCase();
  if (isValidRealMaTk(cleanTxt)) {
    if (usedCodes) usedCodes.add(cleanTxt);
    return { ma_tk: cleanTxt, ma_tk_source: "txt" };
  }

  const generated = generateFallbackNtCode(folderName, usedCodes);
  return { ma_tk: generated, ma_tk_source: "generated_nt" };
}

/**
 * Check if `loai_hinh` is "Nhà phố" (floors `so_tang` are only kept for Nhà phố).
 */
export function isNhaPhoLoaiHinh(loaiHinh: string | null | undefined): boolean {
  const clean = (loaiHinh || "").trim().toLowerCase();
  return clean === "nhà phố" || clean === "nha pho";
}

/**
 * Parse area string which can be ONE number ("50") or TWO numbers separated by "-" or "/" ("67-75", "50/50"):
 * - One number (e.g. "50"): dien_tich_so = dien_tich_thuc_te = 50
 * - Two numbers (e.g. "67-75", "50/50"): first = dien_tich_so (công nhận trên sổ), second = dien_tich_thuc_te (sử dụng thực tế)
 * NEVER concatenates "67-75" into 6775!
 */
export function parseAreaNumbers(rawArea: string): ParsedAreaResult {
  if (!rawArea || !rawArea.trim()) {
    return { dien_tich: "", dien_tich_so: null, dien_tich_thuc_te: null };
  }

  const cleaned = rawArea
    .trim()
    .replace(/m2|m²/gi, "")
    .replace(/\s+/g, "");

  // Match two numbers separated by "-" or "/" (or "–")
  const dualMatch = cleaned.match(
    /^([0-9]+(?:[.,][0-9]+)?)([/\-–])([0-9]+(?:[.,][0-9]+)?)$/
  );
  if (dualMatch) {
    const num1 = parseFloat(dualMatch[1].replace(",", "."));
    const sep = dualMatch[2] === "–" ? "-" : dualMatch[2];
    const num2 = parseFloat(dualMatch[3].replace(",", "."));
    const valid1 = !isNaN(num1) && num1 > 0 ? num1 : null;
    const valid2 = !isNaN(num2) && num2 > 0 ? num2 : null;
    return {
      dien_tich: `${dualMatch[1].replace(",", ".")}${sep}${dualMatch[3].replace(",", ".")}`,
      dien_tich_so: valid1,
      dien_tich_thuc_te: valid2 ?? valid1,
    };
  }

  // Match single number
  const singleMatch = cleaned.match(/^([0-9]+(?:[.,][0-9]+)?)$/);
  if (singleMatch) {
    const num = parseFloat(singleMatch[1].replace(",", "."));
    const valid = !isNaN(num) && num > 0 ? num : null;
    return {
      dien_tich: valid !== null ? String(valid) : cleaned,
      dien_tich_so: valid,
      dien_tich_thuc_te: valid,
    };
  }

  return {
    dien_tich: cleaned,
    dien_tich_so: null,
    dien_tich_thuc_te: null,
  };
}

/**
 * Cross-check (Kiểm tra chéo):
 * - Compare (rộng x dài) ONLY against `dien_tich_thuc_te` (NEVER against `dien_tich_so`).
 *   If deviation > 30%, flag as "Cần xem lại" (`needsReview = true`).
 * - If `dien_tich_thuc_te < dien_tich_so`, attach a light check flag (`needsLightCheck = true`).
 */
export function validateAreaCrossCheck(
  dien_tich_so: number | null | undefined,
  dien_tich_thuc_te: number | null | undefined,
  rong: string | number | null | undefined,
  dai: string | number | null | undefined
): AreaCrossCheckResult {
  const dtSo =
    dien_tich_so !== null && dien_tich_so !== undefined && !isNaN(Number(dien_tich_so))
      ? Number(dien_tich_so)
      : null;
  const dtThucTe =
    dien_tich_thuc_te !== null &&
    dien_tich_thuc_te !== undefined &&
    !isNaN(Number(dien_tich_thuc_te))
      ? Number(dien_tich_thuc_te)
      : null;

  const r =
    rong !== null && rong !== undefined && String(rong).trim() !== ""
      ? parseFloat(String(rong).replace(",", "."))
      : NaN;
  const d =
    dai !== null && dai !== undefined && String(dai).trim() !== ""
      ? parseFloat(String(dai).replace(",", "."))
      : NaN;

  let needsReview = false;
  let reviewReason: string | undefined;
  let calcArea: number | null = null;
  let deviationPercent: number | null = null;

  if (!isNaN(r) && r > 0 && !isNaN(d) && d > 0) {
    calcArea = +(r * d).toFixed(2);
    if (dtThucTe !== null && dtThucTe > 0) {
      const diffRatio = Math.abs(calcArea - dtThucTe) / dtThucTe;
      deviationPercent = Math.round(diffRatio * 100);
      if (diffRatio > 0.3) {
        needsReview = true;
        reviewReason = `Cần xem lại: Rộng×Dài (${calcArea}m²) lệch ${deviationPercent}% so với DT thực tế (${dtThucTe}m²)`;
      }
    }
  }

  let needsLightCheck = false;
  let lightCheckReason: string | undefined;
  if (dtSo !== null && dtSo > 0 && dtThucTe !== null && dtThucTe > 0 && dtThucTe < dtSo) {
    needsLightCheck = true;
    lightCheckReason = `Kiểm tra: DT thực tế (${dtThucTe}m²) nhỏ hơn DT sổ (${dtSo}m²)`;
  }

  return {
    needsReview,
    needsLightCheck,
    calcArea,
    deviationPercent,
    reviewReason,
    lightCheckReason,
  };
}

/**
 * Convert Vietnamese price text (e.g. "20 tỷ", "4.8 tỷ", "4,85 tỷ", "850 triệu", "4 tỷ 8")
 * into an integer in VND.
 */
export function parsePriceToVnd(rawPrice: string): { vnd: number | null; display: string } {
  if (!rawPrice || !rawPrice.trim()) {
    return { vnd: null, display: "" };
  }
  const clean = rawPrice.trim();

  // Case 1: "4 tỷ 8" or "4 ty 85"
  const splitBillionMatch = clean.match(/([0-9]+)\s*(?:tỷ|ty|tỉ|ti)\s*([0-9]+)/i);
  if (splitBillionMatch) {
    const intPart = parseInt(splitBillionMatch[1], 10);
    const decStr = splitBillionMatch[2];
    const decVal = parseInt(decStr, 10) / Math.pow(10, decStr.length);
    const vnd = Math.round((intPart + decVal) * 1_000_000_000);
    return { vnd, display: `${intPart}.${decStr} tỷ` };
  }

  // Case 2: Standard "[number] tỷ / triệu / B"
  const match = clean.match(/([0-9]+(?:[.,][0-9]+)?)\s*(tỷ|ty|tỉ|ti|triệu|tr|b)?/i);
  if (!match) {
    return { vnd: null, display: clean };
  }

  const num = parseFloat(match[1].replace(",", "."));
  if (isNaN(num) || num <= 0) {
    return { vnd: null, display: clean };
  }

  const unit = (match[2] || "tỷ").toLowerCase();
  if (unit === "triệu" || unit === "tr") {
    const vnd = Math.round(num * 1_000_000);
    return { vnd, display: `${match[1].replace(",", ".")} triệu` };
  }

  // Default to billion (tỷ) if number is < 10000, or if already full VND integer
  if (num >= 100_000_000) {
    return {
      vnd: Math.round(num),
      display: `${+(num / 1_000_000_000).toFixed(2)} tỷ`,
    };
  }

  const vnd = Math.round(num * 1_000_000_000);
  return { vnd, display: `${match[1].replace(",", ".")} tỷ` };
}

/**
 * Format integer VND back to readable Vietnamese string (e.g. 4800000000 -> "4.8 tỷ")
 */
export function formatVndToReadable(vnd: number | null | undefined): string {
  if (vnd === null || vnd === undefined || isNaN(vnd) || vnd <= 0) return "";
  if (vnd >= 1_000_000_000) {
    const billions = +(vnd / 1_000_000_000).toFixed(3);
    return `${billions} tỷ`;
  }
  if (vnd >= 1_000_000) {
    const millions = +(vnd / 1_000_000).toFixed(1);
    return `${millions} triệu`;
  }
  return vnd.toLocaleString("vi-VN") + " đ";
}

/**
 * Protect numbers that belong to street names or plot identifiers (e.g., "đường 12", "Đường số 8",
 * "Cách Mạng Tháng 8", "Quốc lộ 13", "Vĩnh Phú 2", "Hẻm 230", "Thửa 45", "Tờ 12", "(KDC Vĩnh Phú 2)")
 * by binding them with a non-breaking space `\u00A0` so metric regexes NEVER mistake them for area or floors.
 */
function lockStreetAndAddressNumbers(text: string): string {
  if (!text) return "";

  // 1. Bind spaces inside parentheses (...)
  let locked = text.replace(/\(([^)]*)\)/g, (full) => full.replace(/\s+/g, "\u00A0"));

  // 2. Bind multi-word street prefixes + number: e.g. "đường số 12", "vĩnh phú 2", "quốc lộ 13", "tỉnh lộ 10", "khu phố 4"
  locked = locked.replace(
    /\b(đường\s+số|quốc\s+lộ|tỉnh\s+lộ|hương\s+lộ|vĩnh\s+phú|khu\s+phố|khu\s+dân\s+cư)\s+([0-9]+[A-Za-z0-9/.-]*)/gi,
    (_, p1, p2) => `${p1.replace(/\s+/g, "\u00A0")}\u00A0${p2}`
  );

  // 3. Bind single-word street/address prefixes + number: e.g. "đường 12", "tháng 8", "ql 13", "hẻm 230", "ngõ 15", "thửa 45", "tờ 12"
  locked = locked.replace(
    /\b(đường|phố|hẻm|ngõ|kiệt|số|tháng|ql|tl|đt|hl|kdc|kp|ấp|thửa|tờ|lô|block|khu|phường|quận)\s+([0-9]+[A-Za-z0-9/.-]*)/gi,
    "$1\u00A0$2"
  );

  return locked;
}

function unlockStreetAndAddressNumbers(text: string): string {
  return (text || "").replace(/\u00A0/g, " ").replace(/\s{2,}/g, " ").trim();
}

/**
 * Parse folder name according to SPEC:
 * 1. Primary key `ma_tk`:
 *    - Extract real `TKxxxxxx` (or `NT-xxxxxx`) at start of folder name.
 *    - NEVER use a numeric prefix (e.g. "01_", "10_", "#10_") of the folder name as `ma_tk`!
 * 2. Area & Dimensions:
 *    - Dual area "67-75" or "50/50" -> dien_tich_so = 67, dien_tich_thuc_te = 75 (never 6775).
 *    - Numbers in street name (e.g. "đường 12") are NEVER counted into area or floors.
 *    - `so_tang` is ONLY populated when `loai_hinh` is "Nhà phố".
 */
export function parseFolderName(folderName: string, parentFolderName = "") {
  const trimmed = folderName.trim();

  let ma_tk = "";
  let rest = trimmed;

  // Step 0: Strip any leading numeric index prefix like "01_", "10_", "#10_", "05 - "
  // Rule 1: "Không dùng tiền tố số của tên thư mục làm mã."
  const numericPrefixBeforeUnderscore = rest.match(/^#?[0-9]{1,5}\s*[_-]+\s*(.+)$/);
  if (numericPrefixBeforeUnderscore) {
    rest = numericPrefixBeforeUnderscore[1].trim();
  }

  // Step 0b: Check if `rest` starts with a real TK code (`TKxxxxxx`) or `NT-xxxxxx`
  const tkStartMatch = rest.match(/^(TK[A-Za-z0-9]{3,16}|NT-[A-Za-z0-9]{4,16})(?:[\s_.-]+|$)(.*)$/i);
  if (tkStartMatch) {
    ma_tk = tkStartMatch[1].trim().toUpperCase();
    rest = tkStartMatch[2].trim();
  } else {
    // What if there is an underscore `SOMETHING_rest`?
    const underscoreIdx = rest.indexOf("_");
    if (underscoreIdx > 0) {
      const candidatePrefix = rest.substring(0, underscoreIdx).trim();
      const afterUnderscore = rest.substring(underscoreIdx + 1).trim();
      if (isValidRealMaTk(candidatePrefix)) {
        ma_tk = candidatePrefix.toUpperCase();
        rest = afterUnderscore;
      } else if (/^#?[0-9]+$/.test(candidatePrefix)) {
        // Purely numeric prefix -> strip it, never use as ma_tk
        ma_tk = "";
        rest = afterUnderscore;
      }
    }
  }

  // 1. Extract trailing price: e.g. "20 tỷ", "4.8 tỷ", "850 triệu", "4 tỷ 8"
  let priceRaw = "";
  let beforePrice = rest;

  const priceRegex = /\s+([0-9]+(?:[.,][0-9]+)?\s*(?:tỷ|ty|tỉ|ti|triệu|tr|b)(?:\s*[0-9]+)?)\s*$/i;
  const priceMatch = rest.match(priceRegex);
  if (priceMatch && priceMatch.index !== undefined) {
    priceRaw = priceMatch[1].trim();
    beforePrice = rest.substring(0, priceMatch.index).trim();
  } else {
    // Only treat a unitless trailing number as price if there are 5 metric tokens at the end:
    // <address> <dien_tich> <so_tang> <rong> <dai> <price_number>
    const lockedCheck = lockStreetAndAddressNumbers(rest);
    const fiveMetricsAtEnd = lockedCheck.match(
      /^(.*?)\s+([0-9]+(?:[.,][0-9]+)?(?:\s*[/\-–]\s*[0-9]+(?:[.,][0-9]+)?)?)\s+([0-9]+(?:[.,][0-9]+)?|Đất|đất|C4|c4|[A-Za-zÀ-ỹ0-9_-]+)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)\s*$/i
    );
    if (fiveMetricsAtEnd) {
      beforePrice = unlockStreetAndAddressNumbers(
        `${fiveMetricsAtEnd[1]} ${fiveMetricsAtEnd[2]} ${fiveMetricsAtEnd[3]} ${fiveMetricsAtEnd[4]} ${fiveMetricsAtEnd[5]}`
      );
      priceRaw = `${fiveMetricsAtEnd[6]} tỷ`;
    }
  }

  const { vnd: gia, display: gia_text } = parsePriceToVnd(priceRaw);

  // 2. Lock street-bound numbers (like "đường 12", "Tháng 8", "Vĩnh Phú 2") before extracting trailing metrics!
  const lockedBeforePrice = lockStreetAndAddressNumbers(beforePrice);

  let lockedAddressPart = lockedBeforePrice;
  let rawAreaToken = "";
  let rawSoTang = "";
  let rong = "";
  let dai = "";

  // Full 4-metric tail: <addressPart> <dien_tich (e.g. 50, 67-75, 50/50)> <so_tang> <rong> <dai>
  const metrics4Regex =
    /^(.*?)\s+([0-9]+(?:[.,][0-9]+)?(?:\s*[/\-–]\s*[0-9]+(?:[.,][0-9]+)?)?)\s+([0-9]+(?:[.,][0-9]+)?|Đất|đất|C4|c4|Tầng|Lầu|Trệt|Biệt\s*thự|Kho|Xưởng|[A-Za-zÀ-ỹ0-9_-]+)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)$/i;

  // 3-metric tail: <addressPart> <dien_tich> <rong> <dai> (when floor was omitted)
  const metrics3Regex =
    /^(.*?)\s+([0-9]+(?:[.,][0-9]+)?(?:\s*[/\-–]\s*[0-9]+(?:[.,][0-9]+)?)?)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)$/i;

  // 2-metric tail: <addressPart> <dien_tich> <so_tang / Đất / C4>
  const metrics2Regex =
    /^(.*?)\s+([0-9]+(?:[.,][0-9]+)?(?:\s*[/\-–]\s*[0-9]+(?:[.,][0-9]+)?)?)\s+([0-9]+|Đất|đất|C4|c4)$/i;

  // 1-metric tail: <addressPart> <dien_tich (dual 67-75 or single number)>
  const metrics1Regex =
    /^(.*?)\s+([0-9]+(?:[.,][0-9]+)?(?:\s*[/\-–]\s*[0-9]+(?:[.,][0-9]+)?)?)$/i;

  const m4 = lockedBeforePrice.match(metrics4Regex);
  if (m4) {
    lockedAddressPart = m4[1].trim();
    rawAreaToken = m4[2].replace(/\s+/g, "").replace(/,/g, ".");
    rawSoTang = unlockStreetAndAddressNumbers(m4[3]);
    rong = m4[4].replace(",", ".");
    dai = m4[5].replace(",", ".");
  } else {
    const m3 = lockedBeforePrice.match(metrics3Regex);
    if (m3) {
      lockedAddressPart = m3[1].trim();
      rawAreaToken = m3[2].replace(/\s+/g, "").replace(/,/g, ".");
      rong = m3[3].replace(",", ".");
      dai = m3[4].replace(",", ".");
    } else {
      const m2 = lockedBeforePrice.match(metrics2Regex);
      if (m2) {
        lockedAddressPart = m2[1].trim();
        rawAreaToken = m2[2].replace(/\s+/g, "").replace(/,/g, ".");
        rawSoTang = unlockStreetAndAddressNumbers(m2[3]);
      } else {
        const m1 = lockedBeforePrice.match(metrics1Regex);
        if (m1) {
          lockedAddressPart = m1[1].trim();
          rawAreaToken = m1[2].replace(/\s+/g, "").replace(/,/g, ".");
        }
      }
    }
  }

  const addressPart = unlockStreetAndAddressNumbers(lockedAddressPart);

  const parsedArea = parseAreaNumbers(rawAreaToken);
  const dien_tich = parsedArea.dien_tich;
  const dien_tich_so = parsedArea.dien_tich_so;
  const dien_tich_thuc_te = parsedArea.dien_tich_thuc_te;

  // 3. Separate Branch: Land / Plot (Thửa, Tờ, Đất) vs Normal House ([số nhà].[tên đường])
  const isLandOrPlot =
    /\b(thửa|tờ|đất)\b/i.test(addressPart) || /^đất$/i.test(rawSoTang);

  let so_nha = "";
  let duong = "";
  let so_tang = "";
  let loai_hinh = "Nhà phố";

  if (isLandOrPlot) {
    let workingAddr = addressPart;
    let thuaVal = "";
    let toVal = "";

    const thuaMatch = workingAddr.match(/\bthửa(?:\s*số)?[\s.:_-]*([0-9A-Za-z/-]+)/i);
    if (thuaMatch) {
      thuaVal = thuaMatch[1].replace(/\./g, "/");
      workingAddr = workingAddr.replace(thuaMatch[0], " ").trim();
    }

    const toMatch = workingAddr.match(/\btờ(?:\s*bản\s*đồ)?(?:\s*số)?[\s.:_-]*([0-9A-Za-z/-]+)/i);
    if (toMatch) {
      toVal = toMatch[1].replace(/\./g, "/");
      workingAddr = workingAddr.replace(toMatch[0], " ").trim();
    }

    workingAddr = workingAddr
      .replace(/^(?:đất|lô\s*đất|thửa\s*đất)[\s.,_-]*/i, "")
      .replace(/^[\s.,/-]+|[\s.,/-]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    workingAddr = workingAddr.replace(/^đường\s+(?=thửa|tờ)/i, "").trim();

    const plotParts: string[] = [];
    if (thuaVal) plotParts.push(`Thửa ${thuaVal}`);
    if (toVal) plotParts.push(`Tờ ${toVal}`);

    if (plotParts.length > 0) {
      so_nha = plotParts.join(", ");
      duong = workingAddr;
    } else {
      const houseSplit = splitHouseNumberAndStreet(workingAddr);
      so_nha = houseSplit.so_nha;
      duong = houseSplit.duong;
    }

    if (rawSoTang) {
      if (/^đất$/i.test(rawSoTang) || rawSoTang === "0") {
        loai_hinh = "Đất";
        so_tang = "";
      } else if (/^[0-9]+$/.test(rawSoTang)) {
        // Even if there is a floor number on land, rule 4 says: "Số tầng chỉ khi loại hình là nhà phố."
        loai_hinh = "Nhà phố";
        so_tang = rawSoTang;
      } else {
        loai_hinh = rawSoTang;
        so_tang = "";
      }
    } else {
      loai_hinh = "Đất";
      so_tang = "";
    }
  } else {
    const houseSplit = splitHouseNumberAndStreet(addressPart);
    so_nha = houseSplit.so_nha;
    duong = houseSplit.duong;

    if (rawSoTang) {
      if (/^[0-9]+(?:[.,][0-9]+)?$/.test(rawSoTang)) {
        const cleanFloor = rawSoTang.replace(",", ".");
        if (cleanFloor === "0") {
          loai_hinh = "Đất";
          so_tang = "";
        } else {
          loai_hinh = "Nhà phố";
          so_tang = cleanFloor;
        }
      } else if (/^c4$/i.test(rawSoTang)) {
        loai_hinh = "Nhà cấp 4";
        so_tang = ""; // Số tầng chỉ khi loại hình là nhà phố
      } else {
        loai_hinh = rawSoTang;
        so_tang = ""; // Số tầng chỉ khi loại hình là nhà phố
      }
    }
  }

  // Enforce strict rule: "Số tầng chỉ khi loại hình là nhà phố."
  if (!isNhaPhoLoaiHinh(loai_hinh)) {
    so_tang = "";
  }

  const dia_chi = [so_nha, duong].filter(Boolean).join(" ").trim();

  return {
    ma_tk,
    so_nha,
    duong,
    dia_chi,
    phuong: parentFolderName || "",
    dien_tich,
    dien_tich_so,
    dien_tich_thuc_te,
    so_tang,
    rong,
    dai,
    gia,
    gia_text,
    loai_hinh,
  };
}

/**
 * Helper to split `[số nhà].[tên đường]` or `[số nhà] [tên đường]`
 */
function splitHouseNumberAndStreet(rawAddress: string): { so_nha: string; duong: string } {
  const trimmed = rawAddress.trim();
  if (!trimmed) return { so_nha: "", duong: "" };

  // Special case: "Hẻm 230 Lò Lu" or "Hẻm 220.36 Nguyễn Văn Tiết"
  const hemMatch = trimmed.match(/^(hẻm|ngõ|kiệt)\s+([0-9]+[A-Za-z0-9./-]*)\s+(.+)$/i);
  if (hemMatch) {
    const prefix = hemMatch[1].charAt(0).toUpperCase() + hemMatch[1].slice(1).toLowerCase();
    const num = hemMatch[2].replace(/\./g, "/");
    return {
      so_nha: `${prefix} ${num}`,
      duong: hemMatch[3].trim(),
    };
  }

  // If starts directly with "Đường", "Phố", "KDC", "Mặt tiền" -> no house number prefix
  if (/^(đường|phố|kdc|khu\s*dân\s*cư|mặt\s*tiền|mt|ql|quốc\s*lộ|tỉnh\s*lộ|đt)\b/i.test(trimmed)) {
    return { so_nha: "", duong: trimmed };
  }

  // Case 1: House number connected to street name by a dot or space:
  const match = trimmed.match(/^([0-9]+[A-Za-z0-9/-]*(?:\.[0-9]+[A-Za-z0-9/-]*)*)(?:\.|\s+)(.+)$/);
  if (match) {
    const rawNo = match[1].trim();
    const rawStreet = match[2].trim();
    const formattedNo = rawNo.replace(/\./g, "/");
    return {
      so_nha: formattedNo,
      duong: rawStreet,
    };
  }

  return { so_nha: "", duong: trimmed };
}

/**
 * Parse "Ngay lay" (or "Ngày lấy") date string from .txt into ISO timestamp
 */
export function parseNgayLayDate(rawDateStr: string | undefined | null): string | null {
  if (!rawDateStr || !rawDateStr.trim()) return null;
  const s = rawDateStr.trim();

  // Pattern 0: HH:mm[:ss] DD/MM/YYYY or HH:mm[:ss] DD-MM-YYYY (e.g. "20:45:13 7/7/2026")
  const timeFirstMatch = s.match(
    /^([0-9]{1,2}):([0-9]{1,2})(?::([0-9]{1,2}))?\s*(?:-\s*)?([0-9]{1,2})[/-]([0-9]{1,2})[/-]([0-9]{4})/
  );
  if (timeFirstMatch) {
    const hour = parseInt(timeFirstMatch[1], 10);
    const min = parseInt(timeFirstMatch[2], 10);
    const sec = timeFirstMatch[3] ? parseInt(timeFirstMatch[3], 10) : 0;
    const day = parseInt(timeFirstMatch[4], 10);
    const month = parseInt(timeFirstMatch[5], 10);
    const year = parseInt(timeFirstMatch[6], 10);
    const dt = new Date(year, month - 1, day, hour, min, sec);
    if (!isNaN(dt.getTime())) return dt.toISOString();
  }

  // Pattern 1: DD/MM/YYYY [HH:mm[:ss]] or DD-MM-YYYY [HH:mm[:ss]]
  const dmyMatch = s.match(
    /^([0-9]{1,2})[/-]([0-9]{1,2})[/-]([0-9]{4})(?:\s*(?:-\s*)?([0-9]{1,2}):([0-9]{1,2})(?::([0-9]{1,2}))?)?/
  );
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const min = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const sec = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    const dt = new Date(year, month - 1, day, hour, min, sec);
    if (!isNaN(dt.getTime())) return dt.toISOString();
  }

  // Pattern 2: YYYY-MM-DD or ISO
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return null;
}

/**
 * Parse the .txt file inside each property folder:
 * Reads blocks: THONG TIN NGUON HANG, TIEU DE, THONG TIN CHI TIET, MO TA
 * Also extracts:
 * - "Mã nguồn hàng: TKxxxxxx"
 * - "Ngay lay" / "Ngày lấy"
 */
export function parsePropertyTxtFile(txtContent: string) {
  const raw = (txtContent || "").replace(/\r\n/g, "\n").trim();

  const extractSection = (headerPattern: RegExp): string => {
    const match = raw.match(headerPattern);
    if (!match || match.index === undefined) return "";
    const startIdx = match.index + match[0].length;
    const rest = raw.substring(startIdx);
    const nextHeader = rest.search(
      /(?:^|\n)\s*(?:---\s*[A-ZÀ-Ỹ0-9\s]+\s*---|THONG TIN NGUON HANG|TIEU DE|THONG TIN CHI TIET|MO TA)\s*(?:\n|$)/i
    );
    return (nextHeader !== -1 ? rest.substring(0, nextHeader) : rest).trim();
  };

  const blockNguonHang = extractSection(/(?:---\s*)?THONG TIN NGUON HANG(?:\s*---)?/i);
  const blockTieuDe = extractSection(/(?:---\s*)?TIEU DE(?:\s*---)?/i);
  const blockChiTiet = extractSection(/(?:---\s*)?THONG TIN CHI TIET(?:\s*---)?/i);
  const blockMoTa = extractSection(/(?:---\s*)?MO TA(?:\s*---)?/i);

  const combinedMeta = [blockNguonHang, blockTieuDe, blockChiTiet, raw].join("\n");

  // 1. Mã TK from txt: "Mã nguồn hàng: TKxxxxxx" (or Ma nguon hang: TKxxxxxx)
  let ma_tk_txt = "";
  const codeLineMatch =
    combinedMeta.match(/(?:Mã\s*nguồn\s*hàng|Ma\s*nguon\s*hang|Mã\s*TK|Ma\s*TK)\s*:\s*(TK[A-Za-z0-9]{3,16}|NT-[A-Za-z0-9]{4,16})\b/i) ||
    blockNguonHang.match(/\b(TK[A-Za-z0-9]{4,16})\b/i);
  if (codeLineMatch && isValidRealMaTk(codeLineMatch[1])) {
    ma_tk_txt = codeLineMatch[1].trim().toUpperCase();
  }

  // 1b. Ngày lấy (Ngay lay) in .txt
  let ngay_lay_raw = "";
  let ngay_lay: string | null = null;
  const ngayLayMatch = combinedMeta.match(
    /(?:Ngày\s*lấy(?:\s*nguồn)?|Ngay\s*lay(?:\s*nguon)?|Thời\s*gian\s*lấy|Thoi\s*gian\s*lay)\s*:\s*([^\n\r]+)/i
  );
  if (ngayLayMatch) {
    ngay_lay_raw = ngayLayMatch[1].trim();
    ngay_lay = parseNgayLayDate(ngay_lay_raw);
  }

  // 2. Tên môi giới nguồn (moi_gioi_nguon)
  let moi_gioi_nguon = "";
  const brokerMatch1 = combinedMeta.match(
    /(?:^|\n)([\p{L}\s.-]{2,35})\s*:\s*(?:[^\n\r]*(?:Đầu chủ|Phó phòng|Trưởng phòng|Giám đốc|Giáp đốc|Phó giám đốc|Khối trưởng|Trưởng khối|Trợ lý|Chuyên viên|Quản lý)[^\n\r]*)/iu
  );
  if (brokerMatch1) {
    const candidate = brokerMatch1[1].trim();
    if (!/Loại nguồn|Chi tiết|Thông tin|Kênh|Trạng thái|Mã nguồn|Ngày lấy|Ngay lay/i.test(candidate)) {
      moi_gioi_nguon = candidate;
    }
  }
  if (!moi_gioi_nguon) {
    const brokerMatch2 = combinedMeta.match(
      /(?:Đầu chủ|Môi giới nguồn|Người đăng|Chuyên viên)\s*:\s*([^\n\r-]+)/i
    );
    if (brokerMatch2) {
      moi_gioi_nguon = brokerMatch2[1].trim();
    }
  }

  // 3. SĐT môi giới nguồn (sdt_nguon)
  let sdt_nguon = "";
  const phoneMatch1 = combinedMeta.match(/(\b0[0-9]{9,10}\b)\s*:\s*Facebook/i);
  const phoneMatch2 = combinedMeta.match(
    /(?:SĐT|Điện thoại|Liên hệ ĐC|Liên hệ|Hotline|Zalo)\s*[:.-]?\s*(\b0[0-9\s.]{8,12}\b)/i
  );
  const phoneMatch3 = (blockChiTiet || raw).match(/\b(0[35789][0-9]{8})\b/);

  if (phoneMatch1) {
    sdt_nguon = phoneMatch1[1].trim();
  } else if (phoneMatch2) {
    sdt_nguon = phoneMatch2[1].replace(/[\s.]/g, "");
  } else if (phoneMatch3) {
    sdt_nguon = phoneMatch3[1].trim();
  }

  // 4. Giá chào (gia_txt)
  let gia_txt: number | null = null;
  let gia_txt_display = "";
  const priceMatch = combinedMeta.match(
    /(?:Giá chào|Giá bán|Giá niêm yết|Gia chao)\s*(?:\(VNĐ\))?\s*:\s*([^\n\r]+)/i
  );
  if (priceMatch) {
    const parsedPrice = parsePriceToVnd(priceMatch[1]);
    gia_txt = parsedPrice.vnd;
    gia_txt_display = parsedPrice.display;
  }

  // 5. Hoa hồng (hoa_hong)
  let hoa_hong = "";
  const hhMatch =
    combinedMeta.match(
      /(?:Phần trăm trích thưởng|Hoa hồng|Trích thưởng|Phan tram trich thuong)\s*:\s*([0-9.,]+\s*%?)/i
    ) || combinedMeta.match(/\bhh\s*[:=]?\s*([0-9.,]+\s*%)/i);
  if (hhMatch) {
    hoa_hong = hhMatch[1].replace(/\s+/g, "");
    if (hoa_hong && !hoa_hong.endsWith("%")) hoa_hong += "%";
  }

  // 6. Tọa độ / Định vị (toa_do)
  let toa_do = "";
  const coordMatch1 = combinedMeta.match(
    /(?:Dinh vi|Định vị|Tọa độ|Toa do|Vị trí bản đồ)\s*:\s*([^\n\r]+)/i
  );
  const coordMatch2 = combinedMeta.match(
    /(https?:\/\/(?:www\.)?(?:google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)[^\s\n\r]+)/i
  );
  const coordMatch3 = combinedMeta.match(/\b([0-9]{1,2}\.[0-9]{4,},\s*[0-9]{2,3}\.[0-9]{4,})\b/);
  if (coordMatch1) {
    toa_do = coordMatch1[1].trim();
  } else if (coordMatch2) {
    toa_do = coordMatch2[1].trim();
  } else if (coordMatch3) {
    toa_do = coordMatch3[1].trim();
  }

  // 7. Trạng thái nguồn (trang_thai_nguon)
  let trang_thai_nguon: SourceStatusType = "đã bổ sung";
  const statusMatch = combinedMeta.match(/(?:Trạng thái|Trang thai)\s*:\s*([^\n\r]+)/i);
  if (statusMatch) {
    const st = statusMatch[1].toLowerCase();
    if (st.includes("đã bán") || st.includes(" hết ") || st.includes("ngừng")) {
      trang_thai_nguon = "đã bán";
    } else if (st.includes("sẵn sàng") || st.includes("ký")) {
      trang_thai_nguon = "sẵn sàng đăng";
    } else if (st.includes("thô")) {
      trang_thai_nguon = "thô";
    }
  }

  // 8. Phường / Khu vực nếu có trong txt
  let phuong_txt = "";
  const wardMatch = combinedMeta.match(
    /(?:Phường|P\.|Xã|Thị trấn)\s+([A-Za-zÀ-ỹ0-9\s]{2,25}?)(?:,|-|\n|\r|$|TP|Thị xã|Quận|Huyện|Bình Dương|HCM)/i
  );
  if (wardMatch) {
    phuong_txt = wardMatch[1].trim();
  }

  // 9. Mô tả thô (mo_ta_tho) - lưu nguyên bản nội bộ
  const mo_ta_tho = raw;

  return {
    ma_tk_txt,
    ngay_lay,
    ngay_lay_raw,
    moi_gioi_nguon,
    sdt_nguon,
    gia_txt,
    gia_txt_display,
    hoa_hong,
    toa_do,
    trang_thai_nguon,
    phuong_txt,
    mo_ta_tho,
    blockMoTa: blockMoTa || raw,
  };
}

/**
 * Check if an image file should be unselected by default
 * (filename contains Capture, screenshot, quy hoạch, or abnormal dimensions)
 */
export function inspectImageMetadata(file: File): Promise<{
  width: number;
  height: number;
  autoExcluded: boolean;
  excludeReason?: string;
  previewUrl: string;
}> {
  return new Promise((resolve) => {
    const previewUrl = URL.createObjectURL(file);
    const lowerName = file.name.toLowerCase();

    const isScreenshotName =
      /capture|screenshot|screen_shot|screen-shot|zalo_|quy_hoach|quyhoach|quy-hoach|ban_do|bando|chup_man_hinh/i.test(
        lowerName
      );

    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width || 0;
      const height = img.naturalHeight || img.height || 0;
      const ratio = height > 0 ? width / height : 1;

      if (isScreenshotName) {
        resolve({
          width,
          height,
          autoExcluded: true,
          excludeReason: "Tên file chứa Capture / Screenshot / Quy hoạch",
          previewUrl,
        });
        return;
      }

      if ((width > 0 && width < 260) || (height > 0 && height < 260)) {
        resolve({
          width,
          height,
          autoExcluded: true,
          excludeReason: `Kích thước quá nhỏ (${width}×${height}px)`,
          previewUrl,
        });
        return;
      }

      if (ratio < 0.43 || ratio > 3.0) {
        resolve({
          width,
          height,
          autoExcluded: true,
          excludeReason: `Tỷ lệ khung hình lạ (${width}×${height}px - nghi ảnh chụp màn hình)`,
          previewUrl,
        });
        return;
      }

      resolve({
        width,
        height,
        autoExcluded: false,
        previewUrl,
      });
    };

    img.onerror = () => {
      resolve({
        width: 0,
        height: 0,
        autoExcluded: isScreenshotName,
        excludeReason: isScreenshotName ? "Tên file chứa Capture / Screenshot" : undefined,
        previewUrl,
      });
    };

    img.src = previewUrl;
  });
}

/**
 * Evaluate row status based on required fields (địa chỉ, giá, diện tích), DB existence,
 * and cross-check rules.
 */
export function evaluateRowStatus(
  item: Pick<
    BulkPropertyItem,
    | "ma_tk"
    | "duong"
    | "so_nha"
    | "phuong"
    | "dien_tich"
    | "dien_tich_so"
    | "dien_tich_thuc_te"
    | "so_tang"
    | "rong"
    | "dai"
    | "gia"
    | "loai_hinh"
    | "existingRecord"
  >,
  hasParseError = false
): {
  previewStatus: BulkRowPreviewStatus;
  trang_thai_nguon: SourceStatusType;
  trang_thai_xu_ly: ProcessingStatusType;
  statusNote?: string;
  needsReview: boolean;
  needsLightCheck: boolean;
  reviewNote?: string;
  lightCheckNote?: string;
  calcArea: number | null;
  deviationPercent: number | null;
} {
  const crossCheck = validateAreaCrossCheck(
    item.dien_tich_so,
    item.dien_tich_thuc_te,
    item.rong,
    item.dai
  );

  if (hasParseError || !item.ma_tk || !item.ma_tk.trim()) {
    return {
      previewStatus: "loi_doc",
      trang_thai_nguon: "thô",
      trang_thai_xu_ly: "tho",
      statusNote: "Không trích xuất được Mã TK hợp lệ",
      needsReview: crossCheck.needsReview,
      needsLightCheck: crossCheck.needsLightCheck,
      reviewNote: crossCheck.reviewReason,
      lightCheckNote: crossCheck.lightCheckReason,
      calcArea: crossCheck.calcArea,
      deviationPercent: crossCheck.deviationPercent,
    };
  }

  const missingFields: string[] = [];
  if (!item.duong?.trim() && !item.so_nha?.trim()) {
    missingFields.push("Địa chỉ");
  }
  const hasArea =
    !!item.dien_tich?.trim() ||
    (item.dien_tich_thuc_te !== null &&
      item.dien_tich_thuc_te !== undefined &&
      Number(item.dien_tich_thuc_te) > 0) ||
    (item.dien_tich_so !== null &&
      item.dien_tich_so !== undefined &&
      Number(item.dien_tich_so) > 0);
  if (!hasArea) {
    missingFields.push("Diện tích");
  }
  if (!item.gia || item.gia <= 0) {
    missingFields.push("Giá");
  }

  const hasAllStructured =
    missingFields.length === 0 &&
    !!item.so_nha?.trim() &&
    !!item.duong?.trim() &&
    !!item.phuong?.trim() &&
    item.dien_tich_so !== null &&
    Number(item.dien_tich_so) > 0 &&
    item.dien_tich_thuc_te !== null &&
    Number(item.dien_tich_thuc_te) > 0 &&
    !!item.rong?.trim() &&
    !!item.dai?.trim() &&
    (!isNhaPhoLoaiHinh(item.loai_hinh) || !!item.so_tang?.trim());

  const computedXuLy: ProcessingStatusType =
    missingFields.length > 0 ? "tho" : hasAllStructured ? "san_sang" : "can_bo_sung";

  if (item.existingRecord) {
    return {
      previewStatus: "da_co",
      trang_thai_nguon: missingFields.length > 0 ? "thô" : "đã bổ sung",
      trang_thai_xu_ly: computedXuLy,
      statusNote:
        missingFields.length > 0
          ? `Đã có trên Supabase theo ma_tk (Thiếu: ${missingFields.join(", ")})`
          : "Đã có trên Supabase theo ma_tk",
      needsReview: crossCheck.needsReview,
      needsLightCheck: crossCheck.needsLightCheck,
      reviewNote: crossCheck.reviewReason,
      lightCheckNote: crossCheck.lightCheckReason,
      calcArea: crossCheck.calcArea,
      deviationPercent: crossCheck.deviationPercent,
    };
  }

  if (missingFields.length > 0) {
    return {
      previewStatus: "thieu_thong_tin",
      trang_thai_nguon: "thô",
      trang_thai_xu_ly: "tho",
      statusNote: `Thiếu: ${missingFields.join(", ")} (Lưu ở trạng thái Thô)`,
      needsReview: crossCheck.needsReview,
      needsLightCheck: crossCheck.needsLightCheck,
      reviewNote: crossCheck.reviewReason,
      lightCheckNote: crossCheck.lightCheckReason,
      calcArea: crossCheck.calcArea,
      deviationPercent: crossCheck.deviationPercent,
    };
  }

  return {
    previewStatus: "moi",
    trang_thai_nguon: "đã bổ sung",
    trang_thai_xu_ly: computedXuLy,
    statusNote: crossCheck.needsReview
      ? "Cần xem lại kích thước Rộng×Dài so với DT thực tế"
      : crossCheck.needsLightCheck
      ? "Kiểm tra: DT thực tế nhỏ hơn DT sổ"
      : "Đầy đủ thông tin, sẵn sàng tải lên",
    needsReview: crossCheck.needsReview,
    needsLightCheck: crossCheck.needsLightCheck,
    reviewNote: crossCheck.reviewReason,
    lightCheckNote: crossCheck.lightCheckReason,
    calcArea: crossCheck.calcArea,
    deviationPercent: crossCheck.deviationPercent,
  };
}

/**
 * Browser-side image compression for Phase 2:
 * Max long edge = 1600px, WebP (or JPEG fallback), quality ~0.80
 */
export function compressImageForBulkUpload(
  file: File,
  maxLongEdge = 1600,
  quality = 0.8
): Promise<File> {
  return new Promise((resolve) => {
    if (
      !file.type.startsWith("image/") ||
      file.type === "image/gif" ||
      file.type === "image/svg+xml"
    ) {
      resolve(file);
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      if (width > height) {
        if (width > maxLongEdge) {
          height = Math.round((height * maxLongEdge) / width);
          width = maxLongEdge;
        }
      } else {
        if (height > maxLongEdge) {
          width = Math.round((width * maxLongEdge) / height);
          height = maxLongEdge;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      const outputMime = "image/webp";
      const baseName = file.name.replace(/\.[^/.]+$/, "");

      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0) {
            const ext = blob.type === "image/webp" ? "webp" : "jpg";
            const outFile = new File([blob], `${baseName}.${ext}`, {
              type: blob.type || "image/jpeg",
              lastModified: Date.now(),
            });
            resolve(outFile);
          } else {
            canvas.toBlob(
              (jpegBlob) => {
                if (jpegBlob) {
                  resolve(
                    new File([jpegBlob], `${baseName}.jpg`, {
                      type: "image/jpeg",
                      lastModified: Date.now(),
                    })
                  );
                } else {
                  resolve(file);
                }
              },
              "image/jpeg",
              quality
            );
          }
        },
        outputMime,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}
