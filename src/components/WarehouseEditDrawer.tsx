import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  X,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Eye,
  Sparkles,
  MoreVertical,
  Send,
} from "lucide-react";
import {
  Property,
  ProcessingStatusType,
  DISTRICT_OPTIONS,
  AuthUser,
  LoaiViTriType,
  AiExtractedFieldKey,
  NguonTrichXuatMap,
} from "../types";
import {
  NormalizedWarehouseProperty,
  LOAI_VI_TRI_OPTIONS,
  HUONG_OPTIONS,
  PHAP_LY_PRESETS,
} from "../utils/dataWarehouseUtils";
import SmartImage from "./SmartImage";

interface WarehouseEditDrawerProps {
  item: NormalizedWarehouseProperty | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Property>) => Promise<void>;
  onDelete?: (prop: Property) => void;
  onPostHometea?: (prop: NormalizedWarehouseProperty) => void;
  currentUser?: AuthUser | null;
  allItems?: NormalizedWarehouseProperty[];
  onSelectProperty?: (id: string) => void;
}

export default function WarehouseEditDrawer({
  item,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onPostHometea,
  currentUser,
  allItems = [],
  onSelectProperty,
}: WarehouseEditDrawerProps) {
  // Form states
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

  const [loaiViTri, setLoaiViTri] = useState<LoaiViTriType | "">("");
  const [huong, setHuong] = useState<string>("");
  const [phapLy, setPhapLy] = useState<string>("");
  const [soPhongNgu, setSoPhongNgu] = useState<string>("");
  const [soWc, setSoWc] = useState<string>("");
  const [duongVaoM, setDuongVaoM] = useState<string>("");
  const [dacDiemInput, setDacDiemInput] = useState<string>("");
  const [hienTrang, setHienTrang] = useState<string>("");
  const [nguonTrichXuat, setNguonTrichXuat] = useState<NguonTrichXuatMap>({});
  const [aiManualFields, setAiManualFields] = useState<AiExtractedFieldKey[]>([]);

  const [trangThaiXuLy, setTrangThaiXuLy] = useState<ProcessingStatusType>("tho");
  const [hometeaTrangThai, setHometeaTrangThai] = useState<string>("chua_dang");
  const [hometeaId, setHometeaId] = useState<string | null>(null);

  // Nội bộ
  const [moTaTho, setMoTaTho] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  const [showRawName, setShowRawName] = useState(false);
  const [showSummarySection, setShowSummarySection] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInputCode, setDeleteInputCode] = useState("");

  const originalContentRef = useRef<HTMLDivElement>(null);
  const isViewer = currentUser?.role === "viewer";

  useEffect(() => {
    if (!item) return;
    setMaTk(item.ma_tk || "");
    setSoNha(item.so_nha || "");
    setDuong(item.ten_duong || item.duong || "");
    setPhuong(item.phuong || "");
    setDienTichSo(item.dien_tich_so !== null && item.dien_tich_so !== undefined ? String(item.dien_tich_so) : "");
    setDienTichThucTe(item.dien_tich_thuc_te !== null && item.dien_tich_thuc_te !== undefined ? String(item.dien_tich_thuc_te) : "");
    setSoTang(item.so_tang || "");
    setRong(item.rong || "");
    setDai(item.dai || "");
    setGiaVnd(item.gia);
    setGiaInput(
      item.gia && item.gia > 0
        ? `${item.gia / 1e9} tỷ`
        : ""
    );
    setLoaiHinh(item.loai_hinh || "Nhà phố");
    setLoaiViTri(item.loai_vi_tri || "");
    setHuong(item.huong || "");
    setPhapLy(item.phap_ly || "");
    setSoPhongNgu(item.so_phong_ngu !== null && item.so_phong_ngu !== undefined ? String(item.so_phong_ngu) : "");
    setSoWc(item.so_wc !== null && item.so_wc !== undefined ? String(item.so_wc) : "");
    setDuongVaoM(item.duong_vao_m !== null && item.duong_vao_m !== undefined ? String(item.duong_vao_m) : "");
    setDacDiemInput(Array.isArray(item.dac_diem) ? item.dac_diem.join(", ") : "");
    setHienTrang(item.hien_trang || "");
    setNguonTrichXuat(item.nguon_trich_xuat || {});
    setAiManualFields(item.ai_manual_fields || []);
    setTrangThaiXuLy(item.trang_thai_xu_ly || "tho");
    setHometeaTrangThai(item.hometea_trang_thai || "chua_dang");
    setHometeaId(item.hometea_id || null);
    setMoTaTho(item.mo_ta_tho || item.raw?.content || "");
    setImageUrls(item.imageUrls || []);
    setShowMoreMenu(false);
    setShowDeleteConfirm(false);
    setDeleteInputCode("");
  }, [item]);

  // Navigation index in allItems queue
  const currentIndex = useMemo(() => {
    if (!item || !allItems.length) return -1;
    return allItems.findIndex((x) => x.id === item.id);
  }, [item, allItems]);

  const handlePrev = () => {
    if (currentIndex > 0 && onSelectProperty) {
      onSelectProperty(allItems[currentIndex - 1].id);
    }
  };

  const handleNext = () => {
    if (currentIndex >= 0 && currentIndex < allItems.length - 1 && onSelectProperty) {
      onSelectProperty(allItems[currentIndex + 1].id);
    }
  };

  // Keyboard shortcuts: J/K = next/prev, Ctrl+Enter = Save & Ready
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isInput = targetTag === "input" || targetTag === "textarea" || targetTag === "select";

      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        handleSaveAndReady();
        return;
      }

      if (!isInput) {
        if (e.key === "j" || e.key === "J") {
          e.preventDefault();
          handleNext();
        } else if (e.key === "k" || e.key === "K") {
          e.preventDefault();
          handlePrev();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentIndex, allItems, maTk, soNha, duong, phuong, giaVnd, loaiViTri, phapLy, trangThaiXuLy]);

  if (!isOpen || !item) return null;

  // Mask phone numbers and names in raw text
  const maskText = (txt: string) => {
    if (!txt) return "";
    let res = txt.replace(/0\d{9,10}/g, "***-***-****");
    res = res.replace(/(0\d{2,3})[\s.-]?\d{3}[\s.-]?\d{3,4}/g, "***-***-****");
    res = res.replace(/(chính chủ|anh|chị|cô|chú|bác|mg|môi giới)\s+[a-zA-ZÀ-ỹ]+/gi, "$1 ***");
    return res;
  };

  const cleanAddress = item.cleanAddress || item.dia_chi || item.raw?.dia_chi || item.raw?.name || [item.so_nha, item.duong || item.ten_duong, item.phuong].filter(Boolean).join(", ") || item.ma_tk || "Bất động sản";
  const rawTitle = item.raw?.name || item.name || item.ma_tk || "Chưa có tên thô";

  // Helper check field status (gray = auto/ok, yellow = needs confirm, green = confirmed)
  const getFieldStatusColor = (key: AiExtractedFieldKey, val: any) => {
    if (aiManualFields.includes(key)) return "border-emerald-500/50 bg-emerald-950/20 text-emerald-300";
    const ev = nguonTrichXuat[key];
    if (ev?.da_xac_nhan || ev?.da_sua_tay) return "border-emerald-500/50 bg-emerald-950/20 text-emerald-300";
    if (val === null || val === undefined || val === "" || ev?.tin_cay === "thap") {
      return "border-amber-500/80 bg-amber-950/30 text-amber-200";
    }
    return "border-slate-700 bg-slate-900/60 text-slate-200";
  };

  const getEvidence = (key: AiExtractedFieldKey) => {
    return nguonTrichXuat[key]?.bang_chung || "Không có bằng chứng trích xuất trực tiếp.";
  };

  const scrollToEvidence = (key: string) => {
    if (originalContentRef.current) {
      const el = originalContentRef.current.querySelector(`[data-evidence-key="${key}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("bg-amber-500/30", "ring-2", "ring-amber-400");
        setTimeout(() => {
          el.classList.remove("bg-amber-500/30", "ring-2", "ring-amber-400");
        }, 2000);
      }
    }
  };

  const handleSaveOnly = async () => {
    if (isViewer) return;
    setIsSaving(true);
    try {
      await onSave(item.id, {
        ma_tk: maTk,
        so_nha: soNha,
        ten_duong: duong,
        phuong: phuong,
        dien_tich_so: dienTichSo ? Number(dienTichSo) : null,
        dien_tich_thuc_te: dienTichThucTe ? Number(dienTichThucTe) : null,
        so_tang: soTang || null,
        rong: rong || null,
        dai: dai || null,
        gia: giaVnd,
        loai_hinh: loaiHinh,
        loai_vi_tri: loaiViTri || null,
        huong: huong || null,
        phap_ly: phapLy || null,
        so_phong_ngu: soPhongNgu ? Number(soPhongNgu) : null,
        so_wc: soWc ? Number(soWc) : null,
        duong_vao_m: duongVaoM ? Number(duongVaoM) : null,
        dac_diem: dacDiemInput ? dacDiemInput.split(",").map((s) => s.trim()).filter(Boolean) : [],
        hien_trang: hienTrang || null,
        nguon_trich_xuat: nguonTrichXuat,
        ai_manual_fields: aiManualFields,
        trang_thai_xu_ly: trangThaiXuLy,
        da_xac_nhan_ai: true,
      });
      setSaveMessage("Đã lưu thành công!");
      setTimeout(() => setSaveMessage(null), 2500);
    } catch (err: any) {
      alert("Lỗi khi lưu: " + (err?.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndReady = async () => {
    if (isViewer) return;
    setIsSaving(true);
    try {
      setTrangThaiXuLy("san_sang");
      await onSave(item.id, {
        ma_tk: maTk,
        so_nha: soNha,
        ten_duong: duong,
        phuong: phuong,
        dien_tich_so: dienTichSo ? Number(dienTichSo) : null,
        dien_tich_thuc_te: dienTichThucTe ? Number(dienTichThucTe) : null,
        so_tang: soTang || null,
        rong: rong || null,
        dai: dai || null,
        gia: giaVnd,
        loai_hinh: loaiHinh,
        loai_vi_tri: loaiViTri || null,
        huong: huong || null,
        phap_ly: phapLy || null,
        so_phong_ngu: soPhongNgu ? Number(soPhongNgu) : null,
        so_wc: soWc ? Number(soWc) : null,
        duong_vao_m: duongVaoM ? Number(duongVaoM) : null,
        dac_diem: dacDiemInput ? dacDiemInput.split(",").map((s) => s.trim()).filter(Boolean) : [],
        hien_trang: hienTrang || null,
        nguon_trich_xuat: nguonTrichXuat,
        ai_manual_fields: aiManualFields,
        trang_thai_xu_ly: "san_sang",
        da_xac_nhan_ai: true,
      });
      if (currentIndex >= 0 && currentIndex < allItems.length - 1 && onSelectProperty) {
        onSelectProperty(allItems[currentIndex + 1].id);
      } else {
        setSaveMessage("Đã lưu & chuyển sẵn sàng!");
        setTimeout(() => setSaveMessage(null), 2500);
      }
    } catch (err: any) {
      alert("Lỗi: " + (err?.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-6 overflow-y-auto animate-fadeIn">
      <div className="flex flex-col w-full max-w-[1100px] max-h-[96vh] rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden my-auto">
        
        {/* THANH TRÊN CÙNG (HEADER) */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0 max-w-full sm:max-w-[55%]">
            <span className="font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs font-bold shrink-0">
              {maTk || "MÃ MỚI"}
            </span>
            <div className="flex flex-col min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-100 truncate" title={cleanAddress}>
                {cleanAddress}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                <span className="truncate">Thô: {rawTitle}</span>
                <button
                  onClick={() => setShowRawName(!showRawName)}
                  className="text-amber-400 hover:underline shrink-0 flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" />
                  {showRawName ? "Ẩn tên thô" : "Xem tên thô"}
                </button>
              </div>
              {showRawName && (
                <div className="mt-1 p-2 rounded bg-slate-900 border border-slate-800 text-xs text-slate-300 font-mono break-all max-h-24 overflow-y-auto">
                  {rawTitle}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap">
            {/* Thanh bước trạng thái */}
            <div className="hidden lg:flex items-center gap-1 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setTrangThaiXuLy("tho")}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  trangThaiXuLy === "tho" || trangThaiXuLy === "can_bo_sung"
                    ? "bg-amber-500/20 text-amber-300 font-medium"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Cần bổ sung
              </button>
              <span className="text-slate-600">→</span>
              <button
                onClick={() => setTrangThaiXuLy("san_sang")}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  trangThaiXuLy === "san_sang"
                    ? "bg-emerald-500/20 text-emerald-300 font-medium"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Sẵn sàng
              </button>
              <span className="text-slate-600">→</span>
              <span
                className={`px-2.5 py-1 rounded-lg ${
                  hometeaTrangThai !== "chua_dang"
                    ? "bg-cyan-500/20 text-cyan-300 font-medium"
                    : "text-slate-500"
                }`}
              >
                Hometea
              </span>
            </div>

            {/* Số thứ tự tin & nút Trước/Sau */}
            <div className="flex items-center gap-1 text-xs text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60">
              <span className="font-semibold text-amber-400">{currentIndex + 1}</span>
              <span className="text-slate-500">/</span>
              <span>{allItems.length} cần duyệt</span>
              <div className="flex items-center gap-0.5 ml-2 border-l border-slate-700 pl-2">
                <button
                  onClick={handlePrev}
                  disabled={currentIndex <= 0}
                  className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 text-slate-300"
                  title="Tin trước (Phím K)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNext}
                  disabled={currentIndex < 0 || currentIndex >= allItems.length - 1}
                  className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 text-slate-300"
                  title="Tin sau (Phím J)"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Menu More (⋯) */}
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {showMoreMenu && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl bg-slate-800 border border-slate-700 shadow-xl py-1 z-50">
                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowDeleteConfirm(true);
                    }}
                    className="w-full text-left px-4 py-2 text-xs text-rose-400 hover:bg-rose-500/10 flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Xóa nguồn này
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* NỘI DUNG 2 CỘT */}
        <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 overflow-y-auto lg:overflow-hidden max-h-[calc(96vh-130px)]">
          
          {/* CỘT TRÁI: Form duyệt chi tiết */}
          <div className="flex flex-col h-full overflow-y-auto p-4 sm:p-6 space-y-5 border-r border-slate-800 bg-slate-900 text-sm">
            
            {/* KHU: Cần quyết định */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  Cần quyết định ({[!phapLy, !loaiViTri].filter(Boolean).length})
                </h3>
                <span className="text-xs text-slate-400">Các trường bắt buộc hoặc cần AI xác nhận</span>
              </div>

              {/* Pháp lý (Bắt buộc) */}
              <div
                onClick={() => scrollToEvidence("phap_ly")}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${getFieldStatusColor(
                  "phap_ly",
                  phapLy
                )}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">Pháp lý *</label>
                  {!phapLy && <span className="text-[11px] text-amber-400 font-medium">cần chọn</span>}
                </div>
                <input
                  type="text"
                  value={phapLy}
                  onChange={(e) => {
                    setPhapLy(e.target.value);
                    if (!aiManualFields.includes("phap_ly")) {
                      setAiManualFields([...aiManualFields, "phap_ly"]);
                    }
                  }}
                  list="phap-ly-list"
                  placeholder="Nhập hoặc chọn pháp lý..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
                <datalist id="phap-ly-list">
                  {PHAP_LY_PRESETS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
                <p className="text-[11px] text-slate-400 mt-1.5 italic truncate">
                  Bằng chứng: {getEvidence("phap_ly")}
                </p>
              </div>

              {/* Loại vị trí (Bắt buộc) */}
              <div
                onClick={() => scrollToEvidence("loai_vi_tri")}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${getFieldStatusColor(
                  "loai_vi_tri",
                  loaiViTri
                )}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">Loại vị trí *</label>
                  {!loaiViTri && <span className="text-[11px] text-amber-400 font-medium">cần chọn</span>}
                </div>
                <select
                  value={loaiViTri}
                  onChange={(e) => {
                    setLoaiViTri(e.target.value as LoaiViTriType);
                    if (!aiManualFields.includes("loai_vi_tri")) {
                      setAiManualFields([...aiManualFields, "loai_vi_tri"]);
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">-- Chọn loại vị trí --</option>
                  {LOAI_VI_TRI_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1.5 italic truncate">
                  Bằng chứng: {getEvidence("loai_vi_tri")}
                </p>
              </div>

              {/* Các trường cơ bản (Giá, Diện tích, Địa chỉ) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <label className="text-xs font-medium text-slate-400 block mb-1">Giá chào</label>
                  <input
                    type="text"
                    value={giaInput}
                    onChange={(e) => {
                      setGiaInput(e.target.value);
                      const num = Number(e.target.value.replace(/[.,\s]/g, ""));
                      if (!isNaN(num)) setGiaVnd(num);
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100"
                  />
                  {giaVnd && <span className="text-[10px] text-amber-400 mt-0.5 block">{giaVnd / 1e9} tỷ</span>}
                </div>

                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <label className="text-xs font-medium text-slate-400 block mb-1">Diện tích (Sổ / Thực tế)</label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      value={dienTichSo}
                      onChange={(e) => setDienTichSo(e.target.value)}
                      placeholder="Sổ"
                      className="w-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100"
                    />
                    <input
                      type="number"
                      value={dienTichThucTe}
                      onChange={(e) => setDienTichThucTe(e.target.value)}
                      placeholder="Thực tế"
                      className="w-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Số nhà</label>
                  <input
                    type="text"
                    value={soNha}
                    onChange={(e) => setSoNha(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Tên đường</label>
                  <input
                    type="text"
                    value={duong}
                    onChange={(e) => setDuong(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Phường</label>
                  <select
                    value={phuong}
                    onChange={(e) => setPhuong(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100"
                  >
                    <option value="">-- Chọn --</option>
                    {DISTRICT_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* KHU: Đã đủ (Thu gọn mặc định, bấm mở) */}
            <div className="border border-slate-800 rounded-xl bg-slate-950/40 overflow-hidden">
              <button
                onClick={() => setShowSummarySection(!showSummarySection)}
                className="w-full flex items-center justify-between p-3 text-xs font-medium text-slate-300 hover:bg-slate-800/50 transition-colors"
              >
                <span>Thông tin bổ sung / Đã đủ ({[huong, soPhongNgu, soWc, duongVaoM].filter(Boolean).length})</span>
                <span className="text-amber-400 text-xs">{showSummarySection ? "Thu gọn ▲" : "Chi tiết ▼"}</span>
              </button>

              {showSummarySection && (
                <div className="p-3 border-t border-slate-800 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Hướng</label>
                      <select
                        value={huong}
                        onChange={(e) => setHuong(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100"
                      >
                        <option value="">-- Không xác định --</option>
                        {HUONG_OPTIONS.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Số tầng</label>
                      <input
                        type="text"
                        value={soTang}
                        onChange={(e) => setSoTang(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Phòng ngủ</label>
                      <input
                        type="number"
                        value={soPhongNgu}
                        onChange={(e) => setSoPhongNgu(e.target.value)}
                        placeholder="—"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100 text-center"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">WC</label>
                      <input
                        type="number"
                        value={soWc}
                        onChange={(e) => setSoWc(e.target.value)}
                        placeholder="—"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100 text-center"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Đường vào (m)</label>
                      <input
                        type="number"
                        value={duongVaoM}
                        onChange={(e) => setDuongVaoM(e.target.value)}
                        placeholder="—"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100 text-center"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Các trường KHÔNG bắt buộc (hiện dấu "—" xám nếu trống) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs text-slate-400 border-t border-slate-800">
              <div>
                <span>Hướng: </span>
                <span className={huong ? "text-slate-200 font-medium" : "text-slate-600"}>
                  {huong || "—"}
                </span>
              </div>
              <div>
                <span>PN / WC: </span>
                <span className={soPhongNgu || soWc ? "text-slate-200 font-medium" : "text-slate-600"}>
                  {soPhongNgu || "—"}PN / {soWc || "—"}WC
                </span>
              </div>
              <div>
                <span>Đường vào: </span>
                <span className={duongVaoM ? "text-slate-200 font-medium" : "text-slate-600"}>
                  {duongVaoM ? `${duongVaoM}m` : "—"}
                </span>
              </div>
            </div>

          </div>

          {/* CỘT PHẢI: Văn bản gốc cuộn được (Che mọi SĐT và tên người bằng ***) */}
          <div className="flex flex-col h-full bg-slate-950 p-4 sm:p-6 overflow-hidden">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 shrink-0 flex items-center justify-between">
              <span>Văn bản gốc (đã che SĐT & tên chủ)</span>
              <span className="text-[11px] text-slate-500 font-normal">Bấm trường bên trái để rà bằng chứng</span>
            </h3>

            <div
              ref={originalContentRef}
              className="flex-1 overflow-y-auto rounded-xl bg-slate-900/80 border border-slate-800 p-4 text-xs sm:text-sm text-slate-300 font-mono leading-relaxed space-y-3 select-text"
            >
              {moTaTho ? (
                maskText(moTaTho).split("\n").map((line, idx) => (
                  <div key={idx} data-evidence-key={`line-${idx}`} className="py-0.5 transition-colors rounded px-1">
                    {line}
                  </div>
                ))
              ) : (
                <p className="text-slate-600 italic">Không có nội dung mô tả gốc.</p>
              )}

              {/* Hình ảnh đính kèm */}
              {imageUrls.length > 0 && (
                <div className="pt-4 border-t border-slate-800">
                  <span className="text-xs font-sans text-slate-400 block mb-2">Ảnh tài sản ({imageUrls.length}):</span>
                  <div className="grid grid-cols-3 gap-2">
                    {imageUrls.map((url, i) => (
                      <div key={i} className="aspect-video rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
                        <SmartImage src={url} alt={`Ảnh ${i + 1}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* CHÂN TRANG CỐ ĐỊNH */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-t border-slate-800 bg-slate-950 shrink-0">
          {/* Bên trái: Hometea status (CHỈ ĐỌC) */}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="font-medium text-slate-300">Hometea:</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                hometeaTrangThai === "cong_khai"
                  ? "bg-cyan-500/20 text-cyan-300"
                  : hometeaTrangThai === "nhap"
                  ? "bg-amber-500/20 text-amber-300"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {hometeaTrangThai === "cong_khai"
                ? "Công khai"
                : hometeaTrangThai === "nhap"
                ? "Nháp"
                : "Chưa đăng"}
            </span>
            {hometeaId && <span className="font-mono text-slate-500">(ID: {hometeaId})</span>}
          </div>

          {/* Giữa / Phải: Nút hành động */}
          <div className="flex items-center gap-2.5">
            {saveMessage && <span className="text-xs text-emerald-400 font-medium animate-fadeIn">{saveMessage}</span>}

            {onPostHometea && item && (
              <button
                type="button"
                onClick={() => onPostHometea(item)}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-md shadow-cyan-600/20 flex items-center gap-1.5 cursor-pointer"
                title="Đăng trực tiếp lên Hometea"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Đăng lên Hometea</span>
              </button>
            )}

            <button
              onClick={handleSaveOnly}
              disabled={isSaving || isViewer}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Lưu
            </button>

            <button
              onClick={handleSaveAndReady}
              disabled={isSaving || isViewer}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition-all shadow-lg shadow-amber-500/20 flex items-center gap-1.5 disabled:opacity-50"
            >
              <span>Lưu & xác nhận → tin kế</span>
            </button>
          </div>
        </div>

        {/* Modal xác nhận xóa khi chọn "Xóa nguồn này" */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4">
              <h3 className="text-base font-bold text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Xác nhận xóa nguồn
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Hành động này sẽ xóa vĩnh viễn tin có mã <strong className="text-amber-400 font-mono">{maTk}</strong>. Vui lòng gõ lại mã TK để xác nhận:
              </p>
              <input
                type="text"
                value={deleteInputCode}
                onChange={(e) => setDeleteInputCode(e.target.value)}
                placeholder={`Nhập lại: ${maTk}`}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-rose-500"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Hủy
                </button>
                <button
                  disabled={deleteInputCode.trim() !== maTk.trim()}
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    if (onDelete && item.raw) onDelete(item.raw);
                    onClose();
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-40 transition-colors"
                >
                  Xóa vĩnh viễn
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
