import React, { useState, useEffect, useRef } from "react";
import { X, UploadCloud, Trash2, Globe, Facebook, Phone, FileText, Check, Loader2, Maximize2, UserCheck, FileUp, FileDown, ChevronDown, Sparkles, GripVertical, ChevronLeft, ChevronRight } from "lucide-react";
import { Property, TransactionType, PropertyStatus, DISTRICT_OPTIONS, AuthUser } from "../types";
import ImageViewerModal from "./ImageViewerModal";

// State structure for individual files being processed/uploaded
interface UploadingItem {
  id: string;
  file: File;
  previewUrl: string;
  status: "compressing" | "uploading" | "error";
  error?: string;
}

// Client-side image compression utilizing HTML5 Canvas
const compressImage = (file: File, maxWidth = 1200, maxHeight = 1200, quality = 0.8): Promise<File> => {
  return new Promise((resolve) => {
    // Only compress common image formats, skip others
    if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Maintain aspect ratio while sizing down
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        
        if (!ctx) {
          resolve(file); // fallback if context creation fails
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              // Return compressed file only if it actually reduced the size
              resolve(compressedFile.size < file.size ? compressedFile : file);
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
};

const MAX_IMAGES = 20;

interface PropertyFormModalProps {
  property?: Property | null; // null if adding new
  isOpen: boolean;
  onClose: () => void;
  onSave: any;
  cloudinaryConfig?: { cloudName: string; uploadPreset: string };
  currentUser?: AuthUser | null;
  editingProperty?: Property | null; // fallback
}

export default function PropertyFormModal({ property, isOpen, onClose, onSave, cloudinaryConfig, currentUser }: PropertyFormModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [facebookLink, setFacebookLink] = useState("");
  const [websiteLink, setWebsiteLink] = useState("");
  const [content, setContent] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [loaiGiaoDich, setLoaiGiaoDich] = useState<TransactionType>("khach_ban");
  const [status, setStatus] = useState<PropertyStatus>("moi");
  const [district, setDistrict] = useState<string>("");

  const [uploading, setUploading] = useState(false);
  const [uploadingItems, setUploadingItems] = useState<UploadingItem[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const txtFileInputRef = useRef<HTMLInputElement>(null);
  const rawTxtInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingTxt, setIsDraggingTxt] = useState(false);
  const [showRawParser, setShowRawParser] = useState(false);

  // Drag and Drop image reordering states
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);
  const [dragOverImageIndex, setDragOverImageIndex] = useState<number | null>(null);

  // Raw Data auto-fill states
  const [rawData, setRawData] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // Sync global uploading status with any active compressing or uploading items
  const activeUploadsCount = uploadingItems.filter(
    (item) => item.status === "compressing" || item.status === "uploading"
  ).length;

  useEffect(() => {
    setUploading(activeUploadsCount > 0);
  }, [activeUploadsCount]);

  // Auto-fill success toast timer
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Initialize form with property data if editing
  useEffect(() => {
    // Revoke any existing temporary preview URLs before resetting
    uploadingItems.forEach((item) => {
      URL.revokeObjectURL(item.previewUrl);
    });
    setUploadingItems([]);

    if (property) {
      setName(property.name || "");
      setPhone(property.phone || "");
      setFacebookLink(property.facebook_link || "");
      setWebsiteLink(property.website_link || "");
      setContent(property.content || "");
      setImageUrls(property.image_urls || []);
      setLoaiGiaoDich(property.loai_giao_dich || "khach_ban");
      setStatus(property.status || "moi");
      setDistrict(property.district || "");
    } else {
      setName("");
      setPhone("");
      setFacebookLink("");
      setWebsiteLink("");
      setContent("");
      setImageUrls([]);
      setLoaiGiaoDich("khach_ban");
      setStatus("moi");
      setDistrict("");
    }
    setRawData("");
    setToastMessage(null);
    setUploadError(null);
    setSubmitError(null);
    setIsDragging(false);
  }, [property, isOpen]);

  if (!isOpen) return null;

  // Single file uploading processor with dual-channel (Server Proxy + Direct Cloudinary Fallback)
  const uploadSingleItem = async (item: UploadingItem) => {
    const rawCloudName = (import.meta as any).env?.VITE_CLOUDINARY_CLOUD_NAME || cloudinaryConfig.cloudName || "";
    let cloudName = rawCloudName.trim().replace(/^["']|["']$/g, "").trim();
    if (cloudName.startsWith("CLOUDINARY_URL=")) {
      cloudName = cloudName.substring("CLOUDINARY_URL=".length).trim();
    }
    if (cloudName.startsWith("cloudinary://")) {
      const atIndex = cloudName.lastIndexOf("@");
      if (atIndex !== -1) {
        cloudName = cloudName.substring(atIndex + 1).trim();
      }
    }
    cloudName = cloudName.split("/")[0].trim();

    const uploadPreset = ((import.meta as any).env?.VITE_CLOUDINARY_UPLOAD_PRESET || cloudinaryConfig.uploadPreset || "").trim();

    try {
      // Step 1: Compress the image in the background (client-side canvas)
      const compressedFile = await compressImage(item.file);
      
      // Update item status to uploading after compression completes
      setUploadingItems(prev =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "uploading" as const } : i))
      );

      let secureUrl = "";
      let lastErrorMessage = "";

      // Channel 1: Upload via server-side proxy
      try {
        const formData = new FormData();
        formData.append("file", compressedFile);
        formData.append("upload_preset", uploadPreset);

        const token = localStorage.getItem("admin_token") || "";
        const headers: Record<string, string> = {};
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(`/api/upload-image`, {
          method: "POST",
          body: formData,
          credentials: "include",
          headers,
        });

        const contentType = (response.headers.get("content-type") || "").toLowerCase();
        if (contentType.includes("application/json")) {
          const data = await response.json();
          if (response.ok && data.secure_url) {
            secureUrl = data.secure_url;
          } else {
            lastErrorMessage = `${data.error || "Máy chủ proxy báo lỗi"} (HTTP ${response.status} — POST /api/upload-image)`;
          }
        } else {
          lastErrorMessage = `Máy chủ không trả về JSON (HTTP ${response.status} — POST /api/upload-image, Content-Type: ${contentType || "none"})`;
        }
      } catch (proxyErr: any) {
        console.warn("Proxy upload failed, trying direct Cloudinary channel:", proxyErr);
        lastErrorMessage = proxyErr.message || "Không thể kết nối proxy.";
      }

      // Channel 2: If Channel 1 did not return secureUrl, fallback directly to Cloudinary API
      if (!secureUrl && cloudName && uploadPreset && !uploadPreset.startsWith("cloudinary://")) {
        try {
          const directFormData = new FormData();
          directFormData.append("file", compressedFile);
          directFormData.append("upload_preset", uploadPreset);

          const directUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
          const directResponse = await fetch(directUrl, {
            method: "POST",
            body: directFormData,
          });

          const directContentType = (directResponse.headers.get("content-type") || "").toLowerCase();
          if (directContentType.includes("application/json")) {
            const directData = await directResponse.json();
            if (directResponse.ok && directData.secure_url) {
              secureUrl = directData.secure_url;
            } else if (directData?.error?.message) {
              lastErrorMessage = `${directData.error.message} (HTTP ${directResponse.status} — POST ${directUrl})`;
            }
          } else {
            lastErrorMessage = `Cloudinary không trả về JSON (HTTP ${directResponse.status} — POST ${directUrl})`;
          }
        } catch (directErr: any) {
          console.warn("Direct Cloudinary upload skipped:", directErr);
          lastErrorMessage = directErr.message || "Tải trực tiếp lên Cloudinary thất bại.";
        }
      }

      // Channel 3: Fallback to inline compressed Data URL if preset was not found
      if (!secureUrl) {
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("Lỗi đọc file"));
            reader.readAsDataURL(compressedFile);
          });
          if (dataUrl) {
            secureUrl = dataUrl;
          }
        } catch (_) {}
      }

      if (secureUrl) {
        // Success: append the secure URL to form state
        setImageUrls(prev => [...prev, secureUrl]);
        
        // Remove this item from uploading state and release blob URL
        setUploadingItems(prev => {
          const found = prev.find((i) => i.id === item.id);
          if (found) URL.revokeObjectURL(found.previewUrl);
          return prev.filter((i) => i.id !== item.id);
        });
      } else {
        throw new Error(lastErrorMessage || "Không thể tải ảnh lên. Vui lòng thử lại.");
      }
    } catch (err: any) {
      console.warn(`Error uploading item ${item.id}:`, err);
      setUploadingItems(prev =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, status: "error" as const, error: err.message || "Tải ảnh thất bại" }
            : i
        )
      );
    }
  };

  // Multiple files parallel trigger
  const uploadFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    const currentTotalCount = imageUrls.length + uploadingItems.filter(item => item.status !== "error").length;
    const remainingSlots = MAX_IMAGES - currentTotalCount;

    if (remainingSlots <= 0) {
      setUploadError(`Bạn chỉ được tải lên tối đa ${MAX_IMAGES} hình ảnh.`);
      return;
    }

    setUploadError(null);

    // Filter list to upload within allowed remaining slots
    const filesToUpload = Array.from(files).slice(0, remainingSlots) as File[];

    // Create item references with local preview object URLs instantly
    const newItems: UploadingItem[] = filesToUpload.map((file, idx) => ({
      id: `upload-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: "compressing",
    }));

    // Update state to render loading previews immediately
    setUploadingItems(prev => [...prev, ...newItems]);

    // Fire off all uploads in parallel
    newItems.forEach((item) => {
      uploadSingleItem(item);
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const retryUpload = (id: string) => {
    const item = uploadingItems.find((i) => i.id === id);
    if (!item) return;

    setUploadingItems(prev =>
      prev.map((i) => (i.id === id ? { ...i, status: "compressing" as const, error: undefined } : i))
    );

    uploadSingleItem(item);
  };

  const removeUploadingItem = (id: string) => {
    setUploadingItems(prev => {
      const found = prev.find((i) => i.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  // Cloudinary image change handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      uploadFiles(e.target.files);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (imageUrls.length < MAX_IMAGES && !uploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (imageUrls.length >= MAX_IMAGES || uploading) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Filter image files only
      const filesArray = Array.from(e.dataTransfer.files) as File[];
      const imageFiles = filesArray.filter(file => file.type && file.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        setUploadError("Chỉ chấp nhận tệp hình ảnh.");
        return;
      }
      uploadFiles(imageFiles);
    }
  };

  // Remove image
  const removeImage = (indexToRemove: number) => {
    setImageUrls((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Reorder images via Drag and Drop
  const handleImageDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.dataTransfer.setData("text/plain", index.toString());
    e.dataTransfer.effectAllowed = "move";
    setDraggedImageIndex(index);
  };

  const handleImageDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (dragOverImageIndex !== index) {
      setDragOverImageIndex(index);
    }
  };

  const handleImageDragEnd = () => {
    setDraggedImageIndex(null);
    setDragOverImageIndex(null);
  };

  const handleImageDrop = (e: React.DragEvent<HTMLDivElement>, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedImageIndex === null || draggedImageIndex === targetIndex) {
      setDraggedImageIndex(null);
      setDragOverImageIndex(null);
      return;
    }

    setImageUrls((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(draggedImageIndex, 1);
      updated.splice(targetIndex, 0, moved);
      return updated;
    });
    setToastMessage(`Đã chuyển ảnh ${draggedImageIndex + 1} sang vị trí ${targetIndex + 1}`);
    setDraggedImageIndex(null);
    setDragOverImageIndex(null);
  };

  // Reorder images via Left/Right arrows (useful for touch devices and quick nudge)
  const moveImage = (currentIndex: number, newIndex: number) => {
    if (newIndex < 0 || newIndex >= imageUrls.length) return;
    setImageUrls((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(currentIndex, 1);
      updated.splice(newIndex, 0, moved);
      return updated;
    });
  };

  // Upload/Import .txt file directly into "Nội dung chi tiết / Mô tả căn bản"
  const handleUploadContentTxt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (typeof text === "string") {
        setContent(text);
        setToastMessage(`Đã nạp thành công nội dung từ file "${file.name}"`);
      }
      e.target.value = "";
    };
    reader.onerror = () => {
      setToastMessage("Không thể đọc tệp .txt. Vui lòng kiểm tra lại file!");
      e.target.value = "";
    };
    reader.readAsText(file, "UTF-8");
  };

  // Download/Export text in "Nội dung chi tiết / Mô tả căn bản" as .txt file
  const handleDownloadContentTxt = () => {
    if (!content.trim()) return;
    const safeTitle = (name || "mo-ta-can-ban")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF]+/gi, "-");
    const filename = `${safeTitle}-${Date.now().toString().slice(-4)}.txt`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setToastMessage(`Đã tải xuống file "${filename}"`);
  };

  // Upload/Import .txt file for Raw Data Parser
  const handleUploadRawTxt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (typeof text === "string") {
        setRawData(text);
        setShowRawParser(true);
        setToastMessage(`Đã nạp dữ liệu thô từ file "${file.name}"`);
      }
      e.target.value = "";
    };
    reader.onerror = () => {
      setToastMessage("Không thể đọc tệp .txt. Vui lòng kiểm tra lại file!");
      e.target.value = "";
    };
    reader.readAsText(file, "UTF-8");
  };

  // Auto-fill raw text parser
  const handleAutoFill = () => {
    if (!rawData.trim()) return;

    let remainingText = rawData;

    // 1. Extract Vietnamese phone number
    const phoneRegex = /(?:^|[^0-9])(0[0-9](?:\s*[.\-]?\s*\d){8,9})(?![0-9])/g;
    let phoneMatch;
    let extractedPhone = "";
    let originalPhoneMatchText = "";

    if ((phoneMatch = phoneRegex.exec(rawData)) !== null) {
      originalPhoneMatchText = phoneMatch[1];
      extractedPhone = originalPhoneMatchText.replace(/[^0-9]/g, "");
    }

    // 2. Extract Facebook Link and Other Link
    const urlRegex = /(https?:\/\/[^\s]+|www\.[a-zA-Z0-9\-.]+\.[a-zA-Z]{2,6}(?:\/[^\s]*)?|[a-zA-Z0-9\-]+\.[a-zA-Z]{2,6}(?:\.[a-zA-Z]{2,6})*(?:\/[^\s]*)?)/gi;
    let fbLinkVal = "";
    let originalFbMatchText = "";
    let otherLinkVal = "";
    let originalOtherMatchText = "";

    const urlMatches: string[] = [];
    let urlMatch;
    while ((urlMatch = urlRegex.exec(rawData)) !== null) {
      urlMatches.push(urlMatch[0]);
    }

    for (const url of urlMatches) {
      const cleanedUrl = url.replace(/[.,!?;:)\s]+$/, "");
      const isFb = /facebook\.com|fb\.com/i.test(cleanedUrl);
      if (isFb) {
        if (!fbLinkVal) {
          originalFbMatchText = url;
          fbLinkVal = cleanedUrl;
          if (!/^https?:\/\//i.test(fbLinkVal)) {
            fbLinkVal = "https://" + fbLinkVal;
          }
        }
      } else {
        if (!otherLinkVal) {
          const hasCommonTld = /\.(com|vn|net|org|info|xyz|me|cc|info|gov|edu|html|htm|php|aspx)/i.test(cleanedUrl) || /^https?:\/\//i.test(cleanedUrl) || /^www\./i.test(cleanedUrl);
          if (hasCommonTld) {
            originalOtherMatchText = url;
            otherLinkVal = cleanedUrl;
            if (!/^https?:\/\//i.test(otherLinkVal)) {
              otherLinkVal = "https://" + otherLinkVal;
            }
          }
        }
      }
    }

    // 3. Update States
    if (extractedPhone) {
      setPhone(extractedPhone);
    }
    if (fbLinkVal) {
      setFacebookLink(fbLinkVal);
    }
    if (otherLinkVal) {
      setWebsiteLink(otherLinkVal);
    }

    // Auto-detect District from raw text if not yet set
    for (const opt of DISTRICT_OPTIONS) {
      if (opt === "Khác") continue;
      const shortName = opt.replace(/^Quận\s+/, "").replace(/^TP\.\s+/, "");
      const pattern = new RegExp(`(\\b${opt}\\b|\\bQ\\.?\\s*${shortName}\\b|\\b${shortName}\\b)`, "i");
      if (pattern.test(rawData)) {
        setDistrict(opt);
        break;
      }
    }

    // 4. Remove extracted segments from original text
    if (originalPhoneMatchText) {
      remainingText = remainingText.replace(originalPhoneMatchText, "");
    }
    if (originalFbMatchText) {
      remainingText = remainingText.replace(originalFbMatchText, "");
    }
    if (originalOtherMatchText) {
      remainingText = remainingText.replace(originalOtherMatchText, "");
    }

    // Clean up content whitespaces & extra newlines
    let cleanedContent = remainingText
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join("\n");

    cleanedContent = cleanedContent.replace(/[ \t]+/g, " ").trim();
    setContent(cleanedContent);

    // 5. Show Success Toast
    setToastMessage("Đã tự động điền thông tin, vui lòng kiểm tra lại trước khi lưu.");
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let finalName = name.trim();
    if (!finalName) {
      if (content.trim()) {
        const firstLine = content.trim().split("\n")[0].slice(0, 60);
        finalName = firstLine || "Nguồn nhà mới";
      } else {
        finalName = "Nguồn nhà mới";
      }
    }
    const finalDistrict = district || "Khác";

    setSubmitting(true);
    setSubmitError(null);

    const payload: Property = {
      id: property?.id,
      name: finalName,
      phone: phone.trim(),
      district: finalDistrict,
      facebook_link: facebookLink.trim(),
      website_link: websiteLink.trim(),
      content: content.trim(),
      image_urls: imageUrls,
      loai_giao_dich: loaiGiaoDich,
      status: status,
      created_by: property?.created_by,
      created_by_name: property?.created_by_name,
    };

    try {
      const result = await onSave(payload);
      setSubmitting(false);
      if (result && result.success) {
        onClose();
      } else {
        setSubmitError(result?.error || "Lưu thông tin thất bại. Vui lòng kiểm tra lại kết nối cơ sở dữ liệu.");
      }
    } catch (err: any) {
      setSubmitting(false);
      setSubmitError(err.message || "Lỗi lưu thông tin.");
    }
  };

  return (
    <div id="modal-form-overlay" className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto">
      <div id="modal-form-content" className="relative w-full max-w-3xl lg:max-w-4xl custom-bg-secondary rounded-xl sm:rounded-2xl border custom-border shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col min-w-0">
        
        {/* Floating Success Toast */}
        {toastMessage && (
          <div id="toast-autofill-success" className="absolute top-2.5 sm:top-3 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-slate-900 px-3.5 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5 text-xs font-bold animate-pulse border border-amber-400 max-w-[90%] break-words">
            <Check className="w-3.5 h-3.5 stroke-[3] text-slate-900 shrink-0" />
            <span className="truncate">{toastMessage}</span>
          </div>
        )}

        {/* Modal Header */}
        <div className="px-3.5 sm:px-5 py-2 sm:py-2.5 border-b custom-border flex justify-between items-center bg-black/5 dark:bg-white/5 shrink-0 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <h3 className="text-sm sm:text-base font-bold custom-text-primary flex items-center gap-2 truncate">
              {property ? "Chỉnh sửa thông tin chủ nhà" : "Thêm thông tin chủ nhà mới"}
            </h3>
            {!property && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200 text-[11px] font-semibold border border-amber-500/30">
                <UserCheck className="w-3 h-3 text-amber-500 shrink-0" />
                <span className="truncate">Phụ trách: <strong>{currentUser?.full_name || currentUser?.email?.split("@")[0] || "Bạn"}</strong></span>
                {currentUser?.phone && <span className="opacity-80 font-mono ml-0.5">({currentUser.phone})</span>}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            id="btn-close-form"
            className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 custom-text-secondary cursor-pointer transition-colors shrink-0 ml-2"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} id="property-form" className="flex flex-col flex-1 overflow-hidden w-full min-w-0">
          <div className="p-3 sm:p-4 space-y-2.5 overflow-y-auto overflow-x-hidden flex-1 max-h-[calc(92vh-6.5rem)] w-full min-w-0">
            
            {submitError && (
              <div id="form-error-msg" className="p-2 sm:p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-xs font-medium">
                {submitError}
              </div>
            )}

            {/* Mobile Automatic Manager Assignment Indicator */}
            {!property && (
              <div id="manager-auto-assigned-box" className="sm:hidden flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-800 dark:text-amber-200">
                <UserCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="truncate">Phụ trách: <strong>{currentUser?.full_name || currentUser?.email?.split("@")[0] || "Bạn"}</strong></span>
              </div>
            )}

            {/* Raw Data Parser Input Block - Collapsible & Compact */}
            <div id="raw-data-parser-section" className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden transition-all">
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-amber-500/10">
                <button
                  type="button"
                  onClick={() => setShowRawParser(!showRawParser)}
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-200 hover:text-amber-900 dark:hover:text-amber-100 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Dán dữ liệu thô (Điền nhanh)</span>
                  <span className="text-[10px] font-normal text-amber-700/80 dark:text-amber-300/80 hidden sm:inline">
                    - Tách nhanh SĐT, FB, mô tả...
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-amber-500 transition-transform duration-200 ${showRawParser ? "rotate-180" : ""}`} />
                </button>
                <div className="flex items-center gap-1">
                  <input
                    type="file"
                    ref={rawTxtInputRef}
                    accept=".txt,text/plain"
                    className="hidden"
                    onChange={handleUploadRawTxt}
                  />
                  <button
                    type="button"
                    id="btn-upload-raw-txt"
                    onClick={() => {
                      setShowRawParser(true);
                      rawTxtInputRef.current?.click();
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-amber-500/30 bg-amber-500/15 hover:bg-amber-500/25 text-[11px] font-semibold text-amber-800 dark:text-amber-200 transition-all cursor-pointer active:scale-95"
                    title="Nạp dữ liệu thô từ file .txt"
                  >
                    <FileUp className="w-3 h-3 text-amber-500" />
                    <span>Nạp file .txt</span>
                  </button>
                </div>
              </div>

              {showRawParser && (
                <div className="p-2 sm:p-2.5 space-y-2 border-t border-amber-500/20">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <textarea
                      id="textarea-raw-data"
                      rows={2}
                      placeholder="Dán toàn bộ tin đăng vào đây để hệ thống tự nhận diện SĐT, link, mô tả..."
                      value={rawData}
                      onChange={(e) => setRawData(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border custom-border custom-bg-primary custom-text-primary focus:outline-none focus:ring-1 focus:ring-amber-400 transition-all text-xs placeholder-slate-400/80 resize-none flex-1"
                    />
                    <button
                      type="button"
                      id="btn-auto-fill"
                      onClick={handleAutoFill}
                      disabled={!rawData.trim()}
                      className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-500 text-slate-900 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-xs active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed sm:self-stretch"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Tự tách tin</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 2-Column Responsive Form Layout on md+ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-3.5 pt-0.5">

              {/* CỘT TRÁI: Thông tin cơ bản, Phân loại & Liên kết */}
              <div className="space-y-2.5">
                {/* Tên & Số điện thoại */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider custom-text-primary block" htmlFor="input-name">
                      Tên chủ nhà <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="input-name"
                      type="text"
                      required
                      placeholder="Ví dụ: Nguyễn Văn A"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border custom-border custom-bg-primary custom-text-primary focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all text-xs sm:text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider custom-text-primary block" htmlFor="input-phone">
                      Số điện thoại
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        id="input-phone"
                        type="tel"
                        placeholder="Ví dụ: 0912345678"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border custom-border custom-bg-primary custom-text-primary focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all text-xs sm:text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Khu vực (Quận/Huyện) & Trạng thái */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider custom-text-primary block" htmlFor="select-district">
                      Khu vực <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="select-district"
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      required
                      className={`w-full px-2 py-1.5 rounded-lg border ${
                        !district ? "border-amber-500/50 bg-amber-500/5" : "custom-border"
                      } custom-bg-primary custom-text-primary focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all text-xs sm:text-sm cursor-pointer`}
                    >
                      <option value="" disabled>-- Chọn Quận/Huyện * --</option>
                      {DISTRICT_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider custom-text-primary block" htmlFor="select-status">
                      Trạng thái
                    </label>
                    <select
                      id="select-status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value as PropertyStatus)}
                      className="w-full px-2 py-1.5 rounded-lg border custom-border custom-bg-primary custom-text-primary focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all text-xs sm:text-sm cursor-pointer"
                    >
                      <option value="moi">Nguồn thô</option>
                      <option value="dang_lien_he">Đang liên hệ</option>
                      <option value="da_ky">Đã ký nhận</option>
                      <option value="da_ban">Đã bán</option>
                    </select>
                  </div>
                </div>

                {/* Loại giao dịch */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider custom-text-primary block">
                    Loại giao dịch <span className="text-red-500">*</span>
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: "khach_ban", label: "Khách cần bán" },
                      { id: "khach_mua", label: "Khách mua" },
                      { id: "moi_gioi", label: "Môi giới" }
                    ].map((option) => (
                      <label
                        key={option.id}
                        className={`flex items-center justify-center py-1.5 px-1 rounded-lg border text-center cursor-pointer transition-all ${
                          loaiGiaoDich === option.id
                            ? "border-amber-400 bg-amber-400/15 text-amber-500 font-bold"
                            : "custom-border hover:bg-black/5 dark:hover:bg-white/5 custom-text-primary text-xs"
                        }`}
                      >
                        <input
                          type="radio"
                          name="loai_giao_dich"
                          value={option.id}
                          checked={loaiGiaoDich === option.id}
                          onChange={() => setLoaiGiaoDich(option.id as TransactionType)}
                          className="sr-only"
                        />
                        <span className="text-[11px] sm:text-xs truncate">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Social Links: Facebook & Website */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider custom-text-primary block" htmlFor="input-facebook">
                      Facebook Link
                    </label>
                    <div className="relative">
                      <Facebook className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-500" />
                      <input
                        id="input-facebook"
                        type="url"
                        placeholder="https://facebook.com/..."
                        value={facebookLink}
                        onChange={(e) => setFacebookLink(e.target.value)}
                        className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border custom-border custom-bg-primary custom-text-primary focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all text-xs sm:text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider custom-text-primary block" htmlFor="input-website">
                      Website / Link khác
                    </label>
                    <div className="relative">
                      <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        id="input-website"
                        type="url"
                        placeholder="https://batdongsan.com/..."
                        value={websiteLink}
                        onChange={(e) => setWebsiteLink(e.target.value)}
                        className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border custom-border custom-bg-primary custom-text-primary focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all text-xs sm:text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* CỘT PHẢI: Nội dung chi tiết & Hình ảnh */}
              <div className="space-y-2.5">

                {/* Content Textarea */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-1.5 flex-wrap">
                    <label className="text-[11px] font-bold uppercase tracking-wider custom-text-primary" htmlFor="textarea-content">
                      Nội dung chi tiết / Mô tả
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="file"
                        ref={txtFileInputRef}
                        accept=".txt,text/plain"
                        className="hidden"
                        onChange={handleUploadContentTxt}
                      />
                      
                      {/* Nút Tải file .txt lên */}
                      <button
                        type="button"
                        id="btn-upload-content-txt"
                        onClick={() => txtFileInputRef.current?.click()}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border custom-border bg-slate-500/5 hover:bg-amber-500/10 hover:border-amber-500/30 text-[10px] sm:text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:text-amber-500 transition-all cursor-pointer active:scale-95"
                        title="Chọn file .txt từ máy tính để nạp vào ô mô tả"
                      >
                        <FileUp className="w-3 h-3 text-amber-500" />
                        <span>Tải .txt lên</span>
                      </button>

                      {/* Nút Tải file .txt về */}
                      <button
                        type="button"
                        id="btn-download-content-txt"
                        onClick={handleDownloadContentTxt}
                        disabled={!content.trim()}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border custom-border bg-slate-500/5 hover:bg-amber-500/10 hover:border-amber-500/30 text-[10px] sm:text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:text-amber-500 transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={content.trim() ? "Tải nội dung mô tả này về máy dạng file .txt" : "Chưa có nội dung để tải về"}
                      >
                        <FileDown className="w-3 h-3 text-amber-500" />
                        <span>Tải .txt về</span>
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <textarea
                      id="textarea-content"
                      rows={3}
                      placeholder="Mô tả căn bản: diện tích, kết cấu, đường/hẻm, pháp lý... (Bấm 'Tải .txt lên' hoặc kéo thả file .txt vào đây)"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingTxt(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        setIsDraggingTxt(false);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingTxt(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file && (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt"))) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const text = ev.target?.result as string;
                            if (typeof text === "string") {
                              setContent(text);
                              setToastMessage(`Đã nạp nội dung từ file "${file.name}"`);
                            }
                          };
                          reader.onerror = () => {
                            setToastMessage("Không thể đọc tệp .txt.");
                          };
                          reader.readAsText(file, "UTF-8");
                        }
                      }}
                      className={`w-full px-2.5 py-1.5 rounded-lg border ${
                        isDraggingTxt ? "border-amber-400 ring-2 ring-amber-400 bg-amber-500/10" : "custom-border"
                      } custom-bg-primary custom-text-primary focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all text-xs sm:text-sm resize-none`}
                    />
                    {isDraggingTxt && (
                      <div className="absolute inset-0 bg-amber-500/20 border-2 border-dashed border-amber-500 rounded-lg flex items-center justify-center pointer-events-none text-xs font-bold text-amber-600 dark:text-amber-400 backdrop-blur-2xs">
                        Thả file .txt vào đây để nạp nội dung
                      </div>
                    )}
                  </div>
                </div>

                {/* Images Uploader Section - Compact & Neat */}
                <div className="space-y-1.5 pt-0.5">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider custom-text-primary block">
                        Hình ảnh ({imageUrls.length}/{MAX_IMAGES})
                      </span>
                      {imageUrls.length > 1 && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                          (Kéo thả đổi vị trí)
                        </span>
                      )}
                    </div>
                    {cloudinaryConfig.cloudName ? (
                      <span className="text-[10px] text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full font-semibold font-mono">
                        Cloudinary
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full font-semibold font-mono">
                        Nén tự động
                      </span>
                    )}
                  </div>

                  {/* Compact Upload Dropzone */}
                  <div 
                    onClick={() => {
                      if (imageUrls.length < MAX_IMAGES && !uploading) {
                        fileInputRef.current?.click();
                      }
                    }}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border border-dashed rounded-lg p-2.5 sm:p-3 flex items-center justify-center gap-3 cursor-pointer transition-all ${
                      imageUrls.length >= MAX_IMAGES 
                        ? "opacity-50 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 cursor-not-allowed" 
                        : isDragging
                          ? "border-amber-400 bg-amber-400/15 scale-[1.01] shadow-xs"
                          : "custom-border hover:border-amber-400 hover:bg-amber-400/5 bg-black/5 dark:bg-white/5"
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      multiple
                      accept="image/*"
                      disabled={imageUrls.length >= MAX_IMAGES || uploading}
                      className="hidden"
                    />
                    
                    {uploading ? (
                      <div className="flex items-center gap-2 text-center pointer-events-none py-1">
                        <Loader2 className="w-5 h-5 text-amber-500 animate-spin shrink-0" />
                        <span className="text-xs font-semibold text-amber-500">
                          Đang tải lên {activeUploadsCount} ảnh...
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5 pointer-events-none py-0.5">
                        <UploadCloud className={`w-5 h-5 shrink-0 transition-transform ${isDragging ? "text-amber-400 scale-110" : "text-amber-500"}`} />
                        <div className="text-left">
                          <p className="text-xs font-semibold custom-text-primary leading-tight">
                            {imageUrls.length >= MAX_IMAGES 
                              ? `Đã đạt tối đa ${MAX_IMAGES} ảnh` 
                              : isDragging 
                                ? "Thả hình ảnh vào đây ngay!" 
                                : "Bấm chọn ảnh hoặc kéo thả vào đây"}
                          </p>
                          <p className="text-[10px] custom-text-secondary leading-tight mt-0.5">
                            JPG, PNG, WEBP (Tối đa {MAX_IMAGES} ảnh)
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {uploadError && (
                    <p id="image-upload-error" className="text-xs text-red-500 font-medium">
                      {uploadError}
                    </p>
                  )}

                  {/* Image Preview List - Compact Grid with Drag & Drop Reordering */}
                  {(imageUrls.length > 0 || uploadingItems.length > 0) && (
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 pt-1 max-h-40 overflow-y-auto pr-0.5" id="preview-image-list">
                      {/* Real uploaded images (Draggable & Reorderable) */}
                      {imageUrls.map((url, idx) => {
                        const isBeingDragged = draggedImageIndex === idx;
                        const isDragOver = dragOverImageIndex === idx && draggedImageIndex !== idx;

                        return (
                          <div 
                            key={`real-${idx}-${url.slice(-20)}`} 
                            draggable
                            onDragStart={(e) => handleImageDragStart(e, idx)}
                            onDragOver={(e) => handleImageDragOver(e, idx)}
                            onDragEnd={handleImageDragEnd}
                            onDrop={(e) => handleImageDrop(e, idx)}
                            className={`relative group aspect-square rounded-lg overflow-hidden border shadow-2xs transition-all select-none ${
                              isBeingDragged
                                ? "opacity-35 scale-95 border-dashed border-amber-500 ring-2 ring-amber-400"
                                : isDragOver
                                  ? "border-amber-400 ring-2 ring-amber-400 scale-105 z-20 shadow-md"
                                  : "border-slate-200 dark:border-slate-800 hover:border-amber-400/70 cursor-grab active:cursor-grabbing"
                            }`}
                            title="Kéo thả để sắp xếp lại vị trí ảnh"
                          >
                            <img
                              src={url}
                              alt={`Ảnh ${idx + 1}`}
                              className="w-full h-full object-cover pointer-events-none"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1594322436404-5a0526db4d13?w=200&auto=format&fit=crop&q=60";
                              }}
                            />

                            {/* Badge thứ tự & Ảnh bìa */}
                            <div className={`absolute top-1 left-1 px-1 py-0.5 rounded text-[9px] font-bold z-10 flex items-center gap-0.5 backdrop-blur-xs pointer-events-none ${
                              idx === 0 
                                ? "bg-amber-500 text-slate-950 shadow-xs ring-1 ring-amber-400" 
                                : "bg-black/65 text-white"
                            }`}>
                              <GripVertical className="w-2.5 h-2.5 opacity-80" />
                              <span>{idx === 0 ? "Bìa (1)" : idx + 1}</span>
                            </div>

                            {/* Nút hành động nhanh: Xem phóng to & Xóa */}
                            <div className="absolute top-1 right-1 flex items-center gap-0.5 z-10">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewerIndex(idx);
                                }}
                                className="p-1 rounded-full bg-black/60 hover:bg-black/85 text-white shadow-xs cursor-pointer transition-all opacity-0 group-hover:opacity-100 active:scale-95"
                                title="Xem phóng to"
                              >
                                <Maximize2 className="w-2.5 h-2.5 text-amber-300" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeImage(idx);
                                }}
                                className="p-1 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-xs cursor-pointer transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100 active:scale-95"
                                title="Xóa ảnh"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            </div>

                            {/* Nút chuyển ảnh sang trái/phải */}
                            {imageUrls.length > 1 && (
                              <div className="absolute inset-x-0 bottom-0 py-0.5 px-1 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between z-10">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveImage(idx, idx - 1);
                                  }}
                                  className="p-0.5 rounded bg-black/60 hover:bg-amber-500 hover:text-slate-950 text-white disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                  title="Dời ảnh sang trước"
                                >
                                  <ChevronLeft className="w-3 h-3" />
                                </button>
                                <span className="text-[8px] text-white/80 font-medium">Kéo đổi vị trí</span>
                                <button
                                  type="button"
                                  disabled={idx === imageUrls.length - 1}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveImage(idx, idx + 1);
                                  }}
                                  className="p-0.5 rounded bg-black/60 hover:bg-amber-500 hover:text-slate-950 text-white disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                  title="Dời ảnh ra sau"
                                >
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Active uploading item placeholders */}
                      {uploadingItems.map((item) => (
                        <div key={item.id} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xs bg-black/5 dark:bg-white/5">
                          <img
                            src={item.previewUrl}
                            alt={item.file.name}
                            className="w-full h-full object-cover opacity-60 blur-[1px]"
                          />
                          
                          {/* Compression phase */}
                          {item.status === "compressing" && (
                            <div className="absolute inset-0 bg-slate-900/50 flex flex-col items-center justify-center p-1 text-center">
                              <Loader2 className="w-4 h-4 text-amber-400 animate-spin mb-0.5" />
                              <span className="text-[9px] text-white font-medium">Nén...</span>
                            </div>
                          )}

                          {/* Upload phase */}
                          {item.status === "uploading" && (
                            <div className="absolute inset-0 bg-slate-900/50 flex flex-col items-center justify-center p-1 text-center">
                              <Loader2 className="w-4 h-4 text-amber-400 animate-spin mb-0.5" />
                              <span className="text-[9px] text-white font-medium animate-pulse">Tải...</span>
                            </div>
                          )}

                          {/* Error fallback */}
                          {item.status === "error" && (
                            <div className="absolute inset-0 bg-red-950/85 flex flex-col items-center justify-center p-1 text-center">
                              <span className="text-[8px] text-red-200 font-bold mb-0.5 line-clamp-1 leading-tight px-0.5">
                                {item.error || "Lỗi"}
                              </span>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => retryUpload(item.id)}
                                  className="px-1.5 py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[8px] cursor-pointer transition-colors active:scale-95"
                                >
                                  Lại
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeUploadingItem(item.id)}
                                  className="p-0.5 rounded bg-red-600 hover:bg-red-700 text-white cursor-pointer transition-colors active:scale-95"
                                  title="Hủy"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
              {/* Kết thúc CỘT PHẢI */}

            </div>
            {/* Kết thúc Grid 2 cột */}

          </div>
          {/* Kết thúc phần thân cuộn */}

          {/* Modal Footer */}
          <div className="px-3.5 sm:px-5 py-2.5 sm:py-3 border-t custom-border flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-2.5 bg-black/5 dark:bg-white/5 shrink-0">
            <button
              type="button"
              id="btn-cancel-form"
              onClick={onClose}
              disabled={submitting}
              className="w-full sm:w-auto px-4 py-1.5 sm:py-2 rounded-lg border custom-border hover:bg-black/5 dark:hover:bg-white/5 custom-text-primary text-xs sm:text-sm font-semibold transition-all cursor-pointer disabled:opacity-50 text-center"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              id="btn-save-form"
              disabled={submitting || uploading}
              className="w-full sm:w-auto px-5 py-1.5 sm:py-2 rounded-lg custom-accent-bg hover:opacity-95 text-white text-xs sm:text-sm font-bold transition-all duration-200 flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50 text-center"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>{property ? "Cập nhật" : "Lưu tin"}</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>

      {/* Zoomable Image Viewer Modal */}
      <ImageViewerModal
        isOpen={viewerIndex !== null}
        images={imageUrls}
        initialIndex={viewerIndex ?? 0}
        title={name ? `Ảnh: ${name}` : "Xem ảnh chi tiết"}
        onClose={() => setViewerIndex(null)}
      />
    </div>
  );
}
