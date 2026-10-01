import React, { useState, useEffect, useMemo } from "react";
import {
  History,
  Download,
  Copy,
  Check,
  Database,
  Send,
  Share2,
  ShieldCheck,
  Code2,
  FileSpreadsheet,
} from "lucide-react";
import { ExportLogEntry, VNguonXuatRow } from "../types";
import {
  NormalizedWarehouseProperty,
  toVNguonXuatRow,
  PROCESSING_STATUS_META,
} from "../utils/dataWarehouseUtils";
import { formatVndToReadable } from "../utils/bulkFolderParser";
import { safeFetchJson } from "../utils/apiClient";

interface ExportLogsViewProps {
  items: NormalizedWarehouseProperty[];
  exportLogs: ExportLogEntry[];
  onRefreshLogs: () => void;
  onExportViewData: (format: "json" | "csv") => Promise<void>;
  onSelectItem: (item: NormalizedWarehouseProperty) => void;
}

const V_NGUON_XUAT_SQL = `-- Đảm bảo mọi bản ghi cũ đều có ma_tk chuẩn trước khi truy vấn VIEW
UPDATE chu_nha_can_ban
SET ma_tk = CASE
  WHEN ma_tk IS NOT NULL AND btrim(ma_tk) <> '' AND ma_tk !~ '^#?[0-9]+$' THEN upper(btrim(ma_tk))
  WHEN name ~* '\\m(TK[A-Z0-9]{4,12})\\M' THEN upper(substring(name from '\\m(TK[A-Z0-9]{4,12})\\M'))
  WHEN content ~* 'Mã nguồn hàng:\\s*(TK[A-Z0-9_-]+)' THEN upper(substring(content from 'Mã nguồn hàng:\\s*(TK[A-Z0-9_-]+)'))
  WHEN ma_tk ~ '^#?[0-9]+$' THEN 'TK' || lpad(regexp_replace(ma_tk, '[^0-9]', '', 'g'), 3, '0') || upper(substr(replace(id::text, '-', ''), 1, 2))
  WHEN name ~ '^#[0-9]+' THEN 'TK' || lpad(substring(name from '^#([0-9]+)'), 3, '0') || upper(substr(replace(id::text, '-', ''), 1, 2))
  ELSE 'TK' || upper(substr(replace(id::text, '-', ''), 1, 6))
END
WHERE ma_tk IS NULL OR btrim(ma_tk) = '' OR ma_tk ~ '^#?[0-9]+$';

-- Tạo VIEW v_nguon_xuat trong Supabase:
-- Đủ mọi dòng, KHÔNG lọc ngầm, 13 cột chuẩn, tuyệt đối KHÔNG chứa sdt_nguon, moi_gioi_nguon, mo_ta_tho
DROP VIEW IF EXISTS v_nguon_xuat;
CREATE OR REPLACE VIEW v_nguon_xuat AS
SELECT
  COALESCE(
    NULLIF(btrim(ma_tk), ''),
    'TK' || upper(substr(replace(id::text, '-', ''), 1, 6))
  ) AS ma_tk,
  COALESCE(so_nha, '') AS so_nha,
  COALESCE(duong, '') AS duong,
  COALESCE(NULLIF(btrim(phuong), ''), COALESCE(district, '')) AS phuong,
  dien_tich_so,
  dien_tich_thuc_te,
  COALESCE(so_tang, '') AS so_tang,
  COALESCE(rong, '') AS rong,
  COALESCE(dai, '') AS dai,
  gia,
  CASE
    WHEN anh IS NOT NULL AND jsonb_typeof(anh) = 'array' AND jsonb_array_length(anh) > 0 THEN anh
    WHEN image_urls IS NOT NULL AND jsonb_typeof(image_urls) = 'array' THEN image_urls
    ELSE '[]'::jsonb
  END AS anh,
  COALESCE(
    NULLIF(btrim(trang_thai_xu_ly), ''),
    CASE
      WHEN trang_thai_nguon = 'sẵn sàng đăng' THEN 'san_sang'
      WHEN trang_thai_nguon = 'đã bổ sung' THEN 'can_bo_sung'
      ELSE 'tho'
    END
  ) AS trang_thai_xu_ly,
  array_to_string(
    array_remove(ARRAY[
      CASE WHEN ma_tk IS NULL OR btrim(ma_tk) = '' OR ma_tk ~ '^#?[0-9]+$' THEN 'ma_tk' END,
      CASE WHEN so_nha IS NULL OR btrim(so_nha) = '' THEN 'so_nha' END,
      CASE WHEN duong IS NULL OR btrim(duong) = '' THEN 'duong' END,
      CASE WHEN (phuong IS NULL OR btrim(phuong) = '') AND (district IS NULL OR btrim(district) = '') THEN 'phuong' END,
      CASE WHEN dien_tich_so IS NULL OR dien_tich_so <= 0 THEN 'dien_tich_so' END,
      CASE WHEN dien_tich_thuc_te IS NULL OR dien_tich_thuc_te <= 0 THEN 'dien_tich_thuc_te' END,
      CASE WHEN so_tang IS NULL OR btrim(so_tang) = '' THEN 'so_tang' END,
      CASE WHEN rong IS NULL OR btrim(rong) = '' THEN 'rong' END,
      CASE WHEN dai IS NULL OR btrim(dai) = '' THEN 'dai' END,
      CASE WHEN gia IS NULL OR gia <= 0 THEN 'gia' END,
      CASE WHEN (anh IS NULL OR jsonb_typeof(anh) <> 'array' OR jsonb_array_length(anh) = 0)
            AND (image_urls IS NULL OR jsonb_typeof(image_urls) <> 'array' OR jsonb_array_length(image_urls) = 0)
           THEN 'anh' END
    ], NULL),
    ', '
  ) AS thieu
FROM chu_nha_can_ban;`;

