import React, { useState, useMemo } from "react";
import {
  ShieldAlert,
  Copy,
  Hash,
  AlertCircle,
  TrendingUp,
  CheckCircle2,
  Trash2,
  Sparkles,
  Wrench,
  Edit3,
} from "lucide-react";
import {
  NormalizedWarehouseProperty,
  MANDATORY_WAREHOUSE_FIELDS,
  MandatoryFieldKey,
} from "../utils/dataWarehouseUtils";

interface DataQualityViewProps {
  items?: NormalizedWarehouseProperty[];
  onSelectItem?: (item: NormalizedWarehouseProperty) => void;
  onAssignAllLegacyMaTk?: (
    records: NormalizedWarehouseProperty[]
  ) => Promise<void>;
  onDeleteDuplicates?: (idsToDelete: string[]) => Promise<void>;
  isAdminOrStaff?: boolean;
  properties?: any; // fallback to allow the old properties prop
  onBackToProperties?: () => void; // fallback back button prop
  currentUser?: any;
}

type QualitySubTab =
  | "duplicate_matk"
  | "missing_matk"
  | "missing_fields"
  | "abnormal_price";

export default function DataQualityView({
  items = [],
  onSelectItem,
  onAssignAllLegacyMaTk,
  onDeleteDuplicates,
  isAdminOrStaff,
  properties,
  onBackToProperties,
  currentUser,
}: DataQualityViewProps) {
  const effectiveIsAdminOrStaff =
    isAdminOrStaff !== undefined
      ? isAdminOrStaff
      : currentUser?.role === "admin" || currentUser?.role === "staff";
  const [activeSubTab, setActiveSubTab] =
    useState<QualitySubTab>("missing_matk");
  const [missingFieldFilter, setMissingFieldFilter] = useState<
    "all" | MandatoryFieldKey
  >("all");
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Fallback to properties if items list is empty or undefined
  const dataItems = useMemo(() => {
    if (items && items.length > 0) return items;
    if (properties && Array.isArray(properties)) {
      // If we got properties directly, they might need normalization, but since they're passed to DataQualityView, they usually are already Normalized.
      return properties;
    }
    return [];
  }, [items, properties]);

  // 1. Nhóm trùng ma_tk
  const duplicateGroups = useMemo(() => {
    const map = new Map<string, NormalizedWarehouseProperty[]>();
    for (const it of dataItems) {
      const code = (it.ma_tk || "").trim().toUpperCase();
      if (!code || it.isLegacyOrMissingMaTk) continue;
      const arr = map.get(code) || [];
      arr.push(it);
      map.set(code, arr);
    }
    const groups: Array<{
      ma_tk: string;
      records: NormalizedWarehouseProperty[];
    }> = [];
    for (const [ma_tk, records] of map.entries()) {
      if (records.length > 1) {
        // Sort by filledCount desc so first record is the most complete one to keep
        records.sort((a, b) => b.filledCount - a.filledCount);
        groups.push({ ma_tk, records });
      }
    }
    return groups;
  }, [dataItems]);

  // 2. Bản ghi không có ma_tk chuẩn (kiểu cũ #10, #11 hoặc rỗng)
  const legacyOrMissingMaTkList = useMemo(() => {
    return dataItems.filter((it) => it.isLegacyOrMissingMaTk);
  }, [dataItems]);

  // 3. Bản ghi thiếu trường bắt buộc
  const missingFieldsList = useMemo(() => {
    return dataItems.filter((it) => {
      if (it.missingFieldKeys.length === 0) return false;
      if (missingFieldFilter === "all") return true;
      return it.missingFieldKeys.includes(missingFieldFilter);
    });
  }, [dataItems, missingFieldFilter]);

  // 4. Giá/m2 bất thường hoặc lệch diện tích
  const abnormalPriceOrAreaList = useMemo(() => {
    return dataItems.filter(
      (it) =>
        it.isAbnormalPricePerM2 ||
        it.needsAreaReview ||
        it.needsAreaLightCheck
    );
  }, [dataItems]);

  const handleFixAllLegacyMaTk = async () => {
    if (!effectiveIsAdminOrStaff || legacyOrMissingMaTkList.length === 0) return;
    if (
      !window.confirm(
        `Xác nhận chạy gán Mã TK chuẩn tự động cho toàn bộ ${legacyOrMissingMaTkList.length} bản ghi chưa chuẩn hóa?`
      )
    ) {
      return;
    }
    setIsProcessing(true);
    setActionMessage("Đang chuẩn hóa mã...");
    try {
      if (onAssignAllLegacyMaTk) {
        await onAssignAllLegacyMaTk(legacyOrMissingMaTkList);
        setActionMessage("Đã gán mã thành công!");
      }
    } catch (err: any) {
      alert("Lỗi: " + err.message);
    } finally {
      setIsProcessing(false);
      setTimeout(() => setActionMessage(null), 2500);
    }
  };

  const handleResolveDuplicateGroup = async (
    ma_tk: string,
    records: NormalizedWarehouseProperty[]
  ) => {
    if (!effectiveIsAdminOrStaff || records.length <= 1) return;
    const toKeep = records[0];
    const toDelete = records.slice(1);
    if (
      !window.confirm(
        `Giữ lại bản ghi đầy đủ nhất (${toKeep.filledCount}/11) và XÓA ${toDelete.length} bản ghi trùng lặp cho Mã ${ma_tk}?`
      )
    ) {
      return;
    }
    setIsProcessing(true);
    try {
      if (onDeleteDuplicates) {
        await onDeleteDuplicates(toDelete.map((r) => r.id));
        setActionMessage(`Đã dọn trùng cho ${ma_tk}!`);
      }
    } catch (err: any) {
      alert("Lỗi: " + err.message);
    } finally {
      setIsProcessing(false);
      setTimeout(() => setActionMessage(null), 2500);
    }
  };

  const handleCleanAllDuplicates = async () => {
    if (!effectiveIsAdminOrStaff || duplicateGroups.length === 0) return;
    if (
      !window.confirm(
        `Xác nhận dọn sạch trùng lặp hàng loạt cho ${duplicateGroups.length} nhóm trùng? Hệ thống luôn giữ lại bản ghi đầy đủ nhất.`
      )
    ) {
      return;
    }
    setIsProcessing(true);
    try {
      const idsToDelete: string[] = [];
      duplicateGroups.forEach((g) => {
        g.records.slice(1).forEach((r) => idsToDelete.push(r.id));
      });
      if (onDeleteDuplicates) {
        await onDeleteDuplicates(idsToDelete);
        setActionMessage(`Đã dọn sạch trùng cho ${idsToDelete.length} bản ghi!`);
      }
    } catch (err: any) {
      alert("Lỗi: " + err.message);
    } finally {
      setIsProcessing(false);
      setTimeout(() => setActionMessage(null), 2500);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Quick Stat cards */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {onBackToProperties && (
              <button
                onClick={onBackToProperties}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                ← Quay lại Kho
              </button>
            )}
            <h2 className="text-xl font-extrabold text-slate-100 flex items-center gap-2 tracking-tight">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              Báo cáo & Giám sát Chất lượng Dữ liệu
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Hệ thống tự động phát hiện mã TK lỗi, bản ghi thiếu trường bắt buộc, hoặc đơn giá bất thường.
          </p>
        </div>

        {actionMessage && (
          <div className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs animate-bounce shadow-lg">
            {actionMessage}
          </div>
        )}
      </div>

      {/* Quick stats panel */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => setActiveSubTab("missing_matk")}
          className={`p-4 rounded-2xl border text-left transition-all ${
            activeSubTab === "missing_matk"
              ? "bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/15"
              : "bg-slate-900 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Mã TK chưa chuẩn
            </span>
            <Hash className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-amber-400 font-mono mt-1">
            {legacyOrMissingMaTkList.length}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Mã trống hoặc dạng cũ (#12)
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("duplicate_matk")}
          className={`p-4 rounded-2xl border text-left transition-all ${
            activeSubTab === "duplicate_matk"
              ? "bg-rose-500/10 border-rose-500 ring-2 ring-rose-500/15"
              : "bg-slate-900 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Mã TK trùng lặp
            </span>
            <Copy className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-extrabold text-rose-400 font-mono mt-1">
            {duplicateGroups.length}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Nhóm trùng lặp cần xóa bớt
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("missing_fields")}
          className={`p-4 rounded-2xl border text-left transition-all ${
            activeSubTab === "missing_fields"
              ? "bg-cyan-500/10 border-cyan-500 ring-2 ring-cyan-500/15"
              : "bg-slate-900 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Thiếu thông tin
            </span>
            <AlertCircle className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-2xl font-extrabold text-cyan-400 font-mono mt-1">
            {dataItems.filter((i) => i.missingFieldKeys.length > 0).length}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Chưa đạt 11/11 trường bắt buộc
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("abnormal_price")}
          className={`p-4 rounded-2xl border text-left transition-all ${
            activeSubTab === "abnormal_price"
              ? "bg-violet-500/10 border-violet-500 ring-2 ring-violet-500/15"
              : "bg-slate-900 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Bất thường khác
            </span>
            <TrendingUp className="w-4 h-4 text-violet-500" />
          </div>
          <div className="text-2xl font-extrabold text-violet-400 font-mono mt-1">
            {abnormalPriceOrAreaList.length}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Giá m² lạ hoặc lệch rộng×dài
          </p>
        </button>
      </div>

      {/* SUB-TAB 1: MÃ TK CHƯA CHUẨN */}
      {activeSubTab === "missing_matk" && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Danh sách Bản ghi có Mã TK chưa chuẩn ({legacyOrMissingMaTkList.length} tin)
              </h3>
              <p className="text-xs text-slate-400">
                Các bản ghi có Mã TK rỗng, sai định dạng hoặc Mã dạng cũ (VD: #12). Cần chuẩn hóa để hiển thị tốt trên Bản Đồ và xuất Hometea.
              </p>
            </div>
            {effectiveIsAdminOrStaff && legacyOrMissingMaTkList.length > 0 && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleFixAllLegacyMaTk}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Chuẩn hóa mã tự động ({legacyOrMissingMaTkList.length} dòng)
              </button>
            )}
          </div>

          {legacyOrMissingMaTkList.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="text-sm font-bold text-slate-200">
                Tuyệt vời! 100% bản ghi đều đã có Mã TK chuẩn hóa đạt chuẩn.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950/90 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 w-32">Mã hiện tại</th>
                    <th className="py-2.5 px-4 w-40">Mã AI đề xuất</th>
                    <th className="py-2.5 px-4">Địa chỉ / Tên thô</th>
                    <th className="py-2.5 px-4 w-28">Trạng thái xử lý</th>
                    <th className="py-2.5 px-4 w-28 text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {legacyOrMissingMaTkList.map((it) => (
                    <tr
                      key={it.id}
                      onClick={() => onSelectItem(it)}
                      className="hover:bg-slate-800/50 cursor-pointer"
                    >
                      <td className="py-2.5 px-4 font-mono text-rose-300">
                        {it.ma_tk || <span className="italic text-slate-500">(Rỗng)</span>}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-emerald-400">
                        {it.suggestedMaTk}
                      </td>
                      <td className="py-2.5 px-4 truncate max-w-xs text-slate-300">
                        {it.dia_chi || it.raw.name}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-slate-400">
                        {it.trang_thai_xu_ly}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectItem(it)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-semibold cursor-pointer"
                        >
                          Duyệt sửa
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: TRÙNG LẶP MÃ TK */}
      {activeSubTab === "duplicate_matk" && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Phát hiện Mã TK bị trùng lặp ({duplicateGroups.length} nhóm trùng)
              </h3>
              <p className="text-xs text-slate-400">
                Các tin nhập trùng lặp nhau. Hệ thống xếp hạng bản ghi đầy đủ nhất để giữ lại, các bản ghi trống hơn đề xuất xóa bỏ để tránh nhiễu dữ liệu.
              </p>
            </div>
            {effectiveIsAdminOrStaff && duplicateGroups.length > 0 && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleCleanAllDuplicates}
                className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Xóa trùng lặp hàng loạt ({duplicateGroups.length} nhóm)
              </button>
            )}
          </div>

          {duplicateGroups.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="text-sm font-bold text-slate-200">
                Tuyệt vời! Không phát hiện Mã TK trùng lặp nào trong cơ sở dữ liệu.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {duplicateGroups.map((g) => (
                <div key={g.ma_tk} className="p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-amber-300">
                      MÃ TRÙNG: {g.ma_tk} ({g.records.length} bản ghi)
                    </span>
                    {effectiveIsAdminOrStaff && (
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() =>
                          handleResolveDuplicateGroup(g.ma_tk, g.records)
                        }
                        className="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold cursor-pointer"
                      >
                        Chỉ giữ lại bản tốt nhất & Xóa trùng
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {g.records.map((r, index) => (
                      <div
                        key={r.id}
                        onClick={() => onSelectItem(r)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          index === 0
                            ? "bg-slate-950/60 border-emerald-500/40 hover:bg-slate-950"
                            : "bg-slate-950/20 border-slate-800/80 hover:bg-slate-800/20"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-slate-400 font-medium">
                            Bản ghi {index === 0 ? "👑 Tốt nhất để GIỮ" : "❌ Đề xuất XÓA"}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 text-[10px] font-mono">
                            Đầy đủ: {r.filledCount}/11
                          </span>
                        </div>
                        <p className="text-xs text-slate-200 truncate">
                          ĐC: {[r.so_nha, r.duong, r.phuong].filter(Boolean).join(", ")}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1 font-mono">
                          Giá: {r.gia_text} · DT: {r.dien_tich_so || r.dien_tich_thuc_te || "?"}m²
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: THIẾU THÔNG TIN KHU CHUẨN */}
      {activeSubTab === "missing_fields" && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
          <div className="p-5 border-b border-slate-800 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Các bản ghi chưa đạt đầy đủ 11/11 trường dữ liệu bắt buộc ({missingFieldsList.length} tin)
              </h3>
              <p className="text-xs text-slate-400">
                Dữ liệu chưa hoàn chỉnh. Lọc theo từng loại trường thiếu để nhanh chóng rà soát bổ sung thông tin.
              </p>
            </div>

            {/* Thanh lọc theo từng trường còn thiếu */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setMissingFieldFilter("all")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer border ${
                  missingFieldFilter === "all"
                    ? "bg-rose-500 text-white border-rose-500"
                    : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
                }`}
              >
                Mọi trường ({dataItems.filter((i) => i.missingFieldKeys.length > 0).length})
              </button>
              {MANDATORY_WAREHOUSE_FIELDS.map((f) => {
                const count = dataItems.filter((i) =>
                  i.missingFieldKeys.includes(f.key)
                ).length;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setMissingFieldFilter(f.key)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer border ${
                      missingFieldFilter === f.key
                        ? "bg-rose-500 text-white border-rose-500"
                        : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
                    }`}
                  >
                    Thiếu {f.label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-950/90 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4">Mã TK</th>
                  <th className="py-2.5 px-4">Địa chỉ hiện tại</th>
                  <th className="py-2.5 px-4">Độ đầy đủ</th>
                  <th className="py-2.5 px-4">Các trường còn thiếu (`thieu`)</th>
                  <th className="py-2.5 px-4 text-right">Sửa nhanh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {missingFieldsList.map((it) => (
                  <tr
                    key={it.id}
                    onClick={() => onSelectItem(it)}
                    className="hover:bg-slate-800/50 cursor-pointer"
                  >
                    <td className="py-2.5 px-4 font-mono font-bold text-amber-300">
                      {it.ma_tk || it.suggestedMaTk}
                    </td>
                    <td className="py-2.5 px-4 text-slate-200 max-w-xs truncate">
                      {[it.so_nha, it.duong, it.phuong]
                        .filter(Boolean)
                        .join(", ") || it.raw.name}
                    </td>
                    <td className="py-2.5 px-4 font-mono">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-bold">
                        {it.filledCount}/{it.totalMandatory}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {it.missingFieldLabels.map((lbl) => (
                          <span
                            key={lbl}
                            className="px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/35 text-rose-300 text-[10px] font-semibold"
                          >
                            {lbl}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectItem(it)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Wrench className="w-3 h-3" />
                        Bổ sung
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: GIÁ/M2 & DIỆN TÍCH BẤT THƯỜNG */}
      {activeSubTab === "abnormal_price" && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h3 className="text-sm font-bold text-slate-100">
              Cảnh báo Giá/m² bất thường & Chênh lệch Diện tích ({abnormalPriceOrAreaList.length} tin)
            </h3>
            <p className="text-xs text-slate-400">
              Phát hiện đơn giá &lt; 15 triệu/m² hoặc &gt; 450 triệu/m², hoặc diện tích thực tế lệch &gt; 30% so với Rộng × Dài.
            </p>
          </div>

          {abnormalPriceOrAreaList.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="text-sm font-bold text-slate-200">
                Không phát hiện bất thường về đơn giá/m² hoặc diện tích!
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950/90 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 w-32">Mã TK</th>
                    <th className="py-2.5 px-4">Địa chỉ</th>
                    <th className="py-2.5 px-4 w-28">Giá chào</th>
                    <th className="py-2.5 px-4 w-36">Đơn giá / m²</th>
                    <th className="py-2.5 px-4">Lý do bất thường / Cảnh báo</th>
                    <th className="py-2.5 px-4 w-28 text-right">Sửa nhanh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {abnormalPriceOrAreaList.map((it) => (
                    <tr
                      key={it.id}
                      onClick={() => onSelectItem(it)}
                      className="hover:bg-slate-800/50 cursor-pointer"
                    >
                      <td className="py-2.5 px-4 font-mono font-bold text-amber-300">
                        {it.ma_tk || it.suggestedMaTk}
                      </td>
                      <td className="py-2.5 px-4 text-slate-300 truncate max-w-xs">
                        {[it.so_nha, it.duong, it.phuong].filter(Boolean).join(", ")}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-200">
                        {it.gia_text}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-200">
                        {it.pricePerM2Text || "—"}
                      </td>
                      <td className="py-2.5 px-4 text-rose-300 text-xs font-medium">
                        {it.isAbnormalPricePerM2 && (
                          <div className="text-rose-400">⚠️ {it.abnormalPriceReason}</div>
                        )}
                        {(it.needsAreaReview || it.needsAreaLightCheck) && (
                          <div className="text-amber-400">⚠️ {it.areaReviewReason}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectItem(it)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-semibold cursor-pointer"
                        >
                          Duyệt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
