import React, { useState } from "react";
import { Database, Image, ShieldAlert, Key, Clipboard, Check, Code, RefreshCw, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { safeFetchJson } from "../utils/apiClient";

interface ConfigGuideProps {
  missingVars: string[];
  supabaseConfigured: boolean;
  cloudinaryConfigured: boolean;
  sqlSchema?: string;
  onRefresh?: () => void;
}

export default function ConfigGuide({ missingVars, supabaseConfigured, cloudinaryConfigured, sqlSchema, onRefresh }: ConfigGuideProps) {
  const [copied, setCopied] = useState(false);
  const [testingDb, setTestingDb] = useState(false);
  const [dbTestResult, setDbTestResult] = useState<{
    connected: boolean;
    status: string;
    message: string;
    details?: string;
    setupSQL?: string;
  } | null>(null);

  const sqlToCopy = sqlSchema || `
-- 1. Tạo bảng chu_nha_can_ban với đầy đủ các cột và 5 trạng thái
CREATE TABLE IF NOT EXISTS chu_nha_can_ban (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  phone text,
  district text,
  facebook_link text,
  website_link text,
  content text,
  image_urls jsonb DEFAULT '[]'::jsonb,
  loai_giao_dich text CHECK (loai_giao_dich IN ('khach_mua', 'khach_ban', 'moi_gioi')) NOT NULL,
  status text CHECK (status IN ('moi', 'dang_lien_he', 'da_chot', 'da_ky', 'da_ban')) NOT NULL DEFAULT 'moi',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Thêm các cột còn thiếu phục vụ tính năng Nhập hàng loạt thư mục (không tạo bảng mới)
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS district text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS ma_tk text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS so_nha text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS duong text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS phuong text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS dien_tich text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS dien_tich_so numeric;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS dien_tich_thuc_te numeric;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS so_tang text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS rong text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS dai text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS gia bigint;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS loai_hinh text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS trang_thai_nguon text DEFAULT 'thô';
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS mo_ta_tho text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS moi_gioi_nguon text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS sdt_nguon text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS hoa_hong text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS toa_do text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS anh jsonb DEFAULT '[]'::jsonb;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS dia_chi text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS ten_thu_muc_goc text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS ngay_lay timestamp with time zone;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS ngay_nhap timestamp with time zone DEFAULT timezone('utc'::text, now());
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS trang_thai_kinh_doanh text DEFAULT 'nguon_tho';
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS trang_thai_xu_ly text DEFAULT 'tho';
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS da_xuat_hometea boolean DEFAULT false;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS da_xuat_fb boolean DEFAULT false;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS da_len_hometea boolean DEFAULT false;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS hometea_id text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS da_xep_lich_fb boolean DEFAULT false;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS da_dang_fb boolean DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_chu_nha_can_ban_ma_tk ON chu_nha_can_ban (ma_tk);

-- 3. Gán ma_tk chuẩn cho các bản ghi cũ & Tạo VIEW v_nguon_xuat (13 cột chuẩn, KHÔNG chứa trường nội bộ)
UPDATE chu_nha_can_ban
SET ma_tk = CASE
  WHEN ma_tk IS NOT NULL AND btrim(ma_tk) <> '' AND ma_tk !~ '^#?[0-9]+$' THEN upper(btrim(ma_tk))
  ELSE 'TK' || upper(substr(replace(id::text, '-', ''), 1, 6))
END
WHERE ma_tk IS NULL OR btrim(ma_tk) = '' OR ma_tk ~ '^#?[0-9]+$';

DROP VIEW IF EXISTS v_nguon_xuat;
CREATE OR REPLACE VIEW v_nguon_xuat AS
SELECT
  COALESCE(NULLIF(btrim(ma_tk), ''), 'TK' || upper(substr(replace(id::text, '-', ''), 1, 6))) AS ma_tk,
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
  COALESCE(NULLIF(btrim(trang_thai_xu_ly), ''), 'tho') AS trang_thai_xu_ly,
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
FROM chu_nha_can_ban;

-- 4. Đảm bảo ràng buộc kiểm tra hỗ trợ đầy đủ 5 trạng thái và tắt RLS
ALTER TABLE chu_nha_can_ban DROP CONSTRAINT IF EXISTS chu_nha_can_ban_status_check;
ALTER TABLE chu_nha_can_ban ADD CONSTRAINT chu_nha_can_ban_status_check CHECK (status IN ('moi', 'dang_lien_he', 'da_chot', 'da_ky', 'da_ban'));
ALTER TABLE chu_nha_can_ban DISABLE ROW LEVEL SECURITY;
  `.trim();

  const handleCopy = () => {
    navigator.clipboard.writeText(sqlToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTestDatabase = async () => {
    setTestingDb(true);
    setDbTestResult(null);
    try {
      const token = localStorage.getItem("admin_token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await safeFetchJson<{
        connected: boolean;
        status: string;
        message: string;
        details?: string;
        setupSQL?: string;
      }>("/api/test-db", { headers, credentials: "include" });

      if (!res.ok) {
        setDbTestResult({
          connected: false,
          status: "http_error",
          message:
            res.errorMessage ||
            `Lỗi kiểm tra DB (HTTP ${res.status} — GET /api/test-db)`,
          details: `HTTP ${res.status} — GET /api/test-db (Content-Type: ${res.contentType})`,
        });
        return;
      }

      setDbTestResult(res.data);
      if (res.data.connected && onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      setDbTestResult({
        connected: false,
        status: "fetch_error",
        message: "Không thể gửi yêu cầu kiểm tra đến máy chủ (GET /api/test-db).",
        details: err.message
      });
    } finally {
      setTestingDb(false);
    }
  };

  return (
    <div className="p-3.5 sm:p-6 max-w-4xl mx-auto my-4 sm:my-8 custom-bg-secondary rounded-xl sm:rounded-2xl border border-amber-500/30 shadow-xl w-full min-w-0 max-w-full overflow-hidden" id="config-guide-container">
      <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-6 w-full min-w-0">
        <div className="p-2.5 sm:p-3 bg-amber-500/10 text-amber-500 rounded-xl shrink-0">
          <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="text-lg sm:text-xl font-bold custom-text-primary truncate">Trung tâm kiểm tra & Cấu hình</h2>
            <button
              onClick={handleTestDatabase}
              disabled={testingDb}
              id="btn-test-db-connection"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingDb ? "animate-spin" : ""}`} />
              {testingDb ? "Đang kiểm tra..." : "Kiểm tra kết nối DB"}
            </button>
          </div>
          <p className="text-xs sm:text-sm custom-text-secondary mt-1 leading-relaxed">
            Ứng dụng cần liên kết với Supabase (Cơ sở dữ liệu) và Cloudinary (Lưu trữ ảnh) để đồng bộ dữ liệu vĩnh viễn.
          </p>
        </div>
      </div>

      {/* Live DB Test Result Banner if tested */}
      {dbTestResult && (
        <div 
          id="db-test-result-box"
          className={`mb-4 sm:mb-6 p-3.5 sm:p-4 rounded-xl border flex flex-col sm:flex-row items-start gap-3 transition-all w-full min-w-0 max-w-full overflow-hidden break-words ${
            dbTestResult.connected 
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
              : dbTestResult.status === "paused_or_dns_error"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
          }`}
        >
          {dbTestResult.connected ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-500" />
          ) : dbTestResult.status === "paused_or_dns_error" ? (
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
          ) : (
            <XCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
          )}
          <div className="space-y-2 text-xs flex-1 min-w-0 w-full">
            <p className="font-bold text-sm">
              {dbTestResult.connected 
                ? "✅ Kết nối Database Supabase thành công!" 
                : dbTestResult.status === "paused_or_dns_error"
                  ? "⏸️ Dự án Supabase đang TẠM DỪNG hoặc sai tên miền URL"
                  : "❌ Kết nối Database chưa hoàn tất"}
            </p>
            <p className="leading-relaxed font-medium break-words">{dbTestResult.message}</p>
            
            {dbTestResult.status === "paused_or_dns_error" && (
              <div className="p-3 bg-black/20 rounded-lg border border-amber-500/30 text-xs space-y-1.5 text-slate-200 w-full min-w-0 overflow-hidden">
                <p className="font-semibold text-amber-400">Cách khắc phục nhanh (1-2 phút):</p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300 break-words">
                  <li>
                    Truy cập trang quản trị: <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="underline text-amber-400 font-semibold hover:text-amber-300 break-all">supabase.com/dashboard</a>
                  </li>
                  <li>
                    Chọn dự án của bạn và nhấn nút <b>"Restore project"</b> (hoặc "Resume") để kích hoạt lại.
                  </li>
                  <li>
                    Đợi khoảng 1-2 phút để Supabase khởi động lại máy chủ, sau đó bấm nút <b>"Kiểm tra kết nối Database"</b> ở trên.
                  </li>
                  <li>
                    Nếu bạn đã tạo một dự án mới, hãy copy <b>Project URL</b> và <b>anon key</b> mới vào mục <b>Settings &gt; Secrets</b>.
                  </li>
                </ol>
              </div>
            )}

            {dbTestResult.details && (
              <p className="font-mono text-[11px] opacity-80 bg-black/10 p-1.5 rounded break-all whitespace-pre-wrap">
                Chi tiết lỗi: {dbTestResult.details}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8 w-full min-w-0 max-w-full">
        {/* Supabase Status Card */}
        <div className={`p-4 sm:p-5 rounded-xl border w-full min-w-0 overflow-hidden ${supabaseConfigured ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}>
          <div className="flex items-center justify-between mb-3 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <Database className={`w-5 h-5 shrink-0 ${supabaseConfigured ? "text-emerald-500" : "text-red-500"}`} />
              <h3 className="font-semibold custom-text-primary text-sm truncate">Supabase Database</h3>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase font-mono shrink-0 ${supabaseConfigured ? "bg-emerald-500/20 text-emerald-500" : "bg-red-500/20 text-red-500"}`}>
              {supabaseConfigured ? "Đã có Key" : "Chưa có Key"}
            </span>
          </div>
          <p className="text-xs custom-text-secondary mb-3 leading-relaxed">
            {supabaseConfigured 
              ? "Biến SUPABASE_URL và SUPABASE_ANON_KEY đã được nạp. Hãy chắc chắn bảng đã được tạo theo script dưới." 
              : "Thiếu biến môi trường SUPABASE_URL hoặc SUPABASE_ANON_KEY trong Settings > Secrets."}
          </p>

          <div className="p-3 bg-black/20 rounded-lg w-full min-w-0 overflow-hidden">
            <div className="flex justify-between items-center mb-2 min-w-0">
              <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 flex items-center gap-1 font-mono truncate">
                <Code className="w-3.5 h-3.5 text-amber-400 shrink-0" /> SQL TẠO BẢNG
              </span>
              <button 
                onClick={handleCopy}
                id="btn-copy-sql"
                className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer font-semibold bg-amber-500/10 px-2 py-1 rounded shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Clipboard className="w-3.5 h-3.5" />}
                {copied ? "Đã sao chép" : "Sao chép SQL"}
              </button>
            </div>
            <pre className="text-[10px] text-slate-300 font-mono overflow-x-auto max-h-36 p-2 bg-black/30 rounded border border-slate-700/50 leading-relaxed max-w-full">
              {sqlToCopy}
            </pre>
          </div>
          
          <div className="mt-3 space-y-1 text-[11px] text-slate-400">
            <p className="font-semibold text-amber-500 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Hướng dẫn chạy mã SQL:
            </p>
            <ol className="list-decimal list-inside space-y-1 pl-1 text-[10px]">
              <li>Mở dự án Supabase của bạn tại <b>supabase.com/dashboard</b></li>
              <li>Bấm vào biểu tượng <b>SQL Editor</b> (cột bên trái)</li>
              <li>Bấm <b>New query</b> &gt; Dán toàn bộ mã SQL trên &gt; Bấm <b>Run</b></li>
            </ol>
          </div>
        </div>

        {/* Cloudinary Status Card */}
        <div className={`p-4 sm:p-5 rounded-xl border w-full min-w-0 overflow-hidden ${cloudinaryConfigured ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}>
          <div className="flex items-center justify-between mb-3 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <Image className={`w-5 h-5 shrink-0 ${cloudinaryConfigured ? "text-emerald-500" : "text-red-500"}`} />
              <h3 className="font-semibold custom-text-primary text-sm truncate">Cloudinary Storage</h3>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase font-mono shrink-0 ${cloudinaryConfigured ? "bg-emerald-500/20 text-emerald-500" : "bg-red-500/20 text-red-500"}`}>
              {cloudinaryConfigured ? "Sẵn sàng" : "Chưa cấu hình"}
            </span>
          </div>
          <p className="text-xs custom-text-secondary mb-3 leading-relaxed">
            {cloudinaryConfigured 
              ? "Cấu hình tải ảnh lên Cloudinary đã sẵn sàng." 
              : "Thiếu biến VITE_CLOUDINARY_CLOUD_NAME hoặc VITE_CLOUDINARY_UPLOAD_PRESET."}
          </p>
          <div className="space-y-1.5 text-xs text-slate-300 bg-black/20 p-3 sm:p-3.5 rounded-lg border border-slate-700/20 w-full min-w-0 overflow-hidden">
            <p className="font-semibold text-[11px] text-slate-400">HƯỚNG DẪN CLOUDINARY PRESET:</p>
            <ol className="list-decimal list-inside space-y-1 text-[10px] sm:text-[11px] leading-relaxed">
              <li>Mở Cloudinary Dashboard &gt; Settings &gt; Upload.</li>
              <li>Tạo một <b>Unsigned Upload Preset</b> mới.</li>
              <li>Cấu hình Folder đích là <b>"chu-nha-ban"</b>.</li>
              <li>Lưu lại tên Preset và thêm vào <b>VITE_CLOUDINARY_UPLOAD_PRESET</b>.</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Variables Checklist */}
      <div className="p-3.5 sm:p-4 bg-black/10 rounded-xl border custom-border w-full min-w-0 max-w-full overflow-hidden">
        <h4 className="text-xs font-bold custom-text-primary uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
          <Key className="w-4 h-4 text-amber-500" /> Danh sách biến môi trường (.env)
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 w-full min-w-0">
          {[
            "SUPABASE_URL",
            "SUPABASE_ANON_KEY",
            "VITE_CLOUDINARY_CLOUD_NAME",
            "VITE_CLOUDINARY_UPLOAD_PRESET",
            "ADMIN_PASSWORD",
            "SESSION_SECRET"
          ].map((v) => {
            const isMissing = missingVars.includes(v);
            return (
              <div 
                key={v}
                className={`flex items-center gap-2 p-2 sm:p-2.5 rounded-lg text-xs font-mono border min-w-0 overflow-hidden ${
                  isMissing 
                    ? "border-red-500/20 bg-red-500/5 text-red-400" 
                    : "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${isMissing ? "bg-red-500" : "bg-emerald-500"}`}></span>
                <span className="truncate min-w-0">{v}</span>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] custom-text-secondary mt-3 italic leading-relaxed text-center sm:text-left">
          * Trong môi trường AI Studio, các biến này được thêm thông qua menu <b>Settings &gt; Secrets</b>. Khi các biến này được cấu hình, dữ liệu sẽ tự động đồng bộ trực tiếp với Supabase.
        </p>
      </div>
    </div>
  );
}
