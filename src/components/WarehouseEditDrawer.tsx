import React, { useState, useEffect } from "react";
import {
  X,
  Save,
  AlertCircle,
  CheckCircle2,
  Lock,
  MapPin,
  Ruler,
  DollarSign,
  Image as ImageIcon,
  FileText,
  Send,
  Share2,
  Code2,
  Trash2,
  Plus,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";
import {
  Property,
  BusinessStatusType,
  ProcessingStatusType,
  DISTRICT_OPTIONS,
  AuthUser,
} from "../types";
import {
  NormalizedWarehouseProperty,
  BUSINESS_STATUS_META,
  PROCESSING_STATUS_META,
  toVNguonXuatRow,
  isStandardMaTk,
} from "../utils/dataWarehouseUtils";
import {
  parseAreaNumbers,
  parsePriceToVnd,
  formatVndToReadable,
} from "../utils/bulkFolderParser";
import SmartImage from "./SmartImage";

interface WarehouseEditDrawerProps {
  item: NormalizedWarehouseProperty | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Property>) => Promise<void>;
  onDelete?: (prop: Property) => void;
  onExportSingle?: (
    item: NormalizedWarehouseProperty,
    target: "hometea" | "post_writer"
  ) => Promise<void>;
  currentUser?: AuthUser | null;
}

