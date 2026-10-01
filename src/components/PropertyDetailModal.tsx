import React, { useState, useEffect } from "react";
import { 
  X, Phone, Facebook, Globe, Calendar, User, Tag, Activity, Copy, Check, 
  ChevronLeft, ChevronRight, Maximize2, UserCheck, Mail, UserPlus, Loader2, 
  MapPin, AlertCircle, FileDown, BadgePercent, Sparkles, Building, Layers, 
  ExternalLink, MessageSquare, Compass, Share2
} from "lucide-react";
import { Property, AuthUser, UserProfile } from "../types";
import ImageViewerModal from "./ImageViewerModal";
import SmartImage from "./SmartImage";
import { parsePropertyData } from "../utils/propertyParser";
import { safeFetchJson } from "../utils/apiClient";

interface PropertyDetailModalProps {
  property: Property | null;
  isOpen: boolean;
  onClose: () => void;
  currentUser?: AuthUser | null;
  onPropertyUpdated?: (updatedProperty: Property) => void;
}

export default function PropertyDetailModal({ 
  property, 
  isOpen, 
  onClose,
  currentUser,
  onPropertyUpdated 
}: PropertyDetailModalProps) {
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedManagerPhone, setCopiedManagerPhone] = useState(false);
  const [copiedCleanContent, setCopiedCleanContent] = useState(false);
  const [copiedFullContent, setCopiedFullContent] = useState(false);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);

  // Manager Reassignment modal for Admins
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  useEffect(() => {
    setActiveImageIdx(0);
    setCopiedPhone(false);
    setCopiedManagerPhone(false);
    setCopiedCleanContent(false);
    setCopiedFullContent(false);
    setIsImageViewerOpen(false);
    setIsAssignModalOpen(false);
    setAssignError(null);
  }, [property, isOpen]);

  if (!isOpen || !property) return null;

  // Structured information parsed from either Proptech / Thiên Khôi or normal listing format
  const parsed = parsePropertyData(property);

  const rawImages = property.image_urls && Array.isArray(property.image_urls)
    ? property.image_urls.filter((url) => typeof url === "string" && url.trim().length > 0)
    : [];
  const images = rawImages.length > 0 
    ? rawImages 
    : ["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&auto=format&fit=crop&q=80"];

  const copyToClipboard = (text: string, onSuccess: () => void) => {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        onSuccess();
      }).catch(() => {
        try {
          const textArea = document.createElement("textarea");
          textArea.value = text;
          textArea.style.position = "fixed";
          textArea.style.opacity = "0";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);
          onSuccess();
        } catch (e) {
          console.error("Clipboard copy failed:", e);
        }
      });
    } else {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        onSuccess();
      } catch (e) {
        console.error("Clipboard copy failed:", e);
      }
    }
  };

  const handleCopyPhone = () => {
    const p = parsed.leadBrokerPhone || property.phone;
    if (!p) return;
    copyToClipboard(p, () => {
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    });
  };

  const handleCopyManagerPhone = () => {
    const managerPhone = property.manager?.phone || property.created_by_phone || parsed.leadBrokerPhone;
    if (!managerPhone) return;
    copyToClipboard(managerPhone, () => {
      setCopiedManagerPhone(true);
      setTimeout(() => setCopiedManagerPhone(false), 2000);
    });
  };

  // Copy clean version for sending to clients (no lead broker/internal notes)
  const handleCopyCleanContent = () => {
    const cleanText = [
      `🏡 ${parsed.displayTitle}`,
      parsed.price ? `💰 Giá chào: ${parsed.price} ${parsed.pricePerM2 ? `(${parsed.pricePerM2})` : ""}` : "",
      parsed.area ? `📐 Diện tích: ${parsed.area} ${parsed.dimensions ? `(${parsed.dimensions})` : ""}` : "",
      parsed.floors ? `🏗 Kết cấu: ${parsed.floors}` : "",
      parsed.rooms ? `🚪 Số phòng: ${parsed.rooms}` : "",
      property.district ? `📍 Khu vực: ${property.district}` : "",
      `\n📝 MÔ TẢ CHI TIẾT:`,
      parsed.cleanDescription || property.content,
      property.phone ? `\n📞 Liên hệ xem nhà: ${property.phone}` : ""
    ].filter(Boolean).join("\n");

    copyToClipboard(cleanText, () => {
      setCopiedCleanContent(true);
      setTimeout(() => setCopiedCleanContent(false), 2000);
    });
  };

  // Copy full raw internal listing
  const handleCopyFullContent = () => {
    if (!property.content) return;
    copyToClipboard(property.content, () => {
      setCopiedFullContent(true);
      setTimeout(() => setCopiedFullContent(false), 2000);
    });
  };

  const handleDownloadDetailTxt = () => {
    if (!property) return;
    const contentToDownload = [
      `THÔNG TIN BẤT ĐỘNG SẢN: ${parsed.displayTitle}`,
      `Mã nguồn: ${parsed.sourceCode || "N/A"}`,
      `Giá chào: ${parsed.price} ${parsed.pricePerM2 ? `(${parsed.pricePerM2})` : ""}`,
      `Hoa hồng: ${parsed.commission}`,
      `Diện tích: ${parsed.area} ${parsed.dimensions ? `(${parsed.dimensions})` : ""}`,
      `Kết cấu: ${parsed.floors || "N/A"}`,
      `Đầu chủ: ${parsed.leadBrokerName} - SĐT: ${parsed.leadBrokerPhone || "N/A"}`,
      `Chuyên viên QL: ${property.manager?.full_name || property.created_by_name || "N/A"}`,
      `Khu vực: ${property.district || "Chưa cập nhật"}`,
      `Loại giao dịch: ${
        property.loai_giao_dich === "khach_ban"
          ? "Khách cần bán"
          : property.loai_giao_dich === "khach_mua"
          ? "Khách mua"
          : "Môi giới"
      }`,
      `Trạng thái: ${
        property.status === "moi"
          ? "Nguồn thô"
          : property.status === "dang_lien_he"
          ? "Đang liên hệ"
          : property.status === "da_ky"
          ? "Đã ký nhận"
          : "Đã bán"
      }`,
      parsed.googleMapsUrl ? `Google Maps: ${parsed.googleMapsUrl}` : null,
      property.facebook_link ? `Facebook: ${property.facebook_link}` : null,
      property.website_link ? `Website: ${property.website_link}` : null,
      `----------------------------------------`,
      `NỘI DUNG CHI TIẾT:`,
      property.content,
      `----------------------------------------`,
      `Thời gian xuất: ${new Date().toLocaleString("vi-VN")}`,
    ]
      .filter(Boolean)
      .join("\n");

    const blob = new Blob([contentToDownload], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const cleanName = (parsed.displayTitle || "bds")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF]+/gi, "-");
    a.href = url;
    a.download = `chi-tiet-${cleanName}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const openAssignModal = async () => {
    setIsAssignModalOpen(true);
    setLoadingUsers(true);
    try {
      const token = localStorage.getItem("admin_token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await safeFetchJson<{ users?: UserProfile[] }>("/api/users", {
        headers,
        credentials: "include",
      });
      if (res.ok && res.data.users) {
        setAvailableUsers(res.data.users);
      }
    } catch (err) {
      console.error("Lỗi tải danh sách người dùng:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleAssignManager = async (user: UserProfile) => {
    if (!property?.id) return;
    setAssigningUserId(user.id);
    setAssignError(null);
    try {
      const token = localStorage.getItem("admin_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const targetUrl = `/api/properties/${property.id}/assign-manager`;

      const res = await safeFetchJson<{
        success?: boolean;
        manager?: any;
        error?: string;
      }>(targetUrl, {
        method: "PUT",
        headers,
        credentials: "include",
        body: JSON.stringify({
          manager_id: user.id,
          manager_name: user.full_name,
          manager_phone: user.phone || "",
          manager_email: user.email || "",
          manager_role: user.role
        })
      });
      if (res.ok && res.data.success) {
        setAssignSuccess(true);
        const updated: Property = {
          ...property,
          created_by: user.id,
          created_by_name: user.full_name,
          created_by_phone: user.phone || "",
          created_by_email: user.email || "",
          created_by_role: user.role,
          manager: res.data.manager
        };
        onPropertyUpdated?.(updated);
        setTimeout(() => {
          setAssignSuccess(false);
          setIsAssignModalOpen(false);
          setAssigningUserId(null);
        }, 800);
      } else {
        setAssignError(
          res.errorMessage ||
            `Không thể phân công người quản lý (HTTP ${res.status} — PUT ${targetUrl})`
        );
        setAssigningUserId(null);
      }
    } catch (err: any) {
      console.error("Lỗi phân công người quản lý:", err);
      setAssignError(err?.message || "Lỗi mạng khi phân công người quản lý.");
      setAssigningUserId(null);
    }
  };

  const managerName = property.manager?.full_name || (property.created_by_name && property.created_by_name !== "Chưa phân công" ? property.created_by_name : "Chưa phân công");
  const managerPhone = property.manager?.phone || property.created_by_phone || "";
  const managerEmail = property.manager?.email || property.created_by_email || "";
  const managerRole = property.manager?.role || property.created_by_role || "staff";
  const isCurrentUserManager = !!(currentUser && (
    currentUser.id === property.manager?.id || 
    currentUser.id === property.created_by || 
    currentUser.email === property.created_by || 
    currentUser.email === property.manager?.email ||
    (property.manager?.phone && currentUser.phone && property.manager.phone.replace(/[^0-9]/g, "") === currentUser.phone.replace(/[^0-9]/g, ""))
  ));
  const isAdmin = currentUser?.role === "admin";

  const getTransactionLabel = (type: string) => {
    switch (type) {
      case "khach_mua": return "Khách mua";
      case "khach_ban": return "Cần bán";
      case "moi_gioi": return "Môi giới";
      default: return type;
    }
  };

  const getTransactionStyle = (type: string) => {
    switch (type) {
      case "khach_mua": return "bg-blue-600 text-white border-blue-500/30";
      case "khach_ban": return "bg-amber-600 text-white border-amber-500/30";
      case "moi_gioi": return "bg-purple-600 text-white border-purple-500/30";
      default: return "bg-slate-700 text-white border-slate-500/30";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "moi": return "Nguồn thô";
      case "dang_lien_he": return "Đang liên hệ";
      case "da_chot": return "Đã chốt";
      case "da_ban": return "Đã bán";
      case "da_ky": return "Đã ký nhận";
      default: return status;
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "moi": return "bg-slate-800 text-slate-200 border-slate-600/40";
      case "dang_lien_he": return "bg-amber-500 text-slate-950 font-bold border-amber-300/40";
      case "da_chot": return "bg-emerald-600 text-white border-emerald-400/30";
      case "da_ban": return "bg-emerald-600 text-white border-emerald-400/30";
      case "da_ky": return "bg-blue-600 text-white border-blue-400/30";
      default: return "bg-slate-700 text-white";
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <div id="property-detail-overlay" className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 z-50 overflow-y-auto animate-in fade-in duration-200">
      <div 
        id="property-detail-modal"
        className="w-full max-w-5xl custom-bg-secondary rounded-2xl sm:rounded-3xl border custom-border shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col min-w-0"
      >
        
        {/* Header bar */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b custom-border flex items-center justify-between shrink-0 bg-black/5 dark:bg-white/5">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0"></span>
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <h2 className="font-extrabold text-sm sm:text-base custom-text-primary truncate">
                {parsed.displayTitle}
              </h2>
              {parsed.sourceCode && (
                <span className="px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                  #{parsed.sourceCode}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            id="btn-close-detail-modal"
            className="p-1.5 sm:p-2 rounded-xl border custom-border hover:bg-black/5 dark:hover:bg-white/5 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0 ml-2"
            title="Đóng cửa sổ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 min-w-0">
          
          {/* Column 1: Image Gallery & Lead Broker Box (5 cols on lg) */}
          <div className="lg:col-span-5 space-y-4 w-full min-w-0 flex flex-col justify-between">
            <div>
              {/* Main Stage Image */}
              <div 
                className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-slate-950 border custom-border shadow-inner group cursor-pointer"
                onClick={() => setIsImageViewerOpen(true)}
                title="Nhấp để xem ảnh toàn màn hình & phóng to"
              >
                <SmartImage
                  src={images[activeImageIdx]}
                  alt={`Ảnh ${activeImageIdx + 1} của ${parsed.displayTitle}`}
                  defaultFit="auto"
                  showFitToggle={true}
                  showOrientationBadge={true}
                  fallbackSrc="https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&auto=format&fit=crop&q=80"
                >
                  {/* Open Fullscreen Zoom Viewer Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsImageViewerOpen(true);
                    }}
                    id="btn-open-image-zoom-modal"
                    className="absolute top-2 right-18 sm:right-20 px-2 py-1 rounded-lg bg-black/65 hover:bg-black/85 text-white backdrop-blur-md transition-all shadow-md cursor-pointer flex items-center gap-1 text-[10px] font-semibold border border-white/20 z-10"
                    title="Xem ảnh phóng to toàn màn hình"
                  >
                    <Maximize2 className="w-3 h-3 text-amber-400" />
                    <span className="hidden sm:inline">Phóng to</span>
                  </button>

                  {/* Navigation Overlays */}
                  {images.length > 1 && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveImageIdx((prev) => (prev > 0 ? prev - 1 : images.length - 1));
                        }}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/85 text-white backdrop-blur-md transition-all cursor-pointer border border-white/20 shadow-lg z-10"
                        title="Ảnh trước"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveImageIdx((prev) => (prev < images.length - 1 ? prev + 1 : 0));
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/85 text-white backdrop-blur-md transition-all cursor-pointer border border-white/20 shadow-lg z-10"
                        title="Ảnh tiếp theo"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>

                      <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-md text-[11px] text-white font-mono border border-white/20 z-10 shadow-sm">
                        {activeImageIdx + 1} / {images.length}
                      </div>
                    </>
                  )}
                </SmartImage>
              </div>

              {/* Thumbnail Gallery */}
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-5 w-full max-w-full mt-2.5" id="detail-thumbnails">
                  {images.map((url, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveImageIdx(idx)}
                      className={`relative w-14 h-14 sm:w-auto aspect-square shrink-0 rounded-xl overflow-hidden border-2 transition-all cursor-pointer bg-slate-900 ${
                        activeImageIdx === idx ? "border-amber-400 ring-2 ring-amber-400/30 scale-[1.03]" : "border-slate-300/40 dark:border-slate-700/60 opacity-70 hover:opacity-100"
                      }`}
                      title={`Xem ảnh ${idx + 1}`}
                    >
                      <img
                        src={url}
                        alt={`Thumb ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1594322436404-5a0526db4d13?w=100&auto=format&fit=crop&q=80";
                        }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* BOX: ĐẦU CHỦ & CHUYÊN VIÊN PHỤ TRÁCH NGUỒN */}
            <div 
              id="box-managing-agent"
              className="mt-3 p-4 rounded-2xl border-2 border-amber-500/35 bg-gradient-to-br from-amber-500/12 via-amber-500/[0.04] to-transparent shadow-sm space-y-3 relative overflow-hidden"
            >
              {/* Header with Role */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  <UserCheck className="w-4 h-4 text-amber-500 shrink-0 stroke-[2.5]" />
                  <span>Đầu chủ & Chuyên viên quản lý</span>
                </div>
                {parsed.commission && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white flex items-center gap-1 shadow-xs">
                    <BadgePercent className="w-3 h-3 stroke-[2.5]" />
                    <span>Hoa hồng {parsed.commission}</span>
                  </span>
                )}
              </div>

              {/* Lead Broker (Đầu chủ nguồn hàng) */}
              <div className="p-3 rounded-xl bg-slate-900/40 dark:bg-black/30 border custom-border space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
                    Người phụ trách ({parsed.leadBrokerRoleLabel}):
                  </span>
                  {parsed.sourceCode && (
                    <span className="text-[10px] font-mono text-slate-400">#{parsed.sourceCode}</span>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 font-black text-base flex items-center justify-center shrink-0 shadow-sm">
                    {parsed.leadBrokerName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-sm custom-text-primary truncate">
                      {parsed.leadBrokerName}
                    </h4>
                    <p className="text-[11px] text-slate-400 truncate">
                      {parsed.leadBrokerRole || "Đầu chủ nguồn hàng"}
                    </p>
                  </div>
                </div>

                {/* Direct Call & Copy Lead Broker Phone */}
                {parsed.leadBrokerPhone ? (
                  <div className="flex items-center gap-1.5 pt-1">
                    <a
                      href={`tel:${parsed.leadBrokerPhone}`}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-xs active:scale-98 transition-all cursor-pointer"
                      title={`Gọi đầu chủ: ${parsed.leadBrokerPhone}`}
                    >
                      <Phone className="w-3.5 h-3.5 fill-current shrink-0" />
                      <span className="truncate font-mono">Gọi: {parsed.leadBrokerPhone}</span>
                    </a>

                    <button
                      onClick={handleCopyPhone}
                      className="p-2 rounded-xl border custom-border hover:bg-black/5 dark:hover:bg-white/5 text-slate-400 hover:text-amber-500 transition-colors cursor-pointer shrink-0"
                      title="Sao chép số điện thoại"
                    >
                      {copiedPhone ? (
                        <Check className="w-4 h-4 text-emerald-500 stroke-[2.5]" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">Chưa cập nhật số điện thoại đầu chủ</p>
                )}
              </div>

              {/* Internal Manager Profile (Chuyên viên nội bộ hệ thống) */}
              <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-500 font-bold text-xs flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 block truncate">Quản lý nội bộ:</span>
                    <span className="font-semibold text-xs custom-text-primary truncate block">
                      {managerName} {isCurrentUserManager ? "(Bạn)" : ""}
                    </span>
                  </div>
                </div>

                {isAdmin && (
                  <button
                    onClick={openAssignModal}
                    id="btn-open-assign-manager"
                    className="px-2.5 py-1.5 rounded-lg border border-dashed border-amber-500/40 hover:bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-semibold transition-colors cursor-pointer shrink-0 flex items-center gap-1"
                    title="Chuyển quyền quản lý nguồn này cho nhân viên khác"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Đổi quản lý</span>
                  </button>
                )}
              </div>

              {/* Google Maps Shortcut Button */}
              {parsed.googleMapsUrl && (
                <div className="pt-2 border-t custom-border">
                  <a
                    href={parsed.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all"
                  >
                    <Compass className="w-4 h-4 stroke-[2.2]" />
                    <span>Mở vị trí chỉ đường Google Maps</span>
                    <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                  </a>
                </div>
              )}
            </div>

          </div>

          {/* Column 2: Specs Grid, Description, Survey Notes & Tools (7 cols on lg) */}
          <div className="lg:col-span-7 space-y-4 sm:space-y-5 flex flex-col justify-between">
            <div className="space-y-4 sm:space-y-5">
              
              {/* Header Badges & Big Price Banner */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${getTransactionStyle(property.loai_giao_dich)}`}>
                    <Tag className="w-3 h-3 inline mr-1" />
                    {getTransactionLabel(property.loai_giao_dich)}
                  </span>
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${getStatusStyle(property.status)}`}>
                    <Activity className="w-3 h-3 inline mr-1" />
                    {getStatusLabel(property.status)}
                  </span>
                  {property.district && (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3 inline mr-0.5" />
                      {property.district}
                    </span>
                  )}
                  {parsed.commission && (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1">
                      <BadgePercent className="w-3.5 h-3.5" />
                      Hoa hồng {parsed.commission}
                    </span>
                  )}
                </div>

                {/* Big Price & Address Title */}
                <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl sm:text-3xl font-black text-amber-500 tracking-tight">
                        {parsed.price}
                      </span>
                      {parsed.pricePerM2 && (
                        <span className="text-sm font-semibold custom-text-secondary">
                          ({parsed.pricePerM2})
                        </span>
                      )}
                    </div>
                    {parsed.sourceCode && (
                      <span className="px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-black/60 text-amber-300 border border-amber-400/40">
                        Mã: #{parsed.sourceCode}
                      </span>
                    )}
                  </div>
                  
                  <h1 className="text-base sm:text-lg font-bold custom-text-primary tracking-tight leading-snug">
                    {parsed.displayTitle}
                  </h1>
                </div>
              </div>

              {/* 6-Tiles Specs Grid (Bảng thông số nhà đất chi tiết) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5">
                {/* 1. Area */}
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border custom-border">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Diện tích</span>
                  <span className="font-extrabold text-sm sm:text-base custom-text-primary block mt-0.5">
                    {parsed.area || "Chưa rõ"}
                  </span>
                </div>

                {/* 2. Dimensions */}
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border custom-border">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Kích thước (Dài x Rộng)</span>
                  <span className="font-extrabold text-sm sm:text-base custom-text-primary block mt-0.5 font-mono">
                    {parsed.dimensions || "Chuẩn"}
                  </span>
                </div>

                {/* 3. Floors / Structure */}
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border custom-border">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Kết cấu</span>
                  <span className="font-extrabold text-sm sm:text-base custom-text-primary block mt-0.5">
                    {parsed.floors || "Nhà phố"}
                  </span>
                </div>

                {/* 4. Commission */}
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border custom-border">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Hoa hồng trích thưởng</span>
                  <span className="font-extrabold text-sm sm:text-base text-emerald-500 block mt-0.5">
                    {parsed.commission || "3%"}
                  </span>
                </div>

                {/* 5. Rental Income or Rooms */}
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border custom-border">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Dòng tiền / Phòng</span>
                  <span className="font-extrabold text-sm sm:text-base custom-text-primary block mt-0.5 truncate">
                    {parsed.rentalIncome || parsed.rooms || "Ở & Kinh doanh"}
                  </span>
                </div>

                {/* 6. District */}
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border custom-border">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Khu vực / Quận</span>
                  <span className="font-extrabold text-sm sm:text-base text-amber-500 block mt-0.5 truncate">
                    {property.district || "TP.HCM"}
                  </span>
                </div>
              </div>

              {/* Fast Copy & Action Bar */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Clean Copy Button for Clients */}
                <button
                  onClick={handleCopyCleanContent}
                  type="button"
                  className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-bold text-amber-600 dark:text-amber-400 transition-all cursor-pointer active:scale-98 shadow-xs"
                  title="Sao chép nội dung tin đăng sạch (đã bỏ thông tin nội bộ) để gửi khách / đăng bài"
                >
                  {copiedCleanContent ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-500 stroke-[2.5]" />
                      <span className="text-emerald-500">Đã sao chép tin gửi khách!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Sao chép tin đăng (gửi khách)</span>
                    </>
                  )}
                </button>

                {/* Copy Full Internal Listing */}
                <button
                  onClick={handleCopyFullContent}
                  type="button"
                  className="inline-flex items-center gap-1 px-3 py-2.5 rounded-xl border custom-border bg-slate-500/5 hover:bg-slate-500/15 text-xs font-semibold custom-text-secondary transition-all cursor-pointer active:scale-98"
                  title="Sao chép toàn bộ nội dung gốc (gồm thông tin Đầu chủ & khảo sát)"
                >
                  {copiedFullContent ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-500" />
                      <span className="text-emerald-500">Đã chép gốc</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Chép toàn bộ gốc</span>
                    </>
                  )}
                </button>

                {/* Download TXT */}
                <button
                  onClick={handleDownloadDetailTxt}
                  type="button"
                  className="inline-flex items-center gap-1 px-3 py-2.5 rounded-xl border custom-border bg-slate-500/5 hover:bg-slate-500/15 text-xs font-semibold custom-text-secondary transition-all cursor-pointer active:scale-98"
                  title="Tải nội dung chi tiết về máy dưới dạng file .txt"
                >
                  <FileDown className="w-4 h-4 text-amber-500" />
                  <span>Tải file .txt</span>
                </button>
              </div>

              {/* Description Content */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                  Nội dung chi tiết & Ghi chú mô tả:
                </span>
                <div className="p-3.5 sm:p-4 rounded-2xl border custom-border custom-bg-primary max-h-60 overflow-y-auto">
                  <p className="text-xs sm:text-sm custom-text-secondary leading-relaxed whitespace-pre-line break-words select-text">
                    {parsed.cleanDescription || property.content || <em className="text-slate-400">Không có mô tả chi tiết...</em>}
                  </p>
                </div>
              </div>

              {/* Survey Notes Timeline (Nhật ký khảo sát của anh em chuyên viên) */}
              {parsed.surveyNotes.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-500">
                    <MessageSquare className="w-4 h-4" />
                    <span>Nhật ký khảo sát của chuyên viên ({parsed.surveyNotes.length} đánh giá):</span>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {parsed.surveyNotes.map((sn, idx) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-slate-900/60 border custom-border space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-bold text-amber-400 truncate">{sn.author}</span>
                          {sn.date && (
                            <span className="text-[10px] text-slate-400 font-mono">{sn.date}</span>
                          )}
                        </div>
                        <p className="text-slate-200 leading-normal">{sn.comment}</p>
                        {sn.phone && (
                          <div className="text-[10px] text-slate-400 font-mono">SĐT: {sn.phone}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* External Social & Web Links */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                  Liên kết ngoài:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {property.facebook_link || parsed.leadBrokerFacebook ? (
                    <a
                      href={property.facebook_link || parsed.leadBrokerFacebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2.5 rounded-xl border border-blue-500/20 hover:border-blue-500/40 bg-blue-500/5 text-blue-500 text-xs font-semibold transition-all"
                    >
                      <Facebook className="w-4 h-4 shrink-0" />
                      <span className="truncate">Facebook Đầu chủ / Tin đăng</span>
                    </a>
                  ) : null}

                  {property.website_link || parsed.googleMapsUrl ? (
                    <a
                      href={parsed.googleMapsUrl || property.website_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2.5 rounded-xl border border-amber-500/20 hover:border-amber-500/40 bg-amber-500/5 text-amber-500 text-xs font-semibold transition-all"
                    >
                      <Globe className="w-4 h-4 shrink-0" />
                      <span className="truncate">Vị trí & Đường đi</span>
                    </a>
                  ) : null}
                </div>
              </div>

            </div>

            {/* Timestamps & Creator Footer */}
            <div className="pt-3 border-t custom-border flex flex-col sm:flex-row justify-between text-[11px] custom-text-secondary gap-1.5 font-mono">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Ngày lấy tin: {formatDate(property.created_at)}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Cập nhật: {formatDate(property.updated_at)}
              </span>
            </div>

          </div>

        </div>

        {/* Modal Bottom Footer */}
        <div className="px-4 sm:px-6 py-3 border-t custom-border flex items-center justify-between bg-black/5 dark:bg-white/5 shrink-0">
          <div className="text-xs text-slate-400 hidden sm:block">
            Mã nguồn: <span className="font-mono text-amber-500 font-bold">{parsed.sourceCode || "TK-SYSTEM"}</span>
          </div>
          <button
            onClick={onClose}
            id="btn-close-detail-footer"
            className="w-full sm:w-auto px-5 py-2 rounded-xl custom-accent-bg hover:opacity-95 text-white text-xs font-bold transition-all shadow-md cursor-pointer text-center"
          >
            Đóng cửa sổ
          </button>
        </div>

      </div>

      {/* Admin Modal: Reassign Manager */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 z-60 animate-in fade-in duration-150">
          <div className="w-full max-w-md custom-bg-secondary rounded-2xl border custom-border shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b custom-border">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-sm custom-text-primary">
                  Phân công chuyên viên quản lý
                </h3>
              </div>
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs custom-text-secondary">
              Chọn nhân viên phụ trách căn nhà <strong>{parsed.displayTitle}</strong>.
            </p>

            {assignSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Đã cập nhật chuyên viên quản lý thành công!</span>
              </div>
            )}

            {assignError && (
              <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 stroke-[2.5]" />
                <span>{assignError}</span>
              </div>
            )}

            <div className="max-h-60 overflow-y-auto space-y-2 py-1">
              {loadingUsers ? (
                <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                  <span>Đang tải danh sách nhân viên...</span>
                </div>
              ) : availableUsers.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  Không tìm thấy nhân viên nào khác
                </div>
              ) : (
                availableUsers.map((user) => {
                  const isCurrent = property.manager?.id === user.id || property.created_by === user.id;
                  const isAssigningThis = assigningUserId === user.id;

                  return (
                    <div
                      key={user.id}
                      className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                        isCurrent
                          ? "border-amber-500/40 bg-amber-500/10"
                          : "custom-border hover:bg-black/5 dark:hover:bg-white/5"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs custom-text-primary truncate">
                            {user.full_name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-500/20 text-slate-400 uppercase font-semibold">
                            {user.role}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold">
                              Hiện tại
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 block truncate">
                          {user.email} {user.phone ? `· ${user.phone}` : ""}
                        </span>
                      </div>

                      <button
                        onClick={() => handleAssignManager(user)}
                        disabled={isCurrent || assigningUserId !== null}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                          isCurrent
                            ? "opacity-40 cursor-not-allowed bg-slate-500/20 text-slate-400"
                            : "custom-accent-bg hover:opacity-90 text-white"
                        }`}
                      >
                        {isAssigningThis ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          "Phân công"
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t custom-border flex justify-end">
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="px-4 py-2 rounded-xl border custom-border text-xs font-semibold custom-text-secondary hover:text-white"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Zoomable Image Lightbox */}
      <ImageViewerModal
        isOpen={isImageViewerOpen}
        images={images}
        initialIndex={activeImageIdx}
        title={parsed.displayTitle}
        onClose={() => setIsImageViewerOpen(false)}
      />
    </div>
  );
}