export default function ExportLogsView({
  items,
  exportLogs,
  onExportViewData,
  onSelectItem,
}: ExportLogsViewProps) {
  const [activeSubView, setActiveSubView] = useState<"logs" | "v_nguon_xuat">(
    "logs"
  );
  const [showSql, setShowSql] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [remoteViewStatus, setRemoteViewStatus] = useState<string | null>(null);

  const viewRows: Array<{
    norm: NormalizedWarehouseProperty;
    row: VNguonXuatRow;
  }> = useMemo(() => {
    return items.map((norm) => ({
      norm,
      row: toVNguonXuatRow(norm),
    }));
  }, [items]);

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    safeFetchJson<{ source?: string; rows?: any[] }>("/api/v-nguon-xuat", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    })
      .then((res) => {
        if (res.ok && res.data?.source === "supabase_view") {
          setRemoteViewStatus(
            `VIEW v_nguon_xuat đang hoạt động trực tiếp trên Supabase (${res.data.rows?.length || 0} dòng)`
          );
        } else {
          setRemoteViewStatus(
            "Chế độ đồng bộ chuẩn v_nguon_xuat (bấm 'Xem SQL VIEW v_nguon_xuat' nếu muốn chạy lại lệnh khởi tạo VIEW trong Supabase SQL Editor)"
          );
        }
      })
      .catch(() => {});
  }, []);

  const handleCopySql = () => {
    navigator.clipboard.writeText(V_NGUON_XUAT_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  return (
    <div className="space-y-5">
      {/* Top Header & Sub-navigation */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base sm:text-lg font-bold text-slate-100">
              Nhật ký xuất & VIEW `v_nguon_xuat` (Hometea / Post Writer)
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Theo dõi lịch sử đẩy nguồn sang Hometea & Post Writer, kiểm tra trực tiếp 13 cột chuẩn của VIEW{" "}
            <code className="text-cyan-300">v_nguon_xuat</code> (không lọc ngầm, ẩn hoàn toàn thông tin nội bộ).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubView("logs")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border ${
              activeSubView === "logs"
                ? "bg-amber-500 text-slate-950 border-amber-500"
                : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Nhật ký xuất ({exportLogs.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveSubView("v_nguon_xuat")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border ${
              activeSubView === "v_nguon_xuat"
                ? "bg-cyan-500 text-slate-950 border-cyan-500"
                : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Bảng VIEW v_nguon_xuat ({viewRows.length} dòng)
          </button>

          <button
            type="button"
            onClick={() => setShowSql((s) => !s)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5 text-amber-400" />
            {showSql ? "Ẩn SQL VIEW" : "Xem SQL VIEW v_nguon_xuat"}
          </button>
        </div>
      </div>

      {/* SQL Box for v_nguon_xuat */}
      {showSql && (
        <div className="p-4 rounded-2xl bg-slate-950 border border-cyan-500/40 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-cyan-300 font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>
                Định nghĩa SQL chuẩn của <code>v_nguon_xuat</code> (13 cột chuẩn — KHÔNG chứa{" "}
                <code>sdt_nguon</code>, <code>moi_gioi_nguon</code>,{" "}
                <code>mo_ta_tho</code>)
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopySql}
              className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              {copiedSql ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Đã sao chép SQL
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Sao chép SQL chạy trên Supabase
                </>
              )}
            </button>
          </div>
          <pre className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-200 overflow-x-auto max-h-72">
            {V_NGUON_XUAT_SQL}
          </pre>
        </div>
      )}

      {/* SUB-VIEW 1: NHẬT KÝ XUẤT */}
      {activeSubView === "logs" && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Lịch sử xuất dữ liệu sang Hometea & Post Writer
              </h3>
              <p className="text-xs text-slate-400">
                Ghi nhận thời gian, người xuất, kênh đích và danh sách Mã TK trong từng đợt xuất.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onExportViewData("json")}
                className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Xuất JSON v_nguon_xuat
              </button>
              <button
                type="button"
                onClick={() => onExportViewData("csv")}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Xuất CSV v_nguon_xuat
              </button>
            </div>
          </div>

          {exportLogs.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <History className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-sm font-bold text-slate-200">
                Chưa có nhật ký xuất nào được ghi nhận
              </p>
              <p className="text-xs text-slate-400">
                Chọn các dòng trong Bảng Kho Chuẩn rồi bấm "Đẩy Hometea", "Xuất Post Writer" hoặc tải file v_nguon_xuat để ghi nhật ký tự động.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950/90 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">Thời gian</th>
                    <th className="py-2.5 px-4">Kênh xuất đích</th>
                    <th className="py-2.5 px-4">Số lượng</th>
                    <th className="py-2.5 px-4">Danh sách Mã TK</th>
                    <th className="py-2.5 px-4">Người thực hiện</th>
                    <th className="py-2.5 px-4">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {exportLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-mono text-slate-300 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString("vi-VN")}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold border inline-flex items-center gap-1 ${
                            log.target === "hometea"
                              ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/35"
                              : log.target === "post_writer"
                              ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/35"
                              : "bg-emerald-500/15 text-emerald-300 border-emerald-500/35"
                          }`}
                        >
                          {log.target === "hometea" ? (
                            <Send className="w-3 h-3" />
                          ) : log.target === "post_writer" ? (
                            <Share2 className="w-3 h-3" />
                          ) : (
                            <Database className="w-3 h-3" />
                          )}
                          {log.target_label}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-amber-300">
                        {log.record_count} tin
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {log.ma_tk_list.slice(0, 8).map((code) => (
                            <span
                              key={code}
                              className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[10px]"
                            >
                              {code}
                            </span>
                          ))}
                          {log.ma_tk_list.length > 8 && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                              +{log.ma_tk_list.length - 8} mã
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-300">
                        {log.exported_by}
                      </td>
                      <td className="py-2.5 px-4 text-slate-400">
                        {log.note || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-VIEW 2: TRỰC TIẾP BẢNG VIEW v_nguon_xuat */}
      {activeSubView === "v_nguon_xuat" && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-100">
                  Dữ liệu VIEW `v_nguon_xuat` ({viewRows.length} dòng — Đủ mọi dòng, KHÔNG lọc ngầm)
                </h3>
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
                  Đã loại bỏ sdt_nguon, moi_gioi_nguon, mo_ta_tho
                </span>
              </div>
              {remoteViewStatus && (
                <p className="text-[11px] text-slate-400">{remoteViewStatus}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onExportViewData("json")}
                className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Tải JSON ({viewRows.length} dòng)
              </button>
              <button
                type="button"
                onClick={() => onExportViewData("csv")}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Tải CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">ma_tk</th>
                  <th className="py-2.5 px-3">so_nha</th>
                  <th className="py-2.5 px-3">duong</th>
                  <th className="py-2.5 px-3">phuong</th>
                  <th className="py-2.5 px-3">dien_tich_so</th>
                  <th className="py-2.5 px-3">dien_tich_thuc_te</th>
                  <th className="py-2.5 px-3">so_tang</th>
                  <th className="py-2.5 px-3">rong</th>
                  <th className="py-2.5 px-3">dai</th>
                  <th className="py-2.5 px-3">gia</th>
                  <th className="py-2.5 px-3">anh</th>
                  <th className="py-2.5 px-3">trang_thai_xu_ly</th>
                  <th className="py-2.5 px-3">thieu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono text-[11px]">
                {viewRows.map(({ norm, row }) => (
                  <tr
                    key={norm.id}
                    onClick={() => onSelectItem(norm)}
                    className="hover:bg-slate-800/50 cursor-pointer"
                  >
                    <td className="py-2 px-3 font-bold text-amber-300 whitespace-nowrap">
                      {row.ma_tk}
                    </td>
                    <td className="py-2 px-3 text-slate-200">
                      {row.so_nha || "—"}
                    </td>
                    <td className="py-2 px-3 text-slate-200 max-w-[160px] truncate">
                      {row.duong || "—"}
                    </td>
                    <td className="py-2 px-3 text-slate-300">
                      {row.phuong || "—"}
                    </td>
                    <td className="py-2 px-3 text-slate-200">
                      {row.dien_tich_so ?? "null"}
                    </td>
                    <td className="py-2 px-3 text-slate-200">
                      {row.dien_tich_thuc_te ?? "null"}
                    </td>
                    <td className="py-2 px-3 text-slate-300">
                      {row.so_tang || "—"}
                    </td>
                    <td className="py-2 px-3 text-slate-300">
                      {row.rong || "—"}
                    </td>
                    <td className="py-2 px-3 text-slate-300">
                      {row.dai || "—"}
                    </td>
                    <td className="py-2 px-3 text-emerald-400 whitespace-nowrap">
                      {row.gia ? formatVndToReadable(row.gia) : "null"}
                    </td>
                    <td className="py-2 px-3 text-slate-300">
                      [{Array.isArray(row.anh) ? row.anh.length : 0} ảnh]
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold border ${
                          PROCESSING_STATUS_META[row.trang_thai_xu_ly]
                            .badgeClass
                        }`}
                      >
                        {row.trang_thai_xu_ly}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-rose-300 max-w-[200px] truncate">
                      {row.thieu || (
                        <span className="text-emerald-400">"" (Đủ)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
