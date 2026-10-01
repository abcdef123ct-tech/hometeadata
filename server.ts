import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import multer from "multer";

dotenv.config();

// Helper to sanitize environment variables (strip quotes, whitespace)
const cleanEnvVar = (val: string | undefined): string => {
  if (!val) return "";
  const cleaned = val.trim().replace(/^["']|["']$/g, "").trim();
  if (cleaned === "undefined" || cleaned === "null" || cleaned === "") {
    return "";
  }
  return cleaned;
};

// Parse full Cloudinary URL if present: cloudinary://api_key:api_secret@cloud_name
const parseCloudinaryUri = (
  val: string
): { cloudName: string; apiKey: string; apiSecret: string } | null => {
  if (!val) return null;
  let cleaned = val.trim().replace(/^["']|["']$/g, "").trim();
  if (cleaned.startsWith("CLOUDINARY_URL=")) {
    cleaned = cleaned.substring("CLOUDINARY_URL=".length).trim().replace(/^["']|["']$/g, "");
  }
  if (!cleaned.startsWith("cloudinary://")) return null;

  const withoutProto = cleaned.substring("cloudinary://".length);
  const atIndex = withoutProto.lastIndexOf("@");
  if (atIndex === -1) return null;

  const creds = withoutProto.substring(0, atIndex);
  const hostPart = withoutProto.substring(atIndex + 1).split("/")[0].split("?")[0].trim();
  const colonIndex = creds.indexOf(":");
  if (colonIndex === -1) {
    return { cloudName: hostPart, apiKey: creds.trim(), apiSecret: "" };
  }
  return {
    cloudName: hostPart,
    apiKey: creds.substring(0, colonIndex).trim(),
    apiSecret: creds.substring(colonIndex + 1).trim(),
  };
};

// Helper to extract Cloud Name from Cloudinary connection string if provided
const extractCloudName = (val: string): string => {
  if (!val) return "";
  const parsed = parseCloudinaryUri(val);
  if (parsed?.cloudName) return parsed.cloudName;

  let cleaned = val.trim().replace(/^["']|["']$/g, "").trim();
  if (cleaned.startsWith("CLOUDINARY_URL=")) {
    cleaned = cleaned.substring("CLOUDINARY_URL=".length).trim();
  }
  if (cleaned.startsWith("cloudinary://")) {
    const atIndex = cleaned.lastIndexOf("@");
    if (atIndex !== -1) {
      cleaned = cleaned.substring(atIndex + 1).trim();
    }
  }
  cleaned = cleaned.split("/")[0].split("?")[0].trim();
  return cleaned;
};

// Helper to retrieve and clean Cloudinary configuration safely
function getCloudinaryConfig() {
  const rawCloudName =
    cleanEnvVar(process.env.VITE_CLOUDINARY_CLOUD_NAME) ||
    cleanEnvVar(process.env.CLOUDINARY_CLOUD_NAME);
  const rawPreset =
    cleanEnvVar(process.env.VITE_CLOUDINARY_UPLOAD_PRESET) ||
    cleanEnvVar(process.env.CLOUDINARY_UPLOAD_PRESET);
  const rawCloudinaryUrl = cleanEnvVar(process.env.CLOUDINARY_URL);

  const uriFromUrl = parseCloudinaryUri(rawCloudinaryUrl);
  const uriFromName = parseCloudinaryUri(rawCloudName);
  const uriFromPreset = parseCloudinaryUri(rawPreset);

  let name =
    extractCloudName(rawCloudName) ||
    uriFromUrl?.cloudName ||
    uriFromName?.cloudName ||
    uriFromPreset?.cloudName ||
    "";

  let apiKey =
    cleanEnvVar(process.env.CLOUDINARY_API_KEY) ||
    cleanEnvVar(process.env.VITE_CLOUDINARY_API_KEY) ||
    uriFromUrl?.apiKey ||
    uriFromName?.apiKey ||
    uriFromPreset?.apiKey ||
    "";

  let apiSecret =
    cleanEnvVar(process.env.CLOUDINARY_API_SECRET) ||
    cleanEnvVar(process.env.VITE_CLOUDINARY_API_SECRET) ||
    uriFromUrl?.apiSecret ||
    uriFromName?.apiSecret ||
    uriFromPreset?.apiSecret ||
    "";

  // If rawPreset is actually a cloudinary:// URI, don't treat it as an upload_preset name
  let preset = uriFromPreset ? "" : rawPreset;
  if (preset.startsWith("CLOUDINARY_UPLOAD_PRESET=")) {
    preset = preset.substring("CLOUDINARY_UPLOAD_PRESET=".length).trim().replace(/^["']|["']$/g, "");
  } else if (preset.startsWith("VITE_CLOUDINARY_UPLOAD_PRESET=")) {
    preset = preset
      .substring("VITE_CLOUDINARY_UPLOAD_PRESET=".length)
      .trim()
      .replace(/^["']|["']$/g, "");
  }

  if (!name || name === "undefined" || name === "null" || name.trim() === "") {
    name = "";
  }
  if (!preset || preset === "undefined" || preset === "null" || preset.trim() === "") {
    preset = "";
  }

  return {
    cloudName: name,
    uploadPreset: preset,
    apiKey,
    apiSecret,
  };
}

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

// Global request logger for debugging
app.use((req, res, next) => {
  console.log(`[GLOBAL REQUEST] ${req.method} ${req.originalUrl || req.url} - Content-Type: ${req.headers["content-type"] || "none"}`);
  next();
});

// Environment configuration check
const SESSION_SECRET = cleanEnvVar(process.env.SESSION_SECRET) || "fallback_secret_for_development_purposes_only_123456";
const ADMIN_PASSWORD = cleanEnvVar(process.env.ADMIN_PASSWORD) || "admin";

const LOCAL_DB_PATH = path.join(process.cwd(), "local_properties.json");
const MANAGERS_DB_PATH = path.join(process.cwd(), "property_managers.json");

// Safe read/write utilities for local property managers mapping (starts empty)
function readPropertyManagers(): Record<string, any> {
  try {
    if (!fs.existsSync(MANAGERS_DB_PATH)) {
      const initial: Record<string, any> = {};
      fs.writeFileSync(MANAGERS_DB_PATH, JSON.stringify(initial, null, 2), "utf8");
      return initial;
    }
    const data = fs.readFileSync(MANAGERS_DB_PATH, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Lỗi đọc file property_managers.json:", err);
    return {};
  }
}

function writePropertyManagers(data: Record<string, any>) {
  try {
    fs.writeFileSync(MANAGERS_DB_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Lỗi ghi file property_managers.json:", err);
  }
}

// Safe read/write utilities for local properties database fallback (starts empty)
function readLocalDb(): any[] {
  try {
    if (!fs.existsSync(LOCAL_DB_PATH)) {
      const defaultData: any[] = [];
      fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(defaultData, null, 2), "utf8");
      return defaultData;
    }
    const data = fs.readFileSync(LOCAL_DB_PATH, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Lỗi đọc file local_properties.json, chuyển sang mảng rỗng:", err);
    return [];
  }
}

function writeLocalDb(data: any[]) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Lỗi ghi file local_properties.json:", err);
  }
}

// Helper to retrieve and clean Supabase configuration safely
function getSupabaseConfig() {
  let url = cleanEnvVar(process.env.SUPABASE_URL) || 
            cleanEnvVar(process.env.VITE_SUPABASE_URL) || 
            cleanEnvVar(process.env.NEXT_PUBLIC_SUPABASE_URL);
  
  let key = cleanEnvVar(process.env.SUPABASE_ANON_KEY) || 
            cleanEnvVar(process.env.VITE_SUPABASE_ANON_KEY) || 
            cleanEnvVar(process.env.SUPABASE_KEY) || 
            cleanEnvVar(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
            cleanEnvVar(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (url && !url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  if (url && url.endsWith("/")) {
    url = url.slice(0, -1);
  }

  return { url, key };
}

// Helper to retrieve service role key for Admin API operations
function getSupabaseServiceRoleKey(): string {
  return cleanEnvVar(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
         cleanEnvVar(process.env.SUPABASE_SERVICE_KEY) ||
         cleanEnvVar(process.env.SUPABASE_SERVICE_ROLE) ||
         cleanEnvVar(process.env.SERVICE_ROLE_KEY);
}

// Mask secret helper for secure diagnostic logging without leaking credentials
function maskSecret(val: string | undefined | null): string {
  if (!val) return "(trống / chưa thiết lập)";
  const trimmed = val.trim();
  if (trimmed.length <= 8) return `*** (độ dài: ${trimmed.length} ký tự)`;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-6)} (độ dài: ${trimmed.length} ký tự)`;
}

// Lazy-loaded Supabase Client to avoid crashing if credentials are missing
let supabaseClient: any = null;
let lastSupabaseUrl = "";
let lastSupabaseKey = "";

function getSupabase() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    throw new Error("SUPABASE_URL hoặc SUPABASE_ANON_KEY chưa được thiết lập trong biến môi trường / Secrets.");
  }
  if (!supabaseClient || lastSupabaseUrl !== url || lastSupabaseKey !== key) {
    supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });
    lastSupabaseUrl = url;
    lastSupabaseKey = key;
  }
  return supabaseClient;
}

// Optional Supabase Admin Client using Service Role Key (server-side only)
let supabaseAdminClient: any = null;
let lastAdminUrl = "";
let lastAdminKey = "";

function getSupabaseAdmin() {
  const { url } = getSupabaseConfig();
  const serviceKey = getSupabaseServiceRoleKey();
  if (!url || !serviceKey) {
    return null;
  }
  if (!supabaseAdminClient || lastAdminUrl !== url || lastAdminKey !== serviceKey) {
    supabaseAdminClient = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });
    lastAdminUrl = url;
    lastAdminKey = serviceKey;
  }
  return supabaseAdminClient;
}

const COMPLETE_SETUP_SQL = `
-- 1. Tạo bảng chu_nha_can_ban với đầy đủ các cột và các giá trị trạng thái
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
  created_by text,
  created_by_name text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ràng buộc kiểm tra trạng thái
ALTER TABLE chu_nha_can_ban DROP CONSTRAINT IF EXISTS chu_nha_can_ban_status_check;
ALTER TABLE chu_nha_can_ban ADD CONSTRAINT chu_nha_can_ban_status_check CHECK (status IN ('moi', 'dang_lien_he', 'da_chot', 'da_ky', 'da_ban'));
ALTER TABLE chu_nha_can_ban DISABLE ROW LEVEL SECURITY;

-- 2. Tạo bảng profiles liên kết với auth.users để quản lý tài khoản
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'staff',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;

-- Thêm cột district (Khu vực / Quận Huyện) vào chu_nha_can_ban nếu chưa có
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS district text;

-- Xóa cột thừa khu_vuc nếu có trong bảng chu_nha_can_ban
ALTER TABLE chu_nha_can_ban DROP COLUMN IF EXISTS khu_vuc;

-- Thêm các cột created_by và created_by_name vào chu_nha_can_ban nếu chưa có
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS created_by_name text;

-- Thêm các cột mở rộng phục vụ tính năng Nhập hàng loạt thư mục (chỉ thêm cột còn thiếu)
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS ma_tk text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS so_nha text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS duong text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS dia_chi text;
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
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS ten_thu_muc_goc text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS ngay_lay timestamp with time zone;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS ngay_nhap timestamp with time zone DEFAULT timezone('utc'::text, now());

-- Hai cột trạng thái chuẩn Kho Dữ Liệu Chuẩn (Hometea & Post Writer)
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS trang_thai_kinh_doanh text DEFAULT 'nguon_tho';
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS trang_thai_xu_ly text DEFAULT 'tho';
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS da_xuat_hometea boolean DEFAULT false;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS da_xuat_fb boolean DEFAULT false;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS da_len_hometea boolean DEFAULT false;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS hometea_id text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS da_xep_lich_fb boolean DEFAULT false;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS da_dang_fb boolean DEFAULT false;

-- Gán ma_tk chuẩn cho các bản ghi cũ chưa có ma_tk hoặc có mã kiểu #10, #11
UPDATE chu_nha_can_ban
SET ma_tk = CASE
  WHEN ma_tk IS NOT NULL AND btrim(ma_tk) <> '' AND ma_tk !~ '^#?[0-9]+$' THEN upper(btrim(ma_tk))
  WHEN name ~* '\m(TK[A-Z0-9]{4,12})\M' THEN upper(substring(name from '\m(TK[A-Z0-9]{4,12})\M'))
  WHEN content ~* 'Mã nguồn hàng:\s*(TK[A-Z0-9_-]+)' THEN upper(substring(content from 'Mã nguồn hàng:\s*(TK[A-Z0-9_-]+)'))
  WHEN ma_tk ~ '^#?[0-9]+$' THEN 'TK' || lpad(regexp_replace(ma_tk, '[^0-9]', '', 'g'), 3, '0') || upper(substr(replace(id::text, '-', ''), 1, 2))
  WHEN name ~ '^#[0-9]+' THEN 'TK' || lpad(substring(name from '^#([0-9]+)'), 3, '0') || upper(substr(replace(id::text, '-', ''), 1, 2))
  ELSE 'TK' || upper(substr(replace(id::text, '-', ''), 1, 6))
END
WHERE ma_tk IS NULL OR btrim(ma_tk) = '' OR ma_tk ~ '^#?[0-9]+$';

-- Ràng buộc duy nhất ma_tk để hỗ trợ upsert onConflict: 'ma_tk'
DROP INDEX IF EXISTS idx_chu_nha_can_ban_ma_tk_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_chu_nha_can_ban_ma_tk_unique ON chu_nha_can_ban (ma_tk);

-- Tạo VIEW v_nguon_xuat: đủ mọi dòng, KHÔNG lọc ngầm, đúng 13 cột chuẩn, KHÔNG chứa sdt_nguon, moi_gioi_nguon, mo_ta_tho
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
FROM chu_nha_can_ban;

-- 3. Trigger tự động thêm dòng vào bảng profiles khi tạo User trong auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, role, status)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'phone', ''),
    COALESCE(new.raw_user_meta_data->>'role', 'staff'),
    'active'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    phone = COALESCE(EXCLUDED.phone, profiles.phone),
    role = COALESCE(EXCLUDED.role, profiles.role);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Đồng bộ ngay lập tức các tài khoản hiện có trong auth.users vào bảng profiles
INSERT INTO public.profiles (id, email, full_name, role, status)
SELECT 
  id, 
  email, 
  COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
  COALESCE(raw_user_meta_data->>'role', 'admin'),
  'active'
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email;
`.trim();

// Middleware to authenticate admin requests
function authenticateAdmin(req: any, res: any, next: any) {
  let token = req.cookies?.admin_token;
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
      token = parts[1];
    }
  }
  if (!token && req.headers["x-access-token"]) {
    token = req.headers["x-access-token"];
  }

  if (!token) {
    return res.status(401).json({ error: "Chưa đăng nhập. Vui lòng đăng nhập hệ thống." });
  }
  try {
    const decoded = jwt.verify(token, SESSION_SECRET);
    req.admin = decoded;
    next();
  } catch (err: any) {
    return res.status(401).json({ error: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại." });
  }
}

// Helper to handle service-level errors gracefully
function handleSupabaseError(error: any, res: any) {
  console.error("Supabase Error Details:", error);
  const errorMsg = String(error?.message || "");
  const errorDetails = String(error?.details || "");
  const errorCode = String(error?.code || "");

  const isTableMissing = errorCode === '42P01' || 
                         errorMsg.includes("relation") || 
                         errorDetails.includes("does not exist") || 
                         errorMsg.includes("does not exist");
                         
  const isDnsOrPausedError = errorCode === "ENOTFOUND" ||
                             errorMsg.includes("ENOTFOUND") ||
                             errorDetails.includes("ENOTFOUND") ||
                             errorMsg.includes("fetch failed") ||
                             errorDetails.includes("fetch failed");

  const isConnectionError = isDnsOrPausedError ||
                            errorCode === "ECONNREFUSED" ||
                            errorMsg.includes("Invalid API key") ||
                            errorMsg.includes("apiKey") ||
                            errorMsg.includes("JWT");

  const isRLSPolicyViolation = errorCode === '42501' ||
                               errorMsg.toLowerCase().includes("row-level security") || 
                               errorDetails.toLowerCase().includes("row-level security") ||
                               errorMsg.toLowerCase().includes("security policy");

  const isCheckConstraintViolation = errorCode === '23514' ||
                                     errorMsg.toLowerCase().includes("check constraint") ||
                                     errorDetails.toLowerCase().includes("check constraint");

  if (isTableMissing) {
    return res.status(500).json({
      error: "Bảng 'chu_nha_can_ban' chưa được cấu hình hoặc chưa tồn tại trong Supabase.",
      isConfigError: true,
      setupSQL: COMPLETE_SETUP_SQL
    });
  }

  if (isCheckConstraintViolation) {
    return res.status(400).json({
      error: "Dữ liệu trạng thái không tương thích với ràng buộc kiểm tra hiện tại trong bảng Supabase của bạn.",
      isConfigError: true,
      setupSQL: COMPLETE_SETUP_SQL
    });
  }

  if (isRLSPolicyViolation) {
    return res.status(500).json({
      error: "Bảng 'chu_nha_can_ban' đang bật Row-Level Security (RLS) nhưng chưa cấu hình chính sách (Policy) cho phép ghi/đọc dữ liệu.",
      isConfigError: true,
      setupSQL: COMPLETE_SETUP_SQL
    });
  }

  if (isDnsOrPausedError) {
    return res.status(500).json({
      error: "Không thể kết nối đến Supabase (Lỗi tên miền / Dự án có thể đang bị Tạm Dừng - Paused). Vui lòng đăng nhập supabase.com/dashboard để Resume lại dự án hoặc kiểm tra lại SUPABASE_URL trong Settings > Secrets.",
      isConfigError: true,
      isPausedOrDnsError: true,
      setupSQL: COMPLETE_SETUP_SQL
    });
  }

  if (isConnectionError) {
    return res.status(500).json({
      error: "Không thể kết nối đến dự án Supabase. Vui lòng xác thực lại tính chính xác của SUPABASE_URL và SUPABASE_ANON_KEY trong mục Secrets.",
      isConfigError: true,
      setupSQL: COMPLETE_SETUP_SQL
    });
  }

  return res.status(500).json({ 
    error: error?.message || "Đã xảy ra lỗi khi truy vấn cơ sở dữ liệu Supabase.",
    setupSQL: COMPLETE_SETUP_SQL
  });
}

// Helper to call Supabase Edge Function with seamless server-side fallback
async function callManageUsersEdgeFunctionOrFallback(
  action: "list" | "create" | "update" | "delete",
  payload: any = {},
  method: "GET" | "POST" | "PUT" | "DELETE" = "POST"
) {
  const { url, key } = getSupabaseConfig();
  const serviceKey = getSupabaseServiceRoleKey();
  const supabase = getSupabase();
  const supabaseAdmin = getSupabaseAdmin();

  // Print diagnostic environment status with masked credentials
  console.log(`[USER-MGT-DIAGNOSTIC] Action: "${action}" | Method: "${method}"`);
  console.log(`[USER-MGT-DIAGNOSTIC] Environment check:`, {
    SUPABASE_URL: maskSecret(url),
    SUPABASE_SERVICE_ROLE_KEY: maskSecret(serviceKey),
    SUPABASE_ANON_KEY: maskSecret(key),
    isSupabaseAdminClientReady: !!supabaseAdmin,
  });

  let edgeFunctionWorked = false;
  let edgeResult: any = null;

  // 1. Try calling the deployed Supabase Edge Function directly (if present)
  if (url && key) {
    try {
      const edgeUrl = `${url}/functions/v1/manage-users`;
      console.log(`[USER-MGT] Đang kiểm tra Supabase Edge Function: ${edgeUrl}`);
      const options: RequestInit = {
        method,
        headers: {
          "Content-Type": "application/json",
          "apikey": key,
          "Authorization": `Bearer ${key}`
        }
      };

      if (method !== "GET") {
        options.body = JSON.stringify({ action, ...payload });
      }

      const resp = await fetch(edgeUrl, options);
      if (resp.status !== 404) {
        const json = await resp.json();
        if (!resp.ok) {
          console.error(`[USER-MGT] Edge Function trả về lỗi HTTP ${resp.status}:`, json);
          throw new Error(json.error || `Edge Function trả về mã lỗi ${resp.status}`);
        }
        console.log(`[USER-MGT] Edge Function thực thi thành công.`);
        edgeFunctionWorked = true;
        edgeResult = json;
      } else {
        console.log(`[USER-MGT] Edge Function trả về 404 (chưa triển khai). Chuyển sang fallback Supabase Admin SDK trực tiếp.`);
      }
    } catch (edgeErr: any) {
      if (!edgeErr.message?.includes("404")) {
        console.error("[USER-MGT] Lỗi khi gọi Supabase Edge Function:", {
          message: edgeErr.message,
          stack: edgeErr.stack,
          fullError: edgeErr
        });
      }
    }
  }

  if (edgeFunctionWorked && edgeResult) {
    return edgeResult;
  }

  // 2. Server-side execution using Supabase Client & Admin SDK
  const dbClient = supabaseAdmin || supabase;

  if (!supabaseAdmin) {
    console.error(
      `[USER-MGT CẢNH BÁO LỚN] supabaseAdmin là NULL! Biến môi trường SUPABASE_SERVICE_ROLE_KEY chưa được thiết lập trên Vercel hoặc bị rỗng.\n` +
      `-> Hệ thống sẽ chỉ có thể dùng Anon Key. Anon Key KHÔNG THỂ gọi Supabase Auth Admin API (listUsers, createUser, deleteUser) và sẽ bị RLS chặn nếu chưa có quyền!`
    );
  } else {
    console.log(`[USER-MGT] supabaseAdmin đã được khởi tạo thành công với Service Role Key.`);
  }

  if (action === "list" || method === "GET") {
    let profilesList: any[] = [];
    let profilesError: any = null;
    let authError: any = null;

    // Bước 1: Đọc từ bảng 'profiles'
    try {
      console.log(`[USER-MGT] Bước 1: Đang truy vấn bảng 'profiles' bằng ${supabaseAdmin ? 'Service Role (vượt RLS)' : 'Anon Client'}...`);
      const { data, error } = await dbClient
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        profilesError = error;
        console.error("[USER-MGT] LỖI THẬT khi đọc bảng 'profiles':", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          fullObject: JSON.stringify(error, Object.getOwnPropertyNames(error))
        });
      } else if (Array.isArray(data)) {
        profilesList = data;
        console.log(`[USER-MGT] Đã đọc được ${data.length} bản ghi từ bảng 'profiles'.`);
      }
    } catch (e: any) {
      profilesError = e;
      console.error("[USER-MGT] NGOẠI LỆ THẬT (catch) khi đọc bảng 'profiles':", {
        message: e?.message,
        stack: e?.stack,
        fullObject: e
      });
    }

    // Bước 2: Đồng bộ trực tiếp với Supabase Auth Users qua Auth Admin API (listUsers)
    if (supabaseAdmin) {
      try {
        console.log(`[USER-MGT] Bước 2: Đang gọi supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })...`);
        const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 1000
        });

        if (authErr) {
          authError = authErr;
          console.error("[USER-MGT] LỖI THẬT TỪ SUPABASE AUTH ADMIN (auth.admin.listUsers):", {
            message: authErr.message,
            status: (authErr as any).status,
            name: authErr.name,
            code: (authErr as any).code,
            fullObject: JSON.stringify(authErr, Object.getOwnPropertyNames(authErr))
          });
        } else if (authData?.users) {
          console.log(`[USER-MGT] Supabase Auth Admin trả về ${authData.users.length} tài khoản người dùng từ auth.users.`);
          const profileMap = new Map<string, any>(profilesList.map((p) => [p.id, p]));
          const missingProfilesToUpsert: any[] = [];

          for (const authUser of authData.users) {
            const existing = profileMap.get(authUser.id);
            const metaName = authUser.user_metadata?.full_name || (authUser.email ? authUser.email.split("@")[0] : "Người dùng");
            const metaPhone = authUser.user_metadata?.phone || "";
            const metaRole = authUser.user_metadata?.role || "staff";
            const isBanned = !!(authUser.banned_until && new Date(authUser.banned_until) > new Date());

            if (!existing) {
              const newProf = {
                id: authUser.id,
                email: authUser.email || "",
                full_name: metaName,
                phone: metaPhone,
                role: metaRole,
                status: isBanned ? "disabled" : "active",
                created_at: authUser.created_at || new Date().toISOString()
              };
              profilesList.push(newProf);
              profileMap.set(authUser.id, newProf);
              missingProfilesToUpsert.push(newProf);
            } else {
              // Đảm bảo thông tin email, họ tên, sđt được cập nhật nếu bảng profiles bị trống
              if (!existing.email && authUser.email) existing.email = authUser.email;
              if ((!existing.full_name || existing.full_name === "Quản trị viên") && authUser.user_metadata?.full_name) {
                existing.full_name = authUser.user_metadata.full_name;
              }
              if (!existing.phone && metaPhone) {
                existing.phone = metaPhone;
              }
            }
          }

          // Tự động sao chép tài khoản từ Auth vào profiles nếu thiếu
          if (missingProfilesToUpsert.length > 0) {
            console.log(`[USER-MGT] Đang tự động sao lưu ${missingProfilesToUpsert.length} tài khoản từ Auth vào bảng 'profiles'...`);
            dbClient
              .from("profiles")
              .upsert(missingProfilesToUpsert)
              .then(() => {
                console.log(`[USER-MGT] Tự động đồng bộ ${missingProfilesToUpsert.length} tài khoản vào bảng 'profiles' thành công.`);
              })
              .catch((err: any) => {
                console.error("[USER-MGT] LỖI THẬT khi tự động ghi profiles:", {
                  message: err?.message,
                  fullError: err
                });
              });
          }
        } else {
          console.warn("[USER-MGT] authData.users trả về rỗng hoặc null:", authData);
        }
      } catch (authListErr: any) {
        authError = authListErr;
        console.error("[USER-MGT] NGOẠI LỆ THẬT (catch) khi gọi auth.admin.listUsers():", {
          message: authListErr?.message,
          status: authListErr?.status,
          stack: authListErr?.stack,
          fullObject: authListErr
        });
      }
    } else {
      console.error(
        `[USER-MGT] BỎ QUA Bước 2 (auth.admin.listUsers) vì supabaseAdmin = null (chưa có SUPABASE_SERVICE_ROLE_KEY).`
      );
    }

    // Sắp xếp theo ngày tạo mới nhất lên đầu
    profilesList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    console.log(`[USER-MGT] HOÀN TẤT: Trả về ${profilesList.length} tài khoản người dùng cho client.`);

    return { 
      success: true, 
      users: profilesList,
      diagnostic: {
        hasServiceRoleKey: !!serviceKey,
        hasSupabaseAdmin: !!supabaseAdmin,
        totalUsers: profilesList.length,
        profilesError: profilesError ? (profilesError.message || String(profilesError)) : null,
        authAdminError: authError ? (authError.message || String(authError)) : null,
      }
    };
  }

  if (action === "create" || method === "POST") {
    const { email, username, password, full_name, role = "admin" } = payload;
    let targetEmail = (email || username || "").trim().toLowerCase();
    if (targetEmail && !targetEmail.includes("@")) {
      targetEmail = `${targetEmail}@nguonnhapk.local`;
    }
    payload.email = targetEmail;

    if (!targetEmail || !password) {
      throw new Error("Tên đăng nhập (hoặc email) và mật khẩu tạm là bắt buộc.");
    }
    if (password.length < 6) {
      throw new Error("Mật khẩu phải có tối thiểu 6 ký tự.");
    }

    if (!supabaseAdmin) {
      throw new Error(
        "Chưa có quyền quản trị: Vui lòng triển khai Supabase Edge Function 'manage-users' (xem file supabase/README.md) hoặc thêm biến SUPABASE_SERVICE_ROLE_KEY trong mục Settings > Secrets."
      );
    }

    // Create user in Supabase Auth
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: targetEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name?.trim() || targetEmail.split("@")[0],
        role: role || "staff",
      }
    });

    if (authErr) {
      throw new Error(`Lỗi tạo tài khoản trên Supabase Auth: ${authErr.message}`);
    }

    const newProfile = {
      id: authData.user.id,
      email: authData.user.email,
      full_name: full_name?.trim() || targetEmail.split("@")[0],
      role: role || "staff",
      status: "active",
      created_at: authData.user.created_at || new Date().toISOString()
    };

    const { data: profileData, error: profErr } = await dbClient
      .from("profiles")
      .upsert([newProfile])
      .select()
      .single();

    if (profErr) {
      console.warn("Lỗi lưu vào bảng profiles:", profErr);
    }

    return {
      success: true,
      message: "Tạo tài khoản người dùng thành công",
      user: profileData || newProfile
    };
  }

  if (action === "update" || method === "PUT") {
    const { id, full_name, role, status } = payload;
    if (!id) {
      throw new Error("Thiếu mã định danh (id) tài khoản.");
    }

    const updates: any = {};
    if (full_name !== undefined) updates.full_name = full_name.trim();
    if (role !== undefined) updates.role = role;
    if (status !== undefined) updates.status = status;

    const { data: updatedProfile, error: updateErr } = await dbClient
      .from("profiles")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      throw updateErr;
    }

    if (supabaseAdmin) {
      const userMetaUpdates: any = {};
      if (full_name !== undefined) userMetaUpdates.full_name = full_name.trim();
      if (role !== undefined) userMetaUpdates.role = role;

      if (Object.keys(userMetaUpdates).length > 0) {
        await supabaseAdmin.auth.admin.updateUserById(id, {
          user_metadata: userMetaUpdates
        }).catch(() => {});
      }

      if (status === "disabled") {
        await supabaseAdmin.auth.admin.updateUserById(id, {
          ban_duration: "876000h"
        }).catch(() => {});
      } else if (status === "active") {
        await supabaseAdmin.auth.admin.updateUserById(id, {
          ban_duration: "none"
        }).catch(() => {});
      }
    }

    return {
      success: true,
      message: "Cập nhật thông tin tài khoản thành công",
      user: updatedProfile
    };
  }

  if (action === "delete" || method === "DELETE") {
    const { id } = payload;
    if (!id) {
      throw new Error("Thiếu mã định danh (id) tài khoản cần xóa.");
    }

    if (supabaseAdmin) {
      await supabaseAdmin.auth.admin.deleteUser(id).catch((e: any) => {
        console.warn("Lỗi khi xóa Auth User:", e.message || e);
      });
    }

    const { error: delErr } = await dbClient
      .from("profiles")
      .delete()
      .eq("id", id);

    if (delErr) {
      throw delErr;
    }

    return {
      success: true,
      message: "Đã xóa tài khoản khỏi hệ thống thành công."
    };
  }

  throw new Error(`Thao tác không hỗ trợ: ${action}`);
}

// --- API ROUTES ---

// 1. Login Endpoint (Supabase Auth signInWithPassword + Profiles check)
app.post("/api/login", async (req, res) => {
  const { email, username, password } = req.body;
  if (!password) {
    return res.status(400).json({ error: "Vui lòng nhập mật khẩu" });
  }

  let rawIdentifier = (email || username || "").trim().toLowerCase();
  if (rawIdentifier && !rawIdentifier.includes("@")) {
    rawIdentifier = `${rawIdentifier}@nguonnhapk.local`;
  }
  const trimmedEmail = rawIdentifier;

  try {
    const { url, key } = getSupabaseConfig();

    // 1. Try Supabase Auth if URL and Anon key are configured and email is provided
    if (url && key && trimmedEmail) {
      const supabase = getSupabase();
      const dbClient = getSupabaseAdmin() || supabase;
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: password
      });

      if (!error && data?.user) {
        const user = data.user;

        // Check user status in profiles table
        let userProfile = null;
        try {
          const { data: profile } = await dbClient
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();

          if (profile) {
            userProfile = profile;
            if (profile.status === "disabled") {
              return res.status(403).json({
                error: "Tài khoản của bạn đã bị vô hiệu hóa bởi quản trị viên. Vui lòng liên hệ hỗ trợ."
              });
            }
          } else {
            // Automatically bootstrap profile record if not present
            const defaultName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Quản trị viên";
            const defaultRole = user.user_metadata?.role || "admin";
            const { data: newProfile } = await dbClient
              .from("profiles")
              .upsert({
                id: user.id,
                email: user.email,
                full_name: defaultName,
                role: defaultRole,
                status: "active"
              })
              .select()
              .single();
            userProfile = newProfile;
          }
        } catch (profileErr) {
          console.warn("Lỗi kiểm tra bảng profiles:", profileErr);
        }

        const fullName = userProfile?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Quản trị viên";
        const phone = userProfile?.phone || user.user_metadata?.phone || "";
        const role = userProfile?.role || "admin";
        const status = userProfile?.status || "active";

        const token = jwt.sign(
          {
            id: user.id,
            email: user.email,
            full_name: fullName,
            phone: phone,
            role,
            status
          },
          SESSION_SECRET,
          { expiresIn: "7d" }
        );

        res.cookie("admin_token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        return res.json({
          success: true,
          token: token,
          message: "Đăng nhập thành công qua Supabase Auth",
          user: {
            id: user.id,
            email: user.email,
            full_name: fullName,
            phone: phone,
            role,
            status
          }
        });
      }

      // If Supabase Auth failed, log error details
      if (error) {
        console.log("Supabase Auth signIn failed:", error.message);
      }
    }

    // 2. Fallback check for emergency master password if configured
    if (ADMIN_PASSWORD && password === ADMIN_PASSWORD) {
      const fallbackUser = {
        id: "master-admin",
        email: trimmedEmail || "admin@system.local",
        full_name: "Quản Trị Viên Hệ Thống",
        role: "admin",
        status: "active"
      };

      const token = jwt.sign(fallbackUser, SESSION_SECRET, { expiresIn: "7d" });

      res.cookie("admin_token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      return res.json({
        success: true,
        token: token,
        message: "Đăng nhập thành công bằng mật khẩu quản trị hệ thống",
        user: fallbackUser
      });
    }

    return res.status(401).json({
      error: trimmedEmail ? "Email hoặc mật khẩu không chính xác." : "Vui lòng nhập email và mật khẩu."
    });
  } catch (err: any) {
    console.error("Lỗi xử lý đăng nhập:", err);
    return res.status(500).json({ error: err.message || "Lỗi xử lý đăng nhập hệ thống." });
  }
});

// 2. Logout Endpoint
app.post("/api/logout", (req, res) => {
  res.clearCookie("admin_token", {
    httpOnly: true,
    secure: true,
    sameSite: "none"
  });
  return res.json({ success: true, message: "Đã đăng xuất khỏi hệ thống" });
});

// 3. Check Session status (returns user profile if authenticated)
app.get("/api/session", (req, res) => {
  let token = req.cookies?.admin_token;
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && (parts[0] === "Bearer" || parts[0] === "Token")) {
      token = parts[1];
    }
  }
  if (!token && req.headers["x-access-token"]) {
    token = req.headers["x-access-token"] as string;
  }
  if (!token) {
    return res.json({ authenticated: false });
  }
  try {
    const decoded = jwt.verify(token, SESSION_SECRET) as any;
    return res.json({
      authenticated: true,
      user: {
        id: decoded.id || "admin",
        email: decoded.email || "",
        full_name: decoded.full_name || (decoded.email ? decoded.email.split("@")[0] : "Quản trị viên"),
        phone: decoded.phone || "",
        role: decoded.role || "admin",
        status: decoded.status || "active"
      }
    });
  } catch (err) {
    return res.json({ authenticated: false });
  }
});

// 3.1 Profile & Password API endpoints (Protected - Any Logged In User)
// Update Profile (Full Name & Phone)
app.put("/api/user/profile", authenticateAdmin, async (req: any, res) => {
  try {
    const { full_name, phone } = req.body;
    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ error: "Họ và tên không được để trống." });
    }

    const userId = req.admin?.id;
    const userEmail = req.admin?.email;
    const trimmedName = full_name.trim();
    const trimmedPhone = typeof phone === "string" ? phone.trim() : (req.admin?.phone || "");

    const supabaseAdmin = getSupabaseAdmin();
    const supabase = getSupabase();
    const dbClient = supabaseAdmin || supabase;

    if (userId && userId !== "master-admin") {
      // 1. Try to update in profiles table (handles case where phone column might not exist yet)
      const updateData: any = { full_name: trimmedName, phone: trimmedPhone };
      const { error: profErr } = await dbClient
        .from("profiles")
        .update(updateData)
        .eq("id", userId);

      if (profErr) {
        if (profErr.message?.includes("phone")) {
          // If phone column doesn't exist yet on DB table, update just full_name
          await dbClient.from("profiles").update({ full_name: trimmedName }).eq("id", userId);
        }
        console.warn("Lỗi cập nhật bảng profiles:", profErr.message);
      }

      // 2. Update in Supabase Auth user metadata (always persists phone & full_name)
      if (supabaseAdmin) {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: { 
            full_name: trimmedName,
            phone: trimmedPhone
          }
        }).catch((e: any) => console.warn("Lỗi cập nhật user_metadata:", e.message));
      }
    }

    // Refresh JWT session token with updated name and phone
    const updatedUser = {
      id: userId || "user",
      email: userEmail || "",
      full_name: trimmedName,
      phone: trimmedPhone,
      role: req.admin?.role || "staff",
      status: req.admin?.status || "active"
    };

    const token = jwt.sign(updatedUser, SESSION_SECRET, { expiresIn: "7d" });
    res.cookie("admin_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      message: "Cập nhật thông tin cá nhân thành công",
      user: updatedUser
    });
  } catch (err: any) {
    console.error("Lỗi cập nhật profile:", err);
    return res.status(500).json({ error: err.message || "Lỗi cập nhật thông tin cá nhân." });
  }
});

// Change Password
app.post("/api/user/change-password", authenticateAdmin, async (req: any, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Mật khẩu mới phải có ít nhất 6 ký tự." });
    }

    const userId = req.admin?.id;
    const userEmail = req.admin?.email;

    if (!userId || userId === "master-admin") {
      return res.status(400).json({
        error: "Tài khoản master qua mật khẩu khẩn cấp không hỗ trợ đổi mật khẩu tại đây. Vui lòng thiết lập biến ADMIN_PASSWORD trong Settings."
      });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const supabase = getSupabase();

    // Verify current password if provided
    if (currentPassword && userEmail) {
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword
      });
      if (verifyErr) {
        return res.status(400).json({ error: "Mật khẩu hiện tại không chính xác." });
      }
    }

    // Update password via admin API
    if (supabaseAdmin) {
      const { error: passErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: newPassword
      });
      if (passErr) {
        throw passErr;
      }
    } else {
      throw new Error("Hệ thống chưa kết nối Supabase Service Role Key để đổi mật khẩu.");
    }

    return res.json({
      success: true,
      message: "Đổi mật khẩu thành công!"
    });
  } catch (err: any) {
    console.error("Lỗi đổi mật khẩu:", err);
    return res.status(500).json({ error: err.message || "Lỗi thay đổi mật khẩu." });
  }
});

// 3.5 User Management API endpoints (Protected - Only Admin)
// GET all accounts from Supabase profiles / Edge Function
app.get("/api/users", authenticateAdmin, async (req: any, res) => {
  console.log(`\n================== [START GET /api/users] ==================`);
  console.log(`[GET /api/users] Người yêu cầu:`, {
    id: req.admin?.id,
    email: req.admin?.email,
    role: req.admin?.role
  });

  if (req.admin?.role !== "admin") {
    console.error(`[GET /api/users] TỪ CHỐI: User không có role admin (role hiện tại: "${req.admin?.role}")`);
    return res.status(403).json({ error: "Bạn không có quyền quản lý tài khoản người dùng." });
  }

  try {
    const result = await callManageUsersEdgeFunctionOrFallback("list", {}, "GET");
    console.log(`[GET /api/users] Kết quả trả về cho client: success=${result?.success}, số lượng users=${result?.users?.length ?? 0}`);
    console.log(`================== [END GET /api/users] ==================\n`);
    return res.json(result);
  } catch (err: any) {
    console.error("================== [LỖI THẬT GET /api/users] ==================");
    console.error("[GET /api/users] Message:", err?.message);
    console.error("[GET /api/users] Status:", err?.status || (err as any)?.statusCode);
    console.error("[GET /api/users] Code:", err?.code);
    console.error("[GET /api/users] Stack:", err?.stack);
    console.error("[GET /api/users] Full Error Object:", JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
    console.error("===============================================================\n");

    return res.status(500).json({ 
      error: err.message || "Lỗi lấy danh sách tài khoản.",
      status: err?.status || 500,
      code: err?.code || null,
      details: err?.details || null
    });
  }
});

// POST create new account via Edge Function / Auth Admin API
app.post("/api/users", authenticateAdmin, async (req: any, res) => {
  if (req.admin?.role !== "admin") {
    return res.status(403).json({ error: "Chỉ Quản trị viên (Admin) mới có quyền tạo tài khoản." });
  }
  try {
    const result = await callManageUsersEdgeFunctionOrFallback("create", req.body, "POST");
    return res.status(201).json(result);
  } catch (err: any) {
    console.error("Lỗi tạo tài khoản mới:", err);
    return res.status(400).json({ error: err.message || "Lỗi tạo tài khoản mới." });
  }
});

// PUT update account profile (full_name, role, status)
app.put("/api/users/:id", authenticateAdmin, async (req: any, res) => {
  if (req.admin?.role !== "admin") {
    return res.status(403).json({ error: "Chỉ Quản trị viên (Admin) mới có quyền cập nhật tài khoản." });
  }
  try {
    const result = await callManageUsersEdgeFunctionOrFallback(
      "update",
      { id: req.params.id, ...req.body },
      "PUT"
    );
    return res.json(result);
  } catch (err: any) {
    console.error("Lỗi cập nhật tài khoản:", err);
    return res.status(400).json({ error: err.message || "Lỗi cập nhật tài khoản." });
  }
});

// DELETE remove account from Supabase Auth + profiles
app.delete("/api/users/:id", authenticateAdmin, async (req: any, res) => {
  if (req.admin?.role !== "admin") {
    return res.status(403).json({ error: "Chỉ Quản trị viên (Admin) mới có quyền xóa tài khoản." });
  }
  try {
    const result = await callManageUsersEdgeFunctionOrFallback(
      "delete",
      { id: req.params.id },
      "DELETE"
    );
    return res.json(result);
  } catch (err: any) {
    console.error("Lỗi xóa tài khoản:", err);
    return res.status(400).json({ error: err.message || "Lỗi xóa tài khoản." });
  }
});

// 4. System config check helper (supports both /api/config-status and /api/system-status)
const handleSystemConfigStatus = (req: any, res: any) => {
  const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();
  const { cloudName, uploadPreset } = getCloudinaryConfig();
  const hasAdminPassword = !!cleanEnvVar(process.env.ADMIN_PASSWORD);

  const hasCloudNameVar = !!cleanEnvVar(process.env.VITE_CLOUDINARY_CLOUD_NAME) || !!cleanEnvVar(process.env.CLOUDINARY_CLOUD_NAME);
  const hasUploadPresetVar = !!cleanEnvVar(process.env.VITE_CLOUDINARY_UPLOAD_PRESET) || !!cleanEnvVar(process.env.CLOUDINARY_UPLOAD_PRESET);

  res.json({
    supabaseConfigured: !!(supabaseUrl && supabaseKey),
    cloudinaryConfigured: !!(cloudName && uploadPreset),
    adminPasswordConfigured: hasAdminPassword,
    supabaseUrlPreview: supabaseUrl ? (supabaseUrl.length > 25 ? `${supabaseUrl.substring(0, 22)}...` : supabaseUrl) : null,
    missingVars: [
      !supabaseUrl && "SUPABASE_URL",
      !supabaseKey && "SUPABASE_ANON_KEY",
      !hasCloudNameVar && "VITE_CLOUDINARY_CLOUD_NAME",
      !hasUploadPresetVar && "VITE_CLOUDINARY_UPLOAD_PRESET",
      !hasAdminPassword && "ADMIN_PASSWORD"
    ].filter(Boolean),
    setupSQL: COMPLETE_SETUP_SQL
  });
};

app.get("/api/config-status", handleSystemConfigStatus);
app.get("/api/system-status", handleSystemConfigStatus);

// 4.1 Comprehensive System Management & Diagnostic API
app.get("/api/system/info", authenticateAdmin, async (req, res) => {
  const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();
  const serviceKey = getSupabaseServiceRoleKey();
  const { cloudName, uploadPreset } = getCloudinaryConfig();
  const hasAdminPassword = !!cleanEnvVar(process.env.ADMIN_PASSWORD);
  const jwtSecret = cleanEnvVar(process.env.JWT_SECRET);
  const localDb = readLocalDb();
  const propertyManagers = readPropertyManagers();

  let supabaseHealth: any = {
    connected: false,
    message: "Chưa kiểm tra",
    propertiesCount: null,
    profilesCount: null,
    propertiesError: null,
    profilesError: null
  };

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = getSupabase();
      if (supabase) {
        const [propRes, profileRes] = await Promise.allSettled([
          supabase.from("chu_nha_can_ban").select("id", { count: "exact", head: true }),
          supabase.from("profiles").select("id", { count: "exact", head: true })
        ]);

        const propCount = propRes.status === "fulfilled" && !propRes.value.error ? propRes.value.count : null;
        const profileCount = profileRes.status === "fulfilled" && !profileRes.value.error ? profileRes.value.count : null;
        const propErr = propRes.status === "fulfilled" && propRes.value.error ? propRes.value.error.message : (propRes.status === "rejected" ? String(propRes.reason) : null);
        const profileErr = profileRes.status === "fulfilled" && profileRes.value.error ? profileRes.value.error.message : (profileRes.status === "rejected" ? String(profileRes.reason) : null);

        supabaseHealth = {
          connected: propRes.status === "fulfilled" && !propRes.value.error,
          propertiesCount: propCount,
          profilesCount: profileCount,
          propertiesError: propErr,
          profilesError: profileErr
        };
      }
    } catch (err: any) {
      supabaseHealth = {
        connected: false,
        message: err.message || "Lỗi kiểm tra Supabase",
        propertiesCount: null,
        profilesCount: null,
        propertiesError: err.message,
        profilesError: null
      };
    }
  }

  const memory = typeof process.memoryUsage === "function" ? process.memoryUsage() : null;

  return res.json({
    success: true,
    server: {
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      platform: process.platform,
      environment: process.env.NODE_ENV || "production",
      memoryRssMb: memory ? Math.round(memory.rss / (1024 * 1024)) : null,
      memoryHeapUsedMb: memory ? Math.round(memory.heapUsed / (1024 * 1024)) : null,
      serverTime: new Date().toISOString()
    },
    database: {
      isConfigured: !!(supabaseUrl && supabaseKey),
      supabaseUrl: maskSecret(supabaseUrl),
      hasAnonKey: !!supabaseKey,
      anonKeyPreview: maskSecret(supabaseKey),
      hasServiceRoleKey: !!serviceKey,
      serviceRoleKeyPreview: maskSecret(serviceKey),
      health: supabaseHealth
    },
    storage: {
      isConfigured: !!(cloudName && uploadPreset),
      provider: "Cloudinary",
      cloudName: cloudName ? maskSecret(cloudName) : "Chưa cấu hình",
      uploadPreset: uploadPreset ? maskSecret(uploadPreset) : "Chưa cấu hình"
    },
    localCache: {
      propertiesCount: localDb.length,
      managersCount: Object.keys(propertyManagers).length
    },
    security: {
      adminPasswordConfigured: hasAdminPassword,
      jwtSecretConfigured: !!jwtSecret,
      authMethod: "Supabase Auth + Local Token Auth",
      roleBasedAccess: true
    },
    setupSQL: COMPLETE_SETUP_SQL
  });
});

// 4.5 Dedicated Database Connection Tester & Diagnostic Endpoint
app.get("/api/test-db", authenticateAdmin, async (req, res) => {
  const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();
  
  if (!supabaseUrl || !supabaseKey) {
    return res.json({
      connected: false,
      status: "missing_env",
      message: "Chưa cấu hình SUPABASE_URL hoặc SUPABASE_ANON_KEY trong mục Settings > Secrets.",
      details: `SUPABASE_URL: ${supabaseUrl ? "Đã có" : "Chưa có"}, SUPABASE_ANON_KEY: ${supabaseKey ? "Đã có" : "Chưa có"}`,
      setupSQL: COMPLETE_SETUP_SQL
    });
  }

  try {
    const supabase = getSupabase();
    
    // Test 1: Query the chu_nha_can_ban table
    const { data, error, count } = await supabase
      .from("chu_nha_can_ban")
      .select("id", { count: "exact", head: true });

    if (error) {
      console.error("Test DB query returned error:", error);
      const errorMsg = String(error?.message || "");
      const errorDetails = String(error?.details || "");
      const errorCode = String(error?.code || "");

      const isTableMissing = errorCode === '42P01' || 
                             errorMsg.includes("relation") || 
                             errorDetails.includes("does not exist") || 
                             errorMsg.includes("does not exist");
      
      const isRLSPolicyViolation = errorCode === '42501' ||
                                   errorMsg.toLowerCase().includes("row-level security") || 
                                   errorDetails.toLowerCase().includes("row-level security") ||
                                   errorMsg.toLowerCase().includes("security policy");

      const isDnsOrPausedError = errorCode === "ENOTFOUND" ||
                                 errorMsg.includes("ENOTFOUND") ||
                                 errorDetails.includes("ENOTFOUND") ||
                                 errorMsg.includes("fetch failed") ||
                                 errorDetails.includes("fetch failed");

      if (isTableMissing) {
        return res.json({
          connected: false,
          status: "table_missing",
          message: "Kết nối thành công đến Supabase nhưng bảng 'chu_nha_can_ban' chưa được tạo.",
          details: "Mã lỗi: 42P01 (Table does not exist). Vui lòng chạy mã SQL bên dưới trong SQL Editor của Supabase.",
          setupSQL: COMPLETE_SETUP_SQL
        });
      }

      if (isRLSPolicyViolation) {
        return res.json({
          connected: false,
          status: "rls_blocked",
          message: "Bảng 'chu_nha_can_ban' đang bật RLS (Row Level Security) và chặn quyền truy cập.",
          details: "Mã lỗi: 42501 (RLS violation). Cần tắt RLS hoặc cấp quyền truy cập toàn quyền.",
          setupSQL: COMPLETE_SETUP_SQL
        });
      }

      if (isDnsOrPausedError) {
        return res.json({
          connected: false,
          status: "paused_or_dns_error",
          message: "Dự án Supabase đang ở trạng thái TẠM DỪNG (Paused) hoặc tên miền URL không chính xác.",
          details: `Không thể kết nối đến URL '${supabaseUrl}'. Đối với gói Supabase Free, dự án sẽ tự động Tạm Dừng nếu không hoạt động 7 ngày. Hãy vào supabase.com/dashboard và bấm 'Restore project' để tiếp tục.`,
          setupSQL: COMPLETE_SETUP_SQL
        });
      }

      return res.json({
        connected: false,
        status: "query_error",
        message: `Lỗi truy vấn Supabase: ${error.message || error.details || "Không rõ nguyên nhân"}`,
        details: JSON.stringify(error),
        setupSQL: COMPLETE_SETUP_SQL
      });
    }

    // Check profiles table status as well
    let profilesStatusMsg = "Bảng 'profiles' đã sẵn sàng.";
    const { error: profileCheckErr } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });
    
    if (profileCheckErr) {
      profilesStatusMsg = "Bảng 'profiles' chưa được tạo. Vui lòng chạy đoạn mã SQL để tạo bảng profiles.";
    }

    return res.json({
      connected: true,
      status: "ready",
      message: `Kết nối thành công! Bảng 'chu_nha_can_ban' (Tổng: ${count ?? 0}). ${profilesStatusMsg}`,
      profilesReady: !profileCheckErr,
      details: `Supabase Project: ${supabaseUrl}`,
      setupSQL: COMPLETE_SETUP_SQL
    });
  } catch (err: any) {
    console.error("Test DB catch error:", err);
    const errString = String(err?.message || "") + " " + String(err?.details || "");
    const isPaused = errString.includes("ENOTFOUND") || errString.includes("fetch failed");

    return res.json({
      connected: false,
      status: isPaused ? "paused_or_dns_error" : "connection_failed",
      message: isPaused 
        ? "Dự án Supabase đang ở trạng thái TẠM DỪNG (Paused) hoặc tên miền URL không chính xác." 
        : "Không thể kết nối đến máy chủ Supabase.",
      details: isPaused 
        ? `Không thể phân giải tên miền '${supabaseUrl}'. Hãy vào supabase.com/dashboard để 'Restore project' hoặc kiểm tra SUPABASE_URL trong Settings > Secrets.`
        : (err.message || "Lỗi kết nối Supabase."),
      setupSQL: COMPLETE_SETUP_SQL
    });
  }
});

// 5. Cloudinary Signature and Config Info (Frontend needs cloud name & upload preset for unsigned upload)
app.get("/api/cloudinary-config", authenticateAdmin, (req, res) => {
  const { cloudName, uploadPreset } = getCloudinaryConfig();
  res.json({
    cloudName,
    uploadPreset
  });
});

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (_) {}
app.use("/uploads", express.static(UPLOADS_DIR));

const upload = multer({ storage: multer.memoryStorage() });

let cachedStorageBucketName: string | null = null;

async function resolveSupabaseStorageBucket(sbClient: any, sbAdmin: any): Promise<string> {
  const envBucket = (
    process.env.SUPABASE_STORAGE_BUCKET ||
    process.env.VITE_SUPABASE_STORAGE_BUCKET ||
    ""
  ).trim();
  if (envBucket) return envBucket;
  if (cachedStorageBucketName) return cachedStorageBucketName;

  const clientForBuckets = sbAdmin || sbClient;
  try {
    const { data: buckets, error } = await clientForBuckets.storage.listBuckets();
    if (!error && Array.isArray(buckets) && buckets.length > 0) {
      const preferredNames = [
        "property-images",
        "properties",
        "nguonnha",
        "images",
        "nha-pho",
        "uploads",
      ];
      for (const name of preferredNames) {
        const found = buckets.find((b: any) => b.name === name || b.id === name);
        if (found) {
          cachedStorageBucketName = found.name || found.id;
          return cachedStorageBucketName!;
        }
      }
      const publicBucket = buckets.find((b: any) => b.public);
      if (publicBucket) {
        cachedStorageBucketName = publicBucket.name || publicBucket.id;
        return cachedStorageBucketName!;
      }
      cachedStorageBucketName = buckets[0].name || buckets[0].id;
      return cachedStorageBucketName!;
    }
  } catch (_) {}

  const defaultBucket = "property-images";
  if (sbAdmin) {
    try {
      await sbAdmin.storage.createBucket(defaultBucket, { public: true });
      cachedStorageBucketName = defaultBucket;
    } catch (_) {}
  }
  return defaultBucket;
}

/**
 * Ensure folder name in Storage is strictly the real `ma_tk` (TKxxxxxx or NT-xxxxxx),
 * never a numeric prefix like "01" or "10".
 */
function sanitizeStorageMaTkFolder(rawFolder: string): string {
  const clean = String(rawFolder || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
  if (!clean || /^#?[0-9]+$/.test(clean)) {
    return "";
  }
  const tkOrNtMatch = clean.match(/^(TK[A-Z0-9]{3,16}|NT-[A-Z0-9]{4,16})/);
  if (tkOrNtMatch) {
    return tkOrNtMatch[1];
  }
  return clean;
}

// 5.5 Server-side Storage upload endpoint:
// Stage 1: Supabase Storage bucket with folder named after real `ma_tk` (TKxxxxxx / NT-xxxxxx)
// Stage 2: Cloudinary upload (Unsigned / Signed) with folder = real `ma_tk`
// Stage 3: Local static file (/uploads/<ma_tk>/...) or Data URI fallback
app.post("/api/upload-image", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Không tìm thấy file để tải lên." });
    }

    const { cloudName, uploadPreset, apiKey, apiSecret } = getCloudinaryConfig();
    const rawReqPreset = String(req.body?.upload_preset || uploadPreset || "").trim();
    const reqPreset = rawReqPreset.startsWith("cloudinary://") ? "" : rawReqPreset;
    const reqFolder = sanitizeStorageMaTkFolder(req.body?.folder || req.body?.ma_tk || "");

    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || "image/jpeg" });
    const originalName = req.file.originalname || `img_${Date.now()}.jpg`;
    const ext = path.extname(originalName) || ".jpg";
    const safeBase = path
      .basename(originalName, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 40);

    // Stage 1: Supabase Storage (Thư mục ảnh trong Storage đặt theo mã TK thật)
    try {
      const sbAdmin = getSupabaseAdmin();
      const sbClient = sbAdmin || getSupabase();
      if (sbClient) {
        const bucketName = await resolveSupabaseStorageBucket(sbClient, sbAdmin);
        const objectPath = `${reqFolder ? reqFolder + "/" : ""}${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 7)}_${safeBase}${ext}`;

        const { error: upErr } = await sbClient.storage
          .from(bucketName)
          .upload(objectPath, req.file.buffer, {
            contentType: req.file.mimetype || "image/jpeg",
            upsert: true,
          });

        if (!upErr) {
          const { data: pubData } = sbClient.storage.from(bucketName).getPublicUrl(objectPath);
          if (pubData?.publicUrl) {
            return res.json({
              success: true,
              secure_url: pubData.publicUrl,
              public_id: objectPath,
              folder: reqFolder,
              bucket: bucketName,
              format: ext.replace(".", ""),
              bytes: req.file.size,
              provider: "supabase_storage",
            });
          }
        }
      }
    } catch (_) {}

    // Helper for unsigned Cloudinary upload attempt
    const tryUnsignedCloudinary = async (presetToTry: string): Promise<{ ok: boolean; data?: any; rawText?: string }> => {
      const formData = new FormData();
      formData.append("file", blob, originalName);
      formData.append("upload_preset", presetToTry);
      if (reqFolder) {
        formData.append("folder", reqFolder);
      }
      const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
      const response = await fetch(cloudinaryUrl, {
        method: "POST",
        body: formData,
      });
      const rawText = await response.text();
      if (response.ok) {
        try {
          return { ok: true, data: JSON.parse(rawText) };
        } catch {
          return { ok: false, rawText };
        }
      }
      return { ok: false, rawText };
    };

    // Stage 2: Try Cloudinary if cloudName is available
    if (cloudName) {
      const presetsToTry = Array.from(
        new Set([reqPreset, "ml_default", "unsigned_preset", "default"].filter(Boolean))
      );

      for (const presetCandidate of presetsToTry) {
        try {
          const result = await tryUnsignedCloudinary(presetCandidate);
          if (result.ok && result.data?.secure_url) {
            return res.json({
              success: true,
              secure_url: result.data.secure_url,
              public_id: result.data.public_id,
              folder: reqFolder,
              format: result.data.format,
              bytes: result.data.bytes,
              provider: "cloudinary_unsigned",
            });
          }

          if (
            presetCandidate === reqPreset &&
            apiKey &&
            apiSecret &&
            result.rawText &&
            result.rawText.includes("Upload preset not found")
          ) {
            try {
              const basicAuth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
              const createPresetRes = await fetch(
                `https://api.cloudinary.com/v1_1/${cloudName}/upload_presets`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Basic ${basicAuth}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    name: reqPreset,
                    unsigned: true,
                  }),
                }
              );
              if (createPresetRes.ok) {
                const retryRes = await tryUnsignedCloudinary(reqPreset);
                if (retryRes.ok && retryRes.data?.secure_url) {
                  return res.json({
                    success: true,
                    secure_url: retryRes.data.secure_url,
                    public_id: retryRes.data.public_id,
                    folder: reqFolder,
                    format: retryRes.data.format,
                    bytes: retryRes.data.bytes,
                    provider: "cloudinary_unsigned_autocreated",
                  });
                }
              }
            } catch (_) {}
          }
        } catch (err: any) {
          console.warn(`Cloudinary unsigned attempt (${presetCandidate}) skipped:`, err?.message || err);
        }
      }

      if (apiKey && apiSecret) {
        try {
          const timestamp = Math.floor(Date.now() / 1000).toString();
          const paramsToSign: Record<string, string> = { timestamp };
          if (reqFolder) {
            paramsToSign.folder = reqFolder;
          }
          const sortedParams = Object.keys(paramsToSign)
            .sort()
            .map((k) => `${k}=${paramsToSign[k]}`)
            .join("&");
          const signature = crypto
            .createHash("sha1")
            .update(sortedParams + apiSecret)
            .digest("hex");

          const signedForm = new FormData();
          signedForm.append("file", blob, originalName);
          signedForm.append("api_key", apiKey);
          signedForm.append("timestamp", timestamp);
          signedForm.append("signature", signature);
          if (reqFolder) {
            signedForm.append("folder", reqFolder);
          }

          const signedRes = await fetch(
            `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
            {
              method: "POST",
              body: signedForm,
            }
          );
          const signedText = await signedRes.text();
          if (signedRes.ok) {
            const signedData = JSON.parse(signedText);
            if (signedData?.secure_url) {
              return res.json({
                success: true,
                secure_url: signedData.secure_url,
                public_id: signedData.public_id,
                folder: reqFolder,
                format: signedData.format,
                bytes: signedData.bytes,
                provider: "cloudinary_signed",
              });
            }
          }
        } catch (signedErr: any) {
          console.warn("Cloudinary signed upload error:", signedErr?.message || signedErr);
        }
      }
    }

    // Stage 3: Local Server Static File Storage (/uploads/<ma_tk>/...) with Data URI fallback
    const uniqueFileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeBase}${ext}`;
    const subDir = reqFolder ? path.join(UPLOADS_DIR, reqFolder) : UPLOADS_DIR;

    try {
      if (!fs.existsSync(subDir)) {
        fs.mkdirSync(subDir, { recursive: true });
      }
      const fullFilePath = path.join(subDir, uniqueFileName);
      fs.writeFileSync(fullFilePath, req.file.buffer);
      const relativeUrl = reqFolder
        ? `/uploads/${reqFolder}/${uniqueFileName}`
        : `/uploads/${uniqueFileName}`;

      return res.json({
        success: true,
        secure_url: relativeUrl,
        public_id: uniqueFileName,
        format: ext.replace(".", ""),
        bytes: req.file.size,
        provider: "local_storage",
      });
    } catch (_) {
      // Read-only filesystem fallback: return inline Data URI
      const mime = req.file.mimetype || "image/jpeg";
      const dataUri = `data:${mime};base64,${req.file.buffer.toString("base64")}`;
      return res.json({
        success: true,
        secure_url: dataUri,
        public_id: uniqueFileName,
        format: ext.replace(".", ""),
        bytes: req.file.size,
        provider: "data_uri",
      });
    }
  } catch (proxyError: any) {
    console.warn("Lỗi xử lý tải ảnh phía máy chủ:", proxyError?.message || proxyError);
    return res.status(500).json({ error: proxyError.message || "Lỗi xử lý tải ảnh phía máy chủ." });
  }
});

// Helper regex and utilities to securely embed and extract creator + warehouse metadata in property content
// This guarantees persistence across all environments even before running ALTER TABLE in Supabase
const CREATOR_TAG_REGEX = /\s*<!--creator:([\s\S]*?)-->\s*/;
const META_TAG_REGEX = /\s*<!--meta:([\s\S]*?)-->\s*/;

const EXPORT_LOGS_PATH = path.join(process.cwd(), "export_logs.json");

function readExportLogs(): any[] {
  try {
    if (!fs.existsSync(EXPORT_LOGS_PATH)) {
      fs.writeFileSync(EXPORT_LOGS_PATH, JSON.stringify([], null, 2), "utf8");
      return [];
    }
    const raw = fs.readFileSync(EXPORT_LOGS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeExportLogs(logs: any[]) {
  try {
    fs.writeFileSync(EXPORT_LOGS_PATH, JSON.stringify(logs.slice(0, 500), null, 2), "utf8");
  } catch (_) {}
}

function extractMetaFromContent(content: string | undefined): {
  cleanContent: string;
  meta: Record<string, any> | null;
} {
  if (!content || typeof content !== "string") {
    return { cleanContent: content || "", meta: null };
  }
  const match = content.match(META_TAG_REGEX);
  if (!match) {
    return { cleanContent: content, meta: null };
  }
  try {
    const meta = JSON.parse(match[1]);
    const cleanContent = content.replace(META_TAG_REGEX, "").trim();
    return { cleanContent, meta };
  } catch {
    return { cleanContent: content.replace(META_TAG_REGEX, "").trim(), meta: null };
  }
}

function embedMetaInContent(content: string | undefined, meta: Record<string, any> | null): string {
  let baseContent = (content || "").replace(META_TAG_REGEX, "").trim();
  if (!meta || Object.keys(meta).length === 0) return baseContent;
  return `${baseContent}\n\n<!--meta:${JSON.stringify(meta)}-->`;
}

function extractCreatorFromContent(content: string | undefined): { cleanContent: string; creator: any | null } {
  if (!content || typeof content !== "string") {
    return { cleanContent: content || "", creator: null };
  }
  const match = content.match(CREATOR_TAG_REGEX);
  if (!match) {
    return { cleanContent: content, creator: null };
  }
  try {
    const creator = JSON.parse(match[1]);
    const cleanContent = content.replace(CREATOR_TAG_REGEX, "").trim();
    return { cleanContent, creator };
  } catch (e) {
    return { cleanContent: content, creator: null };
  }
}

function embedCreatorInContent(content: string | undefined, creator: any): string {
  let baseContent = (content || "").trim();
  // Remove any existing creator tag first
  baseContent = baseContent.replace(CREATOR_TAG_REGEX, "").trim();
  if (!creator) return baseContent;
  const tag = `\n\n<!--creator:${JSON.stringify(creator)}-->`;
  return baseContent + tag;
}

// Helper to enrich properties with manager info (using property_managers.json, profiles, content creator tag, and auth metadata)
async function enrichPropertiesWithManagers(props: any[], supabase: any) {
  if (!props || props.length === 0) return props;

  const propertyManagers = readPropertyManagers();
  let profilesList: any[] = [];
  try {
    const { data: profs } = await supabase.from("profiles").select("*");
    if (profs && Array.isArray(profs)) {
      profilesList = profs;
    }
  } catch (e) {}

  const adminAuth = getSupabaseAdmin();
  let authUsersList: any[] = [];
  if (adminAuth) {
    try {
      const { data: authData } = await adminAuth.auth.admin.listUsers();
      if (authData?.users) {
        authUsersList = authData.users;
      }
    } catch (e) {}
  }

  const userMap: Record<string, any> = {};
  for (const u of authUsersList) {
    const profile = {
      id: u.id,
      email: u.email,
      full_name: u.user_metadata?.full_name || u.email?.split("@")[0] || "Quản trị viên",
      phone: u.user_metadata?.phone || "",
      role: u.user_metadata?.role || "staff",
    };
    userMap[u.id] = profile;
    if (u.email) userMap[u.email] = profile;
    if (profile.phone) {
      userMap[profile.phone.replace(/[^0-9]/g, "")] = profile;
    }
  }
  for (const p of profilesList) {
    const existing = userMap[p.id] || {};
    const profile = {
      id: p.id,
      email: p.email || existing.email,
      full_name: p.full_name || existing.full_name || p.email?.split("@")[0] || "Quản trị viên",
      phone: p.phone || existing.phone || "",
      role: p.role || existing.role || "staff",
    };
    userMap[p.id] = profile;
    if (p.email) userMap[p.email] = profile;
    if (profile.phone) {
      userMap[profile.phone.replace(/[^0-9]/g, "")] = profile;
    }
  }

  let managersChanged = false;

  for (const prop of props) {
    // 0. Extract creator and warehouse metadata embedded in content if present
    const { cleanContent: afterCreator, creator: embeddedCreator } = extractCreatorFromContent(prop.content);
    const { cleanContent, meta: embeddedMeta } = extractMetaFromContent(afterCreator);
    prop.content = cleanContent;

    if (embeddedMeta && typeof embeddedMeta === "object") {
      const metaKeys = [
        "ma_tk",
        "so_nha",
        "duong",
        "phuong",
        "dien_tich",
        "dien_tich_so",
        "dien_tich_thuc_te",
        "so_tang",
        "rong",
        "dai",
        "gia",
        "loai_hinh",
        "trang_thai_nguon",
        "trang_thai_kinh_doanh",
        "trang_thai_xu_ly",
        "da_xuat_hometea",
        "da_xuat_fb",
        "mo_ta_tho",
        "moi_gioi_nguon",
        "sdt_nguon",
        "hoa_hong",
        "toa_do",
        "anh",
        "ten_thu_muc_goc",
      ];
      for (const k of metaKeys) {
        if (
          (prop[k] === undefined || prop[k] === null || prop[k] === "") &&
          embeddedMeta[k] !== undefined &&
          embeddedMeta[k] !== null &&
          embeddedMeta[k] !== ""
        ) {
          prop[k] = embeddedMeta[k];
        }
      }
    }

    // 1. Check existing propertyManagers mapping
    let manager = propertyManagers[prop.id];

    // 2. If content had an embedded creator, it is authoritative
    if (embeddedCreator && (embeddedCreator.id || embeddedCreator.email || embeddedCreator.name)) {
      const cleanEmbeddedPhone = embeddedCreator.phone ? embeddedCreator.phone.replace(/[^0-9]/g, "") : "";
      const matchedUser = userMap[embeddedCreator.id] || 
                         userMap[embeddedCreator.email] || 
                         (cleanEmbeddedPhone ? userMap[cleanEmbeddedPhone] : null);
      manager = {
        created_by: embeddedCreator.id || matchedUser?.id || "admin",
        created_by_name: matchedUser?.full_name || embeddedCreator.name || embeddedCreator.full_name || "Quản trị viên",
        created_by_phone: matchedUser?.phone || embeddedCreator.phone || "",
        created_by_email: matchedUser?.email || embeddedCreator.email || "",
        created_by_role: matchedUser?.role || embeddedCreator.role || "staff"
      };
      propertyManagers[prop.id] = manager;
      managersChanged = true;
    }

    // 3. Check created_by in property columns
    const authorKey = prop.created_by;
    if (!manager && authorKey && userMap[authorKey]) {
      const u = userMap[authorKey];
      manager = {
        created_by: u.id,
        created_by_name: u.full_name,
        created_by_phone: u.phone,
        created_by_email: u.email,
        created_by_role: u.role
      };
      propertyManagers[prop.id] = manager;
      managersChanged = true;
    }

    // 4. Check if property content matches a user's phone number
    if (!manager && prop.content) {
      const cleanDigits = prop.content.replace(/[^0-9]/g, "");
      for (const user of Object.values(userMap)) {
        if (user.phone) {
          const cleanPhone = user.phone.replace(/[^0-9]/g, "");
          if (cleanPhone && cleanPhone.length >= 9 && cleanDigits.includes(cleanPhone)) {
            manager = {
              created_by: user.id,
              created_by_name: user.full_name,
              created_by_phone: user.phone,
              created_by_email: user.email,
              created_by_role: user.role
            };
            propertyManagers[prop.id] = manager;
            managersChanged = true;
            break;
          }
        }
      }
    }

    // 5. Fallback if prop.created_by_name exists and is not unassigned
    if (!manager && prop.created_by_name && prop.created_by_name !== "Chưa phân công") {
      const foundUser = Object.values(userMap).find((u: any) => u.full_name?.toLowerCase() === prop.created_by_name.toLowerCase());
      manager = {
        created_by: foundUser?.id || prop.created_by || "admin",
        created_by_name: prop.created_by_name,
        created_by_phone: foundUser?.phone || "",
        created_by_email: foundUser?.email || "",
        created_by_role: foundUser?.role || "staff"
      };
    }

    // 6. DO NOT DEFAULT TO thanhtra1996st!
    // If no manager is identified, it remains unassigned ("Chưa phân công")

    if (manager) {
      const latestUser = userMap[manager.created_by] || 
                         userMap[manager.created_by_email] || 
                         (manager.created_by_phone ? userMap[manager.created_by_phone.replace(/[^0-9]/g, "")] : null);

      const resolvedName = latestUser?.full_name || manager.created_by_name || "Quản trị viên";
      const resolvedPhone = latestUser?.phone || manager.created_by_phone || "";
      const resolvedEmail = latestUser?.email || manager.created_by_email || "";
      const resolvedRole = latestUser?.role || manager.created_by_role || "staff";

      prop.created_by = manager.created_by || prop.created_by;
      prop.created_by_name = resolvedName;
      prop.created_by_phone = resolvedPhone;
      prop.created_by_email = resolvedEmail;
      prop.created_by_role = resolvedRole;
      prop.manager = {
        id: prop.created_by,
        full_name: resolvedName,
        phone: resolvedPhone,
        email: resolvedEmail,
        role: resolvedRole
      };
    } else {
      prop.created_by = "";
      prop.created_by_name = "Chưa phân công";
      prop.created_by_phone = "";
      prop.created_by_email = "";
      prop.created_by_role = "staff";
      prop.manager = null;
    }
  }

  if (managersChanged) {
    writePropertyManagers(propertyManagers);
  }

  return props;
}

// 6. Get All Properties (Protected)
app.get("/api/properties", authenticateAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("chu_nha_can_ban")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.log("Supabase query did not complete. Activating local database fallback.");
      const localData = readLocalDb();
      localData.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      await enrichPropertiesWithManagers(localData, supabase);
      
      const isTableMissing = error?.code === '42P01' || 
                             error?.message?.includes("relation") || 
                             error?.details?.includes("does not exist") || 
                             error?.message?.includes("does not exist");
      return res.json({
        properties: localData,
        isFallbackMode: true,
        isConfigError: isTableMissing,
        setupSQL: isTableMissing ? `
CREATE TABLE chu_nha_can_ban (
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
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS district text;
        `.trim() : undefined
      });
    }

    const properties = (data || []).map((prop: any) => {
      const p = { ...prop, district: prop.district || prop.khu_vuc || "" };
      delete p.khu_vuc;
      return p;
    });
    await enrichPropertiesWithManagers(properties, supabase);

    return res.json({ properties, isFallbackMode: false });
  } catch (error: any) {
    console.log("Supabase fetch connection failed. Activating local database fallback.");
    let supabase: any = null;
    try {
      supabase = getSupabase();
    } catch (_) {}
    const localData = readLocalDb().map((prop: any) => {
      const p = { ...prop, district: prop.district || prop.khu_vuc || "" };
      delete p.khu_vuc;
      return p;
    });
    localData.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    if (supabase) {
      await enrichPropertiesWithManagers(localData, supabase);
    }
    return res.json({ 
      properties: localData, 
      isFallbackMode: true, 
      isConfigError: true,
      setupSQL: COMPLETE_SETUP_SQL
    });
  }
});

/**
 * Parse "Ngay lay" / "Ngày lấy" from raw text or date string on server
 */
function parseServerNgayLayDate(rawDateStr: string | undefined | null): string | null {
  if (!rawDateStr || typeof rawDateStr !== "string" || !rawDateStr.trim()) return null;
  const s = rawDateStr.trim();
  const dmyMatch = s.match(
    /^([0-9]{1,2})[/-]([0-9]{1,2})[/-]([0-9]{4})(?:\s+([0-9]{1,2}):([0-9]{1,2})(?::([0-9]{1,2}))?)?/
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
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();
  return null;
}

function extractNgayLayFromStoredRecord(row: any, meta?: Record<string, any> | null): {
  iso: string | null;
  raw: string;
} {
  if (!row && !meta) return { iso: null, raw: "" };
  const direct = row?.ngay_lay || meta?.ngay_lay;
  if (direct) {
    const iso = parseServerNgayLayDate(String(direct));
    if (iso) {
      return { iso, raw: String(meta?.ngay_lay_raw || direct) };
    }
  }
  const textToScan = [row?.mo_ta_tho, meta?.mo_ta_tho, row?.content]
    .filter(Boolean)
    .join("\n");
  const m = textToScan.match(
    /(?:Ngày\s*lấy(?:\s*nguồn)?|Ngay\s*lay(?:\s*nguon)?|Thời\s*gian\s*lấy|Thoi\s*gian\s*lay)\s*:\s*([^\n\r]+)/i
  );
  if (m) {
    const raw = m[1].trim();
    return { iso: parseServerNgayLayDate(raw), raw };
  }
  return { iso: null, raw: "" };
}

/**
 * Adaptive Supabase upsert on `chu_nha_can_ban` using `onConflict: 'ma_tk'`.
 * If Supabase reports that a specific column does not exist in `chu_nha_can_ban`,
 * removes ONLY that missing column and retries `.upsert(..., { onConflict: 'ma_tk' })`
 * so all existing structured columns (`ma_tk, loai_hinh, dia_chi, phuong, gia, dien_tich_so,
 * dien_tich_thuc_te, rong, dai, so_tang, trang_thai_xu_ly`, etc.) are always written.
 */
const unsupportedColumnsCache = new Set<string>();

async function upsertChuNhaCanBanByMaTk(
  supabase: any,
  payload: Record<string, any>,
  existingId?: string | null
): Promise<any> {
  const workingPayload: Record<string, any> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (!unsupportedColumnsCache.has(k) && v !== undefined) {
      workingPayload[k] = v;
    }
  }

  // Never touch protected export/draft columns during import
  const protectedExact = [
    "da_len_hometea",
    "hometea_id",
    "da_xep_lich_fb",
    "da_dang_fb",
    "da_xuat_hometea",
    "da_xuat_fb",
    "ngay_xuat_hometea",
    "ngay_xuat_fb",
  ];
  for (const key of Object.keys(workingPayload)) {
    if (protectedExact.includes(key) || key.startsWith("draft_")) {
      delete workingPayload[key];
    }
  }

  for (let attempt = 0; attempt < 25; attempt++) {
    const { data, error } = await supabase
      .from("chu_nha_can_ban")
      .upsert([workingPayload], { onConflict: "ma_tk" })
      .select();

    if (!error) {
      return data?.[0] || null;
    }

    const errMsg = String(error.message || "") + " " + String(error.details || "");

    // Case 1: Specific column does not exist in `chu_nha_can_ban`
    const colMatch1 = errMsg.match(/Could not find the '([^']+)' column/i);
    const colMatch2 = errMsg.match(/column "([^"]+)" of relation "chu_nha_can_ban" does not exist/i);
    const missingCol = colMatch1?.[1] || colMatch2?.[1];

    if (missingCol && missingCol in workingPayload && missingCol !== "name") {
      unsupportedColumnsCache.add(missingCol);
      delete workingPayload[missingCol];
      continue;
    }

    // Case 2: Type mismatch on a column (e.g. numeric column receiving text)
    if (error.code === "22P02") {
      for (const numCol of ["so_tang", "rong", "dai", "dien_tich_so", "dien_tich_thuc_te", "gia"]) {
        if (workingPayload[numCol] !== null && workingPayload[numCol] !== undefined) {
          const parsedNum = Number(String(workingPayload[numCol]).replace(",", "."));
          workingPayload[numCol] = !isNaN(parsedNum) && String(workingPayload[numCol]).trim() !== "" ? parsedNum : null;
        }
      }
      continue;
    }

    // Case 3: `42P10` (UNIQUE constraint on `ma_tk` hasn't been created in DB yet)
    if (error.code === "42P10" || errMsg.includes("ON CONFLICT specification")) {
      if (existingId) {
        const { data: updData, error: updErr } = await supabase
          .from("chu_nha_can_ban")
          .update(workingPayload)
          .eq("id", existingId)
          .select();
        if (updErr) throw updErr;
        return updData?.[0] || null;
      } else {
        const { data: insData, error: insErr } = await supabase
          .from("chu_nha_can_ban")
          .insert([workingPayload])
          .select();
        if (insErr) throw insErr;
        return insData?.[0] || null;
      }
    }

    throw error;
  }

  throw new Error("Không thể lưu bản ghi vào bảng chu_nha_can_ban sau nhiều lần thử.");
}

