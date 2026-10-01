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
  items: NormalizedWarehouseProperty[];
  onSelectItem: (item: NormalizedWarehouseProperty) => void;
  onAssignAllLegacyMaTk: (
    records: NormalizedWarehouseProperty[]
  ) => Promise<void>;
  onDeleteDuplicates: (idsToDelete: string[]) => Promise<void>;
  isAdminOrStaff: boolean;
}

type QualitySubTab =
  | "duplicate_matk"
  | "missing_matk"
  | "missing_fields"
  | "abnormal_price";

export default function DataQualityView({
  items,
  onSelectItem,
  onAssignAllLegacyMaTk,
  onDeleteDuplicates,
  isAdminOrStaff,
}: DataQualityViewProps) {
  const [activeSubTab, setActiveSubTab] =
    useState<QualitySubTab>("missing_matk");
  const [missingFieldFilter, setMissingFieldFilter] = useState<
    "all" | MandatoryFieldKey
  >("all");
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // 1. Nhóm trùng ma_tk
  const duplicateGroups = useMemo(() => {
    const map = new Map<string, NormalizedWarehouseProperty[]>();
    for (const it of items) {
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
  }, [items]);

  // 2. Bản ghi không có ma_tk chuẩn (kiểu cũ #10, #11 hoặc rỗng)
  const legacyOrMissingMaTkList = useMemo(() => {
    return items.filter((it) => it.isLegacyOrMissingMaTk);
  }, [items]);

  // 3. Bản ghi thiếu trường bắt buộc
  const missingFieldsList = useMemo(() => {
    return items.filter((it) => {
      if (it.missingFieldKeys.length === 0) return false;
      if (missingFieldFilter === "all") return true;
      return it.missingFieldKeys.includes(missingFieldFilter);
    });
  }, [items, missingFieldFilter]);

  // 4. Giá/m2 bất thường hoặc lệch diện tích
  const abnormalPriceOrAreaList = useMemo(() => {
    return items.filter(
      (it) =>
        it.isAbnormalPricePerM2 ||
        it.needsAreaReview ||
        it.needsAreaLightCheck
    );
  }, [items]);

  const handleFixAllLegacyMaTk = async () => {
    if (!isAdminOrStaff || legacyOrMissingMaTkList.length === 0) return;
    setIsProcessing(true);
    setActionMessage(null);
    try {
      await onAssignAllLegacyMaTk(legacyOrMissingMaTkList);
      setActionMessage(
        `Đã gán Mã TK chuẩn cho ${legacyOrMissingMaTkList.length} bản ghi kiểu cũ thành công!`
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveAllDuplicates = async () => {
    if (!isAdminOrStaff || duplicateGroups.length === 0) return;
    const idsToDelete: string[] = [];
    for (const grp of duplicateGroups) {
      // Keep grp.records[0] (most complete), delete the rest
      for (let i = 1; i < grp.records.length; i++) {
        idsToDelete.push(grp.records[i].id);
      }
    }
    if (idsToDelete.length === 0) return;
    setIsProcessing(true);
    setActionMessage(null);
    try {
      await onDeleteDuplicates(idsToDelete);
      setActionMessage(
        `Đã dọn sạch ${idsToDelete.length} bản ghi trùng Mã TK (giữ lại bản đầy đủ nhất)!`
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <h2 className="text-base sm:text-lg font-bold text-slate-100">
              Trung tâm Kiểm soát Chất lượng Dữ liệu Kho Chuẩn
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Rà soát trùng lặp Mã TK, chuẩn hóa mã kiểu cũ (#10, #11), bổ sung trường bắt buộc còn thiếu và kiểm tra đơn giá/m² bất thường.
          </p>
        </div>

        {actionMessage && (
          <div className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{actionMessage}</span>
          </div>
        )}
      </div>

      {/* 4 Sub-tab Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setActiveSubTab("duplicate_matk")}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            activeSubTab === "duplicate_matk"
              ? "bg-rose-950/40 border-rose-500/60 ring-2 ring-rose-500/20"
              : "bg-slate-900/70 border-slate-800 hover:bg-slate-900"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-rose-400">
            <span>1. Trùng Mã TK</span>
            <Copy className="w-4 h-4" />
          </div>
          <div className="text-2xl font-extrabold text-slate-100 mt-2 font-mono">
            {duplicateGroups.length}
            <span className="text-xs font-normal text-slate-400 ml-1.5">
              nhóm trùng
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Cần gộp hoặc xóa bản trùng lặp
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("missing_matk")}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            activeSubTab === "missing_matk"
              ? "bg-amber-950/40 border-amber-500/60 ring-2 ring-amber-500/20"
              : "bg-slate-900/70 border-slate-800 hover:bg-slate-900"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-amber-400">
            <span>2. Chưa có ma_tk chuẩn</span>
            <Hash className="w-4 h-4" />
          </div>
          <div className="text-2xl font-extrabold text-slate-100 mt-2 font-mono">
            {legacyOrMissingMaTkList.length}
            <span className="text-xs font-normal text-slate-400 ml-1.5">
              bản ghi (#10, #11...)
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Gán mã TK chuẩn duy nhất cho mọi dòng
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("missing_fields")}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            activeSubTab === "missing_fields"
              ? "bg-orange-950/40 border-orange-500/60 ring-2 ring-orange-500/20"
              : "bg-slate-900/70 border-slate-800 hover:bg-slate-900"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-orange-400">
            <span>3. Thiếu trường bắt buộc</span>
            <AlertCircle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-extrabold text-slate-100 mt-2 font-mono">
            {items.filter((i) => i.missingFieldKeys.length > 0).length}
            <span className="text-xs font-normal text-slate-400 ml-1.5">
              / {items.length} tin
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Chưa đủ 11/11 cột chuẩn v_nguon_xuat
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("abnormal_price")}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            activeSubTab === "abnormal_price"
              ? "bg-cyan-950/40 border-cyan-500/60 ring-2 ring-cyan-500/20"
              : "bg-slate-900/70 border-slate-800 hover:bg-slate-900"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-cyan-400">
            <span>4. Giá/m² & DT bất thường</span>
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="text-2xl font-extrabold text-slate-100 mt-2 font-mono">
            {abnormalPriceOrAreaList.length}
            <span className="text-xs font-normal text-slate-400 ml-1.5">
              cảnh báo
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Đơn giá &lt;15tr, &gt;450tr/m² hoặc lệch R×D
          </p>
        </button>
      </div>

      {/* SUB-TAB 1: TRÙNG MÃ TK */}
      {activeSubTab === "duplicate_matk" && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Danh sách các nhóm trùng Mã TK ({duplicateGroups.length} nhóm)
              </h3>
              <p className="text-xs text-slate-400">
                Hệ thống tự động xếp bản ghi có độ đầy đủ cao nhất lên đầu mỗi nhóm để giữ lại.
              </p>
            </div>
            {isAdminOrStaff && duplicateGroups.length > 0 && (
              <button
                type="button"
                onClick={handleRemoveAllDuplicates}
                disabled={isProcessing}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isProcessing
                  ? "Đang xử lý..."
                  : "Xóa tất cả bản trùng (Giữ lại 1 bản đầy đủ nhất mỗi mã)"}
              </button>
            )}
          </div>

          {duplicateGroups.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="text-sm font-bold text-slate-200">
                Không có Mã TK nào bị trùng lặp!
              </p>
              <p className="text-xs text-slate-400">
                Toàn bộ các mã TK trong kho đều là duy nhất.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {duplicateGroups.map((grp) => (
                <div key={grp.ma_tk} className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono text-xs font-bold">
                        {grp.ma_tk}
                      </span>
                      <span className="text-xs text-slate-400">
                        Xuất hiện {grp.records.length} lần
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {grp.records.map((rec, idx) => (
                      <div
                        key={rec.id}
                        onClick={() => onSelectItem(rec)}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer ${
                          idx === 0
                            ? "bg-emerald-950/20 border-emerald-500/40"
                            : "bg-slate-950 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                idx === 0
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-rose-500/20 text-rose-300"
                              }`}
                            >
                              {idx === 0 ? "Giữ lại (Đầy đủ nhất)" : "Bản trùng"}
                            </span>
                            <span className="text-xs font-semibold text-slate-200 truncate">
                              {[rec.so_nha, rec.duong, rec.phuong]
                                .filter(Boolean)
                                .join(", ") || rec.raw.name}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-3">
                            <span>Độ đầy đủ: {rec.filledCount}/11</span>
                            <span>Ảnh: {rec.imageCount}</span>
                            <span>Giá: {rec.gia_text || "—"}</span>
                          </div>
                        </div>

                        {idx > 0 && isAdminOrStaff && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteDuplicates([rec.id]);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold shrink-0 cursor-pointer"
                          >
                            Xóa bản này
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: BẢN GHI KHÔNG CÓ MA_TK CHUẨN (KIỂU CŨ #10, #11) */}
      {activeSubTab === "missing_matk" && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Bản ghi chưa có `ma_tk` chuẩn hoặc đang dùng mã kiểu cũ (#10, #11) ({legacyOrMissingMaTkList.length} tin)
              </h3>
              <p className="text-xs text-slate-400">
                Mọi dòng xuất ra VIEW <code className="text-amber-300">v_nguon_xuat</code> đều bắt buộc có <code className="text-amber-300">ma_tk</code> chuẩn duy nhất.
              </p>
            </div>
            {isAdminOrStaff && legacyOrMissingMaTkList.length > 0 && (
              <button
                type="button"
                onClick={handleFixAllLegacyMaTk}
                disabled={isProcessing}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isProcessing
                  ? "Đang gán mã..."
                  : `Gán mã TK chuẩn cho tất cả (${legacyOrMissingMaTkList.length} tin)`}
              </button>
            )}
          </div>

          {legacyOrMissingMaTkList.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="text-sm font-bold text-slate-200">
                100% bản ghi đã có Mã TK chuẩn!
              </p>
              <p className="text-xs text-slate-400">
                Không còn bản ghi nào dùng mã kiểu cũ (#10, #11) hoặc bỏ trống mã TK.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950/90 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">Mã hiện tại / Kiểu cũ</th>
                    <th className="py-2.5 px-4">Mã TK chuẩn đề xuất</th>
                    <th className="py-2.5 px-4">Tên gốc / Địa chỉ</th>
                    <th className="py-2.5 px-4">Phường</th>
                    <th className="py-2.5 px-4">Giá</th>
                    <th className="py-2.5 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {legacyOrMissingMaTkList.map((it) => (
                    <tr
                      key={it.id}
                      onClick={() => onSelectItem(it)}
                      className="hover:bg-slate-800/50 cursor-pointer"
                    >
                      <td className="py-2.5 px-4 font-mono text-rose-400 font-semibold">
                        {it.legacyToken || it.raw_ma_tk || "(Trống)"}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-amber-300">
                        {it.suggestedMaTk}
                      </td>
                      <td className="py-2.5 px-4 text-slate-200 max-w-xs truncate">
                        {[it.so_nha, it.duong].filter(Boolean).join(" ") ||
                          it.raw.name}
                      </td>
                      <td className="py-2.5 px-4 text-slate-300">
                        {it.phuong || "—"}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-emerald-400">
                        {it.gia_text || "—"}
                      </td>
                      <td
                        className="py-2.5 px-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          {isAdminOrStaff && (
                            <button
                              type="button"
                              onClick={() => onAssignAllLegacyMaTk([it])}
                              className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px] font-semibold cursor-pointer"
                            >
                              Gán {it.suggestedMaTk}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onSelectItem(it)}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                            title="Mở ngăn chỉnh sửa"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: THIẾU TRƯỜNG BẮT BUỘC */}
      {activeSubTab === "missing_fields" && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  Bản ghi thiếu trường bắt buộc ({missingFieldsList.length} tin)
                </h3>
                <p className="text-xs text-slate-400">
                  Bấm vào bất kỳ dòng nào để mở ngăn chỉnh sửa bên phải (các ô còn thiếu được tô đỏ).
                </p>
              </div>
            </div>

            {/* Filter by specific missing field */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setMissingFieldFilter("all")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer border ${
                  missingFieldFilter === "all"
                    ? "bg-amber-500 text-slate-950 border-amber-500"
                    : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
                }`}
              >
                Tất cả trường thiếu (
                {items.filter((i) => i.missingFieldKeys.length > 0).length})
              </button>
              {MANDATORY_WAREHOUSE_FIELDS.map((f) => {
                const count = items.filter((i) =>
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
                    <th className="py-2.5 px-4">Mã TK</th>
                    <th className="py-2.5 px-4">Địa chỉ</th>
                    <th className="py-2.5 px-4">DT (Sổ / Thực tế)</th>
                    <th className="py-2.5 px-4">Rộng × Dài</th>
                    <th className="py-2.5 px-4">Giá & Đơn giá/m²</th>
                    <th className="py-2.5 px-4">Lý do cảnh báo</th>
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
                      <td className="py-2.5 px-4 text-slate-200 max-w-xs truncate">
                        {[it.so_nha, it.duong, it.phuong]
                          .filter(Boolean)
                          .join(", ") || it.raw.name}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-300">
                        Sổ: {it.dien_tich_so ?? "—"}m² / TT:{" "}
                        {it.dien_tich_thuc_te ?? "—"}m²
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-300">
                        {it.rong || "?"} × {it.dai || "?"}
                      </td>
                      <td className="py-2.5 px-4 font-mono">
                        <div className="text-emerald-400 font-bold">
                          {it.gia_text || "—"}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {it.pricePerM2Text || "—"}
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="space-y-1">
                          {it.isAbnormalPricePerM2 && (
                            <div className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/35 text-rose-300 text-[11px] font-semibold inline-block mr-1">
                              {it.abnormalPriceReason}
                            </div>
                          )}
                          {(it.needsAreaReview || it.needsAreaLightCheck) && (
                            <div className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-amber-300 text-[11px] font-semibold inline-block">
                              {it.areaReviewReason}
                            </div>
                          )}
                        </div>
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
