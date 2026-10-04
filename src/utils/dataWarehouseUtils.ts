import {
  Property,
  BusinessStatusType,
  ProcessingStatusType,
  VNguonXuatRow,
  LoaiViTriType,
  AiExtractedFieldKey,
  NguonTrichXuatMap,
} from "../types";
import { parsePropertyData } from "./propertyParser";
import {
  parseFolderName,
  parseAreaNumbers,
  parsePriceToVnd,
  formatVndToReadable,
  validateAreaCrossCheck,
} from "./bulkFolderParser";

export const LOAI_VI_TRI_OPTIONS: Array<{ value: LoaiViTriType; label: string }> = [
  { value: "mat_tien", label: "Mặt tiền (mat_tien)" },
  { value: "hem_xe_hoi", label: "Hẻm xe hơi (hem_xe_hoi)" },
  { value: "hem_xe_may", label: "Hẻm xe máy (hem_xe_may)" },
  { value: "hem", label: "Hẻm chưa rõ loại (hem)" },
];

export const LOAI_VI_TRI_LABELS: Record<LoaiViTriType, string> = {
  mat_tien: "Mặt tiền",
  hem_xe_hoi: "Hẻm xe hơi",
  hem_xe_may: "Hẻm xe máy",
  hem: "Hẻm",
};

export const HUONG_OPTIONS = [
  "Đông",
  "Tây",
  "Nam",
  "Bắc",
  "Đông Nam",
  "Đông Bắc",
  "Tây Nam",
  "Tây Bắc",
] as const;

export const PHAP_LY_PRESETS = [
  "Sổ hồng riêng",
  "Sổ hồng riêng, hoàn công",
  "Sổ chung",
  "Sổ đỏ",
  "Giấy tờ tay (vi bằng)",
] as const;

export const AI_EXTRACTED_FIELDS_META: Array<{
  key: AiExtractedFieldKey;
  label: string;
  shortLabel: string;
}> = [
  { key: "loai_vi_tri", label: "Loại vị trí (loai_vi_tri)", shortLabel: "Vị trí" },
  { key: "huong", label: "Hướng (huong)", shortLabel: "Hướng" },
  { key: "phap_ly", label: "Pháp lý (phap_ly)", shortLabel: "Pháp lý" },
  { key: "so_phong_ngu", label: "Số phòng ngủ (so_phong_ngu)", shortLabel: "PN" },
  { key: "so_wc", label: "Số WC (so_wc)", shortLabel: "WC" },
  { key: "so_nha", label: "Số nhà (so_nha)", shortLabel: "Số nhà" },
  { key: "ten_duong", label: "Tên đường (ten_duong)", shortLabel: "Tên đường" },
  { key: "duong_vao_m", label: "Đường vào m (duong_vao_m)", shortLabel: "Đường vào (m)" },
  { key: "dac_diem", label: "Đặc điểm (dac_diem)", shortLabel: "Đặc điểm" },
  { key: "hien_trang", label: "Hiện trạng (hien_trang)", shortLabel: "Hiện trạng" },
];

export const MANDATORY_WAREHOUSE_FIELDS = [
  { key: "ma_tk", label: "Mã TK" },
  { key: "so_nha", label: "Số nhà" },
  { key: "duong", label: "Đường" },
  { key: "phuong", label: "Phường" },
  { key: "dien_tich_so", label: "DT sổ" },
  { key: "dien_tich_thuc_te", label: "DT thực tế" },
  { key: "so_tang", label: "Số tầng" },
  { key: "rong", label: "Rộng" },
  { key: "dai", label: "Dài" },
  { key: "gia", label: "Giá" },
  { key: "anh", label: "Ảnh" },
] as const;

export type MandatoryFieldKey = (typeof MANDATORY_WAREHOUSE_FIELDS)[number]["key"];

export const BUSINESS_STATUS_META: Record<
  BusinessStatusType,
  { label: string; shortLabel: string; colorClass: string; badgeClass: string }
