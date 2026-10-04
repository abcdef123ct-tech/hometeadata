import React, { useState, useMemo } from "react";
import {
  X,
  ArrowRight,
  CheckCircle2,
  Database,
  Sparkles,
  Play,
  AlertTriangle,
} from "lucide-react";
import { BusinessStatusType, ProcessingStatusType } from "../types";
import { safeFetchJson } from "../utils/apiClient";
import {
  NormalizedWarehouseProperty,
  BUSINESS_STATUS_META,
  PROCESSING_STATUS_META,
} from "../utils/dataWarehouseUtils";

interface MigrationProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  items?: NormalizedWarehouseProperty[];
  onConfirmMigration?: (
    batchItems: Array<{ id: string; changes: Record<string, any> }>
  ) => Promise<void>;
  onMigrationSuccess?: () => void;
}

export default function MigrationProposalModal({
  isOpen,
  onClose,
  items = [],
  onConfirmMigration,
  onMigrationSuccess,
}: MigrationProposalModalProps) {
  const [assignMissingMaTk, setAssignMissingMaTk] = useState(true);
  const [syncStructuredFields, setSyncStructuredFields] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  // Thống kê đề xuất ánh xạ trên toàn bộ kho dữ liệu hiện tại
  const summary = useMemo(() => {
    const kdCounts: Record<BusinessStatusType, number> = {
      nguon_tho: 0,
      da_ky: 0,
      da_ban: 0,
    };
    const xlCounts: Record<ProcessingStatusType, number> = {
      tho: 0,
      can_bo_sung: 0,
      san_sang: 0,
      da_len_hometea: 0,
      da_dang_fb: 0,
    };
    let legacyMaTkCount = 0;
    let unmigratedStatusCount = 0;

    for (const item of items) {
      kdCounts[item.trang_thai_kinh_doanh] =
        (kdCounts[item.trang_thai_kinh_doanh] || 0) + 1;
      xlCounts[item.trang_thai_xu_ly] =
        (xlCounts[item.trang_thai_xu_ly] || 0) + 1;
      if (item.isLegacyOrMissingMaTk) legacyMaTkCount++;
      if (!item.raw.trang_thai_kinh_doanh || !item.raw.trang_thai_xu_ly) {
        unmigratedStatusCount++;
      }
    }

    return {
      total: items.length,
      kdCounts,
      xlCounts,
      legacyMaTkCount,
      unmigratedStatusCount,
    };
  }, [items]);

  if (!isOpen) return null;

  const handleRunMigration = async () => {
    setIsRunning(true);
    setDoneMessage(null);
    try {
      const batch = items.map((item) => {
        const changes: Record<string, any> = {
          trang_thai_kinh_doanh: item.trang_thai_kinh_doanh,
          trang_thai_xu_ly: item.trang_thai_xu_ly,
        };
        if (assignMissingMaTk) {
          changes.ma_tk = item.isLegacyOrMissingMaTk
            ? item.suggestedMaTk
            : item.ma_tk;
        }
        if (syncStructuredFields) {
          if (item.so_nha) changes.so_nha = item.so_nha;
          if (item.duong) changes.duong = item.duong;
          if (item.phuong) changes.phuong = item.phuong;
          if (item.dien_tich_so !== null)
            changes.dien_tich_so = item.dien_tich_so;
          if (item.dien_tich_thuc_te !== null)
            changes.dien_tich_thuc_te = item.dien_tich_thuc_te;
          if (item.so_tang) changes.so_tang = item.so_tang;
          if (item.rong) changes.rong = item.rong;
          if (item.dai) changes.dai = item.dai;
          if (item.gia !== null) changes.gia = item.gia;
        }
        return {
          id: item.id,
          changes,
        };
      });

      if (onConfirmMigration) {
        await onConfirmMigration(batch);
      } else {
        const token = localStorage.getItem("admin_token");
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        // Attempt sequential updates over PUT /api/properties/:id
        for (const task of batch) {
          await safeFetchJson(`/api/properties/${task.id}`, {
            method: "PUT",
            headers,
            body: JSON.stringify(task.changes),
            credentials: "include",
          });
        }
      }

      setDoneMessage(
        `Đã ánh xạ và đồng bộ thành công ${batch.length} bản ghi sang 2 cột trạng thái chuẩn!`
      );
      if (onMigrationSuccess) {
        onMigrationSuccess();
      }
    } catch (err: any) {
      alert("Lỗi: " + (err?.message || err));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-4xl max-h-[90vh] bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Đề xuất ánh xạ dữ liệu cũ sang 2 cột trạng thái chuẩn ({summary.total} tin)
              </h3>
              <p className="text-xs text-slate-400">
                Kiểm tra quy tắc chuyển đổi và kết quả dự kiến trước khi xác nhận lưu vào cơ sở dữ liệu
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 1. Bảng quy tắc ánh xạ đề xuất */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cột 1: trang_thai_kinh_doanh */}
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Cột 1: trang_thai_kinh_doanh
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Tổng: {summary.total} tin
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <span>status = 'moi' / 'dang_lien_he'</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                      <code className="text-amber-300 font-bold">nguon_tho</code>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Nguồn thô mới thu thập hoặc đang liên hệ
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-md bg-slate-800 font-mono font-bold text-slate-200">
                    {summary.kdCounts.nguon_tho} tin
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <span>status = 'da_ky' / 'da_chot'</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                      <code className="text-sky-400 font-bold">da_ky</code>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Nguồn đã ký hợp đồng / xác nhận hoa hồng
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-md bg-sky-500/15 text-sky-300 font-mono font-bold">
                    {summary.kdCounts.da_ky} tin
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <span>status = 'da_ban' / 'đã bán'</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                      <code className="text-rose-400 font-bold">da_ban</code>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Nguồn đã bán / ngừng giao dịch
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-md bg-rose-500/15 text-rose-300 font-mono font-bold">
                    {summary.kdCounts.da_ban} tin
                  </span>
                </div>
              </div>
            </div>

            {/* Cột 2: trang_thai_xu_ly */}
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Cột 2: trang_thai_xu_ly
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Theo độ đầy đủ & lịch sử xuất
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <code className="text-slate-300 font-bold">tho</code>
                    <span className="text-slate-400 ml-2 text-[11px]">
                      Thiếu địa chỉ, giá hoặc diện tích cốt lõi
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-slate-800 font-mono font-bold text-slate-300">
                    {summary.xlCounts.tho} tin
                  </span>
                </div>

                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <code className="text-amber-300 font-bold">can_bo_sung</code>
                    <span className="text-slate-400 ml-2 text-[11px]">
                      Có địa chỉ + giá + DT nhưng còn thiếu trường phụ
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono font-bold">
                    {summary.xlCounts.can_bo_sung} tin
                  </span>
                </div>

                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <code className="text-emerald-300 font-bold">san_sang</code>
                    <span className="text-slate-400 ml-2 text-[11px]">
                      Đủ 11/11 trường bắt buộc hoặc đã đánh dấu sẵn sàng
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono font-bold">
                    {summary.xlCounts.san_sang} tin
                  </span>
                </div>

                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <code className="text-cyan-300 font-bold">da_len_hometea</code>
                    <span className="text-slate-400 ml-2 text-[11px]">
                      Đã xuất sang Hometea
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-mono font-bold">
                    {summary.xlCounts.da_len_hometea} tin
                  </span>
                </div>

                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <code className="text-indigo-300 font-bold">da_dang_fb</code>
                    <span className="text-slate-400 ml-2 text-[11px]">
                      Đã xuất sang Post Writer / Đăng FB
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-mono font-bold">
                    {summary.xlCounts.da_dang_fb} tin
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Tùy chọn chuẩn hóa kèm theo */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Tùy chọn chuẩn hóa đi kèm khi chạy ánh xạ
            </h4>
            <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={assignMissingMaTk}
                onChange={(e) => setAssignMissingMaTk(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-amber-500"
              />
              <span>
                Tự động gán <b>Mã TK chuẩn</b> (VD: <code>TK010AB</code>) cho{" "}
                <b>{summary.legacyMaTkCount}</b> bản ghi cũ chưa có mã hoặc dùng mã kiểu{" "}
                <code>#10, #11</code>
              </span>
            </label>
            <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={syncStructuredFields}
                onChange={(e) => setSyncStructuredFields(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-amber-500"
              />
              <span>
                Đồng bộ các trường đã bóc tách tự động (<code>so_nha</code>,{" "}
                <code>duong</code>, <code>phuong</code>, <code>dien_tich_so</code>,{" "}
                <code>dien_tich_thuc_te</code>, <code>gia</code>) vào các cột chuẩn
              </span>
            </label>
          </div>

          {/* 3. Bảng xem trước mẫu ánh xạ */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Xem trước chi tiết ánh xạ ({items.length} bản ghi)
              </h4>
              <span className="text-[11px] text-slate-500">
                Hiển thị 50 dòng đầu tiên
              </span>
            </div>
            <div className="border border-slate-800 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-900 text-slate-400 sticky top-0">
                  <tr>
                    <th className="py-2 px-3 border-b border-slate-800">Mã cũ / Gốc</th>
                    <th className="py-2 px-3 border-b border-slate-800">Mã TK chuẩn</th>
                    <th className="py-2 px-3 border-b border-slate-800">Địa chỉ</th>
                    <th className="py-2 px-3 border-b border-slate-800">Status cũ</th>
                    <th className="py-2 px-3 border-b border-slate-800">
                      trang_thai_kinh_doanh
                    </th>
                    <th className="py-2 px-3 border-b border-slate-800">
                      trang_thai_xu_ly
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 bg-slate-950">
                  {items.slice(0, 50).map((it) => (
                    <tr key={it.id} className="hover:bg-slate-900/50">
                      <td className="py-2 px-3 font-mono text-slate-400">
                        {it.raw_ma_tk || it.legacyToken || "—"}
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-amber-300">
                        {it.isLegacyOrMissingMaTk ? it.suggestedMaTk : it.ma_tk}
                      </td>
                      <td className="py-2 px-3 text-slate-200 truncate max-w-[220px]">
                        {[it.so_nha, it.duong, it.phuong]
                          .filter(Boolean)
                          .join(", ") || it.raw.name}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-400">
                        {it.raw.status || "moi"}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            BUSINESS_STATUS_META[it.trang_thai_kinh_doanh]
                              .badgeClass
                          }`}
                        >
                          {it.trang_thai_kinh_doanh}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            PROCESSING_STATUS_META[it.trang_thai_xu_ly]
                              .badgeClass
                          }`}
                        >
                          {it.trang_thai_xu_ly}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {doneMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{doneMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              Giữ nguyên toàn bộ {summary.total} bản ghi hiện có, không xóa bất kỳ dữ liệu nào.
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleRunMigration}
              disabled={isRunning}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {isRunning
                ? "Đang ánh xạ dữ liệu..."
                : `Xác nhận & Ánh xạ ${summary.total} tin`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
