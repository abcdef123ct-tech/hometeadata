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
  items?: NormalizedWarehouseProperty[];
  exportLogs?: ExportLogEntry[];
  onRefreshLogs?: () => void;
  onExportViewData?: (format: "json" | "csv") => Promise<void>;
  onSelectItem?: (item: NormalizedWarehouseProperty) => void;
  logs?: ExportLogEntry[]; // fallback log parameter
  onBackToProperties?: () => void;
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
  items = [],
  exportLogs,
  onExportViewData,
  onSelectItem,
  logs,
  onBackToProperties,
}: ExportLogsViewProps) {
  const [activeSubView, setActiveSubView] = useState<"logs" | "v_nguon_xuat">(
    "logs"
  );
  const [showSql, setShowSql] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [remoteViewStatus, setRemoteViewStatus] = useState<string | null>(null);

  const displayLogs = useMemo(() => {
    if (exportLogs && exportLogs.length > 0) return exportLogs;
    if (logs && logs.length > 0) return logs;
    return [];
  }, [exportLogs, logs]);

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
    <div className="space-y-6 animate-fadeIn">
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
              <History className="w-5 h-5 text-cyan-400" />
              Nhật ký Truy xuất & Đồng bộ Dữ liệu
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Xem danh sách các đợt xuất file JSON, CSV, đồng bộ sang Hometea và đăng bài Post Writer.
          </p>
        </div>

        {/* Sub-view switcher */}
        <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 self-start sm:self-center shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubView("logs")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeSubView === "logs"
                ? "bg-cyan-500 text-slate-950 font-extrabold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Nhật ký đợt xuất
          </button>
          <button
            type="button"
            onClick={() => setActiveSubView("v_nguon_xuat")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeSubView === "v_nguon_xuat"
                ? "bg-cyan-500 text-slate-950 font-extrabold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Bản xem trước VIEW v_nguon_xuat
          </button>
        </div>
      </div>

      {activeSubView === "logs" ? (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-xl">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100">
              Nhật ký chi tiết các đợt đồng bộ ({displayLogs.length})
            </h3>
          </div>

          {displayLogs.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-2">
              <Database className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-sm">Chưa có lượt đồng bộ hay xuất bản dữ liệu nào được ghi nhận.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950/90 text-slate-400 border-b border-slate-800 uppercase text-[10px] tracking-wider font-bold">
                  <tr>
                    <th className="py-3 px-4">Thời gian xuất</th>
                    <th className="py-3 px-4">Kênh truyền / Định dạng</th>
                    <th className="py-3 px-4 text-center">Số bản ghi</th>
                    <th className="py-3 px-4">Người thực hiện</th>
                    <th className="py-3 px-4">Mã TK đã đồng bộ</th>
                    <th className="py-3 px-4">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {displayLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30">
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {new Date(log.created_at).toLocaleString("vi-VN")}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border inline-flex items-center gap-1 ${
                            log.target === "hometea"
                              ? "bg-cyan-500/15 border-cyan-500/35 text-cyan-300"
                              : log.target === "post_writer"
                              ? "bg-indigo-500/15 border-indigo-500/35 text-indigo-300"
                              : "bg-emerald-500/15 border-emerald-500/35 text-emerald-300"
                          }`}
                        >
                          {log.target === "hometea" && <Send className="w-2.5 h-2.5" />}
                          {log.target === "post_writer" && <Share2 className="w-2.5 h-2.5" />}
                          {log.target_label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-200">
                        {log.record_count}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300 font-medium">
                        {log.exported_by}
                      </td>
                      <td className="py-3.5 px-4 max-w-[280px]">
                        <div className="flex flex-wrap gap-1">
                          {log.ma_tk_list.slice(0, 10).map((m) => (
                            <span
                              key={m}
                              className="px-1.5 py-0.2 rounded bg-slate-950 text-[10px] text-amber-300 font-mono font-semibold border border-slate-800"
                            >
                              {m}
                            </span>
                          ))}
                          {log.ma_tk_list.length > 10 && (
                            <span className="text-[10px] text-slate-500 font-bold self-center pl-1">
                              +{log.ma_tk_list.length - 10} tin khác
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 italic max-w-xs truncate">
                        {log.note || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-cyan-950/25 border border-cyan-500/30 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="text-xs font-bold text-cyan-300 block">
                {remoteViewStatus || "Trạng thái VIEW v_nguon_xuat"}
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                VIEW `v_nguon_xuat` là bảng ảo chuẩn hóa, thời gian thực, tự động gán Mã TK chuẩn và dọn sạch sđt/tên chủ nhà để kết nối an toàn ra ngoài.
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2.5">
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  Dữ liệu v_nguon_xuat xem trước ({viewRows.length} dòng)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSql(!showSql)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer border border-slate-700"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  Xem SQL VIEW v_nguon_xuat
                </button>
                {onExportViewData && (
                  <>
                    <button
                      type="button"
                      onClick={() => onExportViewData("json")}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Xuất JSON chuẩn
                    </button>
                    <button
                      type="button"
                      onClick={() => onExportViewData("csv")}
                      className="px-3 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-750 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                      Xuất CSV chuẩn
                    </button>
                  </>
                )}
              </div>
            </div>

            {showSql && (
              <div className="p-4 bg-slate-950 border-b border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 uppercase font-mono font-bold tracking-wider">
                    Lệnh SQL tạo VIEW v_nguon_xuat
                  </span>
                  <button
                    onClick={handleCopySql}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold flex items-center gap-1"
                  >
                    {copiedSql ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        Đã sao chép
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Sao chép SQL
                      </>
                    )}
                  </button>
                </div>
                <pre className="text-[11px] font-mono p-3 rounded-lg bg-slate-900 text-cyan-300 overflow-x-auto max-h-48 leading-relaxed">
                  {V_NGUON_XUAT_SQL}
                </pre>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950/90 text-slate-400 border-b border-slate-800 uppercase text-[10px] tracking-wider font-bold">
                  <tr>
                    <th className="py-2.5 px-4 w-28">Mã TK</th>
                    <th className="py-2.5 px-4 w-48">Địa chỉ (`so_nha` / `duong`)</th>
                    <th className="py-2.5 px-4 w-28">Phường</th>
                    <th className="py-2.5 px-4 w-28 text-center">Diện tích (Sổ/TT)</th>
                    <th className="py-2.5 px-4 w-28">Kích thước / Tầng</th>
                    <th className="py-2.5 px-4 w-24">Giá chào</th>
                    <th className="py-2.5 px-4 w-28">Trạng thái xử lý</th>
                    <th className="py-2.5 px-4">Sự thiếu hụt chuẩn hóa (`thieu`)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {viewRows.slice(0, 50).map(({ norm, row }) => (
                    <tr key={norm.id} className="hover:bg-slate-800/20">
                      <td className="py-2.5 px-4 font-mono font-bold text-amber-300">
                        {row.ma_tk}
                      </td>
                      <td className="py-2.5 px-4 truncate max-w-[200px]">
                        <span className="font-bold text-slate-200">
                          {row.so_nha || <span className="text-slate-600 font-normal">Chưa gán</span>}
                        </span>{" "}
                        <span className="text-slate-400">
                          {row.duong || <span className="text-slate-600 font-normal">Chưa gán</span>}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-300">{row.phuong}</td>
                      <td className="py-2.5 px-4 text-center font-mono font-medium">
                        {row.dien_tich_so || "—"}/{row.dien_tich_thuc_te || "—"}{" "}
                        <span className="text-[10px] text-slate-500">m²</span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-400">
                        {row.rong || "?"}×{row.dai || "?"}m · {row.so_tang ? `${row.so_tang} t` : "? t"}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-emerald-400">
                        {row.gia ? formatVndToReadable(row.gia) : "—"}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            PROCESSING_STATUS_META[row.trang_thai_xu_ly]?.badgeClass || ""
                          }`}
                        >
                          {row.trang_thai_xu_ly}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        {row.thieu ? (
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {row.thieu.split(", ").map((t) => (
                              <span
                                key={t}
                                className="px-1.5 py-0.2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[9px] font-bold"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-emerald-400 font-bold text-[10px]">👑 Hoàn hảo (11/11)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {viewRows.length > 50 && (
              <div className="p-4 bg-slate-950/60 text-center text-xs text-slate-500 font-medium">
                Đang hiển thị 50 bản ghi đầu tiên trong tổng số {viewRows.length} bản ghi của VIEW v_nguon_xuat.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