> = {
  nguon_tho: {
    label: "Nguồn thô",
    shortLabel: "Nguồn thô",
    colorClass: "text-slate-300",
    badgeClass: "bg-slate-800/90 text-slate-300 border-slate-700",
  },
  da_ky: {
    label: "Đã ký",
    shortLabel: "Đã ký",
    colorClass: "text-sky-400",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  da_ban: {
    label: "Đã bán",
    shortLabel: "Đã bán",
    colorClass: "text-rose-400",
    badgeClass: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  },
};

export const PROCESSING_STATUS_META: Record<
  ProcessingStatusType,
  { label: string; shortLabel: string; colorClass: string; badgeClass: string; dotColor: string }
> = {
  tho: {
    label: "Thô",
    shortLabel: "Thô",
    colorClass: "text-slate-400",
    badgeClass: "bg-slate-800 text-slate-300 border-slate-700",
    dotColor: "bg-slate-400",
  },
  can_bo_sung: {
    label: "Cần bổ sung",
    shortLabel: "Cần bổ sung",
    colorClass: "text-amber-400",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/35",
    dotColor: "bg-amber-400",
  },
  san_sang: {
    label: "Sẵn sàng",
    shortLabel: "Sẵn sàng",
    colorClass: "text-emerald-400",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/35",
    dotColor: "bg-emerald-400",
  },
  da_len_hometea: {
    label: "Đã lên Hometea",
    shortLabel: "Lên Hometea",
    colorClass: "text-cyan-400",
    badgeClass: "bg-cyan-500/15 text-cyan-300 border-cyan-500/35",
    dotColor: "bg-cyan-400",
  },
  da_dang_fb: {
    label: "Đã đăng FB",
    shortLabel: "Đã đăng FB",
    colorClass: "text-indigo-400",
    badgeClass: "bg-indigo-500/15 text-indigo-300 border-indigo-500/35",
    dotColor: "bg-indigo-400",
  },
};

export interface NormalizedWarehouseProperty {
  raw: Property;
  id: string;
  name: string;
  dia_chi: string;
  cleanAddress: string;
  ma_tk: string;
  raw_ma_tk: string;
  isLegacyOrMissingMaTk: boolean;
  legacyToken: string; // e.g. "#10", "#11" or ""
  suggestedMaTk: string;

  so_nha: string;
  ten_duong: string;
  duong: string;
  phuong: string;
  dien_tich: string;
  dien_tich_so: number | null;
  dien_tich_thuc_te: number | null;
  so_tang: string;
  rong: string;
  dai: string;
  gia: number | null;
  gia_text: string;
  pricePerM2Million: number | null;
  pricePerM2Text: string;
  loai_hinh: string;
  toa_do: string;

  // Các trường Bóc tách bằng AI (NULL nếu không có trong văn bản)
  loai_vi_tri: LoaiViTriType | null;
  huong: string | null;
  phap_ly: string | null;
  so_phong_ngu: number | null;
  so_wc: number | null;
  duong_vao_m: number | null;
  dac_diem: string[] | null;
  hien_trang: string | null;
  nguon_trich_xuat: NguonTrichXuatMap;
  da_boc_tach_ai: boolean;
  da_xac_nhan_ai: boolean;
  ai_manual_fields: AiExtractedFieldKey[];
  aiNeedsConfirmKeys: AiExtractedFieldKey[];
  aiNeedsConfirmCount: number;

  // Ảnh
  imageUrls: string[];
  anhArray: any[];
  imageCount: number;

  // Hai cột trạng thái chuẩn
  trang_thai_kinh_doanh: BusinessStatusType;
  trang_thai_xu_ly: ProcessingStatusType;

  // Đã xuất đâu
  da_xuat_hometea: boolean;
  da_xuat_fb: boolean;
  hometea_id: string | null;
  hometea_trang_thai: string | null;

  // Độ đầy đủ & Trường thiếu
  missingFieldKeys: MandatoryFieldKey[];
  missingFieldLabels: string[];
  thieuString: string; // comma-separated keys for v_nguon_xuat
  thieuLabelString: string; // comma-separated Vietnamese labels
  filledCount: number;
  totalMandatory: number;

  // Nội bộ (KHÔNG xuất ra v_nguon_xuat)
  moi_gioi_nguon: string;
  sdt_nguon: string;
  hoa_hong: string;
  mo_ta_tho: string;

  // Cờ kiểm tra chất lượng dữ liệu
  isAbnormalPricePerM2: boolean;
  abnormalPriceReason?: string;
  needsAreaReview: boolean;
  needsAreaLightCheck: boolean;
  areaReviewReason?: string;
}

/**
 * Làm sạch tên đường theo quy tắc:
 * - KHÔNG có chữ "Đường" dư ở đầu
 * - KHÔNG chứa số nhà, thửa, tờ, ghi chú vị trí ("kế nhà 228...", "gần...", "cách...")
 */
export function sanitizeTenDuong(raw: string | undefined | null): string {
  if (!raw) return "";
  let s = String(raw).trim();
  if (!s) return "";

  // Loại bỏ thông tin thửa đất, tờ bản đồ
  s = s
    .replace(/\bthửa(?:\s*đất)?(?:\s*số)?[\s.:_-]*[0-9A-Za-z/-]+[;,\s]*/gi, " ")
    .replace(/\btờ(?:\s*bản\s*đồ)?(?:\s*số)?[\s.:_-]*[0-9A-Za-z/-]+[;,\s]*/gi, " ")
    .replace(/(?:^|[;,\s]+)số\s+[0-9]{3,6}\s*[;,]\s*/gi, " ")
    .replace(/\((?:lô|thửa|tờ|kế|cạnh|gần)[^)]*\)/gi, " ")
    .replace(/\b(?:kế\s*nhà|cạnh\s*nhà|đối\s*diện\s*nhà|sát\s*nhà|gần\s*nhà)\s+[0-9A-Za-z./-]+\b/gi, " ")
    .trim();

  // Bỏ chữ "Đường" dư ở đầu (VD: "Đường Nguyễn Thị Chạy" -> "Nguyễn Thị Chạy", "Đường số 4" -> "Số 4")
  s = s.replace(/^đường\s+/i, "").trim();
  if (/^số\s+[0-9A-Za-z]+$/i.test(s)) {
    s = s.replace(/^số\s+/i, "Số ");
  }

  s = s.replace(/^[\s.,;/-]+|[\s.,;/-]+$/g, "").replace(/\s{2,}/g, " ").trim();
  return s;
}