// 6.1 Check existing Mã TK in batch (Phase 1 Preview - single query by ma_tk list)
app.post("/api/properties/check-ma-tk", authenticateAdmin, async (req, res) => {
  try {
    const rawList: string[] = Array.isArray(req.body?.ma_tk_list) ? req.body.ma_tk_list : [];
    const maTkList = Array.from(
      new Set(
        rawList
          .map((m) => String(m || "").trim().toUpperCase())
          .filter((m) => m && !/^#?[0-9]+$/.test(m))
      )
    );

    if (maTkList.length === 0) {
      return res.json({ success: true, existingMap: {} });
    }

    const existingMap: Record<string, any> = {};
    const maTkSet = new Set(maTkList);

    const attachNgayLayMeta = (row: any) => {
      if (!row) return row;
      const { cleanContent: c1 } = extractCreatorFromContent(row.content);
      const { meta } = extractMetaFromContent(c1);
      const storedNgayLay = extractNgayLayFromStoredRecord(row, meta);
      return {
        ...(meta || {}),
        ...row,
        _stored_ngay_lay: storedNgayLay.iso,
        _stored_ngay_lay_raw: storedNgayLay.raw,
        _manually_edited_fields: Array.isArray(meta?.manually_edited_fields)
          ? meta.manually_edited_fields
          : [],
      };
    };

    try {
      const supabase = getSupabase();
      // Single query against Supabase `chu_nha_can_ban` by `ma_tk` list
      const { data: byCol, error: colErr } = await supabase
        .from("chu_nha_can_ban")
        .select("*")
        .in("ma_tk", maTkList);

      if (!colErr && Array.isArray(byCol)) {
        for (const row of byCol) {
          if (row.ma_tk) {
            const key = String(row.ma_tk).trim().toUpperCase();
            existingMap[key] = attachNgayLayMeta(row);
          }
        }
      }

      // If any requested codes weren't found in the `ma_tk` column, check legacy rows where `ma_tk` is null
      if (Object.keys(existingMap).length < maTkList.length) {
        const { data: legacyRows } = await supabase
          .from("chu_nha_can_ban")
          .select("*");

        if (Array.isArray(legacyRows)) {
          for (const row of legacyRows) {
            const rowMaTk = String(row.ma_tk || "").trim().toUpperCase();
            if (rowMaTk && maTkSet.has(rowMaTk) && !existingMap[rowMaTk]) {
              existingMap[rowMaTk] = attachNgayLayMeta(row);
              continue;
            }
            const nameUpper = String(row.name || "").toUpperCase();
            const contentUpper = String(row.content || "").toUpperCase();
            for (const code of maTkSet) {
              if (!existingMap[code]) {
                if (
                  nameUpper.startsWith(`${code}_`) ||
                  nameUpper.startsWith(`${code} `) ||
                  contentUpper.includes(`MÃ NGUỒN HÀNG: ${code}`) ||
                  contentUpper.includes(`"MA_TK":"${code}"`)
                ) {
                  existingMap[code] = attachNgayLayMeta(row);
                }
              }
            }
          }
        }
      }
    } catch (_) {
      const localData = readLocalDb();
      for (const row of localData) {
        const code = String(row.ma_tk || "").trim().toUpperCase();
        if (code && maTkSet.has(code)) {
          existingMap[code] = attachNgayLayMeta(row);
        }
      }
    }

    return res.json({ success: true, existingMap });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Lỗi kiểm tra danh sách Mã TK." });
  }
});

// 6.2 Bulk Upsert Single Property Unit by Mã TK (Phase 2 Queue)
app.post("/api/properties/bulk-upsert", authenticateAdmin, async (req: any, res) => {
  try {
    if (req.admin?.role === "viewer") {
      return res.status(403).json({ error: "Tài khoản Người xem không có quyền nhập nguồn nhà." });
    }

    const updateExisting = !!req.body?.updateExisting;
    const rec = req.body?.record || {};
    const ma_tk = String(rec.ma_tk || "").trim().toUpperCase();

    if (!ma_tk || /^#?[0-9]+$/.test(ma_tk)) {
      return res.status(400).json({
        error: "Mã TK thật (TKxxxxxx hoặc NT-xxxxxx) là bắt buộc. Không dùng tiền tố số làm mã.",
      });
    }

    const so_nha = String(rec.so_nha || "").trim();
    const duong = String(rec.duong || "").trim();
    const dia_chi = String(rec.dia_chi || [so_nha, duong].filter(Boolean).join(" ")).trim();
    const phuong = String(rec.phuong || "").trim();
    const dien_tich = String(rec.dien_tich || "").trim();

    // Parse dien_tich_so (công nhận) and dien_tich_thuc_te (thực tế) - NEVER concatenate "67-75" into 6775!
    let dien_tich_so: number | null =
      rec.dien_tich_so !== null &&
      rec.dien_tich_so !== undefined &&
      rec.dien_tich_so !== "" &&
      !isNaN(Number(rec.dien_tich_so))
        ? Number(rec.dien_tich_so)
        : null;
    let dien_tich_thuc_te: number | null =
      rec.dien_tich_thuc_te !== null &&
      rec.dien_tich_thuc_te !== undefined &&
      rec.dien_tich_thuc_te !== "" &&
      !isNaN(Number(rec.dien_tich_thuc_te))
        ? Number(rec.dien_tich_thuc_te)
        : null;

    if ((dien_tich_so === null || dien_tich_thuc_te === null) && dien_tich) {
      const cleanArea = dien_tich.replace(/m2|m²|\s+/gi, "");
      const dualMatch = cleanArea.match(/^([0-9]+(?:[.,][0-9]+)?)[/\-–]([0-9]+(?:[.,][0-9]+)?)$/);
      if (dualMatch) {
        const n1 = parseFloat(dualMatch[1].replace(",", "."));
        const n2 = parseFloat(dualMatch[2].replace(",", "."));
        if (dien_tich_so === null && !isNaN(n1) && n1 > 0) dien_tich_so = n1;
        if (dien_tich_thuc_te === null && !isNaN(n2) && n2 > 0) dien_tich_thuc_te = n2;
      } else {
        const singleMatch = cleanArea.match(/^([0-9]+(?:[.,][0-9]+)?)$/);
        if (singleMatch) {
          const n = parseFloat(singleMatch[1].replace(",", "."));
          if (!isNaN(n) && n > 0) {
            if (dien_tich_so === null) dien_tich_so = n;
            if (dien_tich_thuc_te === null) dien_tich_thuc_te = n;
          }
        }
      }
    }

    const loai_hinh = String(rec.loai_hinh || "Nhà phố").trim();
    const isNhaPho =
      loai_hinh.toLowerCase() === "nhà phố" || loai_hinh.toLowerCase() === "nha pho";

    // Rule 4: "Số tầng chỉ khi loại hình là nhà phố."
    const rawSoTangStr = isNhaPho ? String(rec.so_tang ?? "").trim() : "";
    const so_tang = rawSoTangStr || null;

    const rawRongStr = String(rec.rong ?? "").trim();
    const rong = rawRongStr || null;

    const rawDaiStr = String(rec.dai ?? "").trim();
    const dai = rawDaiStr || null;

    const gia =
      rec.gia !== null && rec.gia !== undefined && rec.gia !== "" && !isNaN(Number(rec.gia))
        ? Math.round(Number(rec.gia))
        : null;
    const gia_text = String(rec.gia_text || "").trim();
    const mo_ta_tho = String(rec.mo_ta_tho || "").trim();
    const moi_gioi_nguon = String(rec.moi_gioi_nguon || "").trim();
    const sdt_nguon = String(rec.sdt_nguon || "").trim();
    const hoa_hong = String(rec.hoa_hong || "3%").trim();
    const toa_do = String(rec.toa_do || "").trim();
    const ten_thu_muc_goc = String(rec.ten_thu_muc_goc || "").trim();
    const ngay_nhap = rec.ngay_nhap || new Date().toISOString();

    // Parse "Ngay lay" from record or .txt content
    const parsedIncomingNgayLay =
      parseServerNgayLayDate(rec.ngay_lay) ||
      extractNgayLayFromStoredRecord({ mo_ta_tho }, null).iso;
    const ngay_lay_raw = String(rec.ngay_lay_raw || "").trim();

    const image_urls: string[] = Array.isArray(rec.image_urls) ? rec.image_urls : [];
    const anh: any[] = Array.isArray(rec.anh) ? rec.anh : [];

    // Enforce Mandatory Fields Rule: if missing address, price, or area -> force trang_thai_nguon = "thô"
    const hasValidArea =
      (dien_tich_thuc_te !== null && dien_tich_thuc_te > 0) ||
      (dien_tich_so !== null && dien_tich_so > 0) ||
      !!dien_tich;
    const isMissingMandatory = !dia_chi || !hasValidArea || !gia || gia <= 0;
    const trang_thai_nguon = isMissingMandatory ? "thô" : rec.trang_thai_nguon || "đã bổ sung";

    const trang_thai_kinh_doanh =
      rec.trang_thai_kinh_doanh || (trang_thai_nguon === "đã bán" ? "da_ban" : "nguon_tho");

    const hasAllStructured =
      !!ma_tk &&
      !!so_nha &&
      !!duong &&
      !!phuong &&
      dien_tich_so !== null &&
      dien_tich_so > 0 &&
      dien_tich_thuc_te !== null &&
      dien_tich_thuc_te > 0 &&
      (!isNhaPho || !!so_tang) &&
      !!rong &&
      !!dai &&
      gia !== null &&
      gia > 0 &&
      image_urls.length > 0;

    const trang_thai_xu_ly =
      rec.trang_thai_xu_ly ||
      (isMissingMandatory ? "tho" : hasAllStructured ? "san_sang" : "can_bo_sung");

    let mappedStatus = "moi";
    if (trang_thai_kinh_doanh === "da_ban" || trang_thai_nguon === "đã bán")
      mappedStatus = "da_ban";
    else if (trang_thai_kinh_doanh === "da_ky" || trang_thai_nguon === "sẵn sàng đăng")
      mappedStatus = "da_ky";
    else mappedStatus = "moi";

    const displayTitle =
      [
        `${ma_tk}_${dia_chi || ten_thu_muc_goc}`,
        dien_tich || (dien_tich_so && dien_tich_thuc_te ? (dien_tich_so === dien_tich_thuc_te ? `${dien_tich_thuc_te}` : `${dien_tich_so}-${dien_tich_thuc_te}`) : ""),
        so_tang || loai_hinh,
        rong,
        dai,
        gia_text,
      ]
        .filter(Boolean)
        .join(" ") ||
      ten_thu_muc_goc ||
      ma_tk;

    const structuredSummaryLines = [
      `--- THONG TIN NGUON HANG ---`,
      `Mã nguồn hàng: ${ma_tk}`,
      ngay_lay_raw || parsedIncomingNgayLay
        ? `Ngày lấy: ${ngay_lay_raw || parsedIncomingNgayLay}`
        : "",
      `Loại hình: ${loai_hinh}`,
      `Trạng thái nguồn: ${trang_thai_nguon}`,
      `--- TIEU DE ---`,
      `${dia_chi}${phuong ? `, ${phuong}` : ""}`,
      `--- THONG TIN CHI TIET ---`,
      gia_text
        ? `Giá chào (VNĐ): ${gia_text} (${gia ? gia.toLocaleString("vi-VN") + " đ" : ""})`
        : "",
      hasValidArea
        ? `Diện tích: ${dien_tich || dien_tich_thuc_te} m² (Sổ: ${dien_tich_so ?? "-"}m² | Thực tế: ${dien_tich_thuc_te ?? "-"}m²) ${rong && dai ? `(${rong} x ${dai}m)` : ""}`
        : "",
      so_tang ? `Kết cấu: ${so_tang} tầng` : "",
      hoa_hong ? `Phần trăm trích thưởng: ${hoa_hong}` : "",
      moi_gioi_nguon ? `Đầu chủ: ${moi_gioi_nguon}` : "",
      sdt_nguon ? `SĐT: ${sdt_nguon}` : "",
      toa_do ? `Dinh vi: ${toa_do}` : "",
      `--- MO TA ---`,
      mo_ta_tho || "",
    ].filter(Boolean);

    const authorId = req.admin?.id || rec.created_by || req.admin?.email || "admin";
    const authorName = req.admin?.full_name || rec.created_by_name || "Quản trị viên";
    const authorPhone = req.admin?.phone || rec.created_by_phone || "";
    const authorEmail = req.admin?.email || rec.created_by_email || "";
    const authorRole = req.admin?.role || rec.created_by_role || "admin";

    const warehouseMeta: Record<string, any> = {
      ma_tk,
      so_nha,
      duong,
      dia_chi,
      phuong,
      dien_tich,
      dien_tich_so,
      dien_tich_thuc_te,
      so_tang: so_tang || "",
      rong: rong || "",
      dai: dai || "",
      gia,
      loai_hinh,
      trang_thai_nguon,
      trang_thai_kinh_doanh,
      trang_thai_xu_ly,
      mo_ta_tho,
      moi_gioi_nguon,
      sdt_nguon,
      hoa_hong,
      toa_do,
      ten_thu_muc_goc,
      ngay_lay: parsedIncomingNgayLay,
      ngay_lay_raw,
    };

    const contentWithMeta = embedMetaInContent(structuredSummaryLines.join("\n"), warehouseMeta);
    const contentWithCreator = embedCreatorInContent(contentWithMeta, {
      id: authorId,
      name: authorName,
      phone: authorPhone,
      email: authorEmail,
      role: authorRole,
    });

    // Requirement 4: Ngoài name/content/image_urls, ghi thêm các cột có cấu trúc:
    // ma_tk, loai_hinh, dia_chi, phuong, gia, dien_tich_so, dien_tich_thuc_te, rong, dai, so_tang, trang_thai_xu_ly
    const fullPayload: Record<string, any> = {
      name: displayTitle,
      phone: sdt_nguon || "",
      district: phuong || "",
      facebook_link: "",
      website_link: toa_do.startsWith("http") ? toa_do : "",
      content: contentWithCreator,
      image_urls,
      loai_giao_dich: "khach_ban",
      status: mappedStatus,
      // Structured columns required by Spec:
      ma_tk,
      loai_hinh,
      dia_chi,
      phuong,
      gia,
      dien_tich_so,
      dien_tich_thuc_te,
      rong,
      dai,
      so_tang,
      trang_thai_xu_ly,
      // Extended warehouse columns:
      so_nha,
      duong,
      dien_tich,
      trang_thai_nguon,
      trang_thai_kinh_doanh,
      mo_ta_tho,
      moi_gioi_nguon,
      sdt_nguon,
      hoa_hong,
      toa_do,
      anh,
      ten_thu_muc_goc,
      ngay_lay: parsedIncomingNgayLay,
      ngay_nhap,
      updated_at: new Date().toISOString(),
    };

    try {
      const supabase = getSupabase();

      // Check if record already exists by `ma_tk`
      let existingRow: any = null;
      const { data: foundByMaTk } = await supabase
        .from("chu_nha_can_ban")
        .select("*")
        .eq("ma_tk", ma_tk)
        .maybeSingle();

      if (foundByMaTk) {
        existingRow = foundByMaTk;
      } else {
        const { data: foundByName } = await supabase
          .from("chu_nha_can_ban")
          .select("*")
          .ilike("name", `${ma_tk}_%`)
          .maybeSingle();
        if (foundByName) existingRow = foundByName;
      }

      if (existingRow && !updateExisting) {
        return res.json({
          success: true,
          skipped: true,
          message: `Bỏ qua Mã TK ${ma_tk} vì đã tồn tại.`,
        });
      }

      let targetPayload: Record<string, any> = { ...fullPayload };

      // Requirement 3: Khi tin "Đã có" và bật "Cập nhật nguồn đã có":
      // - So ngày lấy (Ngay lay) trong .txt, chỉ cập nhật nếu mới hơn bản đang lưu.
      // - Chỉ cập nhật phần thô và các trường chưa chỉnh tay.
      // - KHÔNG đụng vào da_len_hometea, hometea_id, da_xep_lich_fb, da_dang_fb, draft_*.
      if (existingRow && updateExisting) {
        const { cleanContent: exC1 } = extractCreatorFromContent(existingRow.content);
        const { meta: exMeta } = extractMetaFromContent(exC1);
        const storedNgayLayInfo = extractNgayLayFromStoredRecord(existingRow, exMeta);

        // Compare Ngay lay: only update if incoming Ngay lay is strictly newer than stored Ngay lay
        if (storedNgayLayInfo.iso) {
          if (!parsedIncomingNgayLay) {
            return res.json({
              success: true,
              skipped: true,
              reason: "missing_ngay_lay",
              message: `Bỏ qua cập nhật ${ma_tk}: Bản đang lưu có Ngày lấy (${storedNgayLayInfo.raw || storedNgayLayInfo.iso.slice(0, 10)}), nhưng .txt mới không có Ngày lấy.`,
            });
          }
          const incomingMs = new Date(parsedIncomingNgayLay).getTime();
          const storedMs = new Date(storedNgayLayInfo.iso).getTime();
          if (incomingMs <= storedMs) {
            return res.json({
              success: true,
              skipped: true,
              reason: "not_newer_ngay_lay",
              message: `Bỏ qua cập nhật ${ma_tk}: Ngày lấy trong .txt (${ngay_lay_raw || parsedIncomingNgayLay.slice(0, 10)}) không mới hơn bản đang lưu (${storedNgayLayInfo.raw || storedNgayLayInfo.iso.slice(0, 10)}).`,
            });
          }
        }

        const manuallyEdited = new Set<string>(
          Array.isArray(exMeta?.manually_edited_fields) ? exMeta.manually_edited_fields : []
        );

        const isNonEmpty = (val: any) =>
          val !== null && val !== undefined && String(val).trim() !== "";

        // Keep existing structured value if it was manually edited OR already has a non-empty value
        const keepOrFill = (field: string, existingVal: any, incomingVal: any) => {
          if (manuallyEdited.has(field) && isNonEmpty(existingVal)) return existingVal;
          if (isNonEmpty(existingVal)) return existingVal;
          return incomingVal;
        };

        const prevImages: string[] = Array.isArray(existingRow.image_urls)
          ? existingRow.image_urls
          : [];
        const mergedImages = Array.from(new Set([...prevImages, ...image_urls]));

        const prevAnh: any[] = Array.isArray(existingRow.anh) ? existingRow.anh : [];
        const mergedAnh = [...prevAnh, ...anh];

        const mergedLoaiHinh = keepOrFill(
          "loai_hinh",
          existingRow.loai_hinh ?? exMeta?.loai_hinh,
          fullPayload.loai_hinh
        );
        const mergedIsNhaPho =
          String(mergedLoaiHinh || "").toLowerCase() === "nhà phố" ||
          String(mergedLoaiHinh || "").toLowerCase() === "nha pho";

        const mergedSoTang = mergedIsNhaPho
          ? keepOrFill("so_tang", existingRow.so_tang ?? exMeta?.so_tang, fullPayload.so_tang)
          : null;

        // Preserve processing status if already exported or ready
        const exXuLy = existingRow.trang_thai_xu_ly || exMeta?.trang_thai_xu_ly;
        const mergedXuLy =
          exXuLy === "da_len_hometea" || exXuLy === "da_dang_fb" || exXuLy === "san_sang"
            ? exXuLy
            : keepOrFill("trang_thai_xu_ly", exXuLy, fullPayload.trang_thai_xu_ly);

        // Update raw part (mo_ta_tho, moi_gioi_nguon, sdt_nguon, hoa_hong, toa_do, ngay_lay)
        // + only fill unedited empty structured fields
        const updatedMeta: Record<string, any> = {
          ...(exMeta || {}),
          ma_tk,
          loai_hinh: mergedLoaiHinh,
          so_nha: keepOrFill("so_nha", existingRow.so_nha ?? exMeta?.so_nha, fullPayload.so_nha),
          duong: keepOrFill("duong", existingRow.duong ?? exMeta?.duong, fullPayload.duong),
          dia_chi: keepOrFill(
            "dia_chi",
            existingRow.dia_chi ?? exMeta?.dia_chi,
            fullPayload.dia_chi
          ),
          phuong: keepOrFill("phuong", existingRow.phuong ?? exMeta?.phuong, fullPayload.phuong),
          dien_tich: keepOrFill(
            "dien_tich",
            existingRow.dien_tich ?? exMeta?.dien_tich,
            fullPayload.dien_tich
          ),
          dien_tich_so:
            existingRow.dien_tich_so ?? exMeta?.dien_tich_so ?? fullPayload.dien_tich_so,
          dien_tich_thuc_te:
            existingRow.dien_tich_thuc_te ??
            exMeta?.dien_tich_thuc_te ??
            fullPayload.dien_tich_thuc_te,
          so_tang: mergedSoTang || "",
          rong: keepOrFill("rong", existingRow.rong ?? exMeta?.rong, fullPayload.rong) || "",
          dai: keepOrFill("dai", existingRow.dai ?? exMeta?.dai, fullPayload.dai) || "",
          gia: existingRow.gia ?? exMeta?.gia ?? fullPayload.gia,
          trang_thai_nguon:
            existingRow.trang_thai_nguon ?? exMeta?.trang_thai_nguon ?? fullPayload.trang_thai_nguon,
          trang_thai_kinh_doanh: keepOrFill(
            "trang_thai_kinh_doanh",
            existingRow.trang_thai_kinh_doanh ?? exMeta?.trang_thai_kinh_doanh,
            fullPayload.trang_thai_kinh_doanh
          ),
          trang_thai_xu_ly: mergedXuLy,
          // Raw part IS updated with the newer .txt data:
          mo_ta_tho: fullPayload.mo_ta_tho || existingRow.mo_ta_tho || exMeta?.mo_ta_tho || "",
          moi_gioi_nguon:
            fullPayload.moi_gioi_nguon ||
            existingRow.moi_gioi_nguon ||
            exMeta?.moi_gioi_nguon ||
            "",
          sdt_nguon:
            fullPayload.sdt_nguon || existingRow.sdt_nguon || exMeta?.sdt_nguon || "",
          hoa_hong: fullPayload.hoa_hong || existingRow.hoa_hong || exMeta?.hoa_hong || "",
          toa_do: fullPayload.toa_do || existingRow.toa_do || exMeta?.toa_do || "",
          ten_thu_muc_goc:
            fullPayload.ten_thu_muc_goc ||
            existingRow.ten_thu_muc_goc ||
            exMeta?.ten_thu_muc_goc ||
            "",
          ngay_lay: parsedIncomingNgayLay || storedNgayLayInfo.iso,
          ngay_lay_raw: ngay_lay_raw || storedNgayLayInfo.raw,
          manually_edited_fields: Array.from(manuallyEdited),
        };

        const mergedContentMeta = embedMetaInContent(structuredSummaryLines.join("\n"), updatedMeta);
        const mergedContentCreator = embedCreatorInContent(mergedContentMeta, {
          id: authorId,
          name: authorName,
          phone: authorPhone,
          email: authorEmail,
          role: authorRole,
        });

        targetPayload = {
          name: keepOrFill("name", existingRow.name, fullPayload.name),
          phone: fullPayload.phone || existingRow.phone || "",
          district: keepOrFill("phuong", existingRow.district || existingRow.phuong, fullPayload.district),
          facebook_link: existingRow.facebook_link || fullPayload.facebook_link,
          website_link: fullPayload.website_link || existingRow.website_link,
          content: mergedContentCreator,
          image_urls: mergedImages,
          loai_giao_dich: existingRow.loai_giao_dich || fullPayload.loai_giao_dich,
          status: existingRow.status || fullPayload.status,
          ma_tk,
          loai_hinh: mergedLoaiHinh,
          dia_chi: updatedMeta.dia_chi,
          phuong: updatedMeta.phuong,
          gia: updatedMeta.gia,
          dien_tich_so: updatedMeta.dien_tich_so,
          dien_tich_thuc_te: updatedMeta.dien_tich_thuc_te,
          rong: updatedMeta.rong || null,
          dai: updatedMeta.dai || null,
          so_tang: mergedSoTang,
          trang_thai_xu_ly: mergedXuLy,
          so_nha: updatedMeta.so_nha,
          duong: updatedMeta.duong,
          dien_tich: updatedMeta.dien_tich,
          trang_thai_nguon: updatedMeta.trang_thai_nguon,
          trang_thai_kinh_doanh: updatedMeta.trang_thai_kinh_doanh,
          mo_ta_tho: updatedMeta.mo_ta_tho,
          moi_gioi_nguon: updatedMeta.moi_gioi_nguon,
          sdt_nguon: updatedMeta.sdt_nguon,
          hoa_hong: updatedMeta.hoa_hong,
          toa_do: updatedMeta.toa_do,
          anh: mergedAnh,
          ten_thu_muc_goc: updatedMeta.ten_thu_muc_goc,
          ngay_lay: updatedMeta.ngay_lay,
          updated_at: new Date().toISOString(),
        };

        // If existingRow had no ma_tk in its column yet, ensure its id is updated so upsert onConflict: 'ma_tk' matches it
        if (existingRow.id && !existingRow.ma_tk) {
          try {
            await supabase
              .from("chu_nha_can_ban")
              .update({ ma_tk })
              .eq("id", existingRow.id);
          } catch (_) {}
        }
      }

      // Requirement 2: Ghi bằng upsert onConflict: 'ma_tk'
      const savedProp = await upsertChuNhaCanBanByMaTk(
        supabase,
        targetPayload,
        existingRow?.id || null
      );

      if (savedProp?.id) {
        const pManagers = readPropertyManagers();
        pManagers[savedProp.id] = {
          created_by: authorId,
          created_by_name: authorName,
          created_by_phone: authorPhone,
          created_by_email: authorEmail,
          created_by_role: authorRole,
        };
        writePropertyManagers(pManagers);
      }

      return res.status(200).json({
        success: true,
        property: savedProp,
        isFallbackMode: false,
      });
    } catch (dbErr: any) {
      // Fallback to local JSON store if Supabase is not configured yet
      const localData = readLocalDb();
      const existingIdx = localData.findIndex(
        (p) => String(p.ma_tk || "").toUpperCase() === ma_tk
      );
      let savedLocal: any;

      if (existingIdx !== -1) {
        if (!updateExisting) {
          return res.json({ success: true, skipped: true });
        }
        const prev = localData[existingIdx];
        const storedNgay = extractNgayLayFromStoredRecord(prev, null);
        if (storedNgay.iso && parsedIncomingNgayLay) {
          if (new Date(parsedIncomingNgayLay).getTime() <= new Date(storedNgay.iso).getTime()) {
            return res.json({
              success: true,
              skipped: true,
              reason: "not_newer_ngay_lay",
              message: `Bỏ qua cập nhật ${ma_tk}: Ngày lấy trong .txt không mới hơn bản đang lưu.`,
            });
          }
        }
        savedLocal = {
          ...fullPayload,
          ...prev,
          mo_ta_tho: fullPayload.mo_ta_tho || prev.mo_ta_tho,
          moi_gioi_nguon: fullPayload.moi_gioi_nguon || prev.moi_gioi_nguon,
          sdt_nguon: fullPayload.sdt_nguon || prev.sdt_nguon,
          hoa_hong: fullPayload.hoa_hong || prev.hoa_hong,
          ngay_lay: parsedIncomingNgayLay || prev.ngay_lay,
          image_urls: Array.from(new Set([...(prev.image_urls || []), ...image_urls])),
          updated_at: new Date().toISOString(),
        };
        localData[existingIdx] = savedLocal;
      } else {
        savedLocal = {
          ...fullPayload,
          id: `local-${ma_tk}-${Date.now()}`,
          created_at: new Date().toISOString(),
        };
        localData.push(savedLocal);
      }
      writeLocalDb(localData);

      return res.status(200).json({
        success: true,
        property: savedLocal,
        isFallbackMode: true,
      });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Lỗi upsert nguồn hàng loạt." });
  }
});

// 6.3 Public / Hometea Safe Feed Endpoint
// Strictly strips `mo_ta_tho`, `moi_gioi_nguon`, `sdt_nguon` and blocks raw ("thô") or incomplete listings
app.get("/api/public/properties", async (req, res) => {
  try {
    let rows: any[] = [];
    try {
      const supabase = getSupabase();
      const { data } = await supabase
        .from("chu_nha_can_ban")
        .select("*")
        .order("updated_at", { ascending: false });
      if (Array.isArray(data)) rows = data;
    } catch (_) {
      rows = readLocalDb();
    }

    const safeProperties = rows
      .filter((r) => {
        if (r.trang_thai_nguon === "thô") return false;
        const hasAddr = !!(r.duong || r.so_nha || r.name);
        const hasPrice = !!(r.gia && Number(r.gia) > 0);
        const hasArea = !!r.dien_tich;
        return hasAddr && hasPrice && hasArea;
      })
      .map((r) => {
        const {
          mo_ta_tho,
          moi_gioi_nguon,
          sdt_nguon,
          phone,
          content,
          ...publicSafeFields
        } = r;
        return publicSafeFields;
      });

    return res.json({ properties: safeProperties });
  } catch (err: any) {
    return res.status(500).json({ error: "Lỗi lấy danh sách công khai." });
  }
});

// 7. Create New Property (Protected)
app.post("/api/properties", authenticateAdmin, async (req: any, res) => {
  try {
    if (req.admin?.role === "viewer") {
      return res.status(403).json({ error: "Tài khoản Người xem (Viewer) không có quyền tạo mới tin." });
    }

    const { name, phone, district, facebook_link, website_link, content, image_urls, loai_giao_dich, status, created_by, created_by_name, created_by_phone, created_by_email, created_by_role } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Tên chủ nhà là bắt buộc" });
    }
    if (!loai_giao_dich) {
      return res.status(400).json({ error: "Loại giao dịch là bắt buộc" });
    }

    // Assign author directly to the currently authenticated user
    const authorId = req.admin?.id || created_by || req.admin?.email || "admin";
    const authorName = req.admin?.full_name || created_by_name || req.admin?.email?.split("@")[0] || "Quản trị viên";
    const authorPhone = req.admin?.phone || created_by_phone || "";
    const authorEmail = req.admin?.email || created_by_email || "";
    const authorRole = req.admin?.role || created_by_role || "staff";

    const creatorMeta = {
      id: authorId,
      name: authorName,
      phone: authorPhone,
      email: authorEmail,
      role: authorRole
    };

    const cleanInputContent = typeof content === "string" ? content.trim() : (content || "");
    const contentWithCreator = embedCreatorInContent(cleanInputContent, creatorMeta);

    // Strictly send ONLY columns that belong to chu_nha_can_ban table in Supabase
    const supabasePayload: Record<string, any> = {
      name: typeof name === "string" ? name.trim() : name,
      phone: phone || "",
      district: typeof district === "string" ? district.trim() : (district || ""),
      facebook_link: facebook_link || "",
      website_link: website_link || "",
      content: contentWithCreator,
      image_urls: Array.isArray(image_urls) ? image_urls : [],
      loai_giao_dich,
      status: status || "moi",
      updated_at: new Date().toISOString()
    };

    console.log(`[POST /api/properties] Inserting to chu_nha_can_ban with district: "${supabasePayload.district}", creator: "${authorName}"`);

    try {
      const supabase = getSupabase();
      const insertResult = await supabase
        .from("chu_nha_can_ban")
        .insert([supabasePayload])
        .select();

      if (insertResult.error) {
        console.error("[POST /api/properties] Supabase insert error:", insertResult.error);
        throw insertResult.error;
      }

      const createdProp = insertResult.data?.[0];
      if (createdProp) {
        // Save to propertyManagers mapping
        const pManagers = readPropertyManagers();
        pManagers[createdProp.id] = {
          created_by: authorId,
          created_by_name: authorName,
          created_by_phone: authorPhone,
          created_by_email: authorEmail,
          created_by_role: authorRole
        };
        writePropertyManagers(pManagers);

        createdProp.content = cleanInputContent;
        createdProp.created_by = authorId;
        createdProp.created_by_name = authorName;
        createdProp.created_by_phone = authorPhone;
        createdProp.created_by_email = authorEmail;
        createdProp.created_by_role = authorRole;
        createdProp.manager = pManagers[createdProp.id];
      }

      console.log(`[POST /api/properties] Created successfully in Supabase chu_nha_can_ban:`, createdProp?.id, `district: "${createdProp?.district}"`);
      return res.status(201).json({ success: true, property: createdProp, isFallbackMode: false });
    } catch (dbErr: any) {
      const isCheckConstraint = dbErr?.code === '23514' ||
                                (dbErr?.message && dbErr.message.toLowerCase().includes("check constraint")) ||
                                (dbErr?.details && dbErr.details.toLowerCase().includes("check constraint"));
      
      console.warn("Supabase insert did not complete, using local data storage fallback:", dbErr?.message);
      
      const localData = readLocalDb();
      const newId = "local-" + Math.random().toString(36).substring(2, 9);
      const managerMeta = {
        created_by: authorId,
        created_by_name: authorName,
        created_by_phone: authorPhone,
        created_by_email: authorEmail,
        created_by_role: authorRole
      };

      const newProp = {
        ...supabasePayload,
        content: cleanInputContent,
        id: newId,
        created_by: authorId,
        created_by_name: authorName,
        created_by_phone: authorPhone,
        created_by_email: authorEmail,
        created_by_role: authorRole,
        manager: managerMeta,
        created_at: new Date().toISOString()
      };
      localData.push(newProp);
      writeLocalDb(localData);

      const pManagers = readPropertyManagers();
      pManagers[newId] = managerMeta;
      writePropertyManagers(pManagers);
      
      return res.status(201).json({ 
        success: true, 
        property: newProp, 
        isFallbackMode: true,
        isConfigError: isCheckConstraint,
        setupSQL: isCheckConstraint ? `
ALTER TABLE chu_nha_can_ban DROP CONSTRAINT IF EXISTS chu_nha_can_ban_status_check;
ALTER TABLE chu_nha_can_ban ADD CONSTRAINT chu_nha_can_ban_status_check CHECK (status IN ('moi', 'dang_lien_he', 'da_chot', 'da_ky', 'da_ban'));
        `.trim() : undefined
      });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Lỗi xử lý tạo mới chủ nhà." });
  }
});

// 8. Update Property Handler (Protected: Admin or Staff Owner) - Supports both PUT and PATCH
const handleUpdateProperty = async (req: any, res: any) => {
  try {
    if (req.admin?.role === "viewer") {
      return res.status(403).json({ error: "Tài khoản Người xem (Viewer) không có quyền chỉnh sửa tin." });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Mã bất động sản (id) là bắt buộc" });
    }

    const userRole = req.admin?.role;
    const userId = req.admin?.id;
    const userEmail = req.admin?.email;

    // Retrieve existing manager to preserve ownership
    const pManagers = readPropertyManagers();
    let currentManager = pManagers[id];

    // If not in local pManagers, check from Supabase content tag
    if (!currentManager && !id.startsWith("local-")) {
      try {
        const supabase = getSupabase();
        const { data: exData } = await supabase.from("chu_nha_can_ban").select("content").eq("id", id).maybeSingle();
        if (exData) {
          const { creator } = extractCreatorFromContent(exData.content);
          if (creator) {
            currentManager = {
              created_by: creator.id,
              created_by_name: creator.name || creator.full_name || "Quản trị viên",
              created_by_phone: creator.phone || "",
              created_by_email: creator.email || "",
              created_by_role: creator.role || "staff"
            };
            pManagers[id] = currentManager;
            writePropertyManagers(pManagers);
          }
        }
      } catch (e) {}
    }

    const {
      name,
      phone,
      district,
      facebook_link,
      website_link,
      content,
      image_urls,
      loai_giao_dich,
      status,
      created_by,
      created_by_name,
      created_by_phone,
      created_by_email,
      created_by_role,
      manager,
      ma_tk,
      so_nha,
      duong,
      phuong,
      dien_tich,
      dien_tich_so,
      dien_tich_thuc_te,
      so_tang,
      rong,
      dai,
      gia,
      loai_hinh,
      trang_thai_nguon,
      trang_thai_kinh_doanh,
      trang_thai_xu_ly,
      da_xuat_hometea,
      da_xuat_fb,
      mo_ta_tho,
      moi_gioi_nguon,
      sdt_nguon,
      hoa_hong,
      toa_do,
      anh,
    } = req.body;

    // Check ownership if user is staff
    if (userRole === "staff") {
      if (currentManager && currentManager.created_by) {
        const isOwner = currentManager.created_by === userId || currentManager.created_by === userEmail;
        if (!isOwner) {
          return res.status(403).json({
            error: "Bạn chỉ có quyền chỉnh sửa căn nhà do chính bạn đã tạo."
          });
        }
      }
    }

    // If manager or created_by is passed in request, update currentManager immediately BEFORE embedding
    if (created_by || created_by_name || created_by_phone || manager) {
      currentManager = {
        created_by: created_by || manager?.id || currentManager?.created_by || req.admin?.id,
        created_by_name: created_by_name || manager?.full_name || currentManager?.created_by_name || "Quản trị viên",
        created_by_phone: created_by_phone || manager?.phone || currentManager?.created_by_phone || "",
        created_by_email: created_by_email || manager?.email || currentManager?.created_by_email || "",
        created_by_role: created_by_role || manager?.role || currentManager?.created_by_role || "staff"
      };
      pManagers[id] = currentManager;
      writePropertyManagers(pManagers);
    }

    // Build base payload + extended warehouse columns
    const supabasePayload: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    if (name !== undefined) supabasePayload.name = typeof name === "string" ? name.trim() : name;
    if (phone !== undefined) supabasePayload.phone = phone || "";
    else if (sdt_nguon !== undefined) supabasePayload.phone = sdt_nguon || "";

    if (phuong !== undefined) supabasePayload.district = typeof phuong === "string" ? phuong.trim() : (phuong || "");
    else if (district !== undefined) supabasePayload.district = typeof district === "string" ? district.trim() : (district || "");

    if (facebook_link !== undefined) supabasePayload.facebook_link = facebook_link || "";
    if (website_link !== undefined) supabasePayload.website_link = website_link || "";

    if (image_urls !== undefined) supabasePayload.image_urls = Array.isArray(image_urls) ? image_urls : [];
    if (loai_giao_dich !== undefined) supabasePayload.loai_giao_dich = loai_giao_dich;

    // Sync status <-> trang_thai_kinh_doanh
    if (trang_thai_kinh_doanh !== undefined) {
      supabasePayload.trang_thai_kinh_doanh = trang_thai_kinh_doanh;
      if (trang_thai_kinh_doanh === "da_ban") supabasePayload.status = "da_ban";
      else if (trang_thai_kinh_doanh === "da_ky") supabasePayload.status = "da_ky";
      else supabasePayload.status = "moi";
    } else if (status !== undefined) {
      supabasePayload.status = status;
    }

    // Extended warehouse fields
    const extendedFields: Record<string, any> = {};
    if (ma_tk !== undefined) extendedFields.ma_tk = String(ma_tk || "").trim().toUpperCase();
    if (so_nha !== undefined) extendedFields.so_nha = String(so_nha || "").trim();
    if (duong !== undefined) extendedFields.duong = String(duong || "").trim();
    if (so_nha !== undefined || duong !== undefined) {
      extendedFields.dia_chi = [
        so_nha !== undefined ? String(so_nha || "").trim() : "",
        duong !== undefined ? String(duong || "").trim() : "",
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
    }
    if (phuong !== undefined) extendedFields.phuong = String(phuong || "").trim();
    if (dien_tich !== undefined) extendedFields.dien_tich = String(dien_tich || "").trim();
    if (dien_tich_so !== undefined) {
      extendedFields.dien_tich_so =
        dien_tich_so !== null && dien_tich_so !== "" && !isNaN(Number(dien_tich_so))
          ? Number(dien_tich_so)
          : null;
    }
    if (dien_tich_thuc_te !== undefined) {
      extendedFields.dien_tich_thuc_te =
        dien_tich_thuc_te !== null && dien_tich_thuc_te !== "" && !isNaN(Number(dien_tich_thuc_te))
          ? Number(dien_tich_thuc_te)
          : null;
    }
    if (so_tang !== undefined) extendedFields.so_tang = String(so_tang || "").trim();
    if (rong !== undefined) extendedFields.rong = String(rong || "").trim();
    if (dai !== undefined) extendedFields.dai = String(dai || "").trim();
    if (gia !== undefined) {
      extendedFields.gia =
        gia !== null && gia !== "" && !isNaN(Number(gia)) ? Math.round(Number(gia)) : null;
    }
    if (loai_hinh !== undefined) extendedFields.loai_hinh = String(loai_hinh || "").trim();
    if (trang_thai_nguon !== undefined) extendedFields.trang_thai_nguon = trang_thai_nguon;
    if (trang_thai_kinh_doanh !== undefined) extendedFields.trang_thai_kinh_doanh = trang_thai_kinh_doanh;
    if (trang_thai_xu_ly !== undefined) extendedFields.trang_thai_xu_ly = trang_thai_xu_ly;
    if (da_xuat_hometea !== undefined) extendedFields.da_xuat_hometea = !!da_xuat_hometea;
    if (da_xuat_fb !== undefined) extendedFields.da_xuat_fb = !!da_xuat_fb;
    if (mo_ta_tho !== undefined) extendedFields.mo_ta_tho = String(mo_ta_tho || "");
    if (moi_gioi_nguon !== undefined) extendedFields.moi_gioi_nguon = String(moi_gioi_nguon || "").trim();
    if (sdt_nguon !== undefined) extendedFields.sdt_nguon = String(sdt_nguon || "").trim();
    if (hoa_hong !== undefined) extendedFields.hoa_hong = String(hoa_hong || "").trim();
    if (toa_do !== undefined) extendedFields.toa_do = String(toa_do || "").trim();
    if (anh !== undefined) extendedFields.anh = Array.isArray(anh) ? anh : [];

    Object.assign(supabasePayload, extendedFields);

    // Preserve creator + warehouse metadata tags inside content
    if (content !== undefined || Object.keys(extendedFields).length > 0) {
      let rawBaseContent = typeof content === "string" ? content : "";
      let prevMeta: Record<string, any> = {};
      if (content === undefined && !id.startsWith("local-")) {
        try {
          const supabase = getSupabase();
          const { data: exRow } = await supabase.from("chu_nha_can_ban").select("content").eq("id", id).maybeSingle();
          if (exRow?.content) {
            const c1 = extractCreatorFromContent(exRow.content);
            const c2 = extractMetaFromContent(c1.cleanContent);
            rawBaseContent = c2.cleanContent;
            if (c2.meta) prevMeta = c2.meta;
          }
        } catch (_) {}
      } else if (typeof content === "string") {
        const c1 = extractCreatorFromContent(content);
        const c2 = extractMetaFromContent(c1.cleanContent);
        rawBaseContent = c2.cleanContent;
        if (c2.meta) prevMeta = c2.meta;
      }

      const prevEdited: string[] = Array.isArray(prevMeta.manually_edited_fields)
        ? prevMeta.manually_edited_fields
        : [];
      const newlyEdited = Object.keys(extendedFields).filter(
        (k) => !["mo_ta_tho", "anh", "updated_at"].includes(k)
      );
      const mergedMeta = {
        ...prevMeta,
        ...extendedFields,
        manually_edited_fields: Array.from(new Set([...prevEdited, ...newlyEdited])),
      };
      const withMeta = embedMetaInContent(rawBaseContent, mergedMeta);

      if (currentManager) {
        supabasePayload.content = embedCreatorInContent(withMeta, {
          id: currentManager.created_by,
          name: currentManager.created_by_name,
          phone: currentManager.created_by_phone,
          email: currentManager.created_by_email,
          role: currentManager.created_by_role
        });
      } else {
        supabasePayload.content = withMeta;
      }
    }

    console.log(`[UPDATE /api/properties/${id}] Updating chu_nha_can_ban`);

    if (id.startsWith("local-")) {
      const localData = readLocalDb();
      let updatedProperty = null;
      const updatedData = localData.map((p) => {
        if (p.id === id) {
          updatedProperty = { ...p, ...supabasePayload, id };
          return updatedProperty;
        }
        return p;
      });

      if (!updatedProperty) {
        updatedProperty = { ...supabasePayload, id, created_at: new Date().toISOString() };
        updatedData.push(updatedProperty);
      }

      writeLocalDb(updatedData);
      return res.json({ success: true, property: updatedProperty, isFallbackMode: true });
    }

    try {
      const supabase = getSupabase();
      let updateResult = await supabase
        .from("chu_nha_can_ban")
        .update(supabasePayload)
        .eq("id", id)
        .select();

      // If extended columns haven't been created in Supabase yet, fallback to base columns (meta tag in content preserves all fields)
      if (
        updateResult.error &&
        (updateResult.error.code === "42703" ||
          String(updateResult.error.message || "").includes("column"))
      ) {
        const basePayload: Record<string, any> = {
          updated_at: supabasePayload.updated_at,
        };
        if (supabasePayload.name !== undefined) basePayload.name = supabasePayload.name;
        if (supabasePayload.phone !== undefined) basePayload.phone = supabasePayload.phone;
        if (supabasePayload.district !== undefined) basePayload.district = supabasePayload.district;
        if (supabasePayload.facebook_link !== undefined) basePayload.facebook_link = supabasePayload.facebook_link;
        if (supabasePayload.website_link !== undefined) basePayload.website_link = supabasePayload.website_link;
        if (supabasePayload.content !== undefined) basePayload.content = supabasePayload.content;
        if (supabasePayload.image_urls !== undefined) basePayload.image_urls = supabasePayload.image_urls;
        if (supabasePayload.loai_giao_dich !== undefined) basePayload.loai_giao_dich = supabasePayload.loai_giao_dich;
        if (supabasePayload.status !== undefined) basePayload.status = supabasePayload.status;

        updateResult = await supabase
          .from("chu_nha_can_ban")
          .update(basePayload)
          .eq("id", id)
          .select();
      }

      if (updateResult.error) {
        console.error(`[UPDATE /api/properties/${id}] Supabase update error:`, updateResult.error);
        throw updateResult.error;
      }

      const { data } = updateResult;

      if (!data || data.length === 0) {
        throw new Error(`Không tìm thấy tin với ID ${id} trong bảng chu_nha_can_ban trên Supabase.`);
      }

      const { cleanContent: c1 } = extractCreatorFromContent(data[0]?.content);
      const { cleanContent, meta: extractedMeta } = extractMetaFromContent(c1);

      const returnedProp = {
        ...(extractedMeta || {}),
        ...data[0],
        ...extendedFields,
        content: cleanContent,
        created_by: pManagers[id]?.created_by || data[0]?.created_by,
        created_by_name: pManagers[id]?.created_by_name || data[0]?.created_by_name,
        created_by_phone: pManagers[id]?.created_by_phone,
        created_by_email: pManagers[id]?.created_by_email,
        created_by_role: pManagers[id]?.created_by_role,
        manager: pManagers[id]
      };

      return res.json({ success: true, property: returnedProp, isFallbackMode: false });
    } catch (dbErr: any) {
      const isCheckConstraint = dbErr?.code === '23514' ||
                                (dbErr?.message && dbErr.message.toLowerCase().includes("check constraint")) ||
                                (dbErr?.details && dbErr.details.toLowerCase().includes("check constraint"));
      
      console.warn("Supabase update did not complete, using local data storage fallback:", dbErr?.message);
      
      const localData = readLocalDb();
      let updatedProperty = null;
      const updatedData = localData.map((p) => {
        if (p.id === id) {
          updatedProperty = { ...p, ...supabasePayload, id };
          return updatedProperty;
        }
        return p;
      });

      if (!updatedProperty) {
        updatedProperty = { ...supabasePayload, id, created_at: new Date().toISOString() };
        updatedData.push(updatedProperty);
      }

      writeLocalDb(updatedData);
      return res.json({ 
        success: true, 
        property: updatedProperty, 
        isFallbackMode: true,
        isConfigError: isCheckConstraint,
        setupSQL: isCheckConstraint ? `
ALTER TABLE chu_nha_can_ban DROP CONSTRAINT IF EXISTS chu_nha_can_ban_status_check;
ALTER TABLE chu_nha_can_ban ADD CONSTRAINT chu_nha_can_ban_status_check CHECK (status IN ('moi', 'dang_lien_he', 'da_chot', 'da_ky', 'da_ban'));
        `.trim() : undefined
      });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Lỗi xử lý cập nhật chủ nhà." });
  }
};

app.put("/api/properties/:id", authenticateAdmin, handleUpdateProperty);
app.patch("/api/properties/:id", authenticateAdmin, handleUpdateProperty);

// 8c. Bulk Warehouse Actions (Mark Ready, Assign Ward, Delete Duplicates, Assign Legacy ma_tk, Export)
app.post("/api/properties/bulk-action", authenticateAdmin, async (req: any, res) => {
  try {
    if (req.admin?.role === "viewer") {
      return res.status(403).json({ error: "Tài khoản Người xem không có quyền thực hiện thao tác hàng loạt." });
    }

    const { action, items, ids, payload } = req.body || {};

    // Action 1: Delete multiple records (e.g. duplicate cleanup)
    if (action === "delete_many" && Array.isArray(ids) && ids.length > 0) {
      let deletedCount = 0;
      try {
        const supabase = getSupabase();
        const remoteIds = ids.filter((id: string) => !String(id).startsWith("local-"));
        if (remoteIds.length > 0) {
          const { error } = await supabase.from("chu_nha_can_ban").delete().in("id", remoteIds);
          if (!error) deletedCount += remoteIds.length;
        }
      } catch (_) {}

      const localData = readLocalDb();
      const filtered = localData.filter((p) => !ids.includes(p.id));
      if (filtered.length !== localData.length) {
        deletedCount += localData.length - filtered.length;
        writeLocalDb(filtered);
      }

      return res.json({ success: true, deletedCount });
    }

    // Action 2: Batch update multiple items (each item in `items` has `{ id, changes }`)
    if (Array.isArray(items) && items.length > 0) {
      let updatedCount = 0;
      let supabase: any = null;
      try {
        supabase = getSupabase();
      } catch (_) {}

      const localData = readLocalDb();
      let localChanged = false;

      for (const entry of items) {
        const itemId = entry?.id;
        const changes = entry?.changes || {};
        if (!itemId) continue;

        if (String(itemId).startsWith("local-") || !supabase) {
          const idx = localData.findIndex((p) => p.id === itemId);
          if (idx !== -1) {
            localData[idx] = {
              ...localData[idx],
              ...changes,
              updated_at: new Date().toISOString(),
            };
            localChanged = true;
            updatedCount++;
          }
          continue;
        }

        try {
          // Fetch existing content to preserve creator & merge warehouse meta
          const { data: exRow } = await supabase
            .from("chu_nha_can_ban")
            .select("content, status")
            .eq("id", itemId)
            .maybeSingle();

          const c1 = extractCreatorFromContent(exRow?.content || "");
          const c2 = extractMetaFromContent(c1.cleanContent);
          const mergedMeta = { ...(c2.meta || {}), ...changes };
          const withMeta = embedMetaInContent(c2.cleanContent, mergedMeta);
          const finalContent = embedCreatorInContent(withMeta, c1.creator);

          const dbUpdate: Record<string, any> = {
            ...changes,
            content: finalContent,
            updated_at: new Date().toISOString(),
          };
          if (changes.phuong !== undefined) {
            dbUpdate.district = changes.phuong;
          }
          if (changes.trang_thai_kinh_doanh !== undefined) {
            if (changes.trang_thai_kinh_doanh === "da_ban") dbUpdate.status = "da_ban";
            else if (changes.trang_thai_kinh_doanh === "da_ky") dbUpdate.status = "da_ky";
            else dbUpdate.status = "moi";
          }

          let { error: upErr } = await supabase
            .from("chu_nha_can_ban")
            .update(dbUpdate)
            .eq("id", itemId);

          if (upErr && (upErr.code === "42703" || String(upErr.message || "").includes("column"))) {
            const fallbackUpdate: Record<string, any> = {
              content: finalContent,
              updated_at: dbUpdate.updated_at,
            };
            if (dbUpdate.district !== undefined) fallbackUpdate.district = dbUpdate.district;
            if (dbUpdate.status !== undefined) fallbackUpdate.status = dbUpdate.status;
            if (dbUpdate.name !== undefined) fallbackUpdate.name = dbUpdate.name;
            const fbRes = await supabase
              .from("chu_nha_can_ban")
              .update(fallbackUpdate)
              .eq("id", itemId);
            upErr = fbRes.error;
          }

          if (!upErr) updatedCount++;
        } catch (_) {}
      }

      if (localChanged) {
        writeLocalDb(localData);
      }

      // If this bulk action also logs an export event
      if (payload?.exportLog) {
        const logs = readExportLogs();
        const newLog = {
          id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ...payload.exportLog,
          exported_by: req.admin?.full_name || req.admin?.email || "Admin",
          created_at: new Date().toISOString(),
        };
        logs.unshift(newLog);
        writeExportLogs(logs);
      }

      return res.json({ success: true, updatedCount });
    }

    return res.status(400).json({ error: "Yêu cầu thao tác hàng loạt không hợp lệ." });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Lỗi thực thi thao tác hàng loạt." });
  }
});

// 8d. Export Logs API (Tab "Nhật ký xuất")
app.get("/api/export-logs", authenticateAdmin, (req, res) => {
  const logs = readExportLogs();
  return res.json({ logs });
});

app.post("/api/export-logs", authenticateAdmin, (req: any, res) => {
  const logs = readExportLogs();
  const { target, target_label, record_count, ma_tk_list, note } = req.body || {};
  const newEntry = {
    id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    target: target || "v_nguon_xuat_json",
    target_label: target_label || "Xuất dữ liệu chuẩn",
    record_count: Number(record_count) || 0,
    ma_tk_list: Array.isArray(ma_tk_list) ? ma_tk_list : [],
    exported_by: req.admin?.full_name || req.admin?.email || "Quản trị viên",
    created_at: new Date().toISOString(),
    note: note || "",
  };
  logs.unshift(newEntry);
  writeExportLogs(logs);
  return res.status(201).json({ success: true, log: newEntry, logs });
});

// 8e. Direct v_nguon_xuat View Endpoint (All rows, NO implicit filtering, 13 standard columns, NO internal fields)
app.get("/api/v-nguon-xuat", authenticateAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    // Try querying the SQL VIEW `v_nguon_xuat` directly first
    const { data: viewData, error: viewErr } = await supabase.from("v_nguon_xuat").select("*");
    if (!viewErr && Array.isArray(viewData)) {
      return res.json({
        source: "supabase_view",
        rows: viewData,
        setupSQL: COMPLETE_SETUP_SQL,
      });
    }
    return res.json({
      source: "computed_fallback",
      rows: [],
      viewError: viewErr?.message || null,
      setupSQL: COMPLETE_SETUP_SQL,
    });
  } catch (err: any) {
    return res.json({
      source: "computed_fallback",
      rows: [],
      viewError: err?.message || null,
      setupSQL: COMPLETE_SETUP_SQL,
    });
  }
});

// 8b. Assign / Change Managing User for a Property (Protected: Admin or Staff)
app.put("/api/properties/:id/assign-manager", authenticateAdmin, async (req: any, res) => {
  try {
    if (req.admin?.role === "viewer") {
      return res.status(403).json({ error: "Tài khoản Người xem không có quyền phân công người quản lý." });
    }

    const { id } = req.params;
    const { manager_id, manager_name, manager_phone, manager_email, manager_role } = req.body;

    if (!manager_id && !manager_name) {
      return res.status(400).json({ error: "Thiếu thông tin người quản lý nguồn nhà." });
    }

    const pManagers = readPropertyManagers();
    pManagers[id] = {
      created_by: manager_id,
      created_by_name: manager_name,
      created_by_phone: manager_phone || "",
      created_by_email: manager_email || "",
      created_by_role: manager_role || "staff"
    };
    writePropertyManagers(pManagers);

    // Update local database if local record
    if (id.startsWith("local-")) {
      const localData = readLocalDb();
      const updated = localData.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            created_by: manager_id,
            created_by_name: manager_name,
            created_by_phone: manager_phone || "",
            created_by_email: manager_email || "",
            created_by_role: manager_role || "staff",
            manager: pManagers[id],
            updated_at: new Date().toISOString()
          };
        }
        return p;
      });
      writeLocalDb(updated);
    } else {
      // Update Supabase chu_nha_can_ban content with embedded creator tag!
      try {
        const supabase = getSupabase();
        const { data: propRow, error: fetchErr } = await supabase
          .from("chu_nha_can_ban")
          .select("content")
          .eq("id", id)
          .maybeSingle();

        if (fetchErr) {
          console.error("[assign-manager] Supabase fetch error:", fetchErr);
        }

        const cleanContent = propRow?.content ? extractCreatorFromContent(propRow.content).cleanContent : "";
        const updatedContent = embedCreatorInContent(cleanContent, {
          id: manager_id,
          name: manager_name,
          phone: manager_phone || "",
          email: manager_email || "",
          role: manager_role || "staff"
        });

        // 1. MUST update content and updated_at (which guaranteed exist in chu_nha_can_ban)
        const updateResult = await supabase
          .from("chu_nha_can_ban")
          .update({
            content: updatedContent,
            updated_at: new Date().toISOString()
          })
          .eq("id", id);

        if (updateResult.error) {
          console.error("[assign-manager] Supabase update content error:", updateResult.error);
          return res.status(500).json({ error: updateResult.error.message || "Lỗi lưu thông tin người quản lý vào Supabase" });
        }

        console.log(`[assign-manager] Successfully saved manager "${manager_name}" to Supabase content for ID: ${id}`);

        // 2. Also try updating dedicated columns if they exist in Supabase
        try {
          await supabase
            .from("chu_nha_can_ban")
            .update({
              created_by: manager_id,
              created_by_name: manager_name
            })
            .eq("id", id);
        } catch (_) {}
      } catch (e: any) {
        console.error("[assign-manager] Unexpected error:", e);
        return res.status(500).json({ error: e.message || "Lỗi cập nhật người phụ trách" });
      }
    }

    return res.json({
      success: true,
      manager: pManagers[id]
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Lỗi xử lý phân công quản lý nguồn." });
  }
});

