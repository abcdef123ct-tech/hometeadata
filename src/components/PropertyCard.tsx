import React from "react";
import {
  MapPin,
  Edit3,
  Trash2,
  Image as ImageIcon,
  Ruler,
  Layers,
  CheckCircle2,
  AlertCircle,
  Send,
  Share2,
} from "lucide-react";
import { Property, PropertyStatus, AuthUser } from "../types";
import {
  normalizePropertyRecord,
  BUSINESS_STATUS_META,
  PROCESSING_STATUS_META,
  NormalizedWarehouseProperty,
} from "../utils/dataWarehouseUtils";
import SmartImage from "./SmartImage";

interface PropertyCardProps {
  prop?: Property;
  property?: Property | NormalizedWarehouseProperty;
  currentUser?: AuthUser | null;
  onEdit?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  onPostHometea?: (e: React.MouseEvent) => void;
  onClick?: () => void;
  onStatusChange?: (e: React.MouseEvent, newStatus: PropertyStatus) => void;
  selected?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (e: React.MouseEvent) => void;
  onSelectToggle?: (e: React.MouseEvent) => void;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({
  prop,
  property,
  currentUser,
  onEdit = () => {},
  onDelete = () => {},
  onPostHometea,
  onClick = () => {},
  selected,
  isSelected,
  onToggleSelect,
  onSelectToggle,
}) => {
  const isCardSelected = Boolean(selected ?? isSelected);
  const handleToggleSelect = onToggleSelect || onSelectToggle;

  const targetProp = (prop || (property && "raw" in property ? (property as any).raw : property) || {}) as Property;
  const norm = React.useMemo(() => normalizePropertyRecord(targetProp), [targetProp]);
  const mainImage = norm.imageUrls[0] || null;

  const isAdmin = currentUser?.role === "admin";
  const isStaff = currentUser?.role === "staff";
  const isOwner =
    Boolean(currentUser?.id && targetProp.created_by === currentUser.id) ||
    Boolean(currentUser?.email && targetProp.created_by === currentUser.email);
  const canModify = isAdmin || (isStaff && (!targetProp.created_by || isOwner));

  const kdMeta = BUSINESS_STATUS_META[norm.trang_thai_kinh_doanh] || BUSINESS_STATUS_META["nguon_tho"];
  const xlMeta = PROCESSING_STATUS_META[norm.trang_thai_xu_ly] || PROCESSING_STATUS_META["tho"];

  return (
    <div
      onClick={onClick}
      className={`group rounded-2xl border overflow-hidden transition-all duration-200 flex flex-col justify-between cursor-pointer bg-slate-900/90 hover:bg-slate-900 ${
        isCardSelected
          ? "border-amber-500 ring-2 ring-amber-500/25"
          : "border-slate-800 hover:border-slate-700"
      }`}
    >
      <div>
        {/* Image Header */}
        <div className="relative h-44 w-full bg-slate-950 overflow-hidden border-b border-slate-800/80">
          {mainImage ? (
            <SmartImage
              src={mainImage}
              alt={norm.ma_tk}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 gap-1.5">
              <ImageIcon className="w-8 h-8 stroke-[1.25]" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400">
                Thiếu ảnh
              </span>
            </div>
          )}

          <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/75 to-transparent pointer-events-none" />

          {/* Top Left: Checkbox + Mã TK */}
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
            {handleToggleSelect && (
              <button
                type="button"
                onClick={handleToggleSelect}
                className={`w-5 h-5 rounded flex items-center justify-center border transition-colors cursor-pointer ${
                  isCardSelected
                    ? "bg-amber-500 border-amber-400 text-slate-950"
                    : "bg-black/60 border-white/30 text-transparent hover:border-amber-400"
                }`}
              >
                ✓
              </button>
            )}
            <span
              className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold border backdrop-blur-md ${
                norm.isLegacyOrMissingMaTk
                  ? "bg-rose-950/90 text-rose-300 border-rose-500/50"
                  : "bg-slate-950/85 text-amber-300 border-amber-500/40"
              }`}
            >
              {norm.ma_tk || norm.suggestedMaTk}
            </span>
          </div>

          {/* Top Right: 2 cột trạng thái */}
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1 z-10">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold border backdrop-blur-md ${kdMeta.badgeClass}`}
            >
              {kdMeta.shortLabel}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold border backdrop-blur-md ${xlMeta.badgeClass}`}
            >
              {xlMeta.shortLabel}
            </span>
          </div>

          {/* Bottom Bar: Giá + Số ảnh */}
          <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex items-end justify-between">
            <div>
              <span className="px-2.5 py-0.5 rounded-md bg-emerald-500 text-slate-950 font-extrabold text-xs shadow">
                {norm.gia_text || "Chưa có giá"}
              </span>
              {norm.pricePerM2Text && (
                <span className="ml-1.5 text-[10px] font-mono text-slate-200 bg-black/50 px-1.5 py-0.5 rounded">
                  {norm.pricePerM2Text}
                </span>
              )}
            </div>

            <span className="px-2 py-0.5 rounded bg-black/70 text-slate-200 text-[10px] font-mono flex items-center gap-1 border border-white/10">
              <ImageIcon className="w-3 h-3 text-amber-400" />
              {norm.imageCount} ảnh
            </span>
          </div>
        </div>

        {/* Card Body */}
        <div className="p-3.5 space-y-2.5">
          {/* Địa chỉ chuẩn */}
          <div>
            <div className="text-sm font-bold text-slate-100 line-clamp-1 group-hover:text-amber-400 transition-colors">
              {[norm.so_nha, norm.duong].filter(Boolean).join(" ") ||
                norm.cleanAddress ||
                norm.dia_chi ||
                norm.name ||
                targetProp.name ||
                norm.ma_tk ||
                "Bất động sản"}
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
              <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="truncate">
                {norm.phuong || "Chưa gán phường"}
              </span>
            </div>
          </div>

          {/* Thông số DT Sổ / Thực tế & Kích thước */}
          <div className="grid grid-cols-2 gap-1.5 p-2 rounded-xl bg-slate-950/90 border border-slate-800/80 text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-300">
              <Ruler className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate font-mono">
                {norm.dien_tich_so ?? "—"} / {norm.dien_tich_thuc_te ?? "—"} m²
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-300">
              <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="truncate font-mono">
                {norm.rong || "?"}×{norm.dai || "?"} · {norm.so_tang || "?"}T
              </span>
            </div>
          </div>

          {/* Độ đầy đủ (x/11) & Trường thiếu */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-medium">
                Độ đầy đủ dữ liệu:
              </span>
              <span
                className={`font-mono font-bold flex items-center gap-1 ${
                  norm.missingFieldKeys.length === 0
                    ? "text-emerald-400"
                    : "text-amber-400"
                }`}
              >
                {norm.missingFieldKeys.length === 0 ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-rose-400" />
                )}
                {norm.filledCount}/{norm.totalMandatory} trường
              </span>
            </div>

            {norm.missingFieldLabels.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {norm.missingFieldLabels.slice(0, 5).map((lbl) => (
                  <span
                    key={lbl}
                    className="px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10px] font-medium"
                  >
                    Thiếu {lbl}
                  </span>
                ))}
                {norm.missingFieldLabels.length > 5 && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                    +{norm.missingFieldLabels.length - 5}
                  </span>
                )}
              </div>
            ) : (
              <div className="text-[10px] text-emerald-400 font-medium">
                Đủ 11/11 trường bắt buộc chuẩn
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer: Đã xuất đâu & Nút sửa/xóa */}
      <div className="px-3.5 py-2.5 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {norm.da_xuat_hometea && (
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold flex items-center gap-1">
              <Send className="w-2.5 h-2.5" />
              Hometea
            </span>
          )}
          {norm.da_xuat_fb && (
            <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold flex items-center gap-1">
              <Share2 className="w-2.5 h-2.5" />
              FB
            </span>
          )}
          {!norm.da_xuat_hometea && !norm.da_xuat_fb && (
            <span className="text-[10px] text-slate-500">Chưa xuất kênh</span>
          )}
        </div>

        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {onPostHometea && (
            <button
              type="button"
              onClick={onPostHometea}
              className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer transition-all shadow-sm shrink-0"
              title="Đăng tin trực tiếp lên Hometea"
            >
              <Send className="w-3 h-3" />
              <span>🚀 Đăng Hometea</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClick}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Edit3 className="w-3 h-3" />
            Mở ngăn sửa
          </button>
          {canModify && (
            <button
              type="button"
              onClick={onDelete}
              className="p-1 rounded bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 cursor-pointer"
              title="Xóa"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PropertyCard;
