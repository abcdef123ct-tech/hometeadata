// server.ts
import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import multer from "multer";
dotenv.config();
var cleanEnvVar = (val) => {
  if (!val) return "";
  const cleaned = val.trim().replace(/^["']|["']$/g, "").trim();
  if (cleaned === "undefined" || cleaned === "null" || cleaned === "") {
    return "";
  }
  return cleaned;
};
var parseCloudinaryUri = (val) => {
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
    apiSecret: creds.substring(colonIndex + 1).trim()
  };
};
var extractCloudName = (val) => {
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
function getCloudinaryConfig() {
  const rawCloudName = cleanEnvVar(process.env.VITE_CLOUDINARY_CLOUD_NAME) || cleanEnvVar(process.env.CLOUDINARY_CLOUD_NAME);
  const rawPreset = cleanEnvVar(process.env.VITE_CLOUDINARY_UPLOAD_PRESET) || cleanEnvVar(process.env.CLOUDINARY_UPLOAD_PRESET);
  const rawCloudinaryUrl = cleanEnvVar(process.env.CLOUDINARY_URL);
  const uriFromUrl = parseCloudinaryUri(rawCloudinaryUrl);
  const uriFromName = parseCloudinaryUri(rawCloudName);
  const uriFromPreset = parseCloudinaryUri(rawPreset);
  let name = extractCloudName(rawCloudName) || uriFromUrl?.cloudName || uriFromName?.cloudName || uriFromPreset?.cloudName || "";
  let apiKey = cleanEnvVar(process.env.CLOUDINARY_API_KEY) || cleanEnvVar(process.env.VITE_CLOUDINARY_API_KEY) || uriFromUrl?.apiKey || uriFromName?.apiKey || uriFromPreset?.apiKey || "";
  let apiSecret = cleanEnvVar(process.env.CLOUDINARY_API_SECRET) || cleanEnvVar(process.env.VITE_CLOUDINARY_API_SECRET) || uriFromUrl?.apiSecret || uriFromName?.apiSecret || uriFromPreset?.apiSecret || "";
  let preset = uriFromPreset ? "" : rawPreset;
  if (preset.startsWith("CLOUDINARY_UPLOAD_PRESET=")) {
    preset = preset.substring("CLOUDINARY_UPLOAD_PRESET=".length).trim().replace(/^["']|["']$/g, "");
  } else if (preset.startsWith("VITE_CLOUDINARY_UPLOAD_PRESET=")) {
    preset = preset.substring("VITE_CLOUDINARY_UPLOAD_PRESET=".length).trim().replace(/^["']|["']$/g, "");
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
    apiSecret
  };
}
var app = express();
var PORT = Number(process.env.PORT) || 3e3;
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  console.log(`[GLOBAL REQUEST] ${req.method} ${req.originalUrl || req.url} - Content-Type: ${req.headers["content-type"] || "none"}`);
  next();
});
var SESSION_SECRET = cleanEnvVar(process.env.SESSION_SECRET) || "fallback_secret_for_development_purposes_only_123456";
var ADMIN_PASSWORD = cleanEnvVar(process.env.ADMIN_PASSWORD) || "admin";
var LOCAL_DB_PATH = path.join(process.cwd(), "local_properties.json");
var MANAGERS_DB_PATH = path.join(process.cwd(), "property_managers.json");
function readPropertyManagers() {
  try {
    if (!fs.existsSync(MANAGERS_DB_PATH)) {
      const initial = {};
      fs.writeFileSync(MANAGERS_DB_PATH, JSON.stringify(initial, null, 2), "utf8");
      return initial;
    }
    const data = fs.readFileSync(MANAGERS_DB_PATH, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("L\u1ED7i \u0111\u1ECDc file property_managers.json:", err);
    return {};
  }
}
function writePropertyManagers(data) {
  try {
    fs.writeFileSync(MANAGERS_DB_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("L\u1ED7i ghi file property_managers.json:", err);
  }
}
function readLocalDb() {
  try {
    if (!fs.existsSync(LOCAL_DB_PATH)) {
      const defaultData = [];
      fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(defaultData, null, 2), "utf8");
      return defaultData;
    }
    const data = fs.readFileSync(LOCAL_DB_PATH, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("L\u1ED7i \u0111\u1ECDc file local_properties.json, chuy\u1EC3n sang m\u1EA3ng r\u1ED7ng:", err);
    return [];
  }
}
function writeLocalDb(data) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("L\u1ED7i ghi file local_properties.json:", err);
  }
}
function getSupabaseConfig() {
  let url = cleanEnvVar(process.env.SUPABASE_URL) || cleanEnvVar(process.env.VITE_SUPABASE_URL) || cleanEnvVar(process.env.NEXT_PUBLIC_SUPABASE_URL);
  let key = cleanEnvVar(process.env.SUPABASE_ANON_KEY) || cleanEnvVar(process.env.VITE_SUPABASE_ANON_KEY) || cleanEnvVar(process.env.SUPABASE_KEY) || cleanEnvVar(process.env.SUPABASE_SERVICE_ROLE_KEY) || cleanEnvVar(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (url && !url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  if (url && url.endsWith("/")) {
    url = url.slice(0, -1);
  }
  return { url, key };
}
function getSupabaseServiceRoleKey() {
  return cleanEnvVar(process.env.SUPABASE_SERVICE_ROLE_KEY) || cleanEnvVar(process.env.SUPABASE_SERVICE_KEY) || cleanEnvVar(process.env.SUPABASE_SERVICE_ROLE) || cleanEnvVar(process.env.SERVICE_ROLE_KEY);
}
function maskSecret(val) {
  if (!val) return "(tr\u1ED1ng / ch\u01B0a thi\u1EBFt l\u1EADp)";
  const trimmed = val.trim();
  if (trimmed.length <= 8) return `*** (\u0111\u1ED9 d\xE0i: ${trimmed.length} k\xFD t\u1EF1)`;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-6)} (\u0111\u1ED9 d\xE0i: ${trimmed.length} k\xFD t\u1EF1)`;
}
var supabaseClient = null;
var lastSupabaseUrl = "";
var lastSupabaseKey = "";
function getSupabase() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    throw new Error("SUPABASE_URL ho\u1EB7c SUPABASE_ANON_KEY ch\u01B0a \u0111\u01B0\u1EE3c thi\u1EBFt l\u1EADp trong bi\u1EBFn m\xF4i tr\u01B0\u1EDDng / Secrets.");
  }
  if (!supabaseClient || lastSupabaseUrl !== url || lastSupabaseKey !== key) {
    supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    lastSupabaseUrl = url;
    lastSupabaseKey = key;
  }
  return supabaseClient;
}
var supabaseAdminClient = null;
var lastAdminUrl = "";
var lastAdminKey = "";
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
        autoRefreshToken: false
      }
    });
    lastAdminUrl = url;
    lastAdminKey = serviceKey;
  }
  return supabaseAdminClient;
}
var COMPLETE_SETUP_SQL = `
-- 1. T\u1EA1o b\u1EA3ng chu_nha_can_ban v\u1EDBi \u0111\u1EA7y \u0111\u1EE7 c\xE1c c\u1ED9t v\xE0 c\xE1c gi\xE1 tr\u1ECB tr\u1EA1ng th\xE1i
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

-- R\xE0ng bu\u1ED9c ki\u1EC3m tra tr\u1EA1ng th\xE1i
ALTER TABLE chu_nha_can_ban DROP CONSTRAINT IF EXISTS chu_nha_can_ban_status_check;
ALTER TABLE chu_nha_can_ban ADD CONSTRAINT chu_nha_can_ban_status_check CHECK (status IN ('moi', 'dang_lien_he', 'da_chot', 'da_ky', 'da_ban'));
ALTER TABLE chu_nha_can_ban DISABLE ROW LEVEL SECURITY;

-- 2. T\u1EA1o b\u1EA3ng profiles li\xEAn k\u1EBFt v\u1EDBi auth.users \u0111\u1EC3 qu\u1EA3n l\xFD t\xE0i kho\u1EA3n
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

-- Th\xEAm c\u1ED9t district (Khu v\u1EF1c / Qu\u1EADn Huy\u1EC7n) v\xE0o chu_nha_can_ban n\u1EBFu ch\u01B0a c\xF3
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS district text;

-- X\xF3a c\u1ED9t th\u1EEBa khu_vuc n\u1EBFu c\xF3 trong b\u1EA3ng chu_nha_can_ban
ALTER TABLE chu_nha_can_ban DROP COLUMN IF EXISTS khu_vuc;

-- Th\xEAm c\xE1c c\u1ED9t created_by v\xE0 created_by_name v\xE0o chu_nha_can_ban n\u1EBFu ch\u01B0a c\xF3
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS created_by_name text;

-- Th\xEAm c\xE1c c\u1ED9t m\u1EDF r\u1ED9ng ph\u1EE5c v\u1EE5 t\xEDnh n\u0103ng Nh\u1EADp h\xE0ng lo\u1EA1t th\u01B0 m\u1EE5c (ch\u1EC9 th\xEAm c\u1ED9t c\xF2n thi\u1EBFu)
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
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS trang_thai_nguon text DEFAULT 'th\xF4';
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS mo_ta_tho text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS moi_gioi_nguon text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS sdt_nguon text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS hoa_hong text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS toa_do text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS anh jsonb DEFAULT '[]'::jsonb;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS ten_thu_muc_goc text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS ngay_lay timestamp with time zone;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS ngay_nhap timestamp with time zone DEFAULT timezone('utc'::text, now());

-- Hai c\u1ED9t tr\u1EA1ng th\xE1i chu\u1EA9n Kho D\u1EEF Li\u1EC7u Chu\u1EA9n (Hometea & Post Writer)
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS trang_thai_kinh_doanh text DEFAULT 'nguon_tho';
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS trang_thai_xu_ly text DEFAULT 'tho';
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS da_xuat_hometea boolean DEFAULT false;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS da_xuat_fb boolean DEFAULT false;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS da_len_hometea boolean DEFAULT false;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS hometea_id text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS da_xep_lich_fb boolean DEFAULT false;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS da_dang_fb boolean DEFAULT false;

-- C\xE1c c\u1ED9t B\xF3c t\xE1ch b\u1EB1ng AI (Ch\u1EC9 l\u1EA5y t\u1EEB v\u0103n b\u1EA3n, kh\xF4ng c\xF3 th\xEC NULL)
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS loai_vi_tri text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS huong text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS phap_ly text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS so_phong_ngu integer;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS so_wc integer;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS ten_duong text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS duong_vao_m numeric;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS dac_diem jsonb;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS hien_trang text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS nguon_trich_xuat jsonb;

-- G\xE1n ma_tk chu\u1EA9n cho c\xE1c b\u1EA3n ghi c\u0169 ch\u01B0a c\xF3 ma_tk ho\u1EB7c c\xF3 m\xE3 ki\u1EC3u #10, #11
UPDATE chu_nha_can_ban
SET ma_tk = CASE
  WHEN ma_tk IS NOT NULL AND btrim(ma_tk) <> '' AND ma_tk !~ '^#?[0-9]+$' THEN upper(btrim(ma_tk))
  WHEN name ~* 'm(TK[A-Z0-9]{4,12})M' THEN upper(substring(name from 'm(TK[A-Z0-9]{4,12})M'))
  WHEN content ~* 'M\xE3 ngu\u1ED3n h\xE0ng:s*(TK[A-Z0-9_-]+)' THEN upper(substring(content from 'M\xE3 ngu\u1ED3n h\xE0ng:s*(TK[A-Z0-9_-]+)'))
  WHEN ma_tk ~ '^#?[0-9]+$' THEN 'TK' || lpad(regexp_replace(ma_tk, '[^0-9]', '', 'g'), 3, '0') || upper(substr(replace(id::text, '-', ''), 1, 2))
  WHEN name ~ '^#[0-9]+' THEN 'TK' || lpad(substring(name from '^#([0-9]+)'), 3, '0') || upper(substr(replace(id::text, '-', ''), 1, 2))
  ELSE 'TK' || upper(substr(replace(id::text, '-', ''), 1, 6))
END
WHERE ma_tk IS NULL OR btrim(ma_tk) = '' OR ma_tk ~ '^#?[0-9]+$';

-- R\xE0ng bu\u1ED9c duy nh\u1EA5t ma_tk \u0111\u1EC3 h\u1ED7 tr\u1EE3 upsert onConflict: 'ma_tk'
DROP INDEX IF EXISTS idx_chu_nha_can_ban_ma_tk_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_chu_nha_can_ban_ma_tk_unique ON chu_nha_can_ban (ma_tk);

-- T\u1EA1o VIEW v_nguon_xuat: \u0111\u1EE7 m\u1ECDi d\xF2ng, KH\xD4NG l\u1ECDc ng\u1EA7m, \u0111\xFAng 13 c\u1ED9t chu\u1EA9n, KH\xD4NG ch\u1EE9a sdt_nguon, moi_gioi_nguon, mo_ta_tho
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
      WHEN trang_thai_nguon = 's\u1EB5n s\xE0ng \u0111\u0103ng' THEN 'san_sang'
      WHEN trang_thai_nguon = '\u0111\xE3 b\u1ED5 sung' THEN 'can_bo_sung'
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

-- 3. Trigger t\u1EF1 \u0111\u1ED9ng th\xEAm d\xF2ng v\xE0o b\u1EA3ng profiles khi t\u1EA1o User trong auth.users
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

-- 4. \u0110\u1ED3ng b\u1ED9 ngay l\u1EADp t\u1EE9c c\xE1c t\xE0i kho\u1EA3n hi\u1EC7n c\xF3 trong auth.users v\xE0o b\u1EA3ng profiles
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
function authenticateAdmin(req, res, next) {
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
    return res.status(401).json({ error: "Ch\u01B0a \u0111\u0103ng nh\u1EADp. Vui l\xF2ng \u0111\u0103ng nh\u1EADp h\u1EC7 th\u1ED1ng." });
  }
  try {
    const decoded = jwt.verify(token, SESSION_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Phi\xEAn \u0111\u0103ng nh\u1EADp \u0111\xE3 h\u1EBFt h\u1EA1n ho\u1EB7c kh\xF4ng h\u1EE3p l\u1EC7. Vui l\xF2ng \u0111\u0103ng nh\u1EADp l\u1EA1i." });
  }
}
async function callManageUsersEdgeFunctionOrFallback(action, payload = {}, method = "POST") {
  const { url, key } = getSupabaseConfig();
  const serviceKey = getSupabaseServiceRoleKey();
  const supabase = getSupabase();
  const supabaseAdmin = getSupabaseAdmin();
  console.log(`[USER-MGT-DIAGNOSTIC] Action: "${action}" | Method: "${method}"`);
  console.log(`[USER-MGT-DIAGNOSTIC] Environment check:`, {
    SUPABASE_URL: maskSecret(url),
    SUPABASE_SERVICE_ROLE_KEY: maskSecret(serviceKey),
    SUPABASE_ANON_KEY: maskSecret(key),
    isSupabaseAdminClientReady: !!supabaseAdmin
  });
  let edgeFunctionWorked = false;
  let edgeResult = null;
  if (url && key) {
    try {
      const edgeUrl = `${url}/functions/v1/manage-users`;
      console.log(`[USER-MGT] \u0110ang ki\u1EC3m tra Supabase Edge Function: ${edgeUrl}`);
      const options = {
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
          console.error(`[USER-MGT] Edge Function tr\u1EA3 v\u1EC1 l\u1ED7i HTTP ${resp.status}:`, json);
          throw new Error(json.error || `Edge Function tr\u1EA3 v\u1EC1 m\xE3 l\u1ED7i ${resp.status}`);
        }
        console.log(`[USER-MGT] Edge Function th\u1EF1c thi th\xE0nh c\xF4ng.`);
        edgeFunctionWorked = true;
        edgeResult = json;
      } else {
        console.log(`[USER-MGT] Edge Function tr\u1EA3 v\u1EC1 404 (ch\u01B0a tri\u1EC3n khai). Chuy\u1EC3n sang fallback Supabase Admin SDK tr\u1EF1c ti\u1EBFp.`);
      }
    } catch (edgeErr) {
      if (!edgeErr.message?.includes("404")) {
        console.error("[USER-MGT] L\u1ED7i khi g\u1ECDi Supabase Edge Function:", {
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
  const dbClient = supabaseAdmin || supabase;
  if (!supabaseAdmin) {
    console.error(
      `[USER-MGT C\u1EA2NH B\xC1O L\u1EDAN] supabaseAdmin l\xE0 NULL! Bi\u1EBFn m\xF4i tr\u01B0\u1EDDng SUPABASE_SERVICE_ROLE_KEY ch\u01B0a \u0111\u01B0\u1EE3c thi\u1EBFt l\u1EADp tr\xEAn Vercel ho\u1EB7c b\u1ECB r\u1ED7ng.
-> H\u1EC7 th\u1ED1ng s\u1EBD ch\u1EC9 c\xF3 th\u1EC3 d\xF9ng Anon Key. Anon Key KH\xD4NG TH\u1EC2 g\u1ECDi Supabase Auth Admin API (listUsers, createUser, deleteUser) v\xE0 s\u1EBD b\u1ECB RLS ch\u1EB7n n\u1EBFu ch\u01B0a c\xF3 quy\u1EC1n!`
    );
  } else {
    console.log(`[USER-MGT] supabaseAdmin \u0111\xE3 \u0111\u01B0\u1EE3c kh\u1EDFi t\u1EA1o th\xE0nh c\xF4ng v\u1EDBi Service Role Key.`);
  }
  if (action === "list" || method === "GET") {
    let profilesList = [];
    let profilesError = null;
    let authError = null;
    try {
      console.log(`[USER-MGT] B\u01B0\u1EDBc 1: \u0110ang truy v\u1EA5n b\u1EA3ng 'profiles' b\u1EB1ng ${supabaseAdmin ? "Service Role (v\u01B0\u1EE3t RLS)" : "Anon Client"}...`);
      const { data, error } = await dbClient.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) {
        profilesError = error;
        console.error("[USER-MGT] L\u1ED6I TH\u1EACT khi \u0111\u1ECDc b\u1EA3ng 'profiles':", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          fullObject: JSON.stringify(error, Object.getOwnPropertyNames(error))
        });
      } else if (Array.isArray(data)) {
        profilesList = data;
        console.log(`[USER-MGT] \u0110\xE3 \u0111\u1ECDc \u0111\u01B0\u1EE3c ${data.length} b\u1EA3n ghi t\u1EEB b\u1EA3ng 'profiles'.`);
      }
    } catch (e) {
      profilesError = e;
      console.error("[USER-MGT] NGO\u1EA0I L\u1EC6 TH\u1EACT (catch) khi \u0111\u1ECDc b\u1EA3ng 'profiles':", {
        message: e?.message,
        stack: e?.stack,
        fullObject: e
      });
    }
    if (supabaseAdmin) {
      try {
        console.log(`[USER-MGT] B\u01B0\u1EDBc 2: \u0110ang g\u1ECDi supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })...`);
        const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 1e3
        });
        if (authErr) {
          authError = authErr;
          console.error("[USER-MGT] L\u1ED6I TH\u1EACT T\u1EEA SUPABASE AUTH ADMIN (auth.admin.listUsers):", {
            message: authErr.message,
            status: authErr.status,
            name: authErr.name,
            code: authErr.code,
            fullObject: JSON.stringify(authErr, Object.getOwnPropertyNames(authErr))
          });
        } else if (authData?.users) {
          console.log(`[USER-MGT] Supabase Auth Admin tr\u1EA3 v\u1EC1 ${authData.users.length} t\xE0i kho\u1EA3n ng\u01B0\u1EDDi d\xF9ng t\u1EEB auth.users.`);
          const profileMap = new Map(profilesList.map((p) => [p.id, p]));
          const missingProfilesToUpsert = [];
          for (const authUser of authData.users) {
            const existing = profileMap.get(authUser.id);
            const metaName = authUser.user_metadata?.full_name || (authUser.email ? authUser.email.split("@")[0] : "Ng\u01B0\u1EDDi d\xF9ng");
            const metaPhone = authUser.user_metadata?.phone || "";
            const metaRole = authUser.user_metadata?.role || "staff";
            const isBanned = !!(authUser.banned_until && new Date(authUser.banned_until) > /* @__PURE__ */ new Date());
            if (!existing) {
              const newProf = {
                id: authUser.id,
                email: authUser.email || "",
                full_name: metaName,
                phone: metaPhone,
                role: metaRole,
                status: isBanned ? "disabled" : "active",
                created_at: authUser.created_at || (/* @__PURE__ */ new Date()).toISOString()
              };
              profilesList.push(newProf);
              profileMap.set(authUser.id, newProf);
              missingProfilesToUpsert.push(newProf);
            } else {
              if (!existing.email && authUser.email) existing.email = authUser.email;
              if ((!existing.full_name || existing.full_name === "Qu\u1EA3n tr\u1ECB vi\xEAn") && authUser.user_metadata?.full_name) {
                existing.full_name = authUser.user_metadata.full_name;
              }
              if (!existing.phone && metaPhone) {
                existing.phone = metaPhone;
              }
            }
          }
          if (missingProfilesToUpsert.length > 0) {
            console.log(`[USER-MGT] \u0110ang t\u1EF1 \u0111\u1ED9ng sao l\u01B0u ${missingProfilesToUpsert.length} t\xE0i kho\u1EA3n t\u1EEB Auth v\xE0o b\u1EA3ng 'profiles'...`);
            dbClient.from("profiles").upsert(missingProfilesToUpsert).then(() => {
              console.log(`[USER-MGT] T\u1EF1 \u0111\u1ED9ng \u0111\u1ED3ng b\u1ED9 ${missingProfilesToUpsert.length} t\xE0i kho\u1EA3n v\xE0o b\u1EA3ng 'profiles' th\xE0nh c\xF4ng.`);
            }).catch((err) => {
              console.error("[USER-MGT] L\u1ED6I TH\u1EACT khi t\u1EF1 \u0111\u1ED9ng ghi profiles:", {
                message: err?.message,
                fullError: err
              });
            });
          }
        } else {
          console.warn("[USER-MGT] authData.users tr\u1EA3 v\u1EC1 r\u1ED7ng ho\u1EB7c null:", authData);
        }
      } catch (authListErr) {
        authError = authListErr;
        console.error("[USER-MGT] NGO\u1EA0I L\u1EC6 TH\u1EACT (catch) khi g\u1ECDi auth.admin.listUsers():", {
          message: authListErr?.message,
          status: authListErr?.status,
          stack: authListErr?.stack,
          fullObject: authListErr
        });
      }
    } else {
      console.error(
        `[USER-MGT] B\u1ECE QUA B\u01B0\u1EDBc 2 (auth.admin.listUsers) v\xEC supabaseAdmin = null (ch\u01B0a c\xF3 SUPABASE_SERVICE_ROLE_KEY).`
      );
    }
    profilesList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    console.log(`[USER-MGT] HO\xC0N T\u1EA4T: Tr\u1EA3 v\u1EC1 ${profilesList.length} t\xE0i kho\u1EA3n ng\u01B0\u1EDDi d\xF9ng cho client.`);
    return {
      success: true,
      users: profilesList,
      diagnostic: {
        hasServiceRoleKey: !!serviceKey,
        hasSupabaseAdmin: !!supabaseAdmin,
        totalUsers: profilesList.length,
        profilesError: profilesError ? profilesError.message || String(profilesError) : null,
        authAdminError: authError ? authError.message || String(authError) : null
      }
    };
  }
  if (action === "create" || method === "POST") {
    const { email, username, password, full_name, role = "admin" } = payload;
    let targetEmail = (email || username || "").trim().toLowerCase();
    if (targetEmail && !targetEmail.includes("@")) {
      targetEmail = `${targetEmail}@hometeadata.local`;
    }
    payload.email = targetEmail;
    if (!targetEmail || !password) {
      throw new Error("T\xEAn \u0111\u0103ng nh\u1EADp (ho\u1EB7c email) v\xE0 m\u1EADt kh\u1EA9u t\u1EA1m l\xE0 b\u1EAFt bu\u1ED9c.");
    }
    if (password.length < 6) {
      throw new Error("M\u1EADt kh\u1EA9u ph\u1EA3i c\xF3 t\u1ED1i thi\u1EC3u 6 k\xFD t\u1EF1.");
    }
    if (!supabaseAdmin) {
      throw new Error(
        "Ch\u01B0a c\xF3 quy\u1EC1n qu\u1EA3n tr\u1ECB: Vui l\xF2ng tri\u1EC3n khai Supabase Edge Function 'manage-users' (xem file supabase/README.md) ho\u1EB7c th\xEAm bi\u1EBFn SUPABASE_SERVICE_ROLE_KEY trong m\u1EE5c Settings > Secrets."
      );
    }
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: targetEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name?.trim() || targetEmail.split("@")[0],
        role: role || "staff"
      }
    });
    if (authErr) {
      throw new Error(`L\u1ED7i t\u1EA1o t\xE0i kho\u1EA3n tr\xEAn Supabase Auth: ${authErr.message}`);
    }
    const newProfile = {
      id: authData.user.id,
      email: authData.user.email,
      full_name: full_name?.trim() || targetEmail.split("@")[0],
      role: role || "staff",
      status: "active",
      created_at: authData.user.created_at || (/* @__PURE__ */ new Date()).toISOString()
    };
    const { data: profileData, error: profErr } = await dbClient.from("profiles").upsert([newProfile]).select().single();
    if (profErr) {
      console.warn("L\u1ED7i l\u01B0u v\xE0o b\u1EA3ng profiles:", profErr);
    }
    return {
      success: true,
      message: "T\u1EA1o t\xE0i kho\u1EA3n ng\u01B0\u1EDDi d\xF9ng th\xE0nh c\xF4ng",
      user: profileData || newProfile
    };
  }
  if (action === "update" || method === "PUT") {
    const { id, full_name, role, status } = payload;
    if (!id) {
      throw new Error("Thi\u1EBFu m\xE3 \u0111\u1ECBnh danh (id) t\xE0i kho\u1EA3n.");
    }
    const updates = {};
    if (full_name !== void 0) updates.full_name = full_name.trim();
    if (role !== void 0) updates.role = role;
    if (status !== void 0) updates.status = status;
    const { data: updatedProfile, error: updateErr } = await dbClient.from("profiles").update(updates).eq("id", id).select().single();
    if (updateErr) {
      throw updateErr;
    }
    if (supabaseAdmin) {
      const userMetaUpdates = {};
      if (full_name !== void 0) userMetaUpdates.full_name = full_name.trim();
      if (role !== void 0) userMetaUpdates.role = role;
      if (Object.keys(userMetaUpdates).length > 0) {
        await supabaseAdmin.auth.admin.updateUserById(id, {
          user_metadata: userMetaUpdates
        }).catch(() => {
        });
      }
      if (status === "disabled") {
        await supabaseAdmin.auth.admin.updateUserById(id, {
          ban_duration: "876000h"
        }).catch(() => {
        });
      } else if (status === "active") {
        await supabaseAdmin.auth.admin.updateUserById(id, {
          ban_duration: "none"
        }).catch(() => {
        });
      }
    }
    return {
      success: true,
      message: "C\u1EADp nh\u1EADt th\xF4ng tin t\xE0i kho\u1EA3n th\xE0nh c\xF4ng",
      user: updatedProfile
    };
  }
  if (action === "delete" || method === "DELETE") {
    const { id } = payload;
    if (!id) {
      throw new Error("Thi\u1EBFu m\xE3 \u0111\u1ECBnh danh (id) t\xE0i kho\u1EA3n c\u1EA7n x\xF3a.");
    }
    if (supabaseAdmin) {
      await supabaseAdmin.auth.admin.deleteUser(id).catch((e) => {
        console.warn("L\u1ED7i khi x\xF3a Auth User:", e.message || e);
      });
    }
    const { error: delErr } = await dbClient.from("profiles").delete().eq("id", id);
    if (delErr) {
      throw delErr;
    }
    return {
      success: true,
      message: "\u0110\xE3 x\xF3a t\xE0i kho\u1EA3n kh\u1ECFi h\u1EC7 th\u1ED1ng th\xE0nh c\xF4ng."
    };
  }
  throw new Error(`Thao t\xE1c kh\xF4ng h\u1ED7 tr\u1EE3: ${action}`);
}
app.post("/api/login", async (req, res) => {
  const { email, username, password } = req.body;
  if (!password) {
    return res.status(400).json({ error: "Vui l\xF2ng nh\u1EADp m\u1EADt kh\u1EA9u" });
  }
  const stripDiacritics = (str) => String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").trim().toLowerCase();
  const rawUserInput = String(username || email || "").trim();
  const baseIdentifier = rawUserInput.toLowerCase().replace(/@(hometeadata|nguonnhapk)\.local$/i, "");
  let rawIdentifier = (email || username || "").trim().toLowerCase();
  if (rawIdentifier && !rawIdentifier.includes("@")) {
    rawIdentifier = `${rawIdentifier}@hometeadata.local`;
  }
  const trimmedEmail = rawIdentifier;
  try {
    const { url, key } = getSupabaseConfig();
    let matchedProfileFromDb = null;
    if (url && key && (trimmedEmail || baseIdentifier)) {
      const supabase = getSupabase();
      const dbClient = getSupabaseAdmin() || supabase;
      const candidateEmails = [];
      const addCandidate = (em) => {
        const clean = String(em || "").trim().toLowerCase();
        if (clean && clean.includes("@") && !candidateEmails.includes(clean)) {
          candidateEmails.push(clean);
        }
      };
      try {
        const { data: allProfiles } = await dbClient.from("profiles").select("*");
        if (Array.isArray(allProfiles) && allProfiles.length > 0) {
          const normBase = stripDiacritics(baseIdentifier);
          matchedProfileFromDb = allProfiles.find((p) => String(p.email || "").trim().toLowerCase() === rawUserInput.toLowerCase()) || allProfiles.find((p) => String(p.email || "").trim().toLowerCase() === trimmedEmail) || allProfiles.find((p) => String(p.email || "").trim().toLowerCase().split("@")[0] === baseIdentifier) || allProfiles.find((p) => stripDiacritics(p.full_name || "") === normBase);
          if (matchedProfileFromDb?.email) {
            addCandidate(matchedProfileFromDb.email);
          }
        }
      } catch (_) {
      }
      if (rawUserInput.includes("@")) {
        addCandidate(rawUserInput);
      }
      const isMasterAdminShortcut = Boolean(ADMIN_PASSWORD && password === ADMIN_PASSWORD) && (baseIdentifier === "admin" || baseIdentifier === "master-admin") && !matchedProfileFromDb;
      if (!isMasterAdminShortcut) {
        addCandidate(trimmedEmail);
      }
      for (const candidateEmail of candidateEmails) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: candidateEmail,
          password
        });
        if (!error && data?.user) {
          const user = data.user;
          let userProfile = matchedProfileFromDb && matchedProfileFromDb.id === user.id ? matchedProfileFromDb : null;
          try {
            if (!userProfile) {
              const { data: profile } = await dbClient.from("profiles").select("*").eq("id", user.id).maybeSingle();
              userProfile = profile;
            }
            if (userProfile) {
              if (userProfile.status === "disabled") {
                return res.status(403).json({
                  error: "T\xE0i kho\u1EA3n c\u1EE7a b\u1EA1n \u0111\xE3 b\u1ECB v\xF4 hi\u1EC7u h\xF3a b\u1EDFi qu\u1EA3n tr\u1ECB vi\xEAn. Vui l\xF2ng li\xEAn h\u1EC7 h\u1ED7 tr\u1EE3."
                });
              }
            } else {
              const defaultName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Qu\u1EA3n tr\u1ECB vi\xEAn";
              const defaultRole = user.user_metadata?.role || "admin";
              const { data: newProfile } = await dbClient.from("profiles").upsert({
                id: user.id,
                email: user.email,
                full_name: defaultName,
                role: defaultRole,
                status: "active"
              }).select().single();
              userProfile = newProfile;
            }
          } catch (profileErr) {
            console.warn("L\u1ED7i ki\u1EC3m tra b\u1EA3ng profiles:", profileErr);
          }
          const fullName = userProfile?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Qu\u1EA3n tr\u1ECB vi\xEAn";
          const phone = userProfile?.phone || user.user_metadata?.phone || "";
          const role = userProfile?.role || "admin";
          const status = userProfile?.status || "active";
          const token = jwt.sign(
            {
              id: user.id,
              email: user.email,
              full_name: fullName,
              phone,
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
            maxAge: 7 * 24 * 60 * 60 * 1e3
            // 7 days
          });
          return res.json({
            success: true,
            token,
            message: "\u0110\u0103ng nh\u1EADp th\xE0nh c\xF4ng qua Supabase Auth",
            user: {
              id: user.id,
              email: user.email,
              full_name: fullName,
              phone,
              role,
              status
            }
          });
        }
      }
    }
    if (ADMIN_PASSWORD && password === ADMIN_PASSWORD) {
      if (matchedProfileFromDb && matchedProfileFromDb.status === "disabled") {
        return res.status(403).json({
          error: "T\xE0i kho\u1EA3n c\u1EE7a b\u1EA1n \u0111\xE3 b\u1ECB v\xF4 hi\u1EC7u h\xF3a b\u1EDFi qu\u1EA3n tr\u1ECB vi\xEAn. Vui l\xF2ng li\xEAn h\u1EC7 h\u1ED7 tr\u1EE3."
        });
      }
      const fallbackUser = matchedProfileFromDb ? {
        id: matchedProfileFromDb.id,
        email: matchedProfileFromDb.email || trimmedEmail || "admin@system.local",
        full_name: matchedProfileFromDb.full_name || "Qu\u1EA3n Tr\u1ECB Vi\xEAn H\u1EC7 Th\u1ED1ng",
        phone: matchedProfileFromDb.phone || "",
        role: matchedProfileFromDb.role || "admin",
        status: matchedProfileFromDb.status || "active"
      } : {
        id: "master-admin",
        email: trimmedEmail || "admin@system.local",
        full_name: "Qu\u1EA3n Tr\u1ECB Vi\xEAn H\u1EC7 Th\u1ED1ng",
        role: "admin",
        status: "active"
      };
      const token = jwt.sign(fallbackUser, SESSION_SECRET, { expiresIn: "7d" });
      res.cookie("admin_token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 7 * 24 * 60 * 60 * 1e3
      });
      return res.json({
        success: true,
        token,
        message: "\u0110\u0103ng nh\u1EADp th\xE0nh c\xF4ng b\u1EB1ng m\u1EADt kh\u1EA9u qu\u1EA3n tr\u1ECB h\u1EC7 th\u1ED1ng",
        user: fallbackUser
      });
    }
    return res.status(401).json({
      error: trimmedEmail ? "Email ho\u1EB7c m\u1EADt kh\u1EA9u kh\xF4ng ch\xEDnh x\xE1c." : "Vui l\xF2ng nh\u1EADp email v\xE0 m\u1EADt kh\u1EA9u."
    });
  } catch (err) {
    console.error("L\u1ED7i x\u1EED l\xFD \u0111\u0103ng nh\u1EADp:", err);
    return res.status(500).json({ error: err.message || "L\u1ED7i x\u1EED l\xFD \u0111\u0103ng nh\u1EADp h\u1EC7 th\u1ED1ng." });
  }
});
app.post("/api/logout", (req, res) => {
  res.clearCookie("admin_token", {
    httpOnly: true,
    secure: true,
    sameSite: "none"
  });
  return res.json({ success: true, message: "\u0110\xE3 \u0111\u0103ng xu\u1EA5t kh\u1ECFi h\u1EC7 th\u1ED1ng" });
});
app.get("/api/session", (req, res) => {
  let token = req.cookies?.admin_token;
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && (parts[0] === "Bearer" || parts[0] === "Token")) {
      token = parts[1];
    }
  }
  if (!token && req.headers["x-access-token"]) {
    token = req.headers["x-access-token"];
  }
  if (!token) {
    return res.json({ authenticated: false });
  }
  try {
    const decoded = jwt.verify(token, SESSION_SECRET);
    return res.json({
      authenticated: true,
      user: {
        id: decoded.id || "admin",
        email: decoded.email || "",
        full_name: decoded.full_name || (decoded.email ? decoded.email.split("@")[0] : "Qu\u1EA3n tr\u1ECB vi\xEAn"),
        phone: decoded.phone || "",
        role: decoded.role || "admin",
        status: decoded.status || "active"
      }
    });
  } catch (err) {
    return res.json({ authenticated: false });
  }
});
app.put("/api/user/profile", authenticateAdmin, async (req, res) => {
  try {
    const { full_name, phone } = req.body;
    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ error: "H\u1ECD v\xE0 t\xEAn kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1EC3 tr\u1ED1ng." });
    }
    const userId = req.admin?.id;
    const userEmail = req.admin?.email;
    const trimmedName = full_name.trim();
    const trimmedPhone = typeof phone === "string" ? phone.trim() : req.admin?.phone || "";
    const supabaseAdmin = getSupabaseAdmin();
    const supabase = getSupabase();
    const dbClient = supabaseAdmin || supabase;
    if (userId && userId !== "master-admin") {
      const updateData = { full_name: trimmedName, phone: trimmedPhone };
      const { error: profErr } = await dbClient.from("profiles").update(updateData).eq("id", userId);
      if (profErr) {
        if (profErr.message?.includes("phone")) {
          await dbClient.from("profiles").update({ full_name: trimmedName }).eq("id", userId);
        }
        console.warn("L\u1ED7i c\u1EADp nh\u1EADt b\u1EA3ng profiles:", profErr.message);
      }
      if (supabaseAdmin) {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            full_name: trimmedName,
            phone: trimmedPhone
          }
        }).catch((e) => console.warn("L\u1ED7i c\u1EADp nh\u1EADt user_metadata:", e.message));
      }
    }
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
      maxAge: 7 * 24 * 60 * 60 * 1e3
    });
    return res.json({
      success: true,
      message: "C\u1EADp nh\u1EADt th\xF4ng tin c\xE1 nh\xE2n th\xE0nh c\xF4ng",
      user: updatedUser
    });
  } catch (err) {
    console.error("L\u1ED7i c\u1EADp nh\u1EADt profile:", err);
    return res.status(500).json({ error: err.message || "L\u1ED7i c\u1EADp nh\u1EADt th\xF4ng tin c\xE1 nh\xE2n." });
  }
});
app.post("/api/user/change-password", authenticateAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "M\u1EADt kh\u1EA9u m\u1EDBi ph\u1EA3i c\xF3 \xEDt nh\u1EA5t 6 k\xFD t\u1EF1." });
    }
    const userId = req.admin?.id;
    const userEmail = req.admin?.email;
    if (!userId || userId === "master-admin") {
      return res.status(400).json({
        error: "T\xE0i kho\u1EA3n master qua m\u1EADt kh\u1EA9u kh\u1EA9n c\u1EA5p kh\xF4ng h\u1ED7 tr\u1EE3 \u0111\u1ED5i m\u1EADt kh\u1EA9u t\u1EA1i \u0111\xE2y. Vui l\xF2ng thi\u1EBFt l\u1EADp bi\u1EBFn ADMIN_PASSWORD trong Settings."
      });
    }
    const supabaseAdmin = getSupabaseAdmin();
    const supabase = getSupabase();
    if (currentPassword && userEmail) {
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword
      });
      if (verifyErr) {
        return res.status(400).json({ error: "M\u1EADt kh\u1EA9u hi\u1EC7n t\u1EA1i kh\xF4ng ch\xEDnh x\xE1c." });
      }
    }
    if (supabaseAdmin) {
      const { error: passErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: newPassword
      });
      if (passErr) {
        throw passErr;
      }
    } else {
      throw new Error("H\u1EC7 th\u1ED1ng ch\u01B0a k\u1EBFt n\u1ED1i Supabase Service Role Key \u0111\u1EC3 \u0111\u1ED5i m\u1EADt kh\u1EA9u.");
    }
    return res.json({
      success: true,
      message: "\u0110\u1ED5i m\u1EADt kh\u1EA9u th\xE0nh c\xF4ng!"
    });
  } catch (err) {
    console.error("L\u1ED7i \u0111\u1ED5i m\u1EADt kh\u1EA9u:", err);
    return res.status(500).json({ error: err.message || "L\u1ED7i thay \u0111\u1ED5i m\u1EADt kh\u1EA9u." });
  }
});
app.get("/api/users", authenticateAdmin, async (req, res) => {
  console.log(`
================== [START GET /api/users] ==================`);
  console.log(`[GET /api/users] Ng\u01B0\u1EDDi y\xEAu c\u1EA7u:`, {
    id: req.admin?.id,
    email: req.admin?.email,
    role: req.admin?.role
  });
  if (req.admin?.role !== "admin") {
    console.error(`[GET /api/users] T\u1EEA CH\u1ED0I: User kh\xF4ng c\xF3 role admin (role hi\u1EC7n t\u1EA1i: "${req.admin?.role}")`);
    return res.status(403).json({ error: "B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n qu\u1EA3n l\xFD t\xE0i kho\u1EA3n ng\u01B0\u1EDDi d\xF9ng." });
  }
  try {
    const result = await callManageUsersEdgeFunctionOrFallback("list", {}, "GET");
    console.log(`[GET /api/users] K\u1EBFt qu\u1EA3 tr\u1EA3 v\u1EC1 cho client: success=${result?.success}, s\u1ED1 l\u01B0\u1EE3ng users=${result?.users?.length ?? 0}`);
    console.log(`================== [END GET /api/users] ==================
`);
    return res.json(result);
  } catch (err) {
    console.error("================== [L\u1ED6I TH\u1EACT GET /api/users] ==================");
    console.error("[GET /api/users] Message:", err?.message);
    console.error("[GET /api/users] Status:", err?.status || err?.statusCode);
    console.error("[GET /api/users] Code:", err?.code);
    console.error("[GET /api/users] Stack:", err?.stack);
    console.error("[GET /api/users] Full Error Object:", JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
    console.error("===============================================================\n");
    return res.status(500).json({
      error: err.message || "L\u1ED7i l\u1EA5y danh s\xE1ch t\xE0i kho\u1EA3n.",
      status: err?.status || 500,
      code: err?.code || null,
      details: err?.details || null
    });
  }
});
app.post("/api/users", authenticateAdmin, async (req, res) => {
  if (req.admin?.role !== "admin") {
    return res.status(403).json({ error: "Ch\u1EC9 Qu\u1EA3n tr\u1ECB vi\xEAn (Admin) m\u1EDBi c\xF3 quy\u1EC1n t\u1EA1o t\xE0i kho\u1EA3n." });
  }
  try {
    const result = await callManageUsersEdgeFunctionOrFallback("create", req.body, "POST");
    return res.status(201).json(result);
  } catch (err) {
    console.error("L\u1ED7i t\u1EA1o t\xE0i kho\u1EA3n m\u1EDBi:", err);
    return res.status(400).json({ error: err.message || "L\u1ED7i t\u1EA1o t\xE0i kho\u1EA3n m\u1EDBi." });
  }
});
app.put("/api/users/:id", authenticateAdmin, async (req, res) => {
  if (req.admin?.role !== "admin") {
    return res.status(403).json({ error: "Ch\u1EC9 Qu\u1EA3n tr\u1ECB vi\xEAn (Admin) m\u1EDBi c\xF3 quy\u1EC1n c\u1EADp nh\u1EADt t\xE0i kho\u1EA3n." });
  }
  try {
    const result = await callManageUsersEdgeFunctionOrFallback(
      "update",
      { id: req.params.id, ...req.body },
      "PUT"
    );
    return res.json(result);
  } catch (err) {
    console.error("L\u1ED7i c\u1EADp nh\u1EADt t\xE0i kho\u1EA3n:", err);
    return res.status(400).json({ error: err.message || "L\u1ED7i c\u1EADp nh\u1EADt t\xE0i kho\u1EA3n." });
  }
});
app.delete("/api/users/:id", authenticateAdmin, async (req, res) => {
  if (req.admin?.role !== "admin") {
    return res.status(403).json({ error: "Ch\u1EC9 Qu\u1EA3n tr\u1ECB vi\xEAn (Admin) m\u1EDBi c\xF3 quy\u1EC1n x\xF3a t\xE0i kho\u1EA3n." });
  }
  try {
    const result = await callManageUsersEdgeFunctionOrFallback(
      "delete",
      { id: req.params.id },
      "DELETE"
    );
    return res.json(result);
  } catch (err) {
    console.error("L\u1ED7i x\xF3a t\xE0i kho\u1EA3n:", err);
    return res.status(400).json({ error: err.message || "L\u1ED7i x\xF3a t\xE0i kho\u1EA3n." });
  }
});
var handleSystemConfigStatus = (req, res) => {
  const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();
  const { cloudName, uploadPreset } = getCloudinaryConfig();
  const hasAdminPassword = !!cleanEnvVar(process.env.ADMIN_PASSWORD);
  const hasCloudNameVar = !!cleanEnvVar(process.env.VITE_CLOUDINARY_CLOUD_NAME) || !!cleanEnvVar(process.env.CLOUDINARY_CLOUD_NAME);
  const hasUploadPresetVar = !!cleanEnvVar(process.env.VITE_CLOUDINARY_UPLOAD_PRESET) || !!cleanEnvVar(process.env.CLOUDINARY_UPLOAD_PRESET);
  res.json({
    supabaseConfigured: !!(supabaseUrl && supabaseKey),
    cloudinaryConfigured: !!(cloudName && uploadPreset),
    adminPasswordConfigured: hasAdminPassword,
    supabaseUrlPreview: supabaseUrl ? supabaseUrl.length > 25 ? `${supabaseUrl.substring(0, 22)}...` : supabaseUrl : null,
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
app.get("/api/system/info", authenticateAdmin, async (req, res) => {
  const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();
  const serviceKey = getSupabaseServiceRoleKey();
  const { cloudName, uploadPreset } = getCloudinaryConfig();
  const hasAdminPassword = !!cleanEnvVar(process.env.ADMIN_PASSWORD);
  const jwtSecret = cleanEnvVar(process.env.JWT_SECRET);
  const localDb = readLocalDb();
  const propertyManagers = readPropertyManagers();
  let supabaseHealth = {
    connected: false,
    message: "Ch\u01B0a ki\u1EC3m tra",
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
        const propErr = propRes.status === "fulfilled" && propRes.value.error ? propRes.value.error.message : propRes.status === "rejected" ? String(propRes.reason) : null;
        const profileErr = profileRes.status === "fulfilled" && profileRes.value.error ? profileRes.value.error.message : profileRes.status === "rejected" ? String(profileRes.reason) : null;
        supabaseHealth = {
          connected: propRes.status === "fulfilled" && !propRes.value.error,
          propertiesCount: propCount,
          profilesCount: profileCount,
          propertiesError: propErr,
          profilesError: profileErr
        };
      }
    } catch (err) {
      supabaseHealth = {
        connected: false,
        message: err.message || "L\u1ED7i ki\u1EC3m tra Supabase",
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
      serverTime: (/* @__PURE__ */ new Date()).toISOString()
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
      cloudName: cloudName ? maskSecret(cloudName) : "Ch\u01B0a c\u1EA5u h\xECnh",
      uploadPreset: uploadPreset ? maskSecret(uploadPreset) : "Ch\u01B0a c\u1EA5u h\xECnh"
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
app.get("/api/test-db", authenticateAdmin, async (req, res) => {
  const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();
  if (!supabaseUrl || !supabaseKey) {
    return res.json({
      connected: false,
      status: "missing_env",
      message: "Ch\u01B0a c\u1EA5u h\xECnh SUPABASE_URL ho\u1EB7c SUPABASE_ANON_KEY trong m\u1EE5c Settings > Secrets.",
      details: `SUPABASE_URL: ${supabaseUrl ? "\u0110\xE3 c\xF3" : "Ch\u01B0a c\xF3"}, SUPABASE_ANON_KEY: ${supabaseKey ? "\u0110\xE3 c\xF3" : "Ch\u01B0a c\xF3"}`,
      setupSQL: COMPLETE_SETUP_SQL
    });
  }
  try {
    const supabase = getSupabase();
    const { data, error, count } = await supabase.from("chu_nha_can_ban").select("id", { count: "exact", head: true });
    if (error) {
      console.error("Test DB query returned error:", error);
      const errorMsg = String(error?.message || "");
      const errorDetails = String(error?.details || "");
      const errorCode = String(error?.code || "");
      const isTableMissing = errorCode === "42P01" || errorMsg.includes("relation") || errorDetails.includes("does not exist") || errorMsg.includes("does not exist");
      const isRLSPolicyViolation = errorCode === "42501" || errorMsg.toLowerCase().includes("row-level security") || errorDetails.toLowerCase().includes("row-level security") || errorMsg.toLowerCase().includes("security policy");
      const isDnsOrPausedError = errorCode === "ENOTFOUND" || errorMsg.includes("ENOTFOUND") || errorDetails.includes("ENOTFOUND") || errorMsg.includes("fetch failed") || errorDetails.includes("fetch failed");
      if (isTableMissing) {
        return res.json({
          connected: false,
          status: "table_missing",
          message: "K\u1EBFt n\u1ED1i th\xE0nh c\xF4ng \u0111\u1EBFn Supabase nh\u01B0ng b\u1EA3ng 'chu_nha_can_ban' ch\u01B0a \u0111\u01B0\u1EE3c t\u1EA1o.",
          details: "M\xE3 l\u1ED7i: 42P01 (Table does not exist). Vui l\xF2ng ch\u1EA1y m\xE3 SQL b\xEAn d\u01B0\u1EDBi trong SQL Editor c\u1EE7a Supabase.",
          setupSQL: COMPLETE_SETUP_SQL
        });
      }
      if (isRLSPolicyViolation) {
        return res.json({
          connected: false,
          status: "rls_blocked",
          message: "B\u1EA3ng 'chu_nha_can_ban' \u0111ang b\u1EADt RLS (Row Level Security) v\xE0 ch\u1EB7n quy\u1EC1n truy c\u1EADp.",
          details: "M\xE3 l\u1ED7i: 42501 (RLS violation). C\u1EA7n t\u1EAFt RLS ho\u1EB7c c\u1EA5p quy\u1EC1n truy c\u1EADp to\xE0n quy\u1EC1n.",
          setupSQL: COMPLETE_SETUP_SQL
        });
      }
      if (isDnsOrPausedError) {
        return res.json({
          connected: false,
          status: "paused_or_dns_error",
          message: "D\u1EF1 \xE1n Supabase \u0111ang \u1EDF tr\u1EA1ng th\xE1i T\u1EA0M D\u1EEANG (Paused) ho\u1EB7c t\xEAn mi\u1EC1n URL kh\xF4ng ch\xEDnh x\xE1c.",
          details: `Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i \u0111\u1EBFn URL '${supabaseUrl}'. \u0110\u1ED1i v\u1EDBi g\xF3i Supabase Free, d\u1EF1 \xE1n s\u1EBD t\u1EF1 \u0111\u1ED9ng T\u1EA1m D\u1EEBng n\u1EBFu kh\xF4ng ho\u1EA1t \u0111\u1ED9ng 7 ng\xE0y. H\xE3y v\xE0o supabase.com/dashboard v\xE0 b\u1EA5m 'Restore project' \u0111\u1EC3 ti\u1EBFp t\u1EE5c.`,
          setupSQL: COMPLETE_SETUP_SQL
        });
      }
      return res.json({
        connected: false,
        status: "query_error",
        message: `L\u1ED7i truy v\u1EA5n Supabase: ${error.message || error.details || "Kh\xF4ng r\xF5 nguy\xEAn nh\xE2n"}`,
        details: JSON.stringify(error),
        setupSQL: COMPLETE_SETUP_SQL
      });
    }
    let profilesStatusMsg = "B\u1EA3ng 'profiles' \u0111\xE3 s\u1EB5n s\xE0ng.";
    const { error: profileCheckErr } = await supabase.from("profiles").select("id", { count: "exact", head: true });
    if (profileCheckErr) {
      profilesStatusMsg = "B\u1EA3ng 'profiles' ch\u01B0a \u0111\u01B0\u1EE3c t\u1EA1o. Vui l\xF2ng ch\u1EA1y \u0111o\u1EA1n m\xE3 SQL \u0111\u1EC3 t\u1EA1o b\u1EA3ng profiles.";
    }
    return res.json({
      connected: true,
      status: "ready",
      message: `K\u1EBFt n\u1ED1i th\xE0nh c\xF4ng! B\u1EA3ng 'chu_nha_can_ban' (T\u1ED5ng: ${count ?? 0}). ${profilesStatusMsg}`,
      profilesReady: !profileCheckErr,
      details: `Supabase Project: ${supabaseUrl}`,
      setupSQL: COMPLETE_SETUP_SQL
    });
  } catch (err) {
    console.error("Test DB catch error:", err);
    const errString = String(err?.message || "") + " " + String(err?.details || "");
    const isPaused = errString.includes("ENOTFOUND") || errString.includes("fetch failed");
    return res.json({
      connected: false,
      status: isPaused ? "paused_or_dns_error" : "connection_failed",
      message: isPaused ? "D\u1EF1 \xE1n Supabase \u0111ang \u1EDF tr\u1EA1ng th\xE1i T\u1EA0M D\u1EEANG (Paused) ho\u1EB7c t\xEAn mi\u1EC1n URL kh\xF4ng ch\xEDnh x\xE1c." : "Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i \u0111\u1EBFn m\xE1y ch\u1EE7 Supabase.",
      details: isPaused ? `Kh\xF4ng th\u1EC3 ph\xE2n gi\u1EA3i t\xEAn mi\u1EC1n '${supabaseUrl}'. H\xE3y v\xE0o supabase.com/dashboard \u0111\u1EC3 'Restore project' ho\u1EB7c ki\u1EC3m tra SUPABASE_URL trong Settings > Secrets.` : err.message || "L\u1ED7i k\u1EBFt n\u1ED1i Supabase.",
      setupSQL: COMPLETE_SETUP_SQL
    });
  }
});
app.get("/api/cloudinary-config", authenticateAdmin, (req, res) => {
  const { cloudName, uploadPreset } = getCloudinaryConfig();
  res.json({
    cloudName,
    uploadPreset
  });
});
var UPLOADS_DIR = path.join(process.cwd(), "uploads");
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (_) {
}
app.use("/uploads", express.static(UPLOADS_DIR));
var upload = multer({ storage: multer.memoryStorage() });
var cachedStorageBucketName = null;
async function resolveSupabaseStorageBucket(sbClient, sbAdmin) {
  const envBucket = (process.env.SUPABASE_STORAGE_BUCKET || process.env.VITE_SUPABASE_STORAGE_BUCKET || "").trim();
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
        "uploads"
      ];
      for (const name of preferredNames) {
        const found = buckets.find((b) => b.name === name || b.id === name);
        if (found) {
          cachedStorageBucketName = found.name || found.id;
          return cachedStorageBucketName;
        }
      }
      const publicBucket = buckets.find((b) => b.public);
      if (publicBucket) {
        cachedStorageBucketName = publicBucket.name || publicBucket.id;
        return cachedStorageBucketName;
      }
      cachedStorageBucketName = buckets[0].name || buckets[0].id;
      return cachedStorageBucketName;
    }
  } catch (_) {
  }
  const defaultBucket = "property-images";
  if (sbAdmin) {
    try {
      await sbAdmin.storage.createBucket(defaultBucket, { public: true });
      cachedStorageBucketName = defaultBucket;
    } catch (_) {
    }
  }
  return defaultBucket;
}
function sanitizeStorageMaTkFolder(rawFolder) {
  const clean = String(rawFolder || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  if (!clean || /^#?[0-9]+$/.test(clean)) {
    return "";
  }
  const tkOrNtMatch = clean.match(/^(TK[A-Z0-9]{3,16}|NT-[A-Z0-9]{4,16})/);
  if (tkOrNtMatch) {
    return tkOrNtMatch[1];
  }
  return clean;
}
app.post("/api/upload-image", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Kh\xF4ng t\xECm th\u1EA5y file \u0111\u1EC3 t\u1EA3i l\xEAn." });
    }
    const { cloudName, uploadPreset, apiKey, apiSecret } = getCloudinaryConfig();
    const rawReqPreset = String(req.body?.upload_preset || uploadPreset || "").trim();
    const reqPreset = rawReqPreset.startsWith("cloudinary://") ? "" : rawReqPreset;
    const reqFolder = sanitizeStorageMaTkFolder(req.body?.folder || req.body?.ma_tk || "");
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || "image/jpeg" });
    const originalName = req.file.originalname || `img_${Date.now()}.jpg`;
    const ext = path.extname(originalName) || ".jpg";
    const safeBase = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
    try {
      const sbAdmin = getSupabaseAdmin();
      const sbClient = sbAdmin || getSupabase();
      if (sbClient) {
        const bucketName = await resolveSupabaseStorageBucket(sbClient, sbAdmin);
        const objectPath = `${reqFolder ? reqFolder + "/" : ""}${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${safeBase}${ext}`;
        const { error: upErr } = await sbClient.storage.from(bucketName).upload(objectPath, req.file.buffer, {
          contentType: req.file.mimetype || "image/jpeg",
          upsert: true
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
              provider: "supabase_storage"
            });
          }
        }
      }
    } catch (_) {
    }
    const tryUnsignedCloudinary = async (presetToTry) => {
      const formData = new FormData();
      formData.append("file", blob, originalName);
      formData.append("upload_preset", presetToTry);
      if (reqFolder) {
        formData.append("folder", reqFolder);
      }
      const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
      const response = await fetch(cloudinaryUrl, {
        method: "POST",
        body: formData
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
              provider: "cloudinary_unsigned"
            });
          }
          if (presetCandidate === reqPreset && apiKey && apiSecret && result.rawText && result.rawText.includes("Upload preset not found")) {
            try {
              const basicAuth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
              const createPresetRes = await fetch(
                `https://api.cloudinary.com/v1_1/${cloudName}/upload_presets`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Basic ${basicAuth}`,
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                    name: reqPreset,
                    unsigned: true
                  })
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
                    provider: "cloudinary_unsigned_autocreated"
                  });
                }
              }
            } catch (_) {
            }
          }
        } catch (err) {
          console.warn(`Cloudinary unsigned attempt (${presetCandidate}) skipped:`, err?.message || err);
        }
      }
      if (apiKey && apiSecret) {
        try {
          const timestamp = Math.floor(Date.now() / 1e3).toString();
          const paramsToSign = { timestamp };
          if (reqFolder) {
            paramsToSign.folder = reqFolder;
          }
          const sortedParams = Object.keys(paramsToSign).sort().map((k) => `${k}=${paramsToSign[k]}`).join("&");
          const signature = crypto.createHash("sha1").update(sortedParams + apiSecret).digest("hex");
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
              body: signedForm
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
                provider: "cloudinary_signed"
              });
            }
          }
        } catch (signedErr) {
          console.warn("Cloudinary signed upload error:", signedErr?.message || signedErr);
        }
      }
    }
    const uniqueFileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeBase}${ext}`;
    const subDir = reqFolder ? path.join(UPLOADS_DIR, reqFolder) : UPLOADS_DIR;
    try {
      if (!fs.existsSync(subDir)) {
        fs.mkdirSync(subDir, { recursive: true });
      }
      const fullFilePath = path.join(subDir, uniqueFileName);
      fs.writeFileSync(fullFilePath, req.file.buffer);
      const relativeUrl = reqFolder ? `/uploads/${reqFolder}/${uniqueFileName}` : `/uploads/${uniqueFileName}`;
      return res.json({
        success: true,
        secure_url: relativeUrl,
        public_id: uniqueFileName,
        format: ext.replace(".", ""),
        bytes: req.file.size,
        provider: "local_storage"
      });
    } catch (_) {
      const mime = req.file.mimetype || "image/jpeg";
      const dataUri = `data:${mime};base64,${req.file.buffer.toString("base64")}`;
      return res.json({
        success: true,
        secure_url: dataUri,
        public_id: uniqueFileName,
        format: ext.replace(".", ""),
        bytes: req.file.size,
        provider: "data_uri"
      });
    }
  } catch (proxyError) {
    console.warn("L\u1ED7i x\u1EED l\xFD t\u1EA3i \u1EA3nh ph\xEDa m\xE1y ch\u1EE7:", proxyError?.message || proxyError);
    return res.status(500).json({ error: proxyError.message || "L\u1ED7i x\u1EED l\xFD t\u1EA3i \u1EA3nh ph\xEDa m\xE1y ch\u1EE7." });
  }
});
var CREATOR_TAG_REGEX = /\s*<!--creator:([\s\S]*?)-->\s*/;
var META_TAG_REGEX = /\s*<!--meta:([\s\S]*?)-->\s*/;
var EXPORT_LOGS_PATH = path.join(process.cwd(), "export_logs.json");
function readExportLogs() {
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
function writeExportLogs(logs) {
  try {
    fs.writeFileSync(EXPORT_LOGS_PATH, JSON.stringify(logs.slice(0, 500), null, 2), "utf8");
  } catch (_) {
  }
}
function extractMetaFromContent(content) {
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
function embedMetaInContent(content, meta) {
  let baseContent = (content || "").replace(META_TAG_REGEX, "").trim();
  if (!meta || Object.keys(meta).length === 0) return baseContent;
  return `${baseContent}

<!--meta:${JSON.stringify(meta)}-->`;
}
function extractCreatorFromContent(content) {
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
function embedCreatorInContent(content, creator) {
  let baseContent = (content || "").trim();
  baseContent = baseContent.replace(CREATOR_TAG_REGEX, "").trim();
  if (!creator) return baseContent;
  const tag = `

<!--creator:${JSON.stringify(creator)}-->`;
  return baseContent + tag;
}
async function enrichPropertiesWithManagers(props, supabase) {
  if (!props || props.length === 0) return props;
  const propertyManagers = readPropertyManagers();
  let profilesList = [];
  try {
    const { data: profs } = await supabase.from("profiles").select("*");
    if (profs && Array.isArray(profs)) {
      profilesList = profs;
    }
  } catch (e) {
  }
  const adminAuth = getSupabaseAdmin();
  let authUsersList = [];
  if (adminAuth) {
    try {
      const { data: authData } = await adminAuth.auth.admin.listUsers();
      if (authData?.users) {
        authUsersList = authData.users;
      }
    } catch (e) {
    }
  }
  const userMap = {};
  for (const u of authUsersList) {
    const profile = {
      id: u.id,
      email: u.email,
      full_name: u.user_metadata?.full_name || u.email?.split("@")[0] || "Qu\u1EA3n tr\u1ECB vi\xEAn",
      phone: u.user_metadata?.phone || "",
      role: u.user_metadata?.role || "staff"
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
      full_name: p.full_name || existing.full_name || p.email?.split("@")[0] || "Qu\u1EA3n tr\u1ECB vi\xEAn",
      phone: p.phone || existing.phone || "",
      role: p.role || existing.role || "staff"
    };
    userMap[p.id] = profile;
    if (p.email) userMap[p.email] = profile;
    if (profile.phone) {
      userMap[profile.phone.replace(/[^0-9]/g, "")] = profile;
    }
  }
  let managersChanged = false;
  for (const prop of props) {
    const { cleanContent: afterCreator, creator: embeddedCreator } = extractCreatorFromContent(prop.content);
    const { cleanContent, meta: embeddedMeta } = extractMetaFromContent(afterCreator);
    prop.content = cleanContent;
    if (embeddedMeta && typeof embeddedMeta === "object") {
      const metaKeys = [
        "ma_tk",
        "so_nha",
        "ten_duong",
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
        "loai_vi_tri",
        "huong",
        "phap_ly",
        "so_phong_ngu",
        "so_wc",
        "duong_vao_m",
        "dac_diem",
        "hien_trang",
        "nguon_trich_xuat",
        "da_boc_tach_ai",
        "da_xac_nhan_ai",
        "ngay_boc_tach_ai",
        "ai_manual_fields"
      ];
      const aiNullableKeys = /* @__PURE__ */ new Set([
        "loai_vi_tri",
        "huong",
        "phap_ly",
        "so_phong_ngu",
        "so_wc",
        "so_nha",
        "ten_duong",
        "duong",
        "duong_vao_m",
        "dac_diem",
        "hien_trang",
        "nguon_trich_xuat",
        "da_boc_tach_ai",
        "da_xac_nhan_ai",
        "ngay_boc_tach_ai",
        "ai_manual_fields"
      ]);
      for (const k of metaKeys) {
        if (aiNullableKeys.has(k) && embeddedMeta.da_boc_tach_ai && k in embeddedMeta) {
          if (prop[k] === void 0 || k === "so_nha" || k === "ten_duong" || k === "duong") {
            prop[k] = embeddedMeta[k];
          }
          continue;
        }
        if ((prop[k] === void 0 || prop[k] === null || prop[k] === "") && embeddedMeta[k] !== void 0 && embeddedMeta[k] !== null && embeddedMeta[k] !== "") {
          prop[k] = embeddedMeta[k];
        }
      }
    }
    let manager = propertyManagers[prop.id];
    if (embeddedCreator && (embeddedCreator.id || embeddedCreator.email || embeddedCreator.name)) {
      const cleanEmbeddedPhone = embeddedCreator.phone ? embeddedCreator.phone.replace(/[^0-9]/g, "") : "";
      const matchedUser = userMap[embeddedCreator.id] || userMap[embeddedCreator.email] || (cleanEmbeddedPhone ? userMap[cleanEmbeddedPhone] : null);
      manager = {
        created_by: embeddedCreator.id || matchedUser?.id || "admin",
        created_by_name: matchedUser?.full_name || embeddedCreator.name || embeddedCreator.full_name || "Qu\u1EA3n tr\u1ECB vi\xEAn",
        created_by_phone: matchedUser?.phone || embeddedCreator.phone || "",
        created_by_email: matchedUser?.email || embeddedCreator.email || "",
        created_by_role: matchedUser?.role || embeddedCreator.role || "staff"
      };
      propertyManagers[prop.id] = manager;
      managersChanged = true;
    }
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
    if (!manager && prop.created_by_name && prop.created_by_name !== "Ch\u01B0a ph\xE2n c\xF4ng") {
      const foundUser = Object.values(userMap).find((u) => u.full_name?.toLowerCase() === prop.created_by_name.toLowerCase());
      manager = {
        created_by: foundUser?.id || prop.created_by || "admin",
        created_by_name: prop.created_by_name,
        created_by_phone: foundUser?.phone || "",
        created_by_email: foundUser?.email || "",
        created_by_role: foundUser?.role || "staff"
      };
    }
    if (manager) {
      const latestUser = userMap[manager.created_by] || userMap[manager.created_by_email] || (manager.created_by_phone ? userMap[manager.created_by_phone.replace(/[^0-9]/g, "")] : null);
      const resolvedName = latestUser?.full_name || manager.created_by_name || "Qu\u1EA3n tr\u1ECB vi\xEAn";
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
      prop.created_by_name = "Ch\u01B0a ph\xE2n c\xF4ng";
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
app.get("/api/properties", authenticateAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("chu_nha_can_ban").select("*").order("updated_at", { ascending: false });
    if (error) {
      console.log("Supabase query did not complete. Activating local database fallback.");
      const localData = readLocalDb();
      localData.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      await enrichPropertiesWithManagers(localData, supabase);
      const isTableMissing = error?.code === "42P01" || error?.message?.includes("relation") || error?.details?.includes("does not exist") || error?.message?.includes("does not exist");
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
        `.trim() : void 0
      });
    }
    const properties = (data || []).map((prop) => {
      const p = { ...prop, district: prop.district || prop.khu_vuc || "" };
      delete p.khu_vuc;
      return p;
    });
    await enrichPropertiesWithManagers(properties, supabase);
    return res.json({ properties, isFallbackMode: false });
  } catch (error) {
    console.log("Supabase fetch connection failed. Activating local database fallback.");
    let supabase = null;
    try {
      supabase = getSupabase();
    } catch (_) {
    }
    const localData = readLocalDb().map((prop) => {
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
function parseServerNgayLayDate(rawDateStr) {
  if (!rawDateStr || typeof rawDateStr !== "string" || !rawDateStr.trim()) return null;
  const s = rawDateStr.trim();
  const timeFirstMatch = s.match(
    /^([0-9]{1,2}):([0-9]{1,2})(?::([0-9]{1,2}))?\s*(?:-\s*)?([0-9]{1,2})[/-]([0-9]{1,2})[/-]([0-9]{4})/
  );
  if (timeFirstMatch) {
    const hour = parseInt(timeFirstMatch[1], 10);
    const min = parseInt(timeFirstMatch[2], 10);
    const sec = timeFirstMatch[3] ? parseInt(timeFirstMatch[3], 10) : 0;
    const day = parseInt(timeFirstMatch[4], 10);
    const month = parseInt(timeFirstMatch[5], 10);
    const year = parseInt(timeFirstMatch[6], 10);
    const dt = new Date(year, month - 1, day, hour, min, sec);
    if (!isNaN(dt.getTime())) return dt.toISOString();
  }
  const dmyMatch = s.match(
    /^([0-9]{1,2})[/-]([0-9]{1,2})[/-]([0-9]{4})(?:\s*(?:-\s*)?([0-9]{1,2}):([0-9]{1,2})(?::([0-9]{1,2}))?)?/
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
function toNumericOrNull(val) {
  if (val === null || val === void 0 || val === "") return null;
  if (typeof val === "number") return !isNaN(val) && isFinite(val) ? val : null;
  const cleaned = String(val).trim().replace(/,/g, ".").replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  return !isNaN(num) && isFinite(num) ? num : null;
}
var KNOWN_CHU_NHA_DB_COLUMNS = /* @__PURE__ */ new Set([
  "id",
  "name",
  "phone",
  "district",
  "facebook_link",
  "website_link",
  "content",
  "image_urls",
  "loai_giao_dich",
  "status",
  "created_by",
  "created_by_name",
  "created_at",
  "updated_at",
  "ma_tk",
  "loai_hinh",
  "dia_chi",
  "phuong",
  "gia",
  "dien_tich_so",
  "dien_tich_thuc_te",
  "rong",
  "dai",
  "so_tang",
  "trang_thai_xu_ly",
  "da_len_hometea",
  "hometea_id",
  "ngay_dang",
  "da_xep_lich_fb",
  "da_dang_fb",
  "draft_hometea_title",
  "draft_hometea_desc",
  "draft_facebook_caption",
  "draft_seo_title",
  "draft_seo_desc",
  "selected_images",
  "anh_dai_dien",
  "loai_vi_tri",
  "huong",
  "phap_ly",
  "so_phong_ngu",
  "so_wc",
  "so_nha",
  "ten_duong",
  "duong_vao_m",
  "dac_diem",
  "hien_trang",
  "nguon_trich_xuat"
]);
function sanitizeChuNhaDbPayload(rawPayload) {
  const clean = {};
  for (const [k, v] of Object.entries(rawPayload)) {
    if (v === void 0) continue;
    if (k === "da_xuat_hometea") {
      clean.da_len_hometea = !!v;
      continue;
    }
    if (k === "da_xuat_fb") {
      clean.da_dang_fb = !!v;
      continue;
    }
    if (!KNOWN_CHU_NHA_DB_COLUMNS.has(k) || unsupportedColumnsCache.has(k)) {
      continue;
    }
    if ([
      "gia",
      "dien_tich_so",
      "dien_tich_thuc_te",
      "rong",
      "dai",
      "so_tang",
      "so_phong_ngu",
      "so_wc",
      "duong_vao_m"
    ].includes(k)) {
      const n = toNumericOrNull(v);
      clean[k] = ["gia", "so_phong_ngu", "so_wc"].includes(k) && n !== null ? Math.round(n) : n;
    } else {
      clean[k] = v;
    }
  }
  return clean;
}
function extractNgayLayFromStoredRecord(row, meta) {
  if (!row && !meta) return { iso: null, raw: "" };
  const direct = row?.ngay_lay || meta?.ngay_lay;
  if (direct) {
    const iso = parseServerNgayLayDate(String(direct));
    if (iso) {
      return { iso, raw: String(meta?.ngay_lay_raw || direct) };
    }
  }
  const textToScan = [row?.mo_ta_tho, meta?.mo_ta_tho, row?.content].filter(Boolean).join("\n");
  const m = textToScan.match(
    /(?:Ngày\s*lấy(?:\s*nguồn)?|Ngay\s*lay(?:\s*nguon)?|Thời\s*gian\s*lấy|Thoi\s*gian\s*lay)\s*:\s*([^\n\r]+)/i
  );
  if (m) {
    const raw = m[1].trim();
    return { iso: parseServerNgayLayDate(raw), raw };
  }
  return { iso: null, raw: "" };
}
var unsupportedColumnsCache = /* @__PURE__ */ new Set();
async function upsertChuNhaCanBanByMaTk(supabase, payload, existingId) {
  const workingPayload = sanitizeChuNhaDbPayload(payload);
  if (!workingPayload.loai_giao_dich) {
    workingPayload.loai_giao_dich = "khach_ban";
  }
  if (!workingPayload.status) {
    workingPayload.status = "moi";
  }
  if (!workingPayload.name) {
    workingPayload.name = String(payload.ma_tk || payload.dia_chi || "Ngu\u1ED3n nh\xE0");
  }
  const protectedExact = [
    "da_len_hometea",
    "hometea_id",
    "da_xep_lich_fb",
    "da_dang_fb",
    "da_xuat_hometea",
    "da_xuat_fb",
    "ngay_xuat_hometea",
    "ngay_xuat_fb"
  ];
  for (const key of Object.keys(workingPayload)) {
    if (protectedExact.includes(key) || key.startsWith("draft_")) {
      delete workingPayload[key];
    }
  }
  for (let attempt = 0; attempt < 25; attempt++) {
    const { data, error } = await supabase.from("chu_nha_can_ban").upsert([workingPayload], { onConflict: "ma_tk" }).select();
    if (!error) {
      return data?.[0] || null;
    }
    const errMsg = String(error.message || "") + " " + String(error.details || "");
    const colMatch1 = errMsg.match(/Could not find the '([^']+)' column/i);
    const colMatch2 = errMsg.match(/column "([^"]+)" of relation "chu_nha_can_ban" does not exist/i);
    const missingCol = colMatch1?.[1] || colMatch2?.[1];
    if (missingCol && missingCol in workingPayload && missingCol !== "name") {
      unsupportedColumnsCache.add(missingCol);
      delete workingPayload[missingCol];
      continue;
    }
    if (error.code === "22P02") {
      for (const numCol of ["so_tang", "rong", "dai", "dien_tich_so", "dien_tich_thuc_te", "gia"]) {
        if (workingPayload[numCol] !== null && workingPayload[numCol] !== void 0) {
          const parsedNum = Number(String(workingPayload[numCol]).replace(",", "."));
          workingPayload[numCol] = !isNaN(parsedNum) && String(workingPayload[numCol]).trim() !== "" ? parsedNum : null;
        }
      }
      continue;
    }
    if (error.code === "42P10" || errMsg.includes("ON CONFLICT specification")) {
      if (existingId) {
        const { data: updData, error: updErr } = await supabase.from("chu_nha_can_ban").update(workingPayload).eq("id", existingId).select();
        if (updErr) throw updErr;
        return updData?.[0] || null;
      } else {
        const { data: insData, error: insErr } = await supabase.from("chu_nha_can_ban").insert([workingPayload]).select();
        if (insErr) throw insErr;
        return insData?.[0] || null;
      }
    }
    throw error;
  }
  throw new Error("Kh\xF4ng th\u1EC3 l\u01B0u b\u1EA3n ghi v\xE0o b\u1EA3ng chu_nha_can_ban sau nhi\u1EC1u l\u1EA7n th\u1EED.");
}
app.post("/api/properties/check-ma-tk", authenticateAdmin, async (req, res) => {
  try {
    const rawList = Array.isArray(req.body?.ma_tk_list) ? req.body.ma_tk_list : [];
    const maTkList = Array.from(
      new Set(
        rawList.map((m) => String(m || "").trim().toUpperCase()).filter((m) => m && !/^#?[0-9]+$/.test(m))
      )
    );
    if (maTkList.length === 0) {
      return res.json({ success: true, existingMap: {} });
    }
    const existingMap = {};
    const maTkSet = new Set(maTkList);
    const attachNgayLayMeta = (row) => {
      if (!row) return row;
      const { cleanContent: c1 } = extractCreatorFromContent(row.content);
      const { meta } = extractMetaFromContent(c1);
      const storedNgayLay = extractNgayLayFromStoredRecord(row, meta);
      return {
        ...meta || {},
        ...row,
        _stored_ngay_lay: storedNgayLay.iso,
        _stored_ngay_lay_raw: storedNgayLay.raw,
        _manually_edited_fields: Array.isArray(meta?.manually_edited_fields) ? meta.manually_edited_fields : []
      };
    };
    try {
      const supabase = getSupabase();
      const { data: byCol, error: colErr } = await supabase.from("chu_nha_can_ban").select("*").in("ma_tk", maTkList);
      if (!colErr && Array.isArray(byCol)) {
        for (const row of byCol) {
          if (row.ma_tk) {
            const key = String(row.ma_tk).trim().toUpperCase();
            existingMap[key] = attachNgayLayMeta(row);
          }
        }
      }
      if (Object.keys(existingMap).length < maTkList.length) {
        const { data: legacyRows } = await supabase.from("chu_nha_can_ban").select("*");
        if (Array.isArray(legacyRows)) {
          for (const row of legacyRows) {
            const rowMaTk = String(row.ma_tk || "").trim().toUpperCase();
            if (rowMaTk && maTkSet.has(rowMaTk) && !existingMap[rowMaTk]) {
              existingMap[rowMaTk] = attachNgayLayMeta(row);
              continue;
            }
            const nameUpper = String(row.name || "").toUpperCase();
            const contentUpper = String(row.content || "").toUpperCase();
            for (const code of Array.from(maTkSet)) {
              if (!existingMap[code]) {
                if (nameUpper.startsWith(`${code}_`) || nameUpper.startsWith(`${code} `) || contentUpper.includes(`M\xC3 NGU\u1ED2N H\xC0NG: ${code}`) || contentUpper.includes(`"MA_TK":"${code}"`)) {
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
  } catch (err) {
    return res.status(500).json({ error: err.message || "L\u1ED7i ki\u1EC3m tra danh s\xE1ch M\xE3 TK." });
  }
});
app.post("/api/properties/bulk-upsert", authenticateAdmin, async (req, res) => {
  try {
    if (req.admin?.role === "viewer") {
      return res.status(403).json({ error: "T\xE0i kho\u1EA3n Ng\u01B0\u1EDDi xem kh\xF4ng c\xF3 quy\u1EC1n nh\u1EADp ngu\u1ED3n nh\xE0." });
    }
    const updateExisting = !!req.body?.updateExisting;
    const rec = req.body?.record || {};
    const ma_tk = String(rec.ma_tk || "").trim().toUpperCase();
    if (!ma_tk || /^#?[0-9]+$/.test(ma_tk)) {
      return res.status(400).json({
        error: "M\xE3 TK th\u1EADt (TKxxxxxx ho\u1EB7c NT-xxxxxx) l\xE0 b\u1EAFt bu\u1ED9c. Kh\xF4ng d\xF9ng ti\u1EC1n t\u1ED1 s\u1ED1 l\xE0m m\xE3."
      });
    }
    const so_nha = String(rec.so_nha || "").trim();
    const duong = String(rec.duong || "").trim();
    const dia_chi = String(rec.dia_chi || [so_nha, duong].filter(Boolean).join(" ")).trim();
    const phuong = String(rec.phuong || "").trim();
    const dien_tich = String(rec.dien_tich || "").trim();
    let dien_tich_so = rec.dien_tich_so !== null && rec.dien_tich_so !== void 0 && rec.dien_tich_so !== "" && !isNaN(Number(rec.dien_tich_so)) ? Number(rec.dien_tich_so) : null;
    let dien_tich_thuc_te = rec.dien_tich_thuc_te !== null && rec.dien_tich_thuc_te !== void 0 && rec.dien_tich_thuc_te !== "" && !isNaN(Number(rec.dien_tich_thuc_te)) ? Number(rec.dien_tich_thuc_te) : null;
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
    const loai_hinh = String(rec.loai_hinh || "Nh\xE0 ph\u1ED1").trim();
    const isNhaPho = loai_hinh.toLowerCase() === "nh\xE0 ph\u1ED1" || loai_hinh.toLowerCase() === "nha pho";
    const rawSoTangStr = isNhaPho ? String(rec.so_tang ?? "").trim() : "";
    const so_tang = rawSoTangStr || null;
    const rawRongStr = String(rec.rong ?? "").trim();
    const rong = rawRongStr || null;
    const rawDaiStr = String(rec.dai ?? "").trim();
    const dai = rawDaiStr || null;
    const gia = rec.gia !== null && rec.gia !== void 0 && rec.gia !== "" && !isNaN(Number(rec.gia)) ? Math.round(Number(rec.gia)) : null;
    const gia_text = String(rec.gia_text || "").trim();
    const mo_ta_tho = String(rec.mo_ta_tho || "").trim();
    const moi_gioi_nguon = String(rec.moi_gioi_nguon || "").trim();
    const sdt_nguon = String(rec.sdt_nguon || "").trim();
    const hoa_hong = String(rec.hoa_hong || "3%").trim();
    const toa_do = String(rec.toa_do || "").trim();
    const ten_thu_muc_goc = String(rec.ten_thu_muc_goc || "").trim();
    const ngay_nhap = rec.ngay_nhap || (/* @__PURE__ */ new Date()).toISOString();
    const parsedIncomingNgayLay = parseServerNgayLayDate(rec.ngay_lay) || extractNgayLayFromStoredRecord({ mo_ta_tho }, null).iso;
    const ngay_lay_raw = String(rec.ngay_lay_raw || "").trim();
    const image_urls = Array.isArray(rec.image_urls) ? rec.image_urls : [];
    const anh = Array.isArray(rec.anh) ? rec.anh : [];
    const hasValidArea = dien_tich_thuc_te !== null && dien_tich_thuc_te > 0 || dien_tich_so !== null && dien_tich_so > 0 || !!dien_tich;
    const isMissingMandatory = !dia_chi || !hasValidArea || !gia || gia <= 0;
    const trang_thai_nguon = isMissingMandatory ? "th\xF4" : rec.trang_thai_nguon || "\u0111\xE3 b\u1ED5 sung";
    const trang_thai_kinh_doanh = rec.trang_thai_kinh_doanh || (trang_thai_nguon === "\u0111\xE3 b\xE1n" ? "da_ban" : "nguon_tho");
    const hasAllStructured = !!ma_tk && !!so_nha && !!duong && !!phuong && dien_tich_so !== null && dien_tich_so > 0 && dien_tich_thuc_te !== null && dien_tich_thuc_te > 0 && (!isNhaPho || !!so_tang) && !!rong && !!dai && gia !== null && gia > 0 && image_urls.length > 0;
    const trang_thai_xu_ly = rec.trang_thai_xu_ly || (isMissingMandatory ? "tho" : hasAllStructured ? "san_sang" : "can_bo_sung");
    let mappedStatus = "moi";
    if (trang_thai_kinh_doanh === "da_ban" || trang_thai_nguon === "\u0111\xE3 b\xE1n")
      mappedStatus = "da_ban";
    else if (trang_thai_kinh_doanh === "da_ky" || trang_thai_nguon === "s\u1EB5n s\xE0ng \u0111\u0103ng")
      mappedStatus = "da_ky";
    else mappedStatus = "moi";
    const displayTitle = [
      `${ma_tk}_${dia_chi || ten_thu_muc_goc}`,
      dien_tich || (dien_tich_so && dien_tich_thuc_te ? dien_tich_so === dien_tich_thuc_te ? `${dien_tich_thuc_te}` : `${dien_tich_so}-${dien_tich_thuc_te}` : ""),
      so_tang || loai_hinh,
      rong,
      dai,
      gia_text
    ].filter(Boolean).join(" ") || ten_thu_muc_goc || ma_tk;
    const structuredSummaryLines = [
      `--- THONG TIN NGUON HANG ---`,
      `M\xE3 ngu\u1ED3n h\xE0ng: ${ma_tk}`,
      ngay_lay_raw || parsedIncomingNgayLay ? `Ng\xE0y l\u1EA5y: ${ngay_lay_raw || parsedIncomingNgayLay}` : "",
      `Lo\u1EA1i h\xECnh: ${loai_hinh}`,
      `Tr\u1EA1ng th\xE1i ngu\u1ED3n: ${trang_thai_nguon}`,
      `--- TIEU DE ---`,
      `${dia_chi}${phuong ? `, ${phuong}` : ""}`,
      `--- THONG TIN CHI TIET ---`,
      gia_text ? `Gi\xE1 ch\xE0o (VN\u0110): ${gia_text} (${gia ? gia.toLocaleString("vi-VN") + " \u0111" : ""})` : "",
      hasValidArea ? `Di\u1EC7n t\xEDch: ${dien_tich || dien_tich_thuc_te} m\xB2 (S\u1ED5: ${dien_tich_so ?? "-"}m\xB2 | Th\u1EF1c t\u1EBF: ${dien_tich_thuc_te ?? "-"}m\xB2) ${rong && dai ? `(${rong} x ${dai}m)` : ""}` : "",
      so_tang ? `K\u1EBFt c\u1EA5u: ${so_tang} t\u1EA7ng` : "",
      hoa_hong ? `Ph\u1EA7n tr\u0103m tr\xEDch th\u01B0\u1EDFng: ${hoa_hong}` : "",
      moi_gioi_nguon ? `\u0110\u1EA7u ch\u1EE7: ${moi_gioi_nguon}` : "",
      sdt_nguon ? `S\u0110T: ${sdt_nguon}` : "",
      toa_do ? `Dinh vi: ${toa_do}` : "",
      `--- MO TA ---`,
      mo_ta_tho || ""
    ].filter(Boolean);
    const authorId = req.admin?.id || rec.created_by || req.admin?.email || "admin";
    const authorName = req.admin?.full_name || rec.created_by_name || "Qu\u1EA3n tr\u1ECB vi\xEAn";
    const authorPhone = req.admin?.phone || rec.created_by_phone || "";
    const authorEmail = req.admin?.email || rec.created_by_email || "";
    const authorRole = req.admin?.role || rec.created_by_role || "admin";
    const warehouseMeta = {
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
      ngay_lay_raw
    };
    const contentWithMeta = embedMetaInContent(structuredSummaryLines.join("\n"), warehouseMeta);
    const contentWithCreator = embedCreatorInContent(contentWithMeta, {
      id: authorId,
      name: authorName,
      phone: authorPhone,
      email: authorEmail,
      role: authorRole
    });
    const fullPayload = {
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
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    try {
      const supabase = getSupabase();
      let existingRow = null;
      const { data: foundByMaTk } = await supabase.from("chu_nha_can_ban").select("*").eq("ma_tk", ma_tk).maybeSingle();
      if (foundByMaTk) {
        existingRow = foundByMaTk;
      } else {
        const { data: foundByName } = await supabase.from("chu_nha_can_ban").select("*").ilike("name", `${ma_tk}_%`).maybeSingle();
        if (foundByName) existingRow = foundByName;
      }
      if (existingRow && !updateExisting) {
        return res.json({
          success: true,
          skipped: true,
          message: `B\u1ECF qua M\xE3 TK ${ma_tk} v\xEC \u0111\xE3 t\u1ED3n t\u1EA1i.`
        });
      }
      let targetPayload = { ...fullPayload };
      if (existingRow && updateExisting) {
        const { cleanContent: exC1 } = extractCreatorFromContent(existingRow.content);
        const { meta: exMeta } = extractMetaFromContent(exC1);
        const storedNgayLayInfo = extractNgayLayFromStoredRecord(existingRow, exMeta);
        if (storedNgayLayInfo.iso) {
          if (!parsedIncomingNgayLay) {
            return res.json({
              success: true,
              skipped: true,
              reason: "missing_ngay_lay",
              message: `B\u1ECF qua c\u1EADp nh\u1EADt ${ma_tk}: B\u1EA3n \u0111ang l\u01B0u c\xF3 Ng\xE0y l\u1EA5y (${storedNgayLayInfo.raw || storedNgayLayInfo.iso.slice(0, 10)}), nh\u01B0ng .txt m\u1EDBi kh\xF4ng c\xF3 Ng\xE0y l\u1EA5y.`
            });
          }
          const incomingMs = new Date(parsedIncomingNgayLay).getTime();
          const storedMs = new Date(storedNgayLayInfo.iso).getTime();
          if (incomingMs <= storedMs) {
            return res.json({
              success: true,
              skipped: true,
              reason: "not_newer_ngay_lay",
              message: `B\u1ECF qua c\u1EADp nh\u1EADt ${ma_tk}: Ng\xE0y l\u1EA5y trong .txt (${ngay_lay_raw || parsedIncomingNgayLay.slice(0, 10)}) kh\xF4ng m\u1EDBi h\u01A1n b\u1EA3n \u0111ang l\u01B0u (${storedNgayLayInfo.raw || storedNgayLayInfo.iso.slice(0, 10)}).`
            });
          }
        }
        const manuallyEdited = new Set(
          Array.isArray(exMeta?.manually_edited_fields) ? exMeta.manually_edited_fields : []
        );
        const isNonEmpty = (val) => val !== null && val !== void 0 && String(val).trim() !== "";
        const keepOrFill = (field, existingVal, incomingVal) => {
          if (manuallyEdited.has(field) && isNonEmpty(existingVal)) return existingVal;
          if (isNonEmpty(existingVal)) return existingVal;
          return incomingVal;
        };
        const prevImages = Array.isArray(existingRow.image_urls) ? existingRow.image_urls : [];
        const mergedImages = Array.from(/* @__PURE__ */ new Set([...prevImages, ...image_urls]));
        const prevAnh = Array.isArray(existingRow.anh) ? existingRow.anh : [];
        const mergedAnh = [...prevAnh, ...anh];
        const mergedLoaiHinh = keepOrFill(
          "loai_hinh",
          existingRow.loai_hinh ?? exMeta?.loai_hinh,
          fullPayload.loai_hinh
        );
        const mergedIsNhaPho = String(mergedLoaiHinh || "").toLowerCase() === "nh\xE0 ph\u1ED1" || String(mergedLoaiHinh || "").toLowerCase() === "nha pho";
        const mergedSoTang = mergedIsNhaPho ? keepOrFill("so_tang", existingRow.so_tang ?? exMeta?.so_tang, fullPayload.so_tang) : null;
        const exXuLy = existingRow.trang_thai_xu_ly || exMeta?.trang_thai_xu_ly;
        const mergedXuLy = exXuLy === "da_len_hometea" || exXuLy === "da_dang_fb" || exXuLy === "san_sang" ? exXuLy : keepOrFill("trang_thai_xu_ly", exXuLy, fullPayload.trang_thai_xu_ly);
        const updatedMeta = {
          ...exMeta || {},
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
          dien_tich_so: existingRow.dien_tich_so ?? exMeta?.dien_tich_so ?? fullPayload.dien_tich_so,
          dien_tich_thuc_te: existingRow.dien_tich_thuc_te ?? exMeta?.dien_tich_thuc_te ?? fullPayload.dien_tich_thuc_te,
          so_tang: mergedSoTang || "",
          rong: keepOrFill("rong", existingRow.rong ?? exMeta?.rong, fullPayload.rong) || "",
          dai: keepOrFill("dai", existingRow.dai ?? exMeta?.dai, fullPayload.dai) || "",
          gia: existingRow.gia ?? exMeta?.gia ?? fullPayload.gia,
          trang_thai_nguon: existingRow.trang_thai_nguon ?? exMeta?.trang_thai_nguon ?? fullPayload.trang_thai_nguon,
          trang_thai_kinh_doanh: keepOrFill(
            "trang_thai_kinh_doanh",
            existingRow.trang_thai_kinh_doanh ?? exMeta?.trang_thai_kinh_doanh,
            fullPayload.trang_thai_kinh_doanh
          ),
          trang_thai_xu_ly: mergedXuLy,
          // Raw part IS updated with the newer .txt data:
          mo_ta_tho: fullPayload.mo_ta_tho || existingRow.mo_ta_tho || exMeta?.mo_ta_tho || "",
          moi_gioi_nguon: fullPayload.moi_gioi_nguon || existingRow.moi_gioi_nguon || exMeta?.moi_gioi_nguon || "",
          sdt_nguon: fullPayload.sdt_nguon || existingRow.sdt_nguon || exMeta?.sdt_nguon || "",
          hoa_hong: fullPayload.hoa_hong || existingRow.hoa_hong || exMeta?.hoa_hong || "",
          toa_do: fullPayload.toa_do || existingRow.toa_do || exMeta?.toa_do || "",
          ten_thu_muc_goc: fullPayload.ten_thu_muc_goc || existingRow.ten_thu_muc_goc || exMeta?.ten_thu_muc_goc || "",
          ngay_lay: parsedIncomingNgayLay || storedNgayLayInfo.iso,
          ngay_lay_raw: ngay_lay_raw || storedNgayLayInfo.raw,
          manually_edited_fields: Array.from(manuallyEdited)
        };
        const mergedContentMeta = embedMetaInContent(structuredSummaryLines.join("\n"), updatedMeta);
        const mergedContentCreator = embedCreatorInContent(mergedContentMeta, {
          id: authorId,
          name: authorName,
          phone: authorPhone,
          email: authorEmail,
          role: authorRole
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
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        if (existingRow.id && !existingRow.ma_tk) {
          try {
            await supabase.from("chu_nha_can_ban").update({ ma_tk }).eq("id", existingRow.id);
          } catch (_) {
          }
        }
      }
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
          created_by_role: authorRole
        };
        writePropertyManagers(pManagers);
      }
      return res.status(200).json({
        success: true,
        property: savedProp,
        isFallbackMode: false
      });
    } catch (dbErr) {
      const localData = readLocalDb();
      const existingIdx = localData.findIndex(
        (p) => String(p.ma_tk || "").toUpperCase() === ma_tk
      );
      let savedLocal;
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
              message: `B\u1ECF qua c\u1EADp nh\u1EADt ${ma_tk}: Ng\xE0y l\u1EA5y trong .txt kh\xF4ng m\u1EDBi h\u01A1n b\u1EA3n \u0111ang l\u01B0u.`
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
          image_urls: Array.from(/* @__PURE__ */ new Set([...prev.image_urls || [], ...image_urls])),
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        localData[existingIdx] = savedLocal;
      } else {
        savedLocal = {
          ...fullPayload,
          id: `local-${ma_tk}-${Date.now()}`,
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        localData.push(savedLocal);
      }
      writeLocalDb(localData);
      return res.status(200).json({
        success: true,
        property: savedLocal,
        isFallbackMode: true
      });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message || "L\u1ED7i upsert ngu\u1ED3n h\xE0ng lo\u1EA1t." });
  }
});
app.get("/api/public/properties", async (req, res) => {
  try {
    let rows = [];
    try {
      const supabase = getSupabase();
      const { data } = await supabase.from("chu_nha_can_ban").select("*").order("updated_at", { ascending: false });
      if (Array.isArray(data)) rows = data;
    } catch (_) {
      rows = readLocalDb();
    }
    const safeProperties = rows.filter((r) => {
      if (r.trang_thai_nguon === "th\xF4") return false;
      const hasAddr = !!(r.duong || r.so_nha || r.name);
      const hasPrice = !!(r.gia && Number(r.gia) > 0);
      const hasArea = !!r.dien_tich;
      return hasAddr && hasPrice && hasArea;
    }).map((r) => {
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
  } catch (err) {
    return res.status(500).json({ error: "L\u1ED7i l\u1EA5y danh s\xE1ch c\xF4ng khai." });
  }
});
app.post("/api/properties", authenticateAdmin, async (req, res) => {
  try {
    if (req.admin?.role === "viewer") {
      return res.status(403).json({ error: "T\xE0i kho\u1EA3n Ng\u01B0\u1EDDi xem (Viewer) kh\xF4ng c\xF3 quy\u1EC1n t\u1EA1o m\u1EDBi tin." });
    }
    const { name, phone, district, facebook_link, website_link, content, image_urls, loai_giao_dich, status, created_by, created_by_name, created_by_phone, created_by_email, created_by_role } = req.body;
    if (!name) {
      return res.status(400).json({ error: "T\xEAn ch\u1EE7 nh\xE0 l\xE0 b\u1EAFt bu\u1ED9c" });
    }
    if (!loai_giao_dich) {
      return res.status(400).json({ error: "Lo\u1EA1i giao d\u1ECBch l\xE0 b\u1EAFt bu\u1ED9c" });
    }
    const authorId = req.admin?.id || created_by || req.admin?.email || "admin";
    const authorName = req.admin?.full_name || created_by_name || req.admin?.email?.split("@")[0] || "Qu\u1EA3n tr\u1ECB vi\xEAn";
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
    const cleanInputContent = typeof content === "string" ? content.trim() : content || "";
    const contentWithCreator = embedCreatorInContent(cleanInputContent, creatorMeta);
    const supabasePayload = {
      name: typeof name === "string" ? name.trim() : name,
      phone: phone || "",
      district: typeof district === "string" ? district.trim() : district || "",
      facebook_link: facebook_link || "",
      website_link: website_link || "",
      content: contentWithCreator,
      image_urls: Array.isArray(image_urls) ? image_urls : [],
      loai_giao_dich,
      status: status || "moi",
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    console.log(`[POST /api/properties] Inserting to chu_nha_can_ban with district: "${supabasePayload.district}", creator: "${authorName}"`);
    try {
      const supabase = getSupabase();
      const insertResult = await supabase.from("chu_nha_can_ban").insert([supabasePayload]).select();
      if (insertResult.error) {
        console.error("[POST /api/properties] Supabase insert error:", insertResult.error);
        throw insertResult.error;
      }
      const createdProp = insertResult.data?.[0];
      if (createdProp) {
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
    } catch (dbErr) {
      const isCheckConstraint = dbErr?.code === "23514" || dbErr?.message && dbErr.message.toLowerCase().includes("check constraint") || dbErr?.details && dbErr.details.toLowerCase().includes("check constraint");
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
        created_at: (/* @__PURE__ */ new Date()).toISOString()
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
        `.trim() : void 0
      });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message || "L\u1ED7i x\u1EED l\xFD t\u1EA1o m\u1EDBi ch\u1EE7 nh\xE0." });
  }
});
var handleUpdateProperty = async (req, res) => {
  try {
    if (req.admin?.role === "viewer") {
      return res.status(403).json({ error: "T\xE0i kho\u1EA3n Ng\u01B0\u1EDDi xem (Viewer) kh\xF4ng c\xF3 quy\u1EC1n ch\u1EC9nh s\u1EEDa tin." });
    }
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "M\xE3 b\u1EA5t \u0111\u1ED9ng s\u1EA3n (id) l\xE0 b\u1EAFt bu\u1ED9c" });
    }
    const userRole = req.admin?.role;
    const userId = req.admin?.id;
    const userEmail = req.admin?.email;
    const pManagers = readPropertyManagers();
    let currentManager = pManagers[id];
    if (!currentManager && !id.startsWith("local-")) {
      try {
        const supabase = getSupabase();
        const { data: exData } = await supabase.from("chu_nha_can_ban").select("content").eq("id", id).maybeSingle();
        if (exData) {
          const { creator } = extractCreatorFromContent(exData.content);
          if (creator) {
            currentManager = {
              created_by: creator.id,
              created_by_name: creator.name || creator.full_name || "Qu\u1EA3n tr\u1ECB vi\xEAn",
              created_by_phone: creator.phone || "",
              created_by_email: creator.email || "",
              created_by_role: creator.role || "staff"
            };
            pManagers[id] = currentManager;
            writePropertyManagers(pManagers);
          }
        }
      } catch (e) {
      }
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
      ngay_boc_tach_ai,
      ai_manual_fields
    } = req.body;
    if (userRole === "staff") {
      if (currentManager && currentManager.created_by) {
        const isOwner = currentManager.created_by === userId || currentManager.created_by === userEmail;
        if (!isOwner) {
          return res.status(403).json({
            error: "B\u1EA1n ch\u1EC9 c\xF3 quy\u1EC1n ch\u1EC9nh s\u1EEDa c\u0103n nh\xE0 do ch\xEDnh b\u1EA1n \u0111\xE3 t\u1EA1o."
          });
        }
      }
    }
    if (created_by || created_by_name || created_by_phone || manager) {
      currentManager = {
        created_by: created_by || manager?.id || currentManager?.created_by || req.admin?.id,
        created_by_name: created_by_name || manager?.full_name || currentManager?.created_by_name || "Qu\u1EA3n tr\u1ECB vi\xEAn",
        created_by_phone: created_by_phone || manager?.phone || currentManager?.created_by_phone || "",
        created_by_email: created_by_email || manager?.email || currentManager?.created_by_email || "",
        created_by_role: created_by_role || manager?.role || currentManager?.created_by_role || "staff"
      };
      pManagers[id] = currentManager;
      writePropertyManagers(pManagers);
    }
    const supabasePayload = {
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (name !== void 0) supabasePayload.name = typeof name === "string" ? name.trim() : name;
    if (phone !== void 0) supabasePayload.phone = phone || "";
    else if (sdt_nguon !== void 0) supabasePayload.phone = sdt_nguon || "";
    if (phuong !== void 0) supabasePayload.district = typeof phuong === "string" ? phuong.trim() : phuong || "";
    else if (district !== void 0) supabasePayload.district = typeof district === "string" ? district.trim() : district || "";
    if (facebook_link !== void 0) supabasePayload.facebook_link = facebook_link || "";
    if (website_link !== void 0) supabasePayload.website_link = website_link || "";
    if (image_urls !== void 0) supabasePayload.image_urls = Array.isArray(image_urls) ? image_urls : [];
    if (loai_giao_dich !== void 0) supabasePayload.loai_giao_dich = loai_giao_dich;
    if (trang_thai_kinh_doanh !== void 0) {
      supabasePayload.trang_thai_kinh_doanh = trang_thai_kinh_doanh;
      if (trang_thai_kinh_doanh === "da_ban") supabasePayload.status = "da_ban";
      else if (trang_thai_kinh_doanh === "da_ky") supabasePayload.status = "da_ky";
      else supabasePayload.status = "moi";
    } else if (status !== void 0) {
      supabasePayload.status = status;
    }
    const extendedFields = {};
    if (ma_tk !== void 0) extendedFields.ma_tk = String(ma_tk || "").trim().toUpperCase();
    if (so_nha !== void 0) {
      extendedFields.so_nha = so_nha !== null && String(so_nha).trim() !== "" ? String(so_nha).trim() : null;
    }
    const effectiveStreet = ten_duong !== void 0 ? ten_duong : duong;
    if (effectiveStreet !== void 0) {
      const cleanStreet = effectiveStreet !== null && String(effectiveStreet).trim() !== "" ? sanitizeTenDuongServer(String(effectiveStreet).trim()) : null;
      extendedFields.ten_duong = cleanStreet;
      extendedFields.duong = cleanStreet || "";
    }
    if (so_nha !== void 0 || effectiveStreet !== void 0) {
      extendedFields.dia_chi = [
        extendedFields.so_nha ? String(extendedFields.so_nha).trim() : "",
        extendedFields.duong ? String(extendedFields.duong).trim() : ""
      ].filter(Boolean).join(" ").trim();
    }
    if (phuong !== void 0) extendedFields.phuong = String(phuong || "").trim();
    if (dien_tich !== void 0) extendedFields.dien_tich = String(dien_tich || "").trim();
    if (dien_tich_so !== void 0) {
      extendedFields.dien_tich_so = dien_tich_so !== null && dien_tich_so !== "" && !isNaN(Number(dien_tich_so)) ? Number(dien_tich_so) : null;
    }
    if (dien_tich_thuc_te !== void 0) {
      extendedFields.dien_tich_thuc_te = dien_tich_thuc_te !== null && dien_tich_thuc_te !== "" && !isNaN(Number(dien_tich_thuc_te)) ? Number(dien_tich_thuc_te) : null;
    }
    if (so_tang !== void 0) extendedFields.so_tang = String(so_tang || "").trim();
    if (rong !== void 0) extendedFields.rong = String(rong || "").trim();
    if (dai !== void 0) extendedFields.dai = String(dai || "").trim();
    if (gia !== void 0) {
      extendedFields.gia = gia !== null && gia !== "" && !isNaN(Number(gia)) ? Math.round(Number(gia)) : null;
    }
    if (loai_hinh !== void 0) extendedFields.loai_hinh = String(loai_hinh || "").trim();
    if (trang_thai_nguon !== void 0) extendedFields.trang_thai_nguon = trang_thai_nguon;
    if (trang_thai_kinh_doanh !== void 0) extendedFields.trang_thai_kinh_doanh = trang_thai_kinh_doanh;
    if (trang_thai_xu_ly !== void 0) extendedFields.trang_thai_xu_ly = trang_thai_xu_ly;
    if (da_xuat_hometea !== void 0) extendedFields.da_xuat_hometea = !!da_xuat_hometea;
    if (da_xuat_fb !== void 0) extendedFields.da_xuat_fb = !!da_xuat_fb;
    if (mo_ta_tho !== void 0) extendedFields.mo_ta_tho = String(mo_ta_tho || "");
    if (moi_gioi_nguon !== void 0) extendedFields.moi_gioi_nguon = String(moi_gioi_nguon || "").trim();
    if (sdt_nguon !== void 0) extendedFields.sdt_nguon = String(sdt_nguon || "").trim();
    if (hoa_hong !== void 0) extendedFields.hoa_hong = String(hoa_hong || "").trim();
    if (toa_do !== void 0) extendedFields.toa_do = String(toa_do || "").trim();
    if (anh !== void 0) extendedFields.anh = Array.isArray(anh) ? anh : [];
    if (loai_vi_tri !== void 0) {
      extendedFields.loai_vi_tri = loai_vi_tri && ["mat_tien", "hem_xe_hoi", "hem_xe_may", "hem"].includes(String(loai_vi_tri)) ? String(loai_vi_tri) : null;
    }
    if (huong !== void 0) {
      extendedFields.huong = huong && String(huong).trim() ? String(huong).trim() : null;
    }
    if (phap_ly !== void 0) {
      extendedFields.phap_ly = phap_ly && String(phap_ly).trim() ? String(phap_ly).trim() : null;
    }
    if (so_phong_ngu !== void 0) {
      const n = toNumericOrNull(so_phong_ngu);
      extendedFields.so_phong_ngu = n !== null && n > 0 ? Math.round(n) : null;
    }
    if (so_wc !== void 0) {
      const n = toNumericOrNull(so_wc);
      extendedFields.so_wc = n !== null && n > 0 ? Math.round(n) : null;
    }
    if (duong_vao_m !== void 0) {
      const n = toNumericOrNull(duong_vao_m);
      extendedFields.duong_vao_m = n !== null && n > 0 ? Number(n) : null;
    }
    if (dac_diem !== void 0) {
      if (Array.isArray(dac_diem)) {
        const cleaned = dac_diem.map((d) => String(d).trim()).filter(Boolean);
        extendedFields.dac_diem = cleaned.length > 0 ? cleaned : null;
      } else if (typeof dac_diem === "string" && dac_diem.trim()) {
        const cleaned = dac_diem.split(",").map((d) => d.trim()).filter(Boolean);
        extendedFields.dac_diem = cleaned.length > 0 ? cleaned : null;
      } else {
        extendedFields.dac_diem = null;
      }
    }
    if (hien_trang !== void 0) {
      extendedFields.hien_trang = hien_trang && String(hien_trang).trim() ? String(hien_trang).trim() : null;
    }
    if (nguon_trich_xuat !== void 0) {
      extendedFields.nguon_trich_xuat = nguon_trich_xuat && typeof nguon_trich_xuat === "object" ? nguon_trich_xuat : {};
    }
    if (da_boc_tach_ai !== void 0) extendedFields.da_boc_tach_ai = !!da_boc_tach_ai;
    if (da_xac_nhan_ai !== void 0) extendedFields.da_xac_nhan_ai = !!da_xac_nhan_ai;
    if (ngay_boc_tach_ai !== void 0) extendedFields.ngay_boc_tach_ai = ngay_boc_tach_ai;
    if (ai_manual_fields !== void 0 && Array.isArray(ai_manual_fields)) {
      extendedFields.ai_manual_fields = ai_manual_fields;
    }
    Object.assign(supabasePayload, extendedFields);
    if (content !== void 0 || Object.keys(extendedFields).length > 0) {
      let rawBaseContent = typeof content === "string" ? content : "";
      let prevMeta = {};
      if (content === void 0 && !id.startsWith("local-")) {
        try {
          const supabase = getSupabase();
          const { data: exRow } = await supabase.from("chu_nha_can_ban").select("content").eq("id", id).maybeSingle();
          if (exRow?.content) {
            const c1 = extractCreatorFromContent(exRow.content);
            const c2 = extractMetaFromContent(c1.cleanContent);
            rawBaseContent = c2.cleanContent;
            if (c2.meta) prevMeta = c2.meta;
          }
        } catch (_) {
        }
      } else if (typeof content === "string") {
        const c1 = extractCreatorFromContent(content);
        const c2 = extractMetaFromContent(c1.cleanContent);
        rawBaseContent = c2.cleanContent;
        if (c2.meta) prevMeta = c2.meta;
      }
      const prevEdited = Array.isArray(prevMeta.manually_edited_fields) ? prevMeta.manually_edited_fields : [];
      const newlyEdited = Object.keys(extendedFields).filter(
        (k) => !["mo_ta_tho", "anh", "updated_at", "nguon_trich_xuat", "ai_manual_fields"].includes(k)
      );
      const prevAiManual = Array.isArray(prevMeta.ai_manual_fields) ? prevMeta.ai_manual_fields : [];
      const incomingAiManual = Array.isArray(extendedFields.ai_manual_fields) ? extendedFields.ai_manual_fields : [];
      const aiTrackableKeys = [
        "loai_vi_tri",
        "huong",
        "phap_ly",
        "so_phong_ngu",
        "so_wc",
        "so_nha",
        "ten_duong",
        "duong_vao_m",
        "dac_diem",
        "hien_trang"
      ];
      const editedAiKeys = aiTrackableKeys.filter((k) => {
        if (k === "ten_duong" && ("ten_duong" in extendedFields || "duong" in extendedFields)) {
          const prevVal = prevMeta.ten_duong ?? prevMeta.duong ?? null;
          const nextVal = extendedFields.ten_duong ?? extendedFields.duong ?? null;
          return JSON.stringify(prevVal) !== JSON.stringify(nextVal);
        }
        if (!(k in extendedFields)) return false;
        return JSON.stringify(prevMeta[k] ?? null) !== JSON.stringify(extendedFields[k] ?? null);
      });
      const mergedAiManualFields = Array.from(
        /* @__PURE__ */ new Set([...prevAiManual, ...incomingAiManual, ...editedAiKeys])
      );
      extendedFields.ai_manual_fields = mergedAiManualFields;
      supabasePayload.ai_manual_fields = mergedAiManualFields;
      const mergedNguonTrichXuat = {
        ...prevMeta.nguon_trich_xuat && typeof prevMeta.nguon_trich_xuat === "object" ? prevMeta.nguon_trich_xuat : {},
        ...extendedFields.nguon_trich_xuat && typeof extendedFields.nguon_trich_xuat === "object" ? extendedFields.nguon_trich_xuat : {}
      };
      for (const k of editedAiKeys) {
        const val = k === "ten_duong" ? extendedFields.ten_duong : extendedFields[k];
        mergedNguonTrichXuat[k] = {
          gia_tri: val ?? null,
          bang_chung: mergedNguonTrichXuat[k]?.bang_chung || "\u0110\xE3 ch\u1EC9nh s\u1EEDa / x\xE1c nh\u1EADn th\u1EE7 c\xF4ng",
          tin_cay: "cao",
          da_sua_tay: true,
          da_xac_nhan: true
        };
      }
      if (Object.keys(mergedNguonTrichXuat).length > 0) {
        extendedFields.nguon_trich_xuat = mergedNguonTrichXuat;
        supabasePayload.nguon_trich_xuat = mergedNguonTrichXuat;
      }
      const mergedMeta = {
        ...prevMeta,
        ...extendedFields,
        ai_manual_fields: mergedAiManualFields,
        nguon_trich_xuat: mergedNguonTrichXuat,
        manually_edited_fields: Array.from(/* @__PURE__ */ new Set([...prevEdited, ...newlyEdited]))
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
        updatedProperty = { ...supabasePayload, id, created_at: (/* @__PURE__ */ new Date()).toISOString() };
        updatedData.push(updatedProperty);
      }
      writeLocalDb(updatedData);
      return res.json({ success: true, property: updatedProperty, isFallbackMode: true });
    }
    try {
      const supabase = getSupabase();
      const dbPayload = sanitizeChuNhaDbPayload(supabasePayload);
      let updateResult = await supabase.from("chu_nha_can_ban").update(dbPayload).eq("id", id).select();
      for (let retry = 0; retry < 15 && updateResult.error; retry++) {
        const errMsg = String(updateResult.error.message || "") + " " + String(updateResult.error.details || "");
        const colMatch1 = errMsg.match(/Could not find the '([^']+)' column/i);
        const colMatch2 = errMsg.match(/column "([^"]+)" of relation "chu_nha_can_ban" does not exist/i);
        const missingCol = colMatch1?.[1] || colMatch2?.[1];
        if (missingCol && missingCol in dbPayload && missingCol !== "name") {
          unsupportedColumnsCache.add(missingCol);
          delete dbPayload[missingCol];
          updateResult = await supabase.from("chu_nha_can_ban").update(dbPayload).eq("id", id).select();
        } else {
          break;
        }
      }
      if (updateResult.error && (updateResult.error.code === "42703" || String(updateResult.error.message || "").includes("column"))) {
        const basePayload = {
          updated_at: supabasePayload.updated_at
        };
        if (supabasePayload.name !== void 0) basePayload.name = supabasePayload.name;
        if (supabasePayload.phone !== void 0) basePayload.phone = supabasePayload.phone;
        if (supabasePayload.district !== void 0) basePayload.district = supabasePayload.district;
        if (supabasePayload.facebook_link !== void 0) basePayload.facebook_link = supabasePayload.facebook_link;
        if (supabasePayload.website_link !== void 0) basePayload.website_link = supabasePayload.website_link;
        if (supabasePayload.content !== void 0) basePayload.content = supabasePayload.content;
        if (supabasePayload.image_urls !== void 0) basePayload.image_urls = supabasePayload.image_urls;
        if (supabasePayload.loai_giao_dich !== void 0) basePayload.loai_giao_dich = supabasePayload.loai_giao_dich;
        if (supabasePayload.status !== void 0) basePayload.status = supabasePayload.status;
        updateResult = await supabase.from("chu_nha_can_ban").update(basePayload).eq("id", id).select();
      }
      if (updateResult.error) {
        console.error(`[UPDATE /api/properties/${id}] Supabase update error:`, updateResult.error);
        throw updateResult.error;
      }
      const { data } = updateResult;
      if (!data || data.length === 0) {
        throw new Error(`Kh\xF4ng t\xECm th\u1EA5y tin v\u1EDBi ID ${id} trong b\u1EA3ng chu_nha_can_ban tr\xEAn Supabase.`);
      }
      const { cleanContent: c1 } = extractCreatorFromContent(data[0]?.content);
      const { cleanContent, meta: extractedMeta } = extractMetaFromContent(c1);
      const returnedProp = {
        ...extractedMeta || {},
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
    } catch (dbErr) {
      const isCheckConstraint = dbErr?.code === "23514" || dbErr?.message && dbErr.message.toLowerCase().includes("check constraint") || dbErr?.details && dbErr.details.toLowerCase().includes("check constraint");
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
        updatedProperty = { ...supabasePayload, id, created_at: (/* @__PURE__ */ new Date()).toISOString() };
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
        `.trim() : void 0
      });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message || "L\u1ED7i x\u1EED l\xFD c\u1EADp nh\u1EADt ch\u1EE7 nh\xE0." });
  }
};
app.put("/api/properties/:id", authenticateAdmin, handleUpdateProperty);
app.patch("/api/properties/:id", authenticateAdmin, handleUpdateProperty);
app.post("/api/properties/bulk-action", authenticateAdmin, async (req, res) => {
  try {
    if (req.admin?.role === "viewer") {
      return res.status(403).json({ error: "T\xE0i kho\u1EA3n Ng\u01B0\u1EDDi xem kh\xF4ng c\xF3 quy\u1EC1n th\u1EF1c hi\u1EC7n thao t\xE1c h\xE0ng lo\u1EA1t." });
    }
    const { action, items, ids, payload } = req.body || {};
    if (action === "delete_many" && Array.isArray(ids) && ids.length > 0) {
      let deletedCount = 0;
      try {
        const supabase = getSupabase();
        const remoteIds = ids.filter((id) => !String(id).startsWith("local-"));
        if (remoteIds.length > 0) {
          const { error } = await supabase.from("chu_nha_can_ban").delete().in("id", remoteIds);
          if (!error) deletedCount += remoteIds.length;
        }
      } catch (_) {
      }
      const localData = readLocalDb();
      const filtered = localData.filter((p) => !ids.includes(p.id));
      if (filtered.length !== localData.length) {
        deletedCount += localData.length - filtered.length;
        writeLocalDb(filtered);
      }
      return res.json({ success: true, deletedCount });
    }
    if (Array.isArray(items) && items.length > 0) {
      let updatedCount = 0;
      let supabase = null;
      try {
        supabase = getSupabase();
      } catch (_) {
      }
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
              updated_at: (/* @__PURE__ */ new Date()).toISOString()
            };
            localChanged = true;
            updatedCount++;
          }
          continue;
        }
        try {
          const { data: exRow } = await supabase.from("chu_nha_can_ban").select("content, status").eq("id", itemId).maybeSingle();
          const c1 = extractCreatorFromContent(exRow?.content || "");
          const c2 = extractMetaFromContent(c1.cleanContent);
          const prevMeta = c2.meta || {};
          const mergedMeta = { ...prevMeta, ...changes };
          const aiKeys = [
            "loai_vi_tri",
            "huong",
            "phap_ly",
            "so_phong_ngu",
            "so_wc",
            "so_nha",
            "ten_duong",
            "duong_vao_m",
            "dac_diem",
            "hien_trang"
          ];
          const touchedAiKeys = aiKeys.filter((k) => k in changes);
          if (touchedAiKeys.length > 0 && !changes._fromAiExtraction) {
            const prevManual = Array.isArray(prevMeta.ai_manual_fields) ? prevMeta.ai_manual_fields : [];
            mergedMeta.ai_manual_fields = Array.from(/* @__PURE__ */ new Set([...prevManual, ...touchedAiKeys]));
            const nextEv = {
              ...prevMeta.nguon_trich_xuat || {},
              ...changes.nguon_trich_xuat || {}
            };
            for (const tk of touchedAiKeys) {
              nextEv[tk] = {
                gia_tri: changes[tk] ?? null,
                bang_chung: nextEv[tk]?.bang_chung || "\u0110\xE3 ch\u1EC9nh s\u1EEDa / x\xE1c nh\u1EADn th\u1EE7 c\xF4ng",
                tin_cay: "cao",
                da_sua_tay: true,
                da_xac_nhan: true
              };
            }
            mergedMeta.nguon_trich_xuat = nextEv;
          }
          delete mergedMeta._fromAiExtraction;
          const withMeta = embedMetaInContent(c2.cleanContent, mergedMeta);
          const finalContent = embedCreatorInContent(withMeta, c1.creator);
          const rawDbUpdate = {
            ...changes,
            content: finalContent,
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          };
          delete rawDbUpdate._fromAiExtraction;
          if (changes.phuong !== void 0) {
            rawDbUpdate.district = changes.phuong;
          }
          if (changes.ten_duong !== void 0 && changes.duong === void 0) {
            rawDbUpdate.duong = changes.ten_duong || "";
          }
          if (changes.so_nha !== void 0 || changes.duong !== void 0 || changes.ten_duong !== void 0) {
            const sn = changes.so_nha !== void 0 ? String(changes.so_nha || "").trim() : "";
            const dg = changes.ten_duong !== void 0 ? String(changes.ten_duong || "").trim() : changes.duong !== void 0 ? String(changes.duong || "").trim() : "";
            const combinedAddr = [sn, dg].filter(Boolean).join(" ").trim();
            if (combinedAddr && !rawDbUpdate.dia_chi) {
              rawDbUpdate.dia_chi = combinedAddr;
            }
          }
          if (changes.trang_thai_kinh_doanh !== void 0) {
            if (changes.trang_thai_kinh_doanh === "da_ban") rawDbUpdate.status = "da_ban";
            else if (changes.trang_thai_kinh_doanh === "da_ky") rawDbUpdate.status = "da_ky";
            else rawDbUpdate.status = "moi";
          }
          const dbUpdate = sanitizeChuNhaDbPayload(rawDbUpdate);
          let { error: upErr } = await supabase.from("chu_nha_can_ban").update(dbUpdate).eq("id", itemId);
          for (let retry = 0; retry < 15 && upErr; retry++) {
            const errMsg = String(upErr.message || "") + " " + String(upErr.details || "");
            const colMatch1 = errMsg.match(/Could not find the '([^']+)' column/i);
            const colMatch2 = errMsg.match(/column "([^"]+)" of relation "chu_nha_can_ban" does not exist/i);
            const missingCol = colMatch1?.[1] || colMatch2?.[1];
            if (missingCol && missingCol in dbUpdate && missingCol !== "content") {
              unsupportedColumnsCache.add(missingCol);
              delete dbUpdate[missingCol];
              const retryRes = await supabase.from("chu_nha_can_ban").update(dbUpdate).eq("id", itemId);
              upErr = retryRes.error;
            } else {
              break;
            }
          }
          if (upErr && (upErr.code === "42703" || String(upErr.message || "").includes("column"))) {
            const fallbackUpdate = {
              content: finalContent,
              updated_at: dbUpdate.updated_at
            };
            if (dbUpdate.district !== void 0) fallbackUpdate.district = dbUpdate.district;
            if (dbUpdate.status !== void 0) fallbackUpdate.status = dbUpdate.status;
            if (dbUpdate.name !== void 0) fallbackUpdate.name = dbUpdate.name;
            const fbRes = await supabase.from("chu_nha_can_ban").update(fallbackUpdate).eq("id", itemId);
            upErr = fbRes.error;
          }
          if (!upErr) updatedCount++;
        } catch (_) {
        }
      }
      if (localChanged) {
        writeLocalDb(localData);
      }
      if (payload?.exportLog) {
        const logs = readExportLogs();
        const newLog = {
          id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ...payload.exportLog,
          exported_by: req.admin?.full_name || req.admin?.email || "Admin",
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        logs.unshift(newLog);
        writeExportLogs(logs);
      }
      return res.json({ success: true, updatedCount });
    }
    return res.status(400).json({ error: "Y\xEAu c\u1EA7u thao t\xE1c h\xE0ng lo\u1EA1t kh\xF4ng h\u1EE3p l\u1EC7." });
  } catch (err) {
    return res.status(500).json({ error: err.message || "L\u1ED7i th\u1EF1c thi thao t\xE1c h\xE0ng lo\u1EA1t." });
  }
});
var AI_FIELD_KEYS = [
  "loai_vi_tri",
  "huong",
  "phap_ly",
  "so_phong_ngu",
  "so_wc",
  "so_nha",
  "ten_duong",
  "duong_vao_m",
  "dac_diem",
  "hien_trang"
];
function stripBrokerAndInternalNotesFromSnippet(raw) {
  if (!raw) return "";
  let s = String(raw);
  s = s.replace(/https?:\/\/[^\s,;)]+/gi, "");
  s = s.replace(/\b(?:fb\.com|facebook\.com|maps\.app\.goo\.gl|goo\.gl\/maps)\/[^\s,;)]+/gi, "");
  s = s.replace(/(?:\+84|0)(?:[\s.-]*[0-9]){8,10}\b/g, "");
  s = s.replace(
    /[^.\n;]*(?:\bbáo\s*trước\s*[0-9]+\s*phút|\bACE\s*dẫn\s*khách|\bdẫn\s*khách\s*liên\s*hệ|\bchuyên\s*viên\s*nguồn|\bsđt\s*chuyên\s*viên|\bhoa\s*hồng|\bhợp\s*tác\s*ACE|\bgửi\s*định\s*vị|\bkhông\s*tự\s*ý\s*đi\s*xem)[^.\n;]*/gi,
    ""
  );
  return s.replace(/\s{2,}/g, " ").replace(/^[\s,;.-]+|[\s,;.-]+$/g, "").trim();
}
function cleanContentForAiInput(rawContent, rawDiaChi, rawName) {
  const { cleanContent: c1 } = extractCreatorFromContent(rawContent || "");
  const { cleanContent: c2 } = extractMetaFromContent(c1);
  const lines = c2.split(/\r?\n/);
  const filteredLines = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^(?:[-•*]\s*)?(?:Chuyên\s*viên\s*nguồn|SĐT(?:\s*chuyên\s*viên)?|Môi\s*giới(?:\s*nguồn)?|Dẫn\s*khách\s*liên\s*hệ|Liên\s*hệ|LH|Zalo|Hoa\s*hồng|HH|Link\s*(?:Facebook|FB|bài\s*viết|Google\s*Maps|tọa\s*độ)|Tọa\s*độ|Vị\s*trí\s*Google\s*Maps|Ngày\s*lấy(?:\s*nguồn)?|Mã\s*nguồn\s*hàng)\s*:/i.test(
      trimmed
    )) {
      continue;
    }
    if (/^https?:\/\/\S+$/i.test(trimmed)) {
      continue;
    }
    let cleanedLine = trimmed.replace(/https?:\/\/[^\s,;)]+/gi, "").replace(/(?:\+84|0)(?:[\s.-]*[0-9]){8,10}\b/g, "").replace(
      /(?:[,;.-]?\s*)(?:vui\s*lòng\s*)?(?:báo\s*trước\s*[0-9]+\s*(?:phút|p|tiếng|giờ)|ACE\s*dẫn\s*khách[^.\n]*|dẫn\s*khách\s*báo\s*trước[^.\n]*|liên\s*hệ\s*trực\s*tiếp[^.\n]*)/gi,
      ""
    ).trim();
    if (cleanedLine) {
      filteredLines.push(cleanedLine);
    }
  }
  const headerParts = [];
  if (rawName && rawName.trim()) {
    headerParts.push(`Ti\xEAu \u0111\u1EC1 / T\xEAn ngu\u1ED3n: ${stripBrokerAndInternalNotesFromSnippet(rawName)}`);
  }
  if (rawDiaChi && rawDiaChi.trim()) {
    headerParts.push(`\u0110\u1ECBa ch\u1EC9 g\u1ED1c: ${stripBrokerAndInternalNotesFromSnippet(rawDiaChi)}`);
  }
  return [...headerParts, ...filteredLines].join("\n").trim();
}
function sanitizeTenDuongServer(raw, phuong) {
  if (!raw) return null;
  let s = stripBrokerAndInternalNotesFromSnippet(String(raw));
  if (!s) return null;
  if (phuong && phuong.trim()) {
    const escapedPhuong = phuong.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(`\\s*,?\\s*(?:ph\u01B0\u1EDDng\\s+)?${escapedPhuong}\\s*$`, "i"), "").trim();
  }
  s = s.replace(/\s*,\s*(?:phường|quận|tp\.?\s*thủ\s*đức|thủ\s*đức|dĩ\s*an|thuận\s*an)[^,]*$/i, "").trim();
  s = s.replace(/\bthửa(?:\s*đất)?(?:\s*số)?[\s.:_-]*[0-9A-Za-z/-]+[;,\s]*/gi, " ").replace(/\btờ(?:\s*bản\s*đồ)?(?:\s*số)?[\s.:_-]*[0-9A-Za-z/-]+[;,\s]*/gi, " ").replace(/(?:^|[;,\s]+)số\s+[0-9]{3,6}\s*[;,]\s*/gi, " ").replace(/\((?:lô|thửa|tờ|kế|cạnh|gần|đối\s*diện)[^)]*\)/gi, " ").replace(/\b(?:kế\s*nhà|cạnh\s*nhà|đối\s*diện(?:\s*nhà)?|sát\s*nhà|gần\s*nhà)\s+[0-9A-Za-z./-]+\b/gi, " ").trim();
  s = s.replace(/^(?:hẻm|ngõ|kiệt|số\s*nhà)\s+[0-9A-Za-z./-]+\s+/i, "").trim();
  const leadingHouseNum = s.match(/^([0-9]+[A-Za-z0-9./-]*)\s+(.+)$/);
  if (leadingHouseNum && !/^(?:đường\s*số|số)\s+[0-9]+$/i.test(s)) {
    const rest = leadingHouseNum[2].trim();
    if (rest && !/^[0-9]+$/.test(rest)) {
      s = rest;
    }
  }
  s = s.replace(/^đường\s+/i, "").trim();
  if (/^số\s+[0-9A-Za-z]+$/i.test(s)) {
    s = s.replace(/^số\s+/i, "S\u1ED1 ");
  }
  s = s.replace(/^[\s.,;/-]+|[\s.,;/-]+$/g, "").replace(/\s{2,}/g, " ").trim();
  return s || null;
}
function sanitizeSoNhaServer(raw) {
  if (!raw) return null;
  let s = stripBrokerAndInternalNotesFromSnippet(String(raw));
  if (!s) return null;
  if (/\b(thửa|tờ|bản\s*đồ|kế\s*nhà|cạnh\s*nhà|đối\s*diện|sát\s*nhà|gần\s*nhà|chưa\s*có|không\s*có|null)\b/i.test(
    s
  )) {
    return null;
  }
  s = s.replace(/^(?:số\s*nhà|số|hẻm|ngõ|kiệt)\s+/i, "").replace(/\./g, "/").trim();
  if (!s || s.length > 25 || !/[0-9]/.test(s)) return null;
  return s;
}
function normalizeHuongServer(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const upper = s.toUpperCase().replace(/\s+/g, " ").trim();
  const map = {
    "\u0110\xD4NG": "\u0110\xF4ng",
    "DONG": "\u0110\xF4ng",
    "T\xC2Y": "T\xE2y",
    "TAY": "T\xE2y",
    "NAM": "Nam",
    "B\u1EAEC": "B\u1EAFc",
    "BAC": "B\u1EAFc",
    "\u0110\xD4NG NAM": "\u0110\xF4ng Nam",
    "DONG NAM": "\u0110\xF4ng Nam",
    "\u0110N": "\u0110\xF4ng Nam",
    "DN": "\u0110\xF4ng Nam",
    "\u0110\xD4NG B\u1EAEC": "\u0110\xF4ng B\u1EAFc",
    "DONG BAC": "\u0110\xF4ng B\u1EAFc",
    "\u0110B": "\u0110\xF4ng B\u1EAFc",
    "DB": "\u0110\xF4ng B\u1EAFc",
    "T\xC2Y NAM": "T\xE2y Nam",
    "TAY NAM": "T\xE2y Nam",
    "TN": "T\xE2y Nam",
    "T\xC2Y B\u1EAEC": "T\xE2y B\u1EAFc",
    "TAY BAC": "T\xE2y B\u1EAFc",
    "TB": "T\xE2y B\u1EAFc"
  };
  if (map[upper]) return map[upper];
  for (const [k, v] of Object.entries(map)) {
    if (k.length > 2 && upper.includes(k)) return v;
  }
  return null;
}
function normalizePhapLyServer(raw, fullText) {
  if (!raw) return null;
  let s = stripBrokerAndInternalNotesFromSnippet(String(raw));
  if (!s || /^(?:null|không\s*rõ|chưa\s*rõ|không\s*có)$/i.test(s)) return null;
  const textHasHoanCong = /\bhoàn\s*công\b/i.test(fullText);
  if (!textHasHoanCong && /\bhoàn\s*công\b/i.test(s)) {
    s = s.replace(/,\s*hoàn\s*công/gi, "").replace(/\bđã\s*hoàn\s*công\b/gi, "").replace(/\bhoàn\s*công\b/gi, "").replace(/\s{2,}/g, " ").replace(/^[\s,;-]+|[\s,;-]+$/g, "").trim();
  }
  return s || null;
}
function normalizeLoaiViTriServer(raw, evidence) {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  const ev = String(evidence || "").toLowerCase();
  if (s === "mat_tien") {
    if (/(?:cách|gần|sát|ra)\s+mặt\s*tiền/i.test(ev) && !/^(?:nhà\s+|đất\s+)?mặt\s*tiền\b/i.test(ev)) {
      return null;
    }
    return "mat_tien";
  }
  if (s === "hem_xe_hoi") return "hem_xe_hoi";
  if (s === "hem_xe_may") return "hem_xe_may";
  if (s === "hem") return "hem";
  return null;
}
var AI_BATCH_EXTRACTION_SCHEMA = {
  type: Type.ARRAY,
  description: "Danh s\xE1ch k\u1EBFt qu\u1EA3 b\xF3c t\xE1ch cho t\u1EEBng tin b\u1EA5t \u0111\u1ED9ng s\u1EA3n theo id",
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING, description: "ID c\u1EE7a b\u1EA3n ghi" },
      loai_vi_tri: {
        type: Type.OBJECT,
        properties: {
          gia_tri: {
            type: Type.STRING,
            nullable: true,
            description: "M\u1ED9t trong 4 m\xE3: 'mat_tien', 'hem_xe_hoi', 'hem_xe_may', 'hem' ho\u1EB7c null n\u1EBFu m\u01A1 h\u1ED3/kh\xF4ng c\xF3"
          },
          bang_chung: {
            type: Type.STRING,
            description: "Tr\xEDch d\u1EABn nguy\xEAn v\u0103n \u0111o\u1EA1n ng\u1EAFn trong v\u0103n b\u1EA3n l\xE0m b\u1EB1ng ch\u1EE9ng (r\u1ED7ng n\u1EBFu kh\xF4ng c\xF3)"
          },
          tin_cay: { type: Type.STRING, description: "'cao' ho\u1EB7c 'thap'" }
        },
        required: ["gia_tri", "bang_chung", "tin_cay"]
      },
      huong: {
        type: Type.OBJECT,
        properties: {
          gia_tri: {
            type: Type.STRING,
            nullable: true,
            description: "M\u1ED9t trong: '\u0110\xF4ng', 'T\xE2y', 'Nam', 'B\u1EAFc', '\u0110\xF4ng Nam', '\u0110\xF4ng B\u1EAFc', 'T\xE2y Nam', 'T\xE2y B\u1EAFc' ho\u1EB7c null"
          },
          bang_chung: { type: Type.STRING },
          tin_cay: { type: Type.STRING }
        },
        required: ["gia_tri", "bang_chung", "tin_cay"]
      },
      phap_ly: {
        type: Type.OBJECT,
        properties: {
          gia_tri: {
            type: Type.STRING,
            nullable: true,
            description: "Chu\u1EA9n h\xF3a: 'S\u1ED5 h\u1ED3ng ri\xEAng' | 'S\u1ED5 h\u1ED3ng ri\xEAng, ho\xE0n c\xF4ng' | 'S\u1ED5 chung' | 'S\u1ED5 \u0111\u1ECF' | 'Gi\u1EA5y t\u1EDD tay (vi b\u1EB1ng)' | kh\xE1c + t\xECnh tr\u1EA1ng \u0111\u1EB7c bi\u1EC7t ng\u1EAFn trong ngo\u1EB7c n\u1EBFu c\xF3, ho\u1EB7c null"
          },
          bang_chung: { type: Type.STRING },
          tin_cay: { type: Type.STRING }
        },
        required: ["gia_tri", "bang_chung", "tin_cay"]
      },
      so_phong_ngu: {
        type: Type.OBJECT,
        properties: {
          gia_tri: {
            type: Type.INTEGER,
            nullable: true,
            description: "S\u1ED1 nguy\xEAn d\u01B0\u01A1ng khi v\u0103n b\u1EA3n ghi r\xF5 s\u1ED1 ph\xF2ng ng\u1EE7, kh\xF4ng c\xF3 th\xEC null (kh\xF4ng \u0111i\u1EC1n 0)"
          },
          bang_chung: { type: Type.STRING },
          tin_cay: { type: Type.STRING }
        },
        required: ["gia_tri", "bang_chung", "tin_cay"]
      },
      so_wc: {
        type: Type.OBJECT,
        properties: {
          gia_tri: {
            type: Type.INTEGER,
            nullable: true,
            description: "S\u1ED1 nguy\xEAn d\u01B0\u01A1ng khi v\u0103n b\u1EA3n ghi r\xF5 s\u1ED1 WC/toilet/nh\xE0 v\u1EC7 sinh, kh\xF4ng c\xF3 th\xEC null"
          },
          bang_chung: { type: Type.STRING },
          tin_cay: { type: Type.STRING }
        },
        required: ["gia_tri", "bang_chung", "tin_cay"]
      },
      so_nha: {
        type: Type.OBJECT,
        properties: {
          gia_tri: {
            type: Type.STRING,
            nullable: true,
            description: "S\u1ED1 nh\xE0 t\xE1ch t\u1EEB \u0111\u1ECBa ch\u1EC9/ti\xEAu \u0111\u1EC1 (VD '17/21', '228'). N\u1EBFu ch\u1EC9 c\xF3 Th\u1EEDa/T\u1EDD ho\u1EB7c ghi ch\xFA 'k\u1EBF nh\xE0 228...' th\xEC \u0111\u1EC3 null"
          },
          bang_chung: { type: Type.STRING },
          tin_cay: { type: Type.STRING }
        },
        required: ["gia_tri", "bang_chung", "tin_cay"]
      },
      ten_duong: {
        type: Type.OBJECT,
        properties: {
          gia_tri: {
            type: Type.STRING,
            nullable: true,
            description: "T\xEAn \u0111\u01B0\u1EDDng s\u1EA1ch: KH\xD4NG c\xF3 ch\u1EEF '\u0110\u01B0\u1EDDng' d\u01B0 \u1EDF \u0111\u1EA7u, KH\xD4NG ch\u1EE9a s\u1ED1 nh\xE0, th\u1EEDa, t\u1EDD, ph\u01B0\u1EDDng hay ghi ch\xFA v\u1ECB tr\xED ('k\u1EBF nh\xE0 228...')"
          },
          bang_chung: { type: Type.STRING },
          tin_cay: { type: Type.STRING }
        },
        required: ["gia_tri", "bang_chung", "tin_cay"]
      },
      duong_vao_m: {
        type: Type.OBJECT,
        properties: {
          gia_tri: {
            type: Type.NUMBER,
            nullable: true,
            description: "S\u1ED1 m\xE9t \u0111\u1ED9 r\u1ED9ng \u0111\u01B0\u1EDDng/h\u1EBBm tr\u01B0\u1EDBc nh\xE0 ho\u1EB7c \u0111\u01B0\u1EDDng v\xE0o (VD: 5, 4.5). Kh\xF4ng c\xF3 th\xEC null"
          },
          bang_chung: { type: Type.STRING },
          tin_cay: { type: Type.STRING }
        },
        required: ["gia_tri", "bang_chung", "tin_cay"]
      },
      dac_diem: {
        type: Type.OBJECT,
        properties: {
          gia_tri: {
            type: Type.ARRAY,
            nullable: true,
            items: { type: Type.STRING },
            description: "M\u1EA3ng c\xE1c c\u1EE5m ng\u1EAFn n\xEAu \u0111\u1EB7c \u0111i\u1EC3m n\u1ED5i b\u1EADt c\xF3 trong b\xE0i (VD: ['l\xF4 g\xF3c', 'view s\xF4ng', 'thang m\xE1y', 'g\u1EA7n tr\u01B0\u1EDDng', 'n\u1ED9i th\u1EA5t cao c\u1EA5p']). Kh\xF4ng c\xF3 th\xEC null"
          },
          bang_chung: { type: Type.STRING },
          tin_cay: { type: Type.STRING }
        },
        required: ["gia_tri", "bang_chung", "tin_cay"]
      },
      hien_trang: {
        type: Type.OBJECT,
        properties: {
          gia_tri: {
            type: Type.STRING,
            nullable: true,
            description: "Hi\u1EC7n tr\u1EA1ng t\xE0i s\u1EA3n ng\u1EAFn g\u1ECDn n\u1EBFu c\xF3 trong b\xE0i (VD: 'Nh\xE0 m\u1EDBi \u1EDF ngay', '\u0110ang cho thu\xEA 8 tri\u1EC7u/th\xE1ng', 'Nh\xE0 c\u0169 ti\u1EC7n x\xE2y m\u1EDBi', '\u0110\u1EA5t tr\u1ED1ng'). Kh\xF4ng c\xF3 th\xEC null"
          },
          bang_chung: { type: Type.STRING },
          tin_cay: { type: Type.STRING }
        },
        required: ["gia_tri", "bang_chung", "tin_cay"]
      }
    },
    required: [
      "id",
      "loai_vi_tri",
      "huong",
      "phap_ly",
      "so_phong_ngu",
      "so_wc",
      "so_nha",
      "ten_duong",
      "duong_vao_m",
      "dac_diem",
      "hien_trang"
    ]
  }
};
var AI_SYSTEM_INSTRUCTION = `B\u1EA1n l\xE0 h\u1EC7 th\u1ED1ng b\xF3c t\xE1ch d\u1EEF li\u1EC7u b\u1EA5t \u0111\u1ED9ng s\u1EA3n ch\xEDnh x\xE1c tuy\u1EC7t \u0111\u1ED1i cho b\u1EA3ng nguonnha.
QUY T\u1EAEC T\u1ED0I TH\u01AF\u1EE2NG:
- CH\u1EC8 d\xF9ng th\xF4ng tin C\xD3 TRONG V\u0102N B\u1EA2N \u0111\u01B0\u1EE3c cung c\u1EA5p.
- Th\xF4ng tin KH\xD4NG C\xD3 trong v\u0103n b\u1EA3n th\xEC b\u1EAFt bu\u1ED9c \u0111\u1EC3 gia_tri = null, tin_cay = "thap", bang_chung = "". TUY\u1EC6T \u0110\u1ED0I KH\xD4NG \u0110O\xC1N, KH\xD4NG \u0110I\u1EC0N M\u1EB6C \u0110\u1ECANH.
- TUY\u1EC6T \u0110\u1ED0I B\u1ECE QUA t\xEAn v\xE0 s\u1ED1 \u0111i\u1EC7n tho\u1EA1i m\xF4i gi\u1EDBi/ch\u1EE7 nh\xE0, link (Facebook, Google Maps), hoa h\u1ED3ng, v\xE0 ghi ch\xFA n\u1ED9i b\u1ED9 ("b\xE1o tr\u01B0\u1EDBc 60 ph\xFAt", "ACE d\u1EABn kh\xE1ch", "g\u1EEDi \u0111\u1ECBnh v\u1ECB"...). Kh\xF4ng \u0111\u01B0a ch\xFAng v\xE0o b\u1EA5t k\u1EF3 tr\u01B0\u1EDDng n\xE0o hay \u0111o\u1EA1n b\u1EB1ng ch\u1EE9ng n\xE0o.

QUY T\u1EAEC CHI TI\u1EBET CHO 10 TR\u01AF\u1EDCNG:
1. loai_vi_tri: m\u1ED9t trong 4 m\xE3 ho\u1EB7c null:
   - "mat_tien": v\u0103n b\u1EA3n n\xF3i r\xF5 nh\xE0/\u0111\u1EA5t l\xE0 "m\u1EB7t ti\u1EC1n" c\u1EE7a ch\xEDnh t\xE0i s\u1EA3n (VD: "Nh\xE0 m\u1EB7t ti\u1EC1n \u0111\u01B0\u1EDDng L\xF2 Lu", "\u0110\u1EA5t m\u1EB7t ti\u1EC1n \u0111\u01B0\u1EDDng s\u1ED1 6"). KH\xD4NG t\xEDnh "c\xE1ch m\u1EB7t ti\u1EC1n X v\xE0i b\u01B0\u1EDBc", "c\xE1ch MT 30m", "g\u1EA7n m\u1EB7t ti\u1EC1n", "s\xE1t m\u1EB7t ti\u1EC1n" l\xE0 mat_tien!
   - "hem_xe_hoi": n\xF3i r\xF5 h\u1EBBm xe h\u01A1i / h\u1EBBm \xF4 t\xF4 / \xF4 t\xF4 v\xE0o t\u1EADn nh\xE0 / xe h\u01A1i ng\u1EE7 trong nh\xE0 / \u0111\u01B0\u1EDDng tr\u01B0\u1EDBc nh\xE0 r\u1ED9ng cho xe h\u01A1i v\xE0o.
   - "hem_xe_may": n\xF3i r\xF5 h\u1EBBm xe m\xE1y / h\u1EBBm nh\u1ECF ch\u1EC9 xe m\xE1y / h\u1EBBm ba g\xE1c.
   - "hem": c\xF3 n\xF3i h\u1EBBm/ng\xF5/ki\u1EC7t ho\u1EB7c \u0111\u1ECBa ch\u1EC9 c\xF3 d\u1EA5u x\u1EB9t (/) nh\u01B0ng kh\xF4ng r\xF5 xe h\u01A1i hay xe m\xE1y.
   - M\u01A1 h\u1ED3 ho\u1EB7c kh\xF4ng c\xF3 th\xF4ng tin v\u1ECB tr\xED m\u1EB7t ti\u1EC1n/h\u1EBBm th\xEC \u0111\u1EC3 gia_tri = null v\xE0 tin_cay = "thap".

2. huong: m\u1ED9t trong 8 h\u01B0\u1EDBng chu\u1EA9n: "\u0110\xF4ng", "T\xE2y", "Nam", "B\u1EAFc", "\u0110\xF4ng Nam", "\u0110\xF4ng B\u1EAFc", "T\xE2y Nam", "T\xE2y B\u1EAFc" (quy \u0111\u1ED5i vi\u1EBFt t\u1EAFt: \u0110N = \u0110\xF4ng Nam, \u0110B = \u0110\xF4ng B\u1EAFc, TN = T\xE2y Nam, TB = T\xE2y B\u1EAFc). Kh\xF4ng c\xF3 trong b\xE0i th\xEC gia_tri = null.

3. phap_ly: chu\u1EA9n h\xF3a v\u1EC1 m\u1ED9t trong:
   "S\u1ED5 h\u1ED3ng ri\xEAng" | "S\u1ED5 h\u1ED3ng ri\xEAng, ho\xE0n c\xF4ng" | "S\u1ED5 chung" | "S\u1ED5 \u0111\u1ECF" | "Gi\u1EA5y t\u1EDD tay (vi b\u1EB1ng)" | ho\u1EB7c m\xF4 t\u1EA3 ng\u1EAFn kh\xE1c n\u1EBFu v\u0103n b\u1EA3n ghi kh\xE1c.
   - N\u1EBFu v\u0103n b\u1EA3n c\xF3 t\xECnh tr\u1EA1ng \u0111\u1EB7c bi\u1EC7t (\u0111ang vay ng\xE2n h\xE0ng, ch\u1EE7 t\u1EF1 r\xFAt s\u1ED5, s\u1ED5 g\u1EEDi ng\xE2n h\xE0ng, mua b\xE1n \u1EE7y quy\u1EC1n, c\xF4ng ch\u1EE9ng vi b\u1EB1ng...) th\xEC th\xEAm v\xE0o d\u1EA1ng ng\u1EAFn trong ngo\u1EB7c, v\xED d\u1EE5: "S\u1ED5 h\u1ED3ng ri\xEAng (\u0111ang vay ng\xE2n h\xE0ng)", "S\u1ED5 h\u1ED3ng ri\xEAng, ho\xE0n c\xF4ng (s\u1ED5 g\u1EEDi ng\xE2n h\xE0ng)".
   - CH\u1EC8 ghi "ho\xE0n c\xF4ng" khi v\u0103n b\u1EA3n th\u1EF1c s\u1EF1 c\xF3 ch\u1EEF "ho\xE0n c\xF4ng".
   - Kh\xF4ng c\xF3 th\xF4ng tin s\u1ED5/ph\xE1p l\xFD trong b\xE0i th\xEC \u0111\u1EC3 gia_tri = null, KH\xD4NG m\u1EB7c \u0111\u1ECBnh.

4. so_phong_ngu, so_wc: s\u1ED1 nguy\xEAn d\u01B0\u01A1ng, CH\u1EC8 khi v\u0103n b\u1EA3n ghi r\xF5 (VD: "3PN", "3 WC", "4 ph\xF2ng ng\u1EE7", "2 toilet"). Kh\xF4ng c\xF3 th\xEC \u0111\u1EC3 null (TUY\u1EC6T \u0110\u1ED0I kh\xF4ng \u0111i\u1EC1n 0).

5. so_nha v\xE0 ten_duong: t\xE1ch t\u1EEB \u0111\u1ECBa ch\u1EC9 / ti\xEAu \u0111\u1EC1 / n\u1ED9i dung:
   - ten_duong: KH\xD4NG c\xF3 ch\u1EEF "\u0110\u01B0\u1EDDng" d\u01B0 \u1EDF \u0111\u1EA7u (VD: "\u0110\u01B0\u1EDDng L\xF2 Lu" -> "L\xF2 Lu", "\u0110\u01B0\u1EDDng s\u1ED1 4" -> "S\u1ED1 4"). KH\xD4NG ch\u1EE9a s\u1ED1 nh\xE0, s\u1ED1 th\u1EEDa, s\u1ED1 t\u1EDD b\u1EA3n \u0111\u1ED3, t\xEAn ph\u01B0\u1EDDng, hay ghi ch\xFA v\u1ECB tr\xED ("k\u1EBF nh\xE0 228...", "c\u1EA1nh nh\xE0...").
   - so_nha: ch\u1EC9 l\u1EA5y s\u1ED1 nh\xE0 th\u1EADt c\u1EE7a t\xE0i s\u1EA3n (VD: "17/21", "96/24"). N\u1EBFu v\u0103n b\u1EA3n ch\u1EC9 ghi "Th\u1EEDa 669, T\u1EDD 41" ho\u1EB7c ghi ch\xFA "K\u1EBF nh\xE0 228 L\xF2 Lu" th\xEC so_nha ph\u1EA3i l\xE0 null.

6. duong_vao_m: s\u1ED1 m\xE9t \u0111\u01B0\u1EDDng/h\u1EBBm tr\u01B0\u1EDBc nh\xE0 ho\u1EB7c \u0111\u01B0\u1EDDng v\xE0o n\u1EBFu b\xE0i c\xF3 n\xEAu (VD: "\u0111\u01B0\u1EDDng tr\u01B0\u1EDBc nh\xE0 5m" -> 5, "h\u1EBBm 3.5m" -> 3.5). Kh\xF4ng c\xF3 th\xEC null.
7. dac_diem: m\u1EA3ng ng\u1EAFn c\xE1c \u0111i\u1EC3m n\u1ED5i b\u1EADt th\u1EF1c s\u1EF1 c\u1EE7a b\u1EA5t \u0111\u1ED9ng s\u1EA3n c\xF3 trong b\xE0i (VD: ["l\xF4 g\xF3c", "view s\xF4ng", "thang m\xE1y", "g\u1EA7n tr\u01B0\u1EDDng", "s\xE2n \xF4 t\xF4", "t\u1EB7ng n\u1ED9i th\u1EA5t"]). Kh\xF4ng c\xF3 th\xEC null.
8. hien_trang: m\xF4 t\u1EA3 ng\u1EAFn hi\u1EC7n tr\u1EA1ng nh\xE0/\u0111\u1EA5t v\xE0 d\xF2ng ti\u1EC1n thu\xEA n\u1EBFu c\xF3 trong b\xE0i (VD: "Nh\xE0 m\u1EDBi \u0111\u1EB9p \u1EDF ngay", "\u0110ang cho thu\xEA 10 tri\u1EC7u/th\xE1ng", "\u0110\u1EA5t tr\u1ED1ng", "Nh\xE0 c\u1EA5p 4 c\u0169"). Kh\xF4ng c\xF3 th\xEC null.

V\u1EDBi m\u1ED7i tr\u01B0\u1EDDng, lu\xF4n tr\u1EA3 v\u1EC1:
- gia_tri: gi\xE1 tr\u1ECB \u0111\xE3 chu\u1EA9n h\xF3a ho\u1EB7c null
- bang_chung: \u0111o\u1EA1n v\u0103n g\u1ED1c ng\u1EAFn g\u1ECDn tr\xEDch nguy\xEAn v\u0103n t\u1EEB b\xE0i l\xE0m b\u1EB1ng ch\u1EE9ng (ho\u1EB7c "" n\u1EBFu gia_tri l\xE0 null)
- tin_cay: "cao" n\u1EBFu v\u0103n b\u1EA3n ghi r\xF5 r\xE0ng, "thap" n\u1EBFu m\u01A1 h\u1ED3 ho\u1EB7c gia_tri l\xE0 null.`;
async function callGeminiExtractChunk(ai, chunkItems) {
  const modelsToTry = [
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite-preview",
    "gemini-2.5-flash"
  ];
  const promptText = `H\xE3y b\xF3c t\xE1ch ch\xEDnh x\xE1c d\u1EEF li\u1EC7u t\u1EEB v\u0103n b\u1EA3n g\u1ED1c c\u1EE7a ${chunkItems.length} tin b\u1EA5t \u0111\u1ED9ng s\u1EA3n d\u01B0\u1EDBi \u0111\xE2y theo \u0111\xFAng quy t\u1EAFc:

${JSON.stringify(
    chunkItems,
    null,
    2
  )}`;
  let lastErr = null;
  for (const modelName of modelsToTry) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: promptText,
          config: {
            systemInstruction: AI_SYSTEM_INSTRUCTION,
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: AI_BATCH_EXTRACTION_SCHEMA
          }
        });
        const rawJson = response.text || "[]";
        const parsed = JSON.parse(rawJson);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  throw lastErr || new Error("Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i t\u1EDBi Gemini API sau nhi\u1EC1u l\u1EA7n th\u1EED.");
}
app.post("/api/properties/ai-extract", authenticateAdmin, async (req, res) => {
  try {
    if (req.admin?.role === "viewer") {
      return res.status(403).json({ error: "T\xE0i kho\u1EA3n Ng\u01B0\u1EDDi xem kh\xF4ng c\xF3 quy\u1EC1n ch\u1EA1y b\xF3c t\xE1ch AI." });
    }
    const apiKey = cleanEnvVar(process.env.GEMINI_API_KEY) || cleanEnvVar(process.env.API_KEY);
    if (!apiKey) {
      return res.status(500).json({
        error: "Ch\u01B0a c\u1EA5u h\xECnh GEMINI_API_KEY tr\xEAn m\xE1y ch\u1EE7."
      });
    }
    const rawRecords = Array.isArray(req.body?.records) ? req.body.records : [];
    if (rawRecords.length === 0) {
      return res.status(400).json({ error: "Danh s\xE1ch b\u1EA3n ghi c\u1EA7n b\xF3c t\xE1ch \u0111ang tr\u1ED1ng." });
    }
    const batchRecords = rawRecords.slice(0, 20);
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } }
    });
    let supabase = null;
    try {
      supabase = getSupabase();
    } catch (_) {
    }
    const remoteIds = batchRecords.map((r) => String(r.id)).filter((id) => id && !id.startsWith("local-"));
    const dbRowMap = {};
    if (supabase && remoteIds.length > 0) {
      try {
        const { data: rows } = await supabase.from("chu_nha_can_ban").select("*").in("id", remoteIds);
        if (Array.isArray(rows)) {
          for (const r of rows) {
            if (r?.id) dbRowMap[String(r.id)] = r;
          }
        }
      } catch (_) {
      }
    }
    const localData = readLocalDb();
    for (const r of localData) {
      if (r?.id && !dbRowMap[String(r.id)]) {
        dbRowMap[String(r.id)] = r;
      }
    }
    const preparedItems = [];
    for (const item of batchRecords) {
      const id = String(item.id || "").trim();
      if (!id) continue;
      const dbRow = dbRowMap[id] || {};
      const fullStoredContent = dbRow.content || item.content || "";
      const c1 = extractCreatorFromContent(fullStoredContent);
      const c2 = extractMetaFromContent(c1.cleanContent);
      const existingMeta = c2.meta || {};
      const phuong = String(
        item.phuong || dbRow.phuong || existingMeta.phuong || dbRow.district || ""
      ).trim();
      const rawDiaChi = String(
        item.dia_chi || dbRow.dia_chi || existingMeta.dia_chi || ""
      ).trim();
      const rawName = String(item.name || dbRow.name || "").trim();
      const manualFieldSet = /* @__PURE__ */ new Set();
      if (Array.isArray(existingMeta.ai_manual_fields)) {
        existingMeta.ai_manual_fields.forEach((f) => manualFieldSet.add(f));
      }
      if (Array.isArray(item.ai_manual_fields)) {
        item.ai_manual_fields.forEach((f) => manualFieldSet.add(f));
      }
      if (existingMeta.nguon_trich_xuat && typeof existingMeta.nguon_trich_xuat === "object") {
        for (const [k, ev] of Object.entries(existingMeta.nguon_trich_xuat)) {
          if (ev?.da_sua_tay) manualFieldSet.add(k);
        }
      }
      const cleanedText = cleanContentForAiInput(
        c2.cleanContent || item.content || "",
        rawDiaChi,
        rawName
      );
      preparedItems.push({
        id,
        text: cleanedText,
        existingRow: dbRow,
        existingCreator: c1.creator,
        existingCleanContent: c2.cleanContent || item.content || "",
        existingMeta,
        phuong,
        manualFieldSet
      });
    }
    const SUB_CHUNK_SIZE = 5;
    const subChunks = [];
    for (let i = 0; i < preparedItems.length; i += SUB_CHUNK_SIZE) {
      subChunks.push(preparedItems.slice(i, i + SUB_CHUNK_SIZE));
    }
    const aiResultMap = {};
    const chunkErrors = [];
    await Promise.all(
      subChunks.map(async (chunk) => {
        try {
          const payloadForAi = chunk.map((c) => ({ id: c.id, text: c.text }));
          const extractedList = await callGeminiExtractChunk(ai, payloadForAi);
          for (const ext of extractedList) {
            if (ext && ext.id) {
              aiResultMap[String(ext.id)] = ext;
            }
          }
        } catch (err) {
          chunkErrors.push({
            ids: chunk.map((c) => c.id),
            error: err?.message || "L\u1ED7i g\u1ECDi AI b\xF3c t\xE1ch"
          });
        }
      })
    );
    const updatedResults = [];
    let localChanged = false;
    for (const prep of preparedItems) {
      const {
        id,
        text,
        existingRow,
        existingCreator,
        existingCleanContent,
        existingMeta,
        phuong,
        manualFieldSet
      } = prep;
      const aiRaw = aiResultMap[id];
      if (!aiRaw) {
        const errEntry = chunkErrors.find((ce) => ce.ids.includes(id));
        updatedResults.push({
          id,
          success: false,
          error: errEntry?.error || "AI kh\xF4ng tr\u1EA3 v\u1EC1 d\u1EEF li\u1EC7u cho tin n\xE0y."
        });
        continue;
      }
      const buildEv = (rawObj, normalizedVal, forceLowIfNull = true) => {
        const cleanEvidence = stripBrokerAndInternalNotesFromSnippet(rawObj?.bang_chung || "");
        const isNull = normalizedVal === null || normalizedVal === void 0 || normalizedVal === "" || Array.isArray(normalizedVal) && normalizedVal.length === 0;
        const rawConf = String(rawObj?.tin_cay || "").toLowerCase() === "cao" ? "cao" : "thap";
        return {
          gia_tri: isNull ? null : normalizedVal,
          bang_chung: isNull ? cleanEvidence : cleanEvidence,
          tin_cay: isNull && forceLowIfNull ? "thap" : rawConf
        };
      };
      const normLoaiViTri = normalizeLoaiViTriServer(
        aiRaw.loai_vi_tri?.gia_tri,
        aiRaw.loai_vi_tri?.bang_chung
      );
      const normHuong = normalizeHuongServer(aiRaw.huong?.gia_tri);
      const normPhapLy = normalizePhapLyServer(aiRaw.phap_ly?.gia_tri, text);
      const rawPn = toNumericOrNull(aiRaw.so_phong_ngu?.gia_tri);
      const normPn = rawPn !== null && rawPn >= 1 && rawPn <= 50 ? Math.round(rawPn) : null;
      const rawWc = toNumericOrNull(aiRaw.so_wc?.gia_tri);
      const normWc = rawWc !== null && rawWc >= 1 && rawWc <= 50 ? Math.round(rawWc) : null;
      const normSoNha = sanitizeSoNhaServer(aiRaw.so_nha?.gia_tri);
      const normTenDuong = sanitizeTenDuongServer(aiRaw.ten_duong?.gia_tri, phuong);
      const rawDuongVao = toNumericOrNull(aiRaw.duong_vao_m?.gia_tri);
      const normDuongVao = rawDuongVao !== null && rawDuongVao > 0 && rawDuongVao <= 100 ? Number(rawDuongVao) : null;
      const rawDacDiemArr = Array.isArray(aiRaw.dac_diem?.gia_tri) ? aiRaw.dac_diem.gia_tri : [];
      const normDacDiemClean = rawDacDiemArr.map((d) => stripBrokerAndInternalNotesFromSnippet(String(d || ""))).filter((d) => d.length > 0 && d.length <= 60);
      const normDacDiem = normDacDiemClean.length > 0 ? normDacDiemClean : null;
      const rawHienTrangStr = stripBrokerAndInternalNotesFromSnippet(
        aiRaw.hien_trang?.gia_tri || ""
      );
      const normHienTrang = rawHienTrangStr ? rawHienTrangStr : null;
      const freshEvidenceMap = {
        loai_vi_tri: buildEv(aiRaw.loai_vi_tri, normLoaiViTri),
        huong: buildEv(aiRaw.huong, normHuong),
        phap_ly: buildEv(aiRaw.phap_ly, normPhapLy),
        so_phong_ngu: buildEv(aiRaw.so_phong_ngu, normPn),
        so_wc: buildEv(aiRaw.so_wc, normWc),
        so_nha: buildEv(aiRaw.so_nha, normSoNha),
        ten_duong: buildEv(aiRaw.ten_duong, normTenDuong),
        duong_vao_m: buildEv(aiRaw.duong_vao_m, normDuongVao),
        dac_diem: buildEv(aiRaw.dac_diem, normDacDiem),
        hien_trang: buildEv(aiRaw.hien_trang, normHienTrang)
      };
      const prevEvidenceMap = existingMeta.nguon_trich_xuat && typeof existingMeta.nguon_trich_xuat === "object" ? existingMeta.nguon_trich_xuat : {};
      const finalEvidenceMap = { ...prevEvidenceMap };
      const finalFieldValues = {};
      for (const key of AI_FIELD_KEYS) {
        if (manualFieldSet.has(key)) {
          const preservedVal = existingMeta[key] !== void 0 ? existingMeta[key] : existingRow[key] !== void 0 ? existingRow[key] : prevEvidenceMap[key]?.gia_tri ?? null;
          finalFieldValues[key] = preservedVal;
          finalEvidenceMap[key] = prevEvidenceMap[key] || {
            gia_tri: preservedVal,
            bang_chung: "Gi\u1EEF nguy\xEAn gi\xE1 tr\u1ECB \u0111\xE3 s\u1EEDa tay",
            tin_cay: "cao",
            da_sua_tay: true,
            da_xac_nhan: true
          };
        } else {
          finalFieldValues[key] = freshEvidenceMap[key].gia_tri;
          finalEvidenceMap[key] = freshEvidenceMap[key];
        }
      }
      const prevStatus = existingMeta.trang_thai_xu_ly || existingRow.trang_thai_xu_ly || "tho";
      const isAlreadyExported = prevStatus === "da_len_hometea" || prevStatus === "da_dang_fb" || existingRow.da_len_hometea || existingRow.da_dang_fb;
      const isAlreadyConfirmed = Boolean(existingMeta.da_xac_nhan_ai);
      const nextProcessingStatus = isAlreadyExported ? prevStatus : isAlreadyConfirmed ? "san_sang" : "can_bo_sung";
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const changesToSave = {
        loai_vi_tri: finalFieldValues.loai_vi_tri,
        huong: finalFieldValues.huong,
        phap_ly: finalFieldValues.phap_ly,
        so_phong_ngu: finalFieldValues.so_phong_ngu,
        so_wc: finalFieldValues.so_wc,
        so_nha: finalFieldValues.so_nha,
        ten_duong: finalFieldValues.ten_duong,
        duong: finalFieldValues.ten_duong || "",
        duong_vao_m: finalFieldValues.duong_vao_m,
        dac_diem: finalFieldValues.dac_diem,
        hien_trang: finalFieldValues.hien_trang,
        nguon_trich_xuat: finalEvidenceMap,
        da_boc_tach_ai: true,
        da_xac_nhan_ai: isAlreadyConfirmed,
        ngay_boc_tach_ai: nowIso,
        ai_manual_fields: Array.from(manualFieldSet),
        trang_thai_xu_ly: nextProcessingStatus
      };
      const combinedDiaChi = [
        changesToSave.so_nha ? String(changesToSave.so_nha).trim() : "",
        changesToSave.ten_duong ? String(changesToSave.ten_duong).trim() : ""
      ].filter(Boolean).join(" ").trim();
      if (combinedDiaChi) {
        changesToSave.dia_chi = combinedDiaChi;
      }
      if (id.startsWith("local-") || !supabase) {
        const idx = localData.findIndex((p) => p.id === id);
        if (idx !== -1) {
          localData[idx] = {
            ...localData[idx],
            ...changesToSave,
            updated_at: nowIso
          };
          localChanged = true;
        }
        updatedResults.push({
          id,
          success: true,
          extracted: changesToSave
        });
        continue;
      }
      try {
        const mergedMeta = {
          ...existingMeta,
          ...changesToSave
        };
        const withMeta = embedMetaInContent(existingCleanContent, mergedMeta);
        const finalContent = embedCreatorInContent(withMeta, existingCreator);
        const rawDbUpdate = {
          ...changesToSave,
          content: finalContent,
          updated_at: nowIso
        };
        const dbUpdate = sanitizeChuNhaDbPayload(rawDbUpdate);
        let { error: upErr } = await supabase.from("chu_nha_can_ban").update(dbUpdate).eq("id", id);
        for (let retry = 0; retry < 15 && upErr; retry++) {
          const errMsg = String(upErr.message || "") + " " + String(upErr.details || "");
          const colMatch1 = errMsg.match(/Could not find the '([^']+)' column/i);
          const colMatch2 = errMsg.match(/column "([^"]+)" of relation "chu_nha_can_ban" does not exist/i);
          const missingCol = colMatch1?.[1] || colMatch2?.[1];
          if (missingCol && missingCol in dbUpdate && missingCol !== "content") {
            unsupportedColumnsCache.add(missingCol);
            delete dbUpdate[missingCol];
            const retryRes = await supabase.from("chu_nha_can_ban").update(dbUpdate).eq("id", id);
            upErr = retryRes.error;
          } else {
            break;
          }
        }
        if (upErr && (upErr.code === "42703" || String(upErr.message || "").includes("column"))) {
          const fallbackUpdate = {
            content: finalContent,
            updated_at: nowIso
          };
          const fbRes = await supabase.from("chu_nha_can_ban").update(fallbackUpdate).eq("id", id);
          upErr = fbRes.error;
        }
        if (upErr) {
          updatedResults.push({
            id,
            success: false,
            error: upErr.message || "L\u1ED7i l\u01B0u k\u1EBFt qu\u1EA3 b\xF3c t\xE1ch v\xE0o c\u01A1 s\u1EDF d\u1EEF li\u1EC7u."
          });
        } else {
          updatedResults.push({
            id,
            success: true,
            extracted: changesToSave
          });
        }
      } catch (saveErr) {
        updatedResults.push({
          id,
          success: false,
          error: saveErr?.message || "L\u1ED7i l\u01B0u d\u1EEF li\u1EC7u b\xF3c t\xE1ch."
        });
      }
    }
    if (localChanged) {
      writeLocalDb(localData);
    }
    const successCount = updatedResults.filter((r) => r.success).length;
    const failedCount = updatedResults.length - successCount;
    return res.json({
      success: true,
      totalProcessed: updatedResults.length,
      successCount,
      failedCount,
      results: updatedResults
    });
  } catch (err) {
    return res.status(500).json({
      error: err?.message || "\u0110\xE3 x\u1EA3y ra l\u1ED7i khi b\xF3c t\xE1ch d\u1EEF li\u1EC7u b\u1EB1ng AI."
    });
  }
});
app.get("/api/export-logs", authenticateAdmin, (req, res) => {
  const logs = readExportLogs();
  return res.json({ logs });
});
app.post("/api/export-logs", authenticateAdmin, (req, res) => {
  const logs = readExportLogs();
  const { target, target_label, record_count, ma_tk_list, note } = req.body || {};
  const newEntry = {
    id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    target: target || "v_nguon_xuat_json",
    target_label: target_label || "Xu\u1EA5t d\u1EEF li\u1EC7u chu\u1EA9n",
    record_count: Number(record_count) || 0,
    ma_tk_list: Array.isArray(ma_tk_list) ? ma_tk_list : [],
    exported_by: req.admin?.full_name || req.admin?.email || "Qu\u1EA3n tr\u1ECB vi\xEAn",
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    note: note || ""
  };
  logs.unshift(newEntry);
  writeExportLogs(logs);
  return res.status(201).json({ success: true, log: newEntry, logs });
});
app.get("/api/v-nguon-xuat", authenticateAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: viewData, error: viewErr } = await supabase.from("v_nguon_xuat").select("*");
    if (!viewErr && Array.isArray(viewData)) {
      return res.json({
        source: "supabase_view",
        rows: viewData,
        setupSQL: COMPLETE_SETUP_SQL
      });
    }
    return res.json({
      source: "computed_fallback",
      rows: [],
      viewError: viewErr?.message || null,
      setupSQL: COMPLETE_SETUP_SQL
    });
  } catch (err) {
    return res.json({
      source: "computed_fallback",
      rows: [],
      viewError: err?.message || null,
      setupSQL: COMPLETE_SETUP_SQL
    });
  }
});
app.put("/api/properties/:id/assign-manager", authenticateAdmin, async (req, res) => {
  try {
    if (req.admin?.role === "viewer") {
      return res.status(403).json({ error: "T\xE0i kho\u1EA3n Ng\u01B0\u1EDDi xem kh\xF4ng c\xF3 quy\u1EC1n ph\xE2n c\xF4ng ng\u01B0\u1EDDi qu\u1EA3n l\xFD." });
    }
    const { id } = req.params;
    const { manager_id, manager_name, manager_phone, manager_email, manager_role } = req.body;
    if (!manager_id && !manager_name) {
      return res.status(400).json({ error: "Thi\u1EBFu th\xF4ng tin ng\u01B0\u1EDDi qu\u1EA3n l\xFD ngu\u1ED3n nh\xE0." });
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
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          };
        }
        return p;
      });
      writeLocalDb(updated);
    } else {
      try {
        const supabase = getSupabase();
        const { data: propRow, error: fetchErr } = await supabase.from("chu_nha_can_ban").select("content").eq("id", id).maybeSingle();
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
        const updateResult = await supabase.from("chu_nha_can_ban").update({
          content: updatedContent,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }).eq("id", id);
        if (updateResult.error) {
          console.error("[assign-manager] Supabase update content error:", updateResult.error);
          return res.status(500).json({ error: updateResult.error.message || "L\u1ED7i l\u01B0u th\xF4ng tin ng\u01B0\u1EDDi qu\u1EA3n l\xFD v\xE0o Supabase" });
        }
        console.log(`[assign-manager] Successfully saved manager "${manager_name}" to Supabase content for ID: ${id}`);
        try {
          await supabase.from("chu_nha_can_ban").update({
            created_by: manager_id,
            created_by_name: manager_name
          }).eq("id", id);
        } catch (_) {
        }
      } catch (e) {
        console.error("[assign-manager] Unexpected error:", e);
        return res.status(500).json({ error: e.message || "L\u1ED7i c\u1EADp nh\u1EADt ng\u01B0\u1EDDi ph\u1EE5 tr\xE1ch" });
      }
    }
    return res.json({
      success: true,
      manager: pManagers[id]
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "L\u1ED7i x\u1EED l\xFD ph\xE2n c\xF4ng qu\u1EA3n l\xFD ngu\u1ED3n." });
  }
});
app.delete("/api/properties/:id", authenticateAdmin, async (req, res) => {
  if (req.admin?.role === "viewer") {
    return res.status(403).json({ error: "T\xE0i kho\u1EA3n Ng\u01B0\u1EDDi xem (Viewer) kh\xF4ng c\xF3 quy\u1EC1n x\xF3a tin kh\u1ECFi h\u1EC7 th\u1ED1ng." });
  }
  try {
    const { id } = req.params;
    const userRole = req.admin?.role;
    const userId = req.admin?.id;
    const userEmail = req.admin?.email;
    if (userRole === "staff") {
      let existingProp = null;
      if (id.startsWith("local-")) {
        const localData = readLocalDb();
        existingProp = localData.find((p) => p.id === id);
      } else {
        const supabase = getSupabase();
        const { data } = await supabase.from("chu_nha_can_ban").select("id, content").eq("id", id).maybeSingle();
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
            error: "B\u1EA1n ch\u1EC9 c\xF3 quy\u1EC1n x\xF3a c\u0103n nh\xE0 do ch\xEDnh b\u1EA1n \u0111\xE3 th\xEAm v\xE0o h\u1EC7 th\u1ED1ng."
          });
        }
      }
    }
    if (id.startsWith("local-")) {
      console.log("Deleting local property in local file:", id);
      const localData = readLocalDb();
      const filtered = localData.filter((p) => p.id !== id);
      writeLocalDb(filtered);
      return res.json({ success: true, message: "\u0110\xE3 x\xF3a m\u1EE5c th\xE0nh c\xF4ng", isFallbackMode: true });
    }
    try {
      const supabase = getSupabase();
      const { error } = await supabase.from("chu_nha_can_ban").delete().eq("id", id);
      if (error) {
        throw error;
      }
      return res.json({ success: true, message: "\u0110\xE3 x\xF3a m\u1EE5c th\xE0nh c\xF4ng", isFallbackMode: false });
    } catch (dbErr) {
      console.warn("Supabase delete failed, falling back to local file:", dbErr.message || dbErr);
      const localData = readLocalDb();
      const filtered = localData.filter((p) => p.id !== id);
      writeLocalDb(filtered);
      return res.json({ success: true, message: "\u0110\xE3 x\xF3a m\u1EE5c th\xE0nh c\xF4ng", isFallbackMode: true });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message || "L\u1ED7i x\u1EED l\xFD x\xF3a ch\u1EE7 nh\xE0." });
  }
});
app.use("/api", (req, res) => {
  const fullPath = req.originalUrl || req.url;
  return res.status(404).json({
    error: `Kh\xF4ng t\xECm th\u1EA5y \u0111\u01B0\u1EDDng d\u1EABn API: ${req.method} ${fullPath} (HTTP 404)`,
    status: 404,
    method: req.method,
    url: fullPath
  });
});
app.use((err, req, res, next) => {
  console.error("Express Custom Global Error Handler:", err);
  res.status(err.status || 500).json({
    error: err.message || "\u0110\xE3 x\u1EA3y ra l\u1ED7i h\u1EC7 th\u1ED1ng ph\xEDa m\xE1y ch\u1EE7."
  });
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
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
var server_default = app;
export {
  server_default as default
};