// 9. Delete Property (Protected: Admin or Staff Owner)
app.delete("/api/properties/:id", authenticateAdmin, async (req: any, res) => {
  if (req.admin?.role === "viewer") {
    return res.status(403).json({ error: "Tài khoản Người xem (Viewer) không có quyền xóa tin khỏi hệ thống." });
  }
  try {
    const { id } = req.params;
    const userRole = req.admin?.role;
    const userId = req.admin?.id;
    const userEmail = req.admin?.email;

    // Check ownership if user is staff
    if (userRole === "staff") {
      let existingProp: any = null;
      if (id.startsWith("local-")) {
        const localData = readLocalDb();
        existingProp = localData.find((p) => p.id === id);
      } else {
        const supabase = getSupabase();
        const { data } = await supabase
          .from("chu_nha_can_ban")
          .select("id, content")
          .eq("id", id)
          .maybeSingle();
        if (data) {
          const { creator } = extractCreatorFromContent(data.content);
          existingProp = {
            id: data.id,
            created_by: creator?.id || creator?.email
          };
        }
      }

      if (existingProp && existingProp.created_by) {
        const isOwner = existingProp.created_by === userId || existingProp.created_by === userEmail;
        if (!isOwner) {
          return res.status(403).json({
            error: "Bạn chỉ có quyền xóa căn nhà do chính bạn đã thêm vào hệ thống."
          });
        }
      }
    }

    if (id.startsWith("local-")) {
      console.log("Deleting local property in local file:", id);
      const localData = readLocalDb();
      const filtered = localData.filter((p) => p.id !== id);
      writeLocalDb(filtered);
      return res.json({ success: true, message: "Đã xóa mục thành công", isFallbackMode: true });
    }

    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from("chu_nha_can_ban")
        .delete()
        .eq("id", id);

      if (error) {
        throw error;
      }

      return res.json({ success: true, message: "Đã xóa mục thành công", isFallbackMode: false });
    } catch (dbErr: any) {
      console.warn("Supabase delete failed, falling back to local file:", dbErr.message || dbErr);
      const localData = readLocalDb();
      const filtered = localData.filter((p) => p.id !== id);
      writeLocalDb(filtered);
      return res.json({ success: true, message: "Đã xóa mục thành công", isFallbackMode: true });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Lỗi xử lý xóa chủ nhà." });
  }
});

// --- API 404 JSON GUARD (MUST BE BEFORE VITE / SPA CATCH-ALL) ---
app.use("/api", (req, res) => {
  const fullPath = req.originalUrl || req.url;
  return res.status(404).json({
    error: `Không tìm thấy đường dẫn API: ${req.method} ${fullPath} (HTTP 404)`,
    status: 404,
    method: req.method,
    url: fullPath,
  });
});

// --- GLOBAL ERROR HANDLER ---
app.use((err: any, req: any, res: any, next: any) => {
  console.error("Express Custom Global Error Handler:", err);
  res.status(err.status || 500).json({
    error: err.message || "Đã xảy ra lỗi hệ thống phía máy chủ."
  });
});

// --- VITE MIDDLEWARE SETUP ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
