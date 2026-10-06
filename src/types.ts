export type TransactionType = "khach_mua" | "khach_ban" | "moi_gioi";
export type PropertyStatus = "moi" | "dang_lien_he" | "da_chot" | "da_ky" | "da_ban";
export type SourceStatusType = "thô" | "đã bổ sung" | "sẵn sàng đăng" | "đã bán";

// 1. Hai cột trạng thái chuẩn của Kho Dữ Liệu Chuẩn
export type BusinessStatusType = "nguon_tho" | "da_ky" | "da_ban";
export type ProcessingStatusType =
  | "tho"
  | "can_bo_sung"
  | "san_sang"
  | "da_len_hometea"
  | "da_dang_fb";

export type LoaiViTriType = "mat_tien" | "hem_xe_hoi" | "hem_xe_may" | "hem";

export type HuongType =
  | "Đông"
  | "Tây"
  | "Nam"
  | "Bắc"
  | "Đông Nam"
  | "Đông Bắc"
  | "Tây Nam"
  | "Tây Bắc";

export type AiConfidenceType = "cao" | "thap";

export type AiExtractedFieldKey =
  | "loai_vi_tri"
  | "huong"
  | "phap_ly"
  | "so_phong_ngu"
  | "so_wc"
  | "so_nha"
  | "ten_duong"
  | "duong_vao_m"
  | "dac_diem"
  | "hien_trang";

export interface AiFieldEvidence<T = any> {
  gia_tri: T | null;
  bang_chung: string;
  tin_cay: AiConfidenceType;
  da_sua_tay?: boolean;
  da_xac_nhan?: boolean;
}

export type NguonTrichXuatMap = Partial<
  Record<AiExtractedFieldKey, AiFieldEvidence<any>>
>;

export type UserRole = "admin" | "staff" | "viewer";
export type UserStatus = "active" | "disabled";

export const DISTRICT_OPTIONS = [
  "Quận 1",
  "Quận 3",
  "Quận 4",
  "Quận 5",
  "Quận 6",
  "Quận 7",
  "Quận 8",
  "Quận 10",
  "Quận 11",
  "Quận 12",
  "Quận Bình Tân",
  "Quận Bình Thạnh",
  "Quận Gò Vấp",
  "Quận Phú Nhuận",
  "Quận Tân Bình",
  "Quận Tân Phú",
  "TP. Thủ Đức",
  "Hiệp Bình Chánh",
  "Hiệp Bình Phước",
  "Linh Đông",
  "Linh Tây",
  "Linh Trung",
  "Linh Xuân",
  "Linh Chiểu",
  "Bình Thọ",
  "Trường Thọ",
  "Tam Phú",
  "Tam Bình",
  "An Phú",
  "An Khánh",
  "Thảo Điền",
  "Bình Trưng Đông",
  "Bình Trưng Tây",
  "Cát Lái",
  "Thạnh Mỹ Lợi",
  "Phú Hữu",
  "Phước Long A",
  "Phước Long B",
  "Tăng Nhơn Phú A",
  "Tăng Nhơn Phú B",
  "Long Trường",
  "Trường Thạnh",
  "Long Thạnh Mỹ",
  "Long Bình",
  "Long Phước",
  "Tân Phú (Thủ Đức)",
  "Vĩnh Phú",
  "Lái Thiêu",
  "Bình Hòa",
  "Vĩnh Phú 1",
  "Vĩnh Phú 2",
  "Thuận An",
  "Dĩ An",
  "Khác"
] as const;

export type DistrictType = typeof DISTRICT_OPTIONS[number];

export interface PropertyImageEntry {
  url: string;
  is_avatar?: boolean;
  is_hidden?: boolean;
  file_name?: string;
}

export interface Property {
  id?: string;
  name: string;
  phone: string;
  district?: string;
  facebook_link: string;
  website_link: string;
  content: string;
  image_urls: string[];
  loai_giao_dich: TransactionType;
  status: PropertyStatus;

  // Hai cột trạng thái mới tách biệt
  trang_thai_kinh_doanh?: BusinessStatusType;
  trang_thai_xu_ly?: ProcessingStatusType;