/**
 * Làm sạch số nhà:
 * - Không chứa Thửa, Tờ, hoặc ghi chú "kế nhà 228..."
 */
export function sanitizeSoNha(raw: string | undefined | null): string {
  if (!raw) return "";
  let s = String(raw).trim();
  if (!s) return "";
  if (/\b(thửa|tờ|kế\s*nhà|cạnh\s*nhà|đối\s*diện)\b/i.test(s)) {
    return "";
  }
  s = s.replace(/^(?:số\s*nhà|số|hẻm|ngõ|kiệt)\s+/i, "").replace(/\./g, "/").trim();
  return s;
}

/**
 * Kiểm tra xem một chuỗi mã TK có phải là mã chuẩn (VD: TK2JLH4L, TK8899) hay là mã kiểu cũ (#10, #11) / trống
 */
export function isStandardMaTk(val?: string | null): boolean {
  if (!val) return false;
  const trimmed = val.trim().toUpperCase();
  if (!trimmed) return false;
  // Kiểu cũ như #10, #11, 10, 11 hoặc ngắn dưới 4 ký tự không bắt đầu bằng chữ cái
  if (/^#?[0-9]+$/.test(trimmed)) return false;
  if (trimmed.length < 4) return false;
  return /^[A-Z0-9_-]{4,20}$/.test(trimmed);
}

/**
 * Sinh mã TK chuẩn duy nhất cho bản ghi cũ (kiểu #10, #11 hoặc chưa có ma_tk)
 */
export function generateStandardMaTk(prop: Property, indexFallback = 1): {
  legacyToken: string;
  suggestedMaTk: string;
} {
  const rawCode = (prop.ma_tk || "").trim();
  const rawName = (prop.name || "").trim();
  const rawContent = (prop.content || "").trim();

  // Check if there is an old #number token like #10, #11
  let legacyNum = "";
  const hashMatchName = rawName.match(/(?:^|\s)#([0-9]{1,5})\b/);
  const hashMatchCode = rawCode.match(/^#?([0-9]{1,5})$/);
  const hashMatchContent = rawContent.match(/Mã nguồn hàng:\s*#?([0-9]{1,5})\b/i);

  if (hashMatchCode) {
    legacyNum = hashMatchCode[1];
  } else if (hashMatchName) {
    legacyNum = hashMatchName[1];
  } else if (hashMatchContent) {
    legacyNum = hashMatchContent[1];
  }

  const idClean = String(prop.id || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  const idSuffix = idClean.slice(0, 4) || String(indexFallback).padStart(4, "0");

  if (legacyNum) {
    const padded = legacyNum.padStart(3, "0");
    return {
      legacyToken: `#${legacyNum}`,
      suggestedMaTk: `TK${padded}${idSuffix.slice(0, 2)}`,
    };
  }

  return {
    legacyToken: rawCode || "",
    suggestedMaTk: `TK${idClean.slice(0, 6) || String(indexFallback).padStart(6, "0")}`,
  };
}

/**
 * Tách thông tin cấu trúc từ bản ghi hiện có (kết hợp cả cột trực tiếp, tên thư mục và nội dung text)
 */
export function normalizePropertyRecord(
  prop: Property,
  indexFallback = 1
): NormalizedWarehouseProperty {
  const safeProp = prop || ({} as Property);
  const parsedLegacy = parsePropertyData(safeProp);
  const rawName = (safeProp.name || "").trim();
  const rawContent = (safeProp.content || "").trim();

  // Try parsing rawName as a folder name if structured fields are missing
  const folderParsed = rawName ? parseFolderName(rawName, prop.phuong || prop.district || "") : null;

  // 1. Mã TK
  let extractedMaTk = (prop.ma_tk || "").trim().toUpperCase();
  if (!isStandardMaTk(extractedMaTk)) {
    if (isStandardMaTk(parsedLegacy.sourceCode)) {
      extractedMaTk = parsedLegacy.sourceCode.trim().toUpperCase();
    } else if (folderParsed && isStandardMaTk(folderParsed.ma_tk)) {
      extractedMaTk = folderParsed.ma_tk.trim().toUpperCase();
    }
  }

  const isLegacyOrMissingMaTk = !isStandardMaTk(extractedMaTk);
  const { legacyToken, suggestedMaTk } = generateStandardMaTk(prop, indexFallback);
  const effectiveMaTk = isLegacyOrMissingMaTk ? (extractedMaTk || legacyToken || "") : extractedMaTk;

  // 2. Địa chỉ: so_nha, ten_duong (duong), dia_chi, phuong
  const hasAiAddressExtraction =
    Boolean(prop.da_boc_tach_ai) ||
    Boolean(prop.nguon_trich_xuat && ("so_nha" in prop.nguon_trich_xuat || "ten_duong" in prop.nguon_trich_xuat));

  let so_nha = sanitizeSoNha(prop.so_nha);
  let duong = sanitizeTenDuong(prop.ten_duong || prop.duong || "");
  const rawDiaChi = String(prop.dia_chi || "").trim();
  let phuong = String(prop.phuong || prop.district || "").trim();

  // Strip trailing ", <phuong>" from dia_chi if present so duong doesn't duplicate phuong
  let cleanDiaChi = rawDiaChi;
  if (cleanDiaChi && phuong) {
    const escapedPhuong = phuong.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleanDiaChi = cleanDiaChi.replace(new RegExp(`\\s*,\\s*${escapedPhuong}\\s*$`, "i"), "").trim();
  }

  const splitDiaChiIntoParts = (addrStr: string): { so_nha: string; duong: string } => {
    const s = addrStr.trim();
    if (!s) return { so_nha: "", duong: "" };

    // Case A: Land plot "Thửa xxx, Tờ yyy [(Lô ...)] <Street>" -> so_nha = "", duong = clean street
    if (/\b(thửa|tờ)\b/i.test(s)) {
      const cleanedStreet = sanitizeTenDuong(s);
      return {
        so_nha: "",
        duong: cleanedStreet,
      };
    }

    // Case B: "Kế nhà 228 Lò Lu", "Cạnh nhà ...", "Đối diện ..." -> location note, NOT house number
    const locNoteMatch = s.match(
      /^(kế\s*nhà|cạnh\s*nhà|đối\s*diện(?:\s*nhà)?|sát\s*nhà|gần\s*nhà)\s+([0-9A-Za-z./-]+)\s+(.+)$/i
    );
    if (locNoteMatch) {
      return {
        so_nha: "",
        duong: sanitizeTenDuong(locNoteMatch[3]),
      };
    }

    // Case C: "Hẻm 230 Lò Lu", "Số 32 Đường 4"
    const prefixMatch = s.match(
      /^(hẻm|ngõ|kiệt|số|lô)\s+([0-9A-Za-z./-]+)\s+(.+)$/i
    );
    if (prefixMatch) {
      return {
        so_nha: prefixMatch[2].replace(/\./g, "/").trim(),
        duong: sanitizeTenDuong(prefixMatch[3]),
      };
    }

    // Case D: House number at start e.g. "17/21 Long Thuận" or "96.24 Nguyễn Thị Chạy"
    const numMatch = s.match(/^([0-9]+[A-Za-z0-9./-]*)\s+(.+)$/);
    if (numMatch && !/^(đường|phố|kdc|quốc\s*lộ|tỉnh\s*lộ)\b/i.test(s)) {
      return {
        so_nha: numMatch[1].replace(/\./g, "/").trim(),
        duong: sanitizeTenDuong(numMatch[2]),
      };
    }

    return { so_nha: "", duong: sanitizeTenDuong(s) };
  };

  if (!hasAiAddressExtraction) {
    if (!so_nha && !duong && cleanDiaChi) {
      const split = splitDiaChiIntoParts(cleanDiaChi);
      so_nha = split.so_nha;
      duong = split.duong;
    }

    // Fallback to folderParsed or parsedLegacy if so_nha or duong is still empty
    if ((!so_nha || !duong) && folderParsed && (folderParsed.so_nha || folderParsed.duong)) {
      if (!so_nha && folderParsed.so_nha) so_nha = sanitizeSoNha(folderParsed.so_nha);
      if (!duong && folderParsed.duong) duong = sanitizeTenDuong(folderParsed.duong);
    }

    if (!so_nha && !duong && parsedLegacy.cleanAddress) {
      const split = splitDiaChiIntoParts(parsedLegacy.cleanAddress);
      so_nha = split.so_nha;
      duong = split.duong;
    }
  } else if (!duong && cleanDiaChi) {
    const split = splitDiaChiIntoParts(cleanDiaChi);
    duong = split.duong;
  }

  // Strip trailing ", <phuong>" from duong if present
  if (duong && phuong) {
    const escapedPhuong = phuong.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    duong = sanitizeTenDuong(
      duong.replace(new RegExp(`\\s*,\\s*${escapedPhuong}\\s*$`, "i"), "").trim()
    );
  }
  const ten_duong = duong;

  // 3. Diện tích: dien_tich_so & dien_tich_thuc_te
  let dien_tich_so: number | null =
    prop.dien_tich_so !== null &&
    prop.dien_tich_so !== undefined &&
    String(prop.dien_tich_so).trim() !== "" &&
    !isNaN(Number(prop.dien_tich_so)) &&
    Number(prop.dien_tich_so) > 0
      ? Number(prop.dien_tich_so)
      : null;

  let dien_tich_thuc_te: number | null =
    prop.dien_tich_thuc_te !== null &&
    prop.dien_tich_thuc_te !== undefined &&
    String(prop.dien_tich_thuc_te).trim() !== "" &&
    !isNaN(Number(prop.dien_tich_thuc_te)) &&
    Number(prop.dien_tich_thuc_te) > 0
      ? Number(prop.dien_tich_thuc_te)
      : null;

  let rawAreaStr = (prop.dien_tich || "").trim();
  if (!rawAreaStr && folderParsed?.dien_tich) {
    rawAreaStr = folderParsed.dien_tich;
  }
  if (!rawAreaStr && parsedLegacy.area) {
    // Extract dual area if present in content e.g. "Sổ: 67m² | Thực tế: 75m²"
    const soMatch = rawContent.match(/Sổ:\s*([0-9]+(?:[.,][0-9]+)?)m²/i);
    const ttMatch = rawContent.match(/Thực tế:\s*([0-9]+(?:[.,][0-9]+)?)m²/i);
    if (soMatch && dien_tich_so === null) {
      dien_tich_so = parseFloat(soMatch[1].replace(",", "."));
    }
    if (ttMatch && dien_tich_thuc_te === null) {
      dien_tich_thuc_te = parseFloat(ttMatch[1].replace(",", "."));
    }
    const firstToken = parsedLegacy.area.split("(")[0].replace(/m2|m²/gi, "").trim();
    rawAreaStr = firstToken;
  }

  if (dien_tich_so === null || dien_tich_thuc_te === null) {
    const parsedArea = parseAreaNumbers(rawAreaStr);
    if (dien_tich_so === null) dien_tich_so = parsedArea.dien_tich_so;
    if (dien_tich_thuc_te === null) dien_tich_thuc_te = parsedArea.dien_tich_thuc_te;
  }

  const dien_tich =
    dien_tich_so !== null && dien_tich_thuc_te !== null
      ? dien_tich_so === dien_tich_thuc_te
        ? `${dien_tich_thuc_te}`
        : `${dien_tich_so}/${dien_tich_thuc_te}`
      : dien_tich_thuc_te !== null
      ? `${dien_tich_thuc_te}`
      : dien_tich_so !== null
      ? `${dien_tich_so}`
      : rawAreaStr;

  // 4. Rộng, Dài, Số tầng, Loại hình
  let rong = String(prop.rong ?? "").trim();
  let dai = String(prop.dai ?? "").trim();
  if ((!rong || !dai) && folderParsed?.rong && folderParsed?.dai) {
    if (!rong) rong = folderParsed.rong;
    if (!dai) dai = folderParsed.dai;
  }
  if ((!rong || !dai) && parsedLegacy.dimensions) {
    const dimParts = parsedLegacy.dimensions.match(
      /([0-9]+(?:[.,][0-9]+)?)\s*[x×]\s*([0-9]+(?:[.,][0-9]+)?)/i
    );
    if (dimParts) {
      if (!rong) rong = dimParts[1].replace(",", ".");
      if (!dai) dai = dimParts[2].replace(",", ".");
    }
  }

  let loai_hinh = String(prop.loai_hinh || "").trim();
  if (!loai_hinh) {
    const lhMatch = rawContent.match(/Loại hình:\s*([^\n\r]+)/i);
    if (lhMatch) loai_hinh = lhMatch[1].trim();
    else if (folderParsed?.loai_hinh) loai_hinh = folderParsed.loai_hinh;
    else loai_hinh = "Nhà phố";
  }

  let so_tang = String(prop.so_tang ?? "").trim();
  if (!so_tang && folderParsed?.so_tang) {
    so_tang = folderParsed.so_tang;
  }
  if (!so_tang && parsedLegacy.floors) {
    so_tang = parsedLegacy.floors.replace(/\s*tầng$/i, "").trim();
  }
  if (loai_hinh.toLowerCase() !== "nhà phố" && loai_hinh.toLowerCase() !== "nha pho") {
    so_tang = "";
  }

  // 5. Giá (VNĐ)
  let gia: number | null =
    prop.gia !== null && prop.gia !== undefined && !isNaN(Number(prop.gia)) && Number(prop.gia) > 0
      ? Math.round(Number(prop.gia))
      : null;

  if (!gia) {
    if (folderParsed?.gia && folderParsed.gia > 0) {
      gia = folderParsed.gia;
    } else if (parsedLegacy.price) {
      const p = parsePriceToVnd(parsedLegacy.price);
      if (p.vnd && p.vnd > 0) gia = p.vnd;
    } else if (parsedLegacy.priceNumber && parsedLegacy.priceNumber > 0) {
      gia = Math.round(parsedLegacy.priceNumber * 1_000_000_000);
    }
  }

  const gia_text = formatVndToReadable(gia) || parsedLegacy.price || "";

  // Đơn giá / m² (ưu tiên tính trên dien_tich_thuc_te, sau đó đến dien_tich_so)
  const effectiveArea = dien_tich_thuc_te || dien_tich_so || null;
  let pricePerM2Million: number | null = null;
  let pricePerM2Text = "";
  if (gia && gia > 0 && effectiveArea && effectiveArea > 0) {
    pricePerM2Million = +(gia / 1_000_000 / effectiveArea).toFixed(1);
    pricePerM2Text =
      pricePerM2Million >= 1000
        ? `${(pricePerM2Million / 1000).toFixed(2)} tỷ/m²`
        : `${pricePerM2Million} tr/m²`;
  }

  // 6. Ảnh
  const rawImageUrls = Array.isArray(prop.image_urls)
    ? prop.image_urls.filter((u) => typeof u === "string" && u.trim().length > 0)
    : [];
  const rawAnh = Array.isArray(prop.anh) ? prop.anh : [];
  const urlsFromAnh = rawAnh
    .filter((a: any) => a && typeof a.url === "string" && a.url.trim().length > 0 && !a.is_hidden)
    .map((a: any) => a.url.trim());

  const imageUrls = rawImageUrls.length > 0 ? rawImageUrls : urlsFromAnh;
  const anhArray =
    rawAnh.length > 0
      ? rawAnh
      : imageUrls.map((url, idx) => ({
          url,
          is_avatar: idx === 0,
          is_hidden: false,
        }));

  // 7. Nội bộ: moi_gioi_nguon, sdt_nguon, hoa_hong, mo_ta_tho
  const moi_gioi_nguon = (
    prop.moi_gioi_nguon ||
    parsedLegacy.leadBrokerName ||
    prop.created_by_name ||
    ""
  ).trim();
  const sdt_nguon = (prop.sdt_nguon || prop.phone || parsedLegacy.leadBrokerPhone || "").trim();
  const hoa_hong = (prop.hoa_hong || parsedLegacy.commission || "").trim();

  let mo_ta_tho = (prop.mo_ta_tho || "").trim();
  if (!mo_ta_tho) {
    const moTaSplit = rawContent.split(/---\s*MO TA\s*---/i);
    if (moTaSplit.length > 1) {
      mo_ta_tho = moTaSplit[1].trim();
    } else {
      mo_ta_tho = parsedLegacy.cleanDescription || rawContent;
    }
  }

  const toa_do = (prop.toa_do || parsedLegacy.googleMapsUrl || prop.website_link || "").trim();

  // 7.5. Các trường Bóc tách bằng AI (Chỉ lấy từ dữ liệu đã bóc tách / sửa tay, không tự đoán)
  const nguon_trich_xuat: NguonTrichXuatMap =
    prop.nguon_trich_xuat && typeof prop.nguon_trich_xuat === "object"
      ? { ...prop.nguon_trich_xuat }
      : {};

  const da_boc_tach_ai = Boolean(
    prop.da_boc_tach_ai || Object.keys(nguon_trich_xuat).length > 0
  );
  const da_xac_nhan_ai = Boolean(prop.da_xac_nhan_ai);
  const ai_manual_fields: AiExtractedFieldKey[] = Array.isArray(prop.ai_manual_fields)
    ? prop.ai_manual_fields
    : [];

  const validLoaiViTri: LoaiViTriType[] = [
    "mat_tien",
    "hem_xe_hoi",
    "hem_xe_may",
    "hem",
  ];
  const rawLoaiViTri =
    prop.loai_vi_tri ?? nguon_trich_xuat.loai_vi_tri?.gia_tri ?? null;
  const loai_vi_tri: LoaiViTriType | null =
    rawLoaiViTri && validLoaiViTri.includes(rawLoaiViTri as LoaiViTriType)
      ? (rawLoaiViTri as LoaiViTriType)
      : null;

  const rawHuong = prop.huong ?? nguon_trich_xuat.huong?.gia_tri ?? null;
  const huong: string | null =
    rawHuong && String(rawHuong).trim() ? String(rawHuong).trim() : null;

  const rawPhapLy = prop.phap_ly ?? nguon_trich_xuat.phap_ly?.gia_tri ?? null;
  const phap_ly: string | null =
    rawPhapLy && String(rawPhapLy).trim() ? String(rawPhapLy).trim() : null;

  const rawPn =
    prop.so_phong_ngu !== undefined
      ? prop.so_phong_ngu
      : nguon_trich_xuat.so_phong_ngu?.gia_tri;
  const so_phong_ngu: number | null =
    rawPn !== null &&
    rawPn !== undefined &&
    String(rawPn).trim() !== "" &&
    !isNaN(Number(rawPn)) &&
    Number(rawPn) > 0
      ? Math.round(Number(rawPn))
      : null;

  const rawWc =
    prop.so_wc !== undefined
      ? prop.so_wc
      : nguon_trich_xuat.so_wc?.gia_tri;
  const so_wc: number | null =
    rawWc !== null &&
    rawWc !== undefined &&
    String(rawWc).trim() !== "" &&
    !isNaN(Number(rawWc)) &&
    Number(rawWc) > 0
      ? Math.round(Number(rawWc))
      : null;

  const rawDuongVao =
    prop.duong_vao_m !== undefined
      ? prop.duong_vao_m
      : nguon_trich_xuat.duong_vao_m?.gia_tri;
  const duong_vao_m: number | null =
    rawDuongVao !== null &&
    rawDuongVao !== undefined &&
    String(rawDuongVao).trim() !== "" &&
    !isNaN(Number(rawDuongVao)) &&
    Number(rawDuongVao) > 0
      ? Number(rawDuongVao)
      : null;

  const rawDacDiem =
    prop.dac_diem !== undefined
      ? prop.dac_diem
      : nguon_trich_xuat.dac_diem?.gia_tri;
  const dac_diem: string[] | null =
    Array.isArray(rawDacDiem) && rawDacDiem.filter(Boolean).length > 0
      ? rawDacDiem.map((d) => String(d).trim()).filter(Boolean)
      : null;

  const rawHienTrang =
    prop.hien_trang !== undefined
      ? prop.hien_trang
      : nguon_trich_xuat.hien_trang?.gia_tri;
  const hien_trang: string | null =
    rawHienTrang && String(rawHienTrang).trim()
      ? String(rawHienTrang).trim()
      : null;

  // Xác định các trường AI có giá trị NULL hoặc tin_cay === 'thap' (chưa được xác nhận/sửa tay)
  const aiFieldValuesMap: Record<AiExtractedFieldKey, any> = {
    loai_vi_tri,
    huong,
    phap_ly,
    so_phong_ngu,
    so_wc,
    so_nha: so_nha || null,
    ten_duong: ten_duong || null,
    duong_vao_m,
    dac_diem,
    hien_trang,
  };

  const aiNeedsConfirmKeys: AiExtractedFieldKey[] = [];
  if (da_boc_tach_ai && !da_xac_nhan_ai) {
    for (const meta of AI_EXTRACTED_FIELDS_META) {
      const k = meta.key;
      const ev = nguon_trich_xuat[k];
      if (ev?.da_sua_tay || ev?.da_xac_nhan || ai_manual_fields.includes(k)) {
        continue;
      }
      const val = aiFieldValuesMap[k];
      const isNullOrEmpty =
        val === null ||
        val === undefined ||
        val === "" ||
        (Array.isArray(val) && val.length === 0);
      if (isNullOrEmpty || !ev || ev.tin_cay === "thap") {
        aiNeedsConfirmKeys.push(k);
      }
    }
  }

  // 8. Tính toán 11 trường bắt buộc chuẩn & cột `thieu`
  const missingFieldKeys: MandatoryFieldKey[] = [];
  const missingFieldLabels: string[] = [];

  const checkMissing = (key: MandatoryFieldKey, isPresent: boolean) => {
    if (!isPresent) {
      missingFieldKeys.push(key);
      const found = MANDATORY_WAREHOUSE_FIELDS.find((f) => f.key === key);
      if (found) missingFieldLabels.push(found.label);
    }
  };

  const isNhaPho =
    loai_hinh.toLowerCase() === "nhà phố" || loai_hinh.toLowerCase() === "nha pho";

  checkMissing("ma_tk", !isLegacyOrMissingMaTk);
  checkMissing("so_nha", !!so_nha);
  checkMissing("duong", !!duong);
  checkMissing("phuong", !!phuong);
  checkMissing("dien_tich_so", dien_tich_so !== null && dien_tich_so > 0);
  checkMissing("dien_tich_thuc_te", dien_tich_thuc_te !== null && dien_tich_thuc_te > 0);
  checkMissing("so_tang", !isNhaPho || !!so_tang);
  checkMissing("rong", !!rong);
  checkMissing("dai", !!dai);
  checkMissing("gia", gia !== null && gia > 0);
  checkMissing("anh", imageUrls.length > 0);

  const totalMandatory = MANDATORY_WAREHOUSE_FIELDS.length; // 11
  const filledCount = totalMandatory - missingFieldKeys.length;

  // 9. Ánh xạ 2 cột trạng thái: trang_thai_kinh_doanh & trang_thai_xu_ly
  let trang_thai_kinh_doanh: BusinessStatusType = "nguon_tho";
  if (
    prop.trang_thai_kinh_doanh &&
    ["nguon_tho", "da_ky", "da_ban"].includes(prop.trang_thai_kinh_doanh)
  ) {
    trang_thai_kinh_doanh = prop.trang_thai_kinh_doanh;
  } else if (prop.status === "da_ban" || prop.trang_thai_nguon === "đã bán") {
    trang_thai_kinh_doanh = "da_ban";
  } else if (prop.status === "da_ky" || prop.status === "da_chot") {
    trang_thai_kinh_doanh = "da_ky";
  } else {
    trang_thai_kinh_doanh = "nguon_tho";
  }

  let da_xuat_hometea = !!(prop.da_xuat_hometea || prop.da_len_hometea);
  let da_xuat_fb = !!(prop.da_xuat_fb || prop.da_dang_fb);

  let trang_thai_xu_ly: ProcessingStatusType = "tho";
  if (
    prop.trang_thai_xu_ly &&
    ["tho", "can_bo_sung", "san_sang", "da_len_hometea", "da_dang_fb"].includes(
      prop.trang_thai_xu_ly
    )
  ) {
    trang_thai_xu_ly = prop.trang_thai_xu_ly;
    if (trang_thai_xu_ly === "da_len_hometea") da_xuat_hometea = true;
    if (trang_thai_xu_ly === "da_dang_fb") da_xuat_fb = true;
    // Quy tắc bắt buộc: Tin đã bóc tách AI nhưng chưa được người dùng xác nhận thì chưa chuyển sang 'san_sang'
    if (da_boc_tach_ai && !da_xac_nhan_ai && trang_thai_xu_ly === "san_sang") {
      trang_thai_xu_ly = "can_bo_sung";
    }
  } else {
    const hasCoreThree =
      (!!duong || !!so_nha) &&
      gia !== null &&
      gia > 0 &&
      ((dien_tich_thuc_te !== null && dien_tich_thuc_te > 0) ||
        (dien_tich_so !== null && dien_tich_so > 0));

    if (da_xuat_fb) {
      trang_thai_xu_ly = "da_dang_fb";
    } else if (da_xuat_hometea) {
      trang_thai_xu_ly = "da_len_hometea";
    } else if (da_xac_nhan_ai) {
      trang_thai_xu_ly = "san_sang";
    } else if (hasCoreThree || prop.trang_thai_nguon === "đã bổ sung" || da_boc_tach_ai) {
      trang_thai_xu_ly = "can_bo_sung";
    } else {
      trang_thai_xu_ly = "tho";
    }
  }

  // 10. Kiểm tra chất lượng dữ liệu (Giá/m2 bất thường & Lệch diện tích)
  let isAbnormalPricePerM2 = false;
  let abnormalPriceReason: string | undefined;
  if (pricePerM2Million !== null) {
    if (pricePerM2Million < 15) {
      isAbnormalPricePerM2 = true;
      abnormalPriceReason = `Đơn giá quá thấp (${pricePerM2Text} < 15 tr/m²)`;
    } else if (pricePerM2Million > 450) {
      isAbnormalPricePerM2 = true;
      abnormalPriceReason = `Đơn giá quá cao (${pricePerM2Text} > 450 tr/m²)`;
    }
  }

  const areaCheck = validateAreaCrossCheck(dien_tich_so, dien_tich_thuc_te, rong, dai);

  const fullAddress =
    prop.dia_chi ||
    [so_nha, duong || ten_duong, phuong].filter(Boolean).join(", ") ||
    prop.name ||
    "";
  const displayName =
    prop.name ||
    [so_nha, duong || ten_duong].filter(Boolean).join(" ") ||
    fullAddress ||
    effectiveMaTk ||
    "Tin Bất Động Sản";
  const cleanAddr =
    [so_nha, duong || ten_duong].filter(Boolean).join(" ") ||
    fullAddress ||
    displayName;

  return {
    raw: prop,
    id: prop.id || `temp-${indexFallback}`,
    name: displayName,
    dia_chi: fullAddress,
    cleanAddress: cleanAddr,
    ma_tk: effectiveMaTk,
    raw_ma_tk: prop.ma_tk || "",
    isLegacyOrMissingMaTk,
    legacyToken,
    suggestedMaTk,
    so_nha,
    ten_duong,
    duong,
    phuong,
    dien_tich,
    dien_tich_so,
    dien_tich_thuc_te,
    so_tang,
    rong,
    dai,
    gia,
    gia_text,
    pricePerM2Million,
    pricePerM2Text,
    loai_hinh,
    toa_do,
    loai_vi_tri,
    huong,
    phap_ly,
    so_phong_ngu,
    so_wc,
    duong_vao_m,
    dac_diem,
    hien_trang,
    nguon_trich_xuat,
    da_boc_tach_ai,
    da_xac_nhan_ai,
    ai_manual_fields,
    aiNeedsConfirmKeys,
    aiNeedsConfirmCount: aiNeedsConfirmKeys.length,
    imageUrls,
    anhArray,
    imageCount: imageUrls.length,
    trang_thai_kinh_doanh,
    trang_thai_xu_ly,
    da_xuat_hometea,
    da_xuat_fb,
    hometea_id: prop.hometea_id || null,
    hometea_trang_thai: prop.hometea_trang_thai || "chua_dang",
    missingFieldKeys,
    missingFieldLabels,
    thieuString: missingFieldKeys.join(", "),
    thieuLabelString: missingFieldLabels.join(", "),
    filledCount,
    totalMandatory,
    moi_gioi_nguon,
    sdt_nguon,
    hoa_hong,
    mo_ta_tho,
    isAbnormalPricePerM2,
    abnormalPriceReason,
    needsAreaReview: areaCheck.needsReview,
    needsAreaLightCheck: areaCheck.needsLightCheck,
    areaReviewReason: areaCheck.reviewReason || areaCheck.lightCheckReason,
  };
}

/**
 * Chuyển đổi sang dòng chuẩn của VIEW `v_nguon_xuat` / Xuất Hometea
 * Đủ mọi dòng, KHÔNG lọc ngầm, KHÔNG chứa sdt_nguon, moi_gioi_nguon, mo_ta_tho
 * Hướng nếu NULL thì xuất sang Hometea thành "Không xác định"
 */
export function toVNguonXuatRow(norm: NormalizedWarehouseProperty): VNguonXuatRow {
  return {
    ma_tk: norm.isLegacyOrMissingMaTk ? norm.suggestedMaTk : norm.ma_tk,
    so_nha: norm.so_nha || null,
    ten_duong: norm.ten_duong || norm.duong || null,
    duong: norm.ten_duong || norm.duong,
    phuong: norm.phuong,
    dien_tich_so: norm.dien_tich_so,
    dien_tich_thuc_te: norm.dien_tich_thuc_te,
    so_tang: norm.so_tang,
    rong: norm.rong,
    dai: norm.dai,
    gia: norm.gia,
    loai_vi_tri: norm.loai_vi_tri,
    huong: norm.huong || "Không xác định",
    phap_ly: norm.phap_ly,
    so_phong_ngu: norm.so_phong_ngu,
    so_wc: norm.so_wc,
    duong_vao_m: norm.duong_vao_m,
    dac_diem: norm.dac_diem,
    hien_trang: norm.hien_trang,
    anh: norm.anhArray,
    trang_thai_xu_ly: norm.trang_thai_xu_ly,
    thieu: norm.thieuString,
  };
}