export default function WarehouseEditDrawer({
  item,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onExportSingle,
  currentUser,
}: WarehouseEditDrawerProps) {
  const [maTk, setMaTk] = useState("");
  const [soNha, setSoNha] = useState("");
  const [duong, setDuong] = useState("");
  const [phuong, setPhuong] = useState("");
  const [dienTichSo, setDienTichSo] = useState<string>("");
  const [dienTichThucTe, setDienTichThucTe] = useState<string>("");
  const [soTang, setSoTang] = useState("");
  const [rong, setRong] = useState("");
  const [dai, setDai] = useState("");
  const [giaInput, setGiaInput] = useState("");
  const [giaVnd, setGiaVnd] = useState<number | null>(null);
  const [loaiHinh, setLoaiHinh] = useState("Nhà phố");
  const [toaDo, setToaDo] = useState("");

  const [trangThaiKinhDoanh, setTrangThaiKinhDoanh] =
    useState<BusinessStatusType>("nguon_tho");
  const [trangThaiXuLy, setTrangThaiXuLy] =
    useState<ProcessingStatusType>("tho");
  const [daXuatHometea, setDaXuatHometea] = useState(false);
  const [daXuatFb, setDaXuatFb] = useState(false);

  // Phần Nội bộ (KHÔNG xuất ra v_nguon_xuat)
  const [moiGioiNguon, setMoiGioiNguon] = useState("");
  const [sdtNguon, setSdtNguon] = useState("");
  const [hoaHong, setHoaHong] = useState("");
  const [moTaTho, setMoTaTho] = useState("");

  // Ảnh
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showViewPreview, setShowViewPreview] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const isViewer = currentUser?.role === "viewer";

  useEffect(() => {
    if (!item) return;
    setMaTk(item.ma_tk || "");
    setSoNha(item.so_nha || "");
    setDuong(item.duong || "");
    setPhuong(item.phuong || "");
    setDienTichSo(
      item.dien_tich_so !== null && item.dien_tich_so !== undefined
        ? String(item.dien_tich_so)
        : ""
    );
    setDienTichThucTe(
      item.dien_tich_thuc_te !== null && item.dien_tich_thuc_te !== undefined
        ? String(item.dien_tich_thuc_te)
        : ""
    );
    setSoTang(item.so_tang || "");
    setRong(item.rong || "");
    setDai(item.dai || "");
    setGiaVnd(item.gia);
    setGiaInput(
      item.gia && item.gia > 0
        ? formatVndToReadable(item.gia) || String(item.gia)
        : ""
    );
    setLoaiHinh(item.loai_hinh || "Nhà phố");
    setToaDo(item.toa_do || "");
    setTrangThaiKinhDoanh(item.trang_thai_kinh_doanh);
    setTrangThaiXuLy(item.trang_thai_xu_ly);
    setDaXuatHometea(item.da_xuat_hometea);
    setDaXuatFb(item.da_xuat_fb);
    setMoiGioiNguon(item.moi_gioi_nguon || "");
    setSdtNguon(item.sdt_nguon || "");
    setHoaHong(item.hoa_hong || "");
    setMoTaTho(item.mo_ta_tho || "");
    setImageUrls(item.imageUrls || []);
    setSaveMessage(null);
    setSaveError(null);
  }, [item]);

  if (!isOpen || !item) return null;

  const handlePriceInputChange = (val: string) => {
    setGiaInput(val);
    const trimmed = val.trim();
    if (!trimmed) {
      setGiaVnd(null);
      return;
    }
    if (/^[0-9]{7,15}$/.test(trimmed.replace(/[.,\s]/g, ""))) {
      const rawNum = Number(trimmed.replace(/[.,\s]/g, ""));
      if (!isNaN(rawNum) && rawNum > 0) {
        setGiaVnd(rawNum);
        return;
      }
    }
    const parsed = parsePriceToVnd(trimmed);
    if (parsed.vnd && parsed.vnd > 0) {
      setGiaVnd(parsed.vnd);
    } else {
      const floatVal = parseFloat(trimmed.replace(",", "."));
      if (!isNaN(floatVal) && floatVal > 0) {
        setGiaVnd(
          floatVal < 1000
            ? Math.round(floatVal * 1_000_000_000)
            : Math.round(floatVal)
        );
      }
    }
  };

  // Kiểm tra các ô bắt buộc còn thiếu để tô đỏ trực tiếp
  const isMaTkMissing = !isStandardMaTk(maTk);
  const isSoNhaMissing = !soNha.trim();
  const isDuongMissing = !duong.trim();
  const isPhuongMissing = !phuong.trim();
  const numDtSo =
    dienTichSo.trim() !== "" && !isNaN(Number(dienTichSo))
      ? Number(dienTichSo)
      : null;
  const numDtThucTe =
    dienTichThucTe.trim() !== "" && !isNaN(Number(dienTichThucTe))
      ? Number(dienTichThucTe)
      : null;
  const isDtSoMissing = numDtSo === null || numDtSo <= 0;
  const isDtThucTeMissing = numDtThucTe === null || numDtThucTe <= 0;
  const isSoTangMissing = !soTang.trim();
  const isRongMissing = !rong.trim();
  const isDaiMissing = !dai.trim();
  const isGiaMissing = !giaVnd || giaVnd <= 0;
  const isAnhMissing = imageUrls.length === 0;

  const currentMissingLabels: string[] = [];
  if (isMaTkMissing) currentMissingLabels.push("Mã TK");
  if (isSoNhaMissing) currentMissingLabels.push("Số nhà");
  if (isDuongMissing) currentMissingLabels.push("Đường");
  if (isPhuongMissing) currentMissingLabels.push("Phường");
  if (isDtSoMissing) currentMissingLabels.push("DT sổ");
  if (isDtThucTeMissing) currentMissingLabels.push("DT thực tế");
  if (isSoTangMissing) currentMissingLabels.push("Số tầng");
  if (isRongMissing) currentMissingLabels.push("Rộng");
  if (isDaiMissing) currentMissingLabels.push("Dài");
  if (isGiaMissing) currentMissingLabels.push("Giá");
  if (isAnhMissing) currentMissingLabels.push("Ảnh");

  const filledNow = 11 - currentMissingLabels.length;

  const fieldInputClass = (isMissing: boolean) =>
    `w-full px-3 py-2 rounded-lg text-xs font-medium transition-all outline-none border ${
      isMissing
        ? "border-rose-500/80 bg-rose-950/30 text-rose-100 placeholder-rose-400/60 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/25"
        : "border-slate-700/80 bg-slate-900/90 text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30"
    }`;

  const handleSaveChanges = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isViewer) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const cleanMaTk = maTk.trim().toUpperCase();
      const combinedDienTich =
        numDtSo !== null && numDtThucTe !== null
          ? numDtSo === numDtThucTe
            ? `${numDtThucTe}`
            : `${numDtSo}/${numDtThucTe}`
          : numDtThucTe !== null
          ? `${numDtThucTe}`
          : numDtSo !== null
          ? `${numDtSo}`
          : "";

      const displayTitle = [
        cleanMaTk ? `${cleanMaTk}_` : "",
        [soNha.trim(), duong.trim()].filter(Boolean).join(" "),
        combinedDienTich,
        soTang.trim(),
        rong.trim(),
        dai.trim(),
        formatVndToReadable(giaVnd),
      ]
        .filter(Boolean)
        .join(" ")
        .replace("_ ", "_");

      const anhPayload = imageUrls.map((url, idx) => ({
        url,
        is_avatar: idx === 0,
        is_hidden: false,
      }));

      const updates: Partial<Property> = {
        name: displayTitle || item.raw.name,
        phone: sdtNguon.trim(),
        district: phuong.trim(),
        ma_tk: cleanMaTk,
        so_nha: soNha.trim(),
        duong: duong.trim(),
        phuong: phuong.trim(),
        dien_tich: combinedDienTich,
        dien_tich_so: numDtSo,
        dien_tich_thuc_te: numDtThucTe,
        so_tang: soTang.trim(),
        rong: rong.trim(),
        dai: dai.trim(),
        gia: giaVnd,
        loai_hinh: loaiHinh.trim(),
        toa_do: toaDo.trim(),
        website_link: toaDo.trim().startsWith("http")
          ? toaDo.trim()
          : item.raw.website_link,
        trang_thai_kinh_doanh: trangThaiKinhDoanh,
        trang_thai_xu_ly: trangThaiXuLy,
        da_xuat_hometea:
          daXuatHometea || trangThaiXuLy === "da_len_hometea",
        da_xuat_fb: daXuatFb || trangThaiXuLy === "da_dang_fb",
        moi_gioi_nguon: moiGioiNguon.trim(),
        sdt_nguon: sdtNguon.trim(),
        hoa_hong: hoaHong.trim(),
        mo_ta_tho: moTaTho,
        image_urls: imageUrls,
        anh: anhPayload,
      };

      await onSave(item.id, updates);
      setSaveMessage("Đã lưu chuẩn hóa bản ghi thành công!");
      setTimeout(() => setSaveMessage(null), 2800);
    } catch (err: any) {
      setSaveError(err.message || "Lỗi khi lưu bản ghi.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddImage = () => {
    const trimmed = newImageUrl.trim();
    if (!trimmed) return;
    if (!imageUrls.includes(trimmed)) {
      setImageUrls((prev) => [...prev, trimmed]);
    }
    setNewImageUrl("");
  };

  const handleRemoveImage = (idx: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSetPrimaryImage = (idx: number) => {
    if (idx === 0) return;
    setImageUrls((prev) => {
      const copy = [...prev];
      const [chosen] = copy.splice(idx, 1);
      return [chosen, ...copy];
    });
  };

  const vNguonXuatPreview = toVNguonXuatRow({
    ...item,
    ma_tk: maTk.trim().toUpperCase() || item.suggestedMaTk,
    isLegacyOrMissingMaTk: !isStandardMaTk(maTk),
    so_nha: soNha.trim(),
    duong: duong.trim(),
    phuong: phuong.trim(),
    dien_tich_so: numDtSo,
    dien_tich_thuc_te: numDtThucTe,
    so_tang: soTang.trim(),
    rong: rong.trim(),
    dai: dai.trim(),
    gia: giaVnd,
    anhArray: imageUrls.map((url, idx) => ({
      url,
      is_avatar: idx === 0,
      is_hidden: false,
    })),
    trang_thai_xu_ly: trangThaiXuLy,
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      {/* Click outside backdrop */}
      <div className="flex-1" onClick={onClose} />

      {/* Right Slide-Over Panel */}
      <div className="w-full max-w-2xl bg-slate-950 border-l border-slate-800 h-full flex flex-col shadow-2xl text-slate-100 overflow-hidden">
        {/* Top Sticky Header */}
        <div className="px-5 py-4 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-300 font-mono text-xs font-bold">
                {maTk || item.suggestedMaTk}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                  BUSINESS_STATUS_META[trangThaiKinhDoanh].badgeClass
                }`}
              >
                {BUSINESS_STATUS_META[trangThaiKinhDoanh].label}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                  PROCESSING_STATUS_META[trangThaiXuLy].badgeClass
                }`}
              >
                {PROCESSING_STATUS_META[trangThaiXuLy].label}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${
                  currentMissingLabels.length === 0
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : "bg-rose-500/15 text-rose-300 border-rose-500/35"
                }`}
              >
                Độ đầy đủ: {filledNow}/11
              </span>
            </div>
            <h3 className="text-sm font-bold text-slate-100 truncate mt-1">
              {[soNha, duong, phuong].filter(Boolean).join(", ") ||
                item.raw.name ||
                "Chỉnh sửa bản ghi kho chuẩn"}
            </h3>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 cursor-pointer shrink-0"
            title="Đóng ngăn chỉnh sửa"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Missing Fields Alert Banner */}
        {currentMissingLabels.length > 0 ? (
          <div className="px-5 py-2.5 bg-rose-950/50 border-b border-rose-500/30 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                Thiếu <b>{currentMissingLabels.length}</b> trường bắt buộc (đã tô đỏ):{" "}
                <span className="font-semibold text-rose-300">
                  {currentMissingLabels.join(", ")}
                </span>
              </span>
            </div>
            {currentMissingLabels.length > 0 && trangThaiXuLy === "san_sang" && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-semibold shrink-0">
                Cần điền đủ để xuất chuẩn
              </span>
            )}
          </div>
        ) : (
          <div className="px-5 py-2 bg-emerald-950/40 border-b border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300 shrink-0">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Đầy đủ 11/11 trường bắt buộc — Đạt chuẩn xuất Hometea & Post Writer.</span>
            </div>
            {trangThaiXuLy !== "san_sang" &&
              trangThaiXuLy !== "da_len_hometea" &&
              trangThaiXuLy !== "da_dang_fb" && (
                <button
                  type="button"
                  onClick={() => setTrangThaiXuLy("san_sang")}
                  className="px-2 py-0.5 rounded bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-[11px] cursor-pointer"
                >
                  Chuyển sang Sẵn sàng
                </button>
              )}
          </div>
        )}

        {/* Scrollable Form Body */}
        <form
          onSubmit={handleSaveChanges}
          className="flex-1 overflow-y-auto p-5 space-y-6"
        >
          {/* GROUP 1: ĐỊNH DANH & 2 CỘT TRẠNG THÁI */}
          <section className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                1. Mã TK & Hai cột trạng thái
              </h4>
              {isMaTkMissing && (
                <button
                  type="button"
                  onClick={() => setMaTk(item.suggestedMaTk)}
                  className="text-[11px] px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold cursor-pointer"
                >
                  Gán mã chuẩn: {item.suggestedMaTk}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Mã TK (Khóa chuẩn) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={maTk}
                  onChange={(e) => setMaTk(e.target.value.toUpperCase())}
                  placeholder="VD: TK2JLH4L"
                  disabled={isViewer}
                  className={`${fieldInputClass(isMaTkMissing)} font-mono uppercase`}
                />
                {item.legacyToken && isMaTkMissing && (
                  <p className="text-[10px] text-rose-400 mt-1">
                    Mã kiểu cũ ({item.legacyToken}) — cần đổi sang mã TK chuẩn
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Trạng thái kinh doanh
                </label>
                <select
                  value={trangThaiKinhDoanh}
                  onChange={(e) =>
                    setTrangThaiKinhDoanh(e.target.value as BusinessStatusType)
                  }
                  disabled={isViewer}
                  className={fieldInputClass(false)}
                >
                  <option value="nguon_tho">nguon_tho (Nguồn thô)</option>
                  <option value="da_ky">da_ky (Đã ký)</option>
                  <option value="da_ban">da_ban (Đã bán)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Trạng thái xử lý
                </label>
                <select
                  value={trangThaiXuLy}
                  onChange={(e) =>
                    setTrangThaiXuLy(e.target.value as ProcessingStatusType)
                  }
                  disabled={isViewer}
                  className={fieldInputClass(false)}
                >
                  <option value="tho">tho (Thô)</option>
                  <option value="can_bo_sung">can_bo_sung (Cần bổ sung)</option>
                  <option value="san_sang">san_sang (Sẵn sàng)</option>
                  <option value="da_len_hometea">
                    da_len_hometea (Đã lên Hometea)
                  </option>
                  <option value="da_dang_fb">da_dang_fb (Đã đăng FB)</option>
                </select>
              </div>
            </div>

            {/* Kênh đã xuất */}
            <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-4 text-xs">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={daXuatHometea || trangThaiXuLy === "da_len_hometea"}
                    onChange={(e) => setDaXuatHometea(e.target.checked)}
                    disabled={isViewer}
                    className="rounded border-slate-700 bg-slate-900 text-cyan-500"
                  />
                  <span className="text-slate-300">Đã xuất Hometea</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={daXuatFb || trangThaiXuLy === "da_dang_fb"}
                    onChange={(e) => setDaXuatFb(e.target.checked)}
                    disabled={isViewer}
                    className="rounded border-slate-700 bg-slate-900 text-indigo-500"
                  />
                  <span className="text-slate-300">Đã xuất Post Writer / FB</span>
                </label>
              </div>

              {onExportSingle && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onExportSingle(item, "hometea")}
                    className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Send className="w-3 h-3" />
                    Đẩy Hometea
                  </button>
                  <button
                    type="button"
                    onClick={() => onExportSingle(item, "post_writer")}
                    className="px-2.5 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Share2 className="w-3 h-3" />
                    Xuất Post Writer
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* GROUP 2: ĐỊA CHỈ CHUẨN */}
          <section className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              2. Địa chỉ chuẩn (Số nhà, Đường, Phường)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Số nhà / Thửa <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={soNha}
                  onChange={(e) => setSoNha(e.target.value)}
                  placeholder="VD: 220/36/14"
                  disabled={isViewer}
                  className={fieldInputClass(isSoNhaMissing)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Tên đường <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={duong}
                  onChange={(e) => setDuong(e.target.value)}
                  placeholder="VD: Cách Mạng Tháng 8"
                  disabled={isViewer}
                  className={fieldInputClass(isDuongMissing)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Phường / Khu vực <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  list="warehouse-ward-options"
                  value={phuong}
                  onChange={(e) => setPhuong(e.target.value)}
                  placeholder="Chọn hoặc nhập phường..."
                  disabled={isViewer}
                  className={fieldInputClass(isPhuongMissing)}
                />
                <datalist id="warehouse-ward-options">
                  {DISTRICT_OPTIONS.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Tọa độ / Link Google Maps (Tùy chọn)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={toaDo}
                  onChange={(e) => setToaDo(e.target.value)}
                  placeholder="Link Google Maps hoặc tọa độ 10.8..., 106.7..."
                  disabled={isViewer}
                  className={fieldInputClass(false)}
                />
                {toaDo.startsWith("http") && (
                  <a
                    href={toaDo}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1 shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Mở Map
                  </a>
                )}
              </div>
            </div>
          </section>

          {/* GROUP 3: DIỆN TÍCH & KẾT CẤU */}
          <section className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Ruler className="w-3.5 h-3.5" />
                3. Diện tích (Sổ / Thực tế) & Kích thước
              </h4>
              {item.needsAreaReview && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                  {item.areaReviewReason}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  DT Sổ (m²) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  value={dienTichSo}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDienTichSo(v);
                    if (!dienTichThucTe && v) setDienTichThucTe(v);
                  }}
                  placeholder="VD: 67"
                  disabled={isViewer}
                  className={fieldInputClass(isDtSoMissing)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  DT Thực tế (m²) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  value={dienTichThucTe}
                  onChange={(e) => setDienTichThucTe(e.target.value)}
                  placeholder="VD: 75"
                  disabled={isViewer}
                  className={fieldInputClass(isDtThucTeMissing)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Rộng (m) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={rong}
                  onChange={(e) => setRong(e.target.value)}
                  placeholder="VD: 4"
                  disabled={isViewer}
                  className={fieldInputClass(isRongMissing)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Dài (m) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={dai}
                  onChange={(e) => setDai(e.target.value)}
                  placeholder="VD: 18.5"
                  disabled={isViewer}
                  className={fieldInputClass(isDaiMissing)}
                />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Số tầng <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={soTang}
                  onChange={(e) => setSoTang(e.target.value)}
                  placeholder="VD: 3"
                  disabled={isViewer}
                  className={fieldInputClass(isSoTangMissing)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Loại hình bất động sản
                </label>
                <input
                  type="text"
                  value={loaiHinh}
                  onChange={(e) => setLoaiHinh(e.target.value)}
                  placeholder="Nhà phố / Đất nền / Biệt thự..."
                  disabled={isViewer}
                  className={fieldInputClass(false)}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    const parsed = parseAreaNumbers(`${dienTichSo}/${dienTichThucTe}`);
                    if (parsed.dien_tich_so && !dienTichThucTe) {
                      setDienTichThucTe(String(parsed.dien_tich_so));
                    } else if (dienTichSo && !dienTichThucTe) {
                      setDienTichThucTe(dienTichSo);
                    } else if (!dienTichSo && dienTichThucTe) {
                      setDienTichSo(dienTichThucTe);
                    }
                  }}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer w-full"
                >
                  Đồng bộ DT Sổ = DT Thực tế (nếu 1 số)
                </button>
              </div>
            </div>
          </section>

          {/* GROUP 4: GIÁ CHÀO & ĐƠN GIÁ */}
          <section className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" />
                4. Giá chào (VNĐ nguyên)
              </h4>
              {item.isAbnormalPricePerM2 && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold">
                  {item.abnormalPriceReason}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Giá chào (Nhập VD: 4.8 tỷ hoặc 4800000000){" "}
                  <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={giaInput}
                  onChange={(e) => handlePriceInputChange(e.target.value)}
                  placeholder="VD: 6.5 tỷ"
                  disabled={isViewer}
                  className={fieldInputClass(isGiaMissing)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Giá nguyên VNĐ lưu vào DB (`gia`)
                </label>
                <div className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-400 flex items-center justify-between">
                  <span>
                    {giaVnd && giaVnd > 0
                      ? giaVnd.toLocaleString("vi-VN") + " đ"
                      : "Chưa có giá hợp lệ"}
                  </span>
                  {giaVnd && (numDtThucTe || numDtSo) ? (
                    <span className="text-slate-400">
                      ~
                      {(
                        giaVnd /
                        1_000_000 /
                        (numDtThucTe || numDtSo || 1)
                      ).toFixed(1)}{" "}
                      tr/m²
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {/* GROUP 5: PHẦN NỘI BỘ (BẢO MẬT - KHÔNG XUẤT RA VIEW v_nguon_xuat) */}
          <section className="p-4 rounded-xl bg-rose-950/15 border border-rose-500/30 space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-rose-400" />
                5. Thông tin Nội bộ (Bảo mật kho)
              </h4>
              <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-semibold">
                Tuyệt đối KHÔNG xuất sang v_nguon_xuat & Hometea
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Môi giới nguồn (`moi_gioi_nguon`)
                </label>
                <input
                  type="text"
                  value={moiGioiNguon}
                  onChange={(e) => setMoiGioiNguon(e.target.value)}
                  placeholder="Tên đầu chủ / MG nguồn"
                  disabled={isViewer}
                  className={fieldInputClass(false)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  SĐT nguồn (`sdt_nguon`)
                </label>
                <input
                  type="text"
                  value={sdtNguon}
                  onChange={(e) => setSdtNguon(e.target.value)}
                  placeholder="SĐT liên hệ nội bộ"
                  disabled={isViewer}
                  className={fieldInputClass(false)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Hoa hồng (`hoa_hong`)
                </label>
                <input
                  type="text"
                  value={hoaHong}
                  onChange={(e) => setHoaHong(e.target.value)}
                  placeholder="VD: 1% hoặc 100 triệu"
                  disabled={isViewer}
                  className={fieldInputClass(false)}
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                Mô tả thô nguyên bản (`mo_ta_tho` - chỉ dùng nội bộ)
              </label>
              <textarea
                rows={4}
                value={moTaTho}
                onChange={(e) => setMoTaTho(e.target.value)}
                placeholder="Nội dung mô tả thô từ file .txt hoặc ghi chú nội bộ..."
                disabled={isViewer}
                className={`${fieldInputClass(false)} font-mono text-[11px] leading-relaxed`}
              />
            </div>
          </section>

          {/* GROUP 6: HÌNH ẢNH */}
          <section
            className={`p-4 rounded-xl border space-y-3.5 ${
              isAnhMissing
                ? "bg-rose-950/20 border-rose-500/60"
                : "bg-slate-900/60 border-slate-800"
            }`}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />
                6. Hình ảnh ({imageUrls.length} ảnh){" "}
                <span className="text-rose-400">*</span>
              </h4>
              {isAnhMissing && (
                <span className="text-[11px] text-rose-400 font-semibold">
                  Cần tối thiểu 1 ảnh
                </span>
              )}
            </div>

            {!isViewer && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  placeholder="Dán link ảnh mới (Cloudinary / URL)..."
                  className={fieldInputClass(false)}
                />
                <button
                  type="button"
                  onClick={handleAddImage}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Thêm ảnh
                </button>
              </div>
            )}

            {imageUrls.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-60 overflow-y-auto pr-1">
                {imageUrls.map((url, idx) => (
                  <div
                    key={`${url}-${idx}`}
                    className={`relative group rounded-lg overflow-hidden border aspect-square bg-slate-950 ${
                      idx === 0
                        ? "border-amber-500 ring-2 ring-amber-500/30"
                        : "border-slate-800"
                    }`}
                  >
                    <SmartImage
                      src={url}
                      alt={`Ảnh ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {idx === 0 && (
                      <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-bold text-[9px]">
                        Đại diện
                      </span>
                    )}
                    {!isViewer && (
                      <div className="absolute inset-x-0 bottom-0 p-1 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between gap-1">
                        {idx !== 0 ? (
                          <button
                            type="button"
                            onClick={() => handleSetPrimaryImage(idx)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/40 cursor-pointer"
                          >
                            Đặt đại diện
                          </button>
                        ) : (
                          <span className="text-[9px] text-slate-400 px-1">
                            Ảnh #1
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(idx)}
                          className="p-1 rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500/40 cursor-pointer"
                          title="Xóa ảnh"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-lg border border-dashed border-rose-500/40 text-center text-xs text-rose-300">
                Chưa có hình ảnh nào trong bản ghi này.
              </div>
            )}
          </section>

          {/* GROUP 7: XEM TRƯỚC DỮ LIỆU XUẤT (VIEW v_nguon_xuat) */}
          <section className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowViewPreview((p) => !p)}
                className="text-xs font-bold text-cyan-400 flex items-center gap-1.5 cursor-pointer hover:underline"
              >
                <Code2 className="w-4 h-4" />
                {showViewPreview
                  ? "Ẩn bản ghi xuất chuẩn (v_nguon_xuat)"
                  : "Xem trước dữ liệu dòng này trên VIEW v_nguon_xuat"}
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    JSON.stringify(vNguonXuatPreview, null, 2)
                  );
                  setCopiedJson(true);
                  setTimeout(() => setCopiedJson(false), 2000);
                }}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center gap-1 cursor-pointer"
              >
                {copiedJson ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    Đã chép JSON
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Chép JSON chuẩn
                  </>
                )}
              </button>
            </div>

            {showViewPreview && (
              <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-cyan-300 overflow-x-auto">
                {JSON.stringify(vNguonXuatPreview, null, 2)}
              </pre>
            )}
          </section>
        </form>

        {/* Bottom Sticky Action Bar */}
        <div className="px-5 py-3.5 bg-slate-900/95 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {onDelete && !isViewer && (
              <button
                type="button"
                onClick={() => onDelete(item.raw)}
                className="px-3 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Xóa nguồn
              </button>
            )}
            {saveMessage && (
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1 truncate">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {saveMessage}
              </span>
            )}
            {saveError && (
              <span className="text-xs text-rose-400 font-semibold truncate">
                {saveError}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
            >
              Đóng
            </button>
            {!isViewer && (
              <button
                type="button"
                onClick={() => handleSaveChanges()}
                disabled={isSaving}
                className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving ? "Đang lưu..." : "Lưu chuẩn hóa"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