  // Đánh dấu kênh đã xuất (KHÔNG đụng vào khi cập nhật nguồn đã có)
  da_xuat_hometea?: boolean;
  da_xuat_fb?: boolean;
  da_len_hometea?: boolean;
  hometea_id?: string | null;
  hometea_trang_thai?: string | null;
  da_xep_lich_fb?: boolean;
  da_dang_fb?: boolean;
  ngay_xuat_hometea?: string;
  ngay_xuat_fb?: string;

  // Các trường chuẩn của Kho Dữ Liệu Chuẩn
  ma_tk?: string;
  so_nha?: string | null;
  ten_duong?: string | null;
  duong?: string | null;
  dia_chi?: string;
  phuong?: string;
  dien_tich?: string;
  dien_tich_so?: number | string | null;
  dien_tich_thuc_te?: number | string | null;
  so_tang?: string | number | null;
  rong?: string | number | null;
  dai?: string | number | null;
  gia?: number | null;
  loai_hinh?: string;
  trang_thai_nguon?: SourceStatusType;
  ngay_lay?: string | null;

  // Các trường Bóc tách bằng AI (Chỉ lấy từ văn bản, không có thì NULL)
  loai_vi_tri?: LoaiViTriType | null;
  huong?: HuongType | string | null;
  phap_ly?: string | null;
  so_phong_ngu?: number | null;
  so_wc?: number | null;
  duong_vao_m?: number | null;
  dac_diem?: string[] | null;
  hien_trang?: string | null;
  nguon_trich_xuat?: NguonTrichXuatMap | null;
  da_boc_tach_ai?: boolean;
  da_xac_nhan_ai?: boolean;
  ngay_boc_tach_ai?: string | null;
  ai_manual_fields?: AiExtractedFieldKey[];

  // Các trường Nội bộ (KHÔNG xuất sang v_nguon_xuat / Hometea)
  mo_ta_tho?: string;
  moi_gioi_nguon?: string;
  sdt_nguon?: string;
  hoa_hong?: string;
  link_thien_khoi?: string | null;
  link_ban_do?: string | null;

  toa_do?: string;
  anh?: PropertyImageEntry[] | any;
  ten_thu_muc_goc?: string;
  ngay_nhap?: string;
  thieu?: string;

  created_by?: string;
  created_by_name?: string;
  created_by_phone?: string;
  created_by_email?: string;
  created_by_role?: UserRole;
  manager?: {
    id?: string;
    full_name?: string;
    phone?: string;
    email?: string;
    role?: UserRole;
  };
  created_at?: string;
  updated_at?: string;
}

/**
 * Dòng dữ liệu chuẩn của VIEW v_nguon_xuat trong Supabase
 * Tuyệt đối KHÔNG chứa: sdt_nguon, moi_gioi_nguon, mo_ta_tho
 */
export interface VNguonXuatRow {
  ma_tk: string;
  so_nha: string | null;
  ten_duong?: string | null;
  duong: string;
  phuong: string;
  dien_tich_so: number | null;
  dien_tich_thuc_te: number | null;
  so_tang: string;
  rong: string;
  dai: string;
  gia: number | null;
  loai_vi_tri?: LoaiViTriType | null;
  huong?: string;
  phap_ly?: string | null;
  so_phong_ngu?: number | null;
  so_wc?: number | null;
  duong_vao_m?: number | null;
  dac_diem?: string[] | null;
  hien_trang?: string | null;
  anh: any[];
  trang_thai_xu_ly: ProcessingStatusType;
  thieu: string;
}

export interface ExportLogEntry {
  id: string;
  target: "hometea" | "post_writer" | "v_nguon_xuat_json" | "v_nguon_xuat_csv";
  target_label: string;
  record_count: number;
  ma_tk_list: string[];
  exported_by: string;
  created_at: string;
  note?: string;
}

export interface ConfigStatus {
  supabaseConfigured: boolean;
  cloudinaryConfigured: boolean;
  adminPasswordConfigured: boolean;
  missingVars: string[];
  setupSQL?: string;
  cloudinary?: {
    cloudName?: string;
    uploadPreset?: string;
  };
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  full_name?: string;
  phone?: string;
  role?: UserRole;
  status?: UserStatus;
}
