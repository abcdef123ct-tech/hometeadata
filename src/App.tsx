import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  Database,
  AlertCircle,
  RefreshCw,
  MapPin,
  LayoutList,
  LayoutGrid,
  CheckCircle2,
  Trash2,
  Sparkles,
  CheckSquare,
  Square,
} from "lucide-react";
import {
  Property,
  ConfigStatus,
  DISTRICT_OPTIONS,
  AuthUser,
  BusinessStatusType,
  ProcessingStatusType,
  ExportLogEntry,
  LoaiViTriType,
  AiExtractedFieldKey,
} from "./types";
import {
  normalizePropertyRecord,
  NormalizedWarehouseProperty,
  BUSINESS_STATUS_META,
  PROCESSING_STATUS_META,
  toVNguonXuatRow,
  LOAI_VI_TRI_LABELS,
  LOAI_VI_TRI_OPTIONS,
  HUONG_OPTIONS,
  PHAP_LY_PRESETS,
} from "./utils/dataWarehouseUtils";
import { safeFetchJson } from "./utils/apiClient";
import { postToHometea } from "./utils/hometeaPost";
import ConfigGuide from "./components/ConfigGuide";
import PropertyFormModal from "./components/PropertyFormModal";
import BulkFolderImportModal from "./components/BulkFolderImportModal";
import LoginScreen from "./components/LoginScreen";
import UserManagementView from "./components/UserManagementView";
import UserProfileView from "./components/UserProfileView";
import SystemAndReportsView from "./components/SystemAndReportsView";
import WarehouseEditDrawer from "./components/WarehouseEditDrawer";
import MigrationProposalModal from "./components/MigrationProposalModal";
import DataQualityView from "./components/DataQualityView";
import ExportLogsView from "./components/ExportLogsView";
import SmartImage from "./components/SmartImage";
import { Navbar, ActiveTabType } from "./components/Navbar";
import { PropertyCard } from "./components/PropertyCard";

export default function App() {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTabType>("properties");

  // Giữ giao diện tối chuẩn
  const [isDarkMode] = useState<boolean>(true);

  // Data & Config States
  const [properties, setProperties] = useState<Property[]>([]);
  const [exportLogs, setExportLogs] = useState<ExportLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isFallbackMode, setIsFallbackMode] = useState<boolean>(false);
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [cloudinaryConfig, setCloudinaryConfig] = useState<{
    cloudName: string;
    uploadPreset: string;
  }>({
    cloudName: "",
    uploadPreset: "",
  });

  // Filters & View Mode (Default: BẢNG dày "table", tùy chọn phụ: "cards")
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterBusinessStatus, setFilterBusinessStatus] = useState<
    "all" | BusinessStatusType
  >("all");
  const [filterProcessingStatus, setFilterProcessingStatus] = useState<
    "all" | ProcessingStatusType
  >("all");
  const [filterDistrict, setFilterDistrict] = useState<string>("all");
  const [filterCompleteness, setFilterCompleteness] = useState<
    "all" | "complete" | "incomplete"
  >("all");
  const [filterAiState, setFilterAiState] = useState<
    "all" | "needs_confirm" | "extracted" | "unextracted"
  >("all");

  // Selection for Bulk Actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkWardValue, setBulkWardValue] = useState<string>("");
  const [bulkActionLoading, setBulkActionLoading] = useState<boolean>(false);
  const [toastBanner, setToastBanner] = useState<string | null>(null);

  // AI Batch Extraction Progress State (20 items per batch, retry on error)
  const [aiBatchProgress, setAiBatchProgress] = useState<{
    isRunning: boolean;
    currentBatch: number;
    totalBatches: number;
    processedCount: number;
    totalCount: number;
    successCount: number;
    failedIds: string[];
    lastError: string | null;
  }>({
    isRunning: false,
    currentBatch: 0,
    totalBatches: 0,
    processedCount: 0,
    totalCount: 0,
    successCount: 0,
    failedIds: [],
    lastError: null,
  });

  // Inline Quick Edit / Confirm state inside the dense table
  const [inlineAiRowId, setInlineAiRowId] = useState<string | null>(null);
  const [inlineAiDraft, setInlineAiDraft] = useState<{
    loai_vi_tri: LoaiViTriType | "";
    huong: string;
    phap_ly: string;
    so_phong_ngu: string;
    so_wc: string;
    so_nha: string;
    ten_duong: string;
    duong_vao_m: string;
    dac_diem: string;
    hien_trang: string;
  }>({
    loai_vi_tri: "",
    huong: "",
    phap_ly: "",
    so_phong_ngu: "",
    so_wc: "",
    so_nha: "",
    ten_duong: "",
    duong_vao_m: "",
    dac_diem: "",
    hien_trang: "",
  });
  const [inlineAiSaving, setInlineAiSaving] = useState<boolean>(false);

  // Right Edit Drawer & Modals
  const [drawerItemId, setDrawerItemId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState<boolean>(false);
  const [isMigrationModalOpen, setIsMigrationModalOpen] =
    useState<boolean>(false);

  // Delete Confirmation State
  const [deletingProperty, setDeletingProperty] = useState<Property | null>(
    null
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Hometea postMessage posting state
  const [hometeaPostingId, setHometeaPostingId] = useState<string | null>(null);
  const [hometeaStatusMsg, setHometeaStatusMsg] = useState<string | null>(null);

  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const showToast = useCallback((msg: string) => {
    setToastBanner(msg);
    setTimeout(() => {
      setToastBanner((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  // Force dark mode class on root
  useEffect(() => {
    document.documentElement.classList.add("dark");
    localStorage.setItem("theme", "dark");
  }, []);

  const getAuthHeaders = (includeContentType = false): Record<string, string> => {
    const headers: Record<string, string> = {};
    if (includeContentType) {
      headers["Content-Type"] = "application/json";
    }
    const token = localStorage.getItem("admin_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  };

  // Check session on startup
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await safeFetchJson<{
          authenticated?: boolean;
          user?: AuthUser;
        }>("/api/session", {
          headers: getAuthHeaders(),
          credentials: "include",
        });
        if (!res.ok) {
          setIsAuthenticated(false);
          return;
        }
        setIsAuthenticated(Boolean(res.data.authenticated));
        if (res.data.user) {
          setCurrentUser(res.data.user);
        }
      } catch (_) {
        setIsAuthenticated(false);
      }
    };
    checkSession();
  }, []);

  const fetchExportLogs = useCallback(async () => {
    try {
      const res = await safeFetchJson<{ logs?: ExportLogEntry[] }>(
        "/api/export-logs",
        {
          headers: getAuthHeaders(),
          credentials: "include",
        }
      );
      if (res.ok && Array.isArray(res.data.logs)) {
        setExportLogs(res.data.logs);
      }
    } catch (_) {}
  }, []);

  // Fetch system config & properties once authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const loadAppData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [propRes, configRes] = await Promise.all([
          safeFetchJson<{ list?: Property[]; properties?: Property[] }>("/api/properties", {
            headers: getAuthHeaders(),
            credentials: "include",
          }),
          safeFetchJson<ConfigStatus>("/api/config-status", {
            headers: getAuthHeaders(),
            credentials: "include",
          }),
        ]);

        const fetchedList = propRes.data.properties || propRes.data.list;
        if (propRes.ok && Array.isArray(fetchedList)) {
          setProperties(fetchedList);
          setIsFallbackMode(false);
        } else {
          setIsFallbackMode(true);
          setError("Không thể tải danh sách. Đang chạy ở chế độ dự phòng.");
        }

        if (configRes.ok) {
          setConfigStatus(configRes.data);
          if (configRes.data.cloudinary) {
            setCloudinaryConfig({
              cloudName: configRes.data.cloudinary.cloudName || "",
              uploadPreset: configRes.data.cloudinary.uploadPreset || "",
            });
          }
        }
      } catch (err: any) {
        setIsFallbackMode(true);
        setError("Lỗi kết nối cơ sở dữ liệu. Vui lòng thử lại.");
      } finally {
        setLoading(false);
      }
    };

    loadAppData();
    fetchExportLogs();
  }, [isAuthenticated, refreshTrigger, fetchExportLogs]);

  // Handle form modal save
  const handleFormModalSave = async (propertyData: Property): Promise<{ success: boolean; error?: string }> => {
    try {
      const id = propertyData.id || "new";
      const isNew = id === "new";
      const url = isNew ? "/api/properties" : `/api/properties/${id}`;
      const method = isNew ? "POST" : "PUT";

      const res = await safeFetchJson<{ success: boolean; item?: Property }>(
        url,
        {
          method,
          headers: getAuthHeaders(true),
          body: JSON.stringify(propertyData),
          credentials: "include",
        }
      );

      if (res.ok) {
        showToast(isNew ? "Đã thêm tin mới thành công!" : "Đã lưu cập nhật tin!");
        setRefreshTrigger((prev) => prev + 1);
        return { success: true };
      } else {
        return { success: false, error: res.error || "Không rõ nguyên nhân" };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  // Handle updates / save
  const handleSaveProperty = async (id: string, updates: Partial<Property>) => {
    try {
      const isNew = id === "new";
      const url = isNew ? "/api/properties" : `/api/properties/${id}`;
      const method = isNew ? "POST" : "PUT";

      const res = await safeFetchJson<{ success: boolean; item?: Property }>(
        url,
        {
          method,
          headers: getAuthHeaders(true),
          body: JSON.stringify(updates),
          credentials: "include",
        }
      );

      if (res.ok) {
        showToast(isNew ? "Đã thêm tin mới thành công!" : "Đã lưu cập nhật tin!");
        setRefreshTrigger((prev) => prev + 1);
      } else {
        alert("Lỗi khi ghi dữ liệu: " + (res.error || "Không rõ nguyên nhân"));
      }
    } catch (err: any) {
      alert("Lỗi kết nối: " + err.message);
    }
  };

  // Quick inline field update for chips
  const handleQuickUpdateField = async (id: string, updates: Partial<Property>) => {
    // Optimistically update local property state
    setProperties((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            ...updates,
          };
        }
        return item;
      })
    );

    try {
      const res = await safeFetchJson<{ success: boolean; item?: Property }>(
        `/api/properties/${id}`,
        {
          method: "PUT",
          headers: getAuthHeaders(true),
          body: JSON.stringify(updates),
          credentials: "include",
        }
      );
      if (res.ok) {
        showToast("Đã lưu cập nhật!");
      } else {
        showToast("Lỗi cập nhật: " + (res.error || "Không thể lưu"));
      }
    } catch (err: any) {
      console.error("Quick update failed:", err);
    }
  };

  // Handle single deletion
  const handleDeleteProperty = async (prop: Property) => {
    try {
      const res = await safeFetchJson<{ success: boolean }>(
        `/api/properties/${prop.id}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
          credentials: "include",
        }
      );
      if (res.ok) {
        showToast(`Đã xóa thành công tin ${prop.ma_tk || ""}`);
        setRefreshTrigger((prev) => prev + 1);
      } else {
        alert("Lỗi khi xóa: " + (res.error || "Không rõ nguyên nhân"));
      }
    } catch (err: any) {
      alert("Lỗi kết nối: " + err.message);
    }
  };

  // Bulk actions - Assign Ward
  const handleBulkAssignWard = async () => {
    if (selectedIds.size === 0 || !bulkWardValue.trim()) return;
    setBulkActionLoading(true);
    try {
      const idsArr = Array.from(selectedIds);
      const res = await safeFetchJson<{ success: boolean }>(
        "/api/properties/bulk-assign-ward",
        {
          method: "POST",
          headers: getAuthHeaders(true),
          body: JSON.stringify({ ids: idsArr, phuong: bulkWardValue.trim() }),
          credentials: "include",
        }
      );
      if (res.ok) {
        showToast(`Đã gán phường "${bulkWardValue}" cho ${idsArr.length} dòng!`);
        setBulkWardValue("");
        setSelectedIds(new Set());
        setRefreshTrigger((prev) => prev + 1);
      } else {
        alert("Lỗi khi gán phường: " + (res.error || "Không rõ"));
      }
    } catch (err: any) {
      alert("Lỗi kết nối: " + err.message);
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Bulk set business status
  const handleBulkSetBusinessStatus = async (status: BusinessStatusType) => {
    if (selectedIds.size === 0) return;
    setBulkActionLoading(true);
    try {
      const idsArr = Array.from(selectedIds);
      const res = await safeFetchJson<{ success: boolean }>(
        "/api/properties/bulk-set-business-status",
        {
          method: "POST",
          headers: getAuthHeaders(true),
          body: JSON.stringify({ ids: idsArr, status }),
          credentials: "include",
        }
      );
      if (res.ok) {
        showToast(`Đã đổi trạng thái kinh doanh cho ${idsArr.length} tin!`);
        setSelectedIds(new Set());
        setRefreshTrigger((prev) => prev + 1);
      }
    } catch (err: any) {
      alert("Lỗi kết nối: " + err.message);
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Bulk set processing status
  const handleBulkSetProcessingStatus = async (status: ProcessingStatusType) => {
    if (selectedIds.size === 0) return;
    setBulkActionLoading(true);
    try {
      const idsArr = Array.from(selectedIds);
      const res = await safeFetchJson<{ success: boolean }>(
        "/api/properties/bulk-set-processing-status",
        {
          method: "POST",
          headers: getAuthHeaders(true),
          body: JSON.stringify({ ids: idsArr, status }),
          credentials: "include",
        }
      );
      if (res.ok) {
        showToast(`Đã đổi trạng thái xử lý cho ${idsArr.length} tin!`);
        setSelectedIds(new Set());
        setRefreshTrigger((prev) => prev + 1);
      }
    } catch (err: any) {
      alert("Lỗi kết nối: " + err.message);
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Bulk clean duplicates
  const handleBulkDeleteDuplicates = async () => {
    if (!window.confirm("Hệ thống sẽ tự động đối chiếu các tin trùng Mã TK hoặc trùng địa chỉ thô, giữ lại bản ghi đầy đủ nhất và xóa các bản ghi còn lại. Bạn có chắc chắn muốn tiếp tục?")) {
      return;
    }
    setBulkActionLoading(true);
    try {
      const res = await safeFetchJson<{ success: boolean; deletedCount?: number }>(
        "/api/properties/bulk-delete-duplicates",
        {
          method: "POST",
          headers: getAuthHeaders(),
          credentials: "include",
        }
      );
      if (res.ok) {
        showToast(`Đã tối ưu hóa và dọn sạch ${res.data.deletedCount || 0} bản ghi trùng lặp!`);
        setSelectedIds(new Set());
        setRefreshTrigger((prev) => prev + 1);
      }
    } catch (err: any) {
      alert("Lỗi kết nối: " + err.message);
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Bulk delete selected properties
  const handleBulkDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn ${selectedIds.size} tin đã chọn khỏi hệ thống?`)) {
      return;
    }
    setBulkActionLoading(true);
    try {
      const idsArr = Array.from(selectedIds);
      const res = await safeFetchJson<{ success: boolean; deletedCount?: number }>(
        "/api/properties/bulk-action",
        {
          method: "POST",
          headers: getAuthHeaders(true),
          body: JSON.stringify({ action: "delete_many", ids: idsArr }),
          credentials: "include",
        }
      );
      if (res.ok) {
        showToast(`Đã xóa thành công ${res.data.deletedCount || idsArr.length} tin!`);
        setSelectedIds(new Set());
        setRefreshTrigger((prev) => prev + 1);
      } else {
        alert("Lỗi khi xóa: " + (res.error || "Không thể thực hiện"));
      }
    } catch (err: any) {
      alert("Lỗi kết nối: " + err.message);
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Post property to Hometea via window.open & postMessage
  const handlePostToHometea = useCallback((item: NormalizedWarehouseProperty | Property) => {
    const propId = item.id;
    setHometeaPostingId(propId);
    setHometeaStatusMsg("Đang chờ Hometea...");

    postToHometea({
      item,
      getAuthHeaders: (includeJson) => getAuthHeaders(includeJson),
      onStatusChange: (msg) => {
        setHometeaStatusMsg(msg);
        if (!msg) {
          setHometeaPostingId(null);
        }
      },
      onSuccess: (hometeaId, maTk) => {
        showToast(`Đã đăng thành công [${maTk}] lên Hometea (ID: ${hometeaId})!`);
        setHometeaPostingId(null);
        setHometeaStatusMsg(null);
        setRefreshTrigger((prev) => prev + 1);
      },
      onError: (err) => {
        alert("Lỗi Hometea: " + err);
        setHometeaPostingId(null);
        setHometeaStatusMsg(null);
      },
    });
  }, [showToast]);

  // AI Batch Processing logic (runs 20 records sequentially)
  const handleRunAiBatchExtraction = async (itemsList: NormalizedWarehouseProperty[]) => {
    if (itemsList.length === 0) return;

    // Filter only records that haven't been processed yet by default, as requested.
    // If they were manually edited, do not overwrite.
    const unextracted = itemsList.filter((it) => !it.da_boc_tach_ai);
    const targetQueue = unextracted.length > 0 ? unextracted : itemsList;

    if (!window.confirm(`Sẽ chạy bóc tách AI cho ${targetQueue.length} dòng. Tiếp tục?`)) {
      return;
    }

    setAiBatchProgress({
      isRunning: true,
      currentBatch: 1,
      totalBatches: Math.ceil(targetQueue.length / 20),
      processedCount: 0,
      totalCount: targetQueue.length,
      successCount: 0,
      failedIds: [],
      lastError: null,
    });

    const queue = [...targetQueue];
    let processed = 0;
    let success = 0;
    const failed: string[] = [];

    while (queue.length > 0) {
      const chunk = queue.splice(0, 20);
      const currentBatchNum = Math.ceil(processed / 20) + 1;

      setAiBatchProgress((prev) => ({
        ...prev,
        currentBatch: currentBatchNum,
      }));

      // Call single AI endpoint sequentially with short pauses
      for (const itemRecord of chunk) {
        try {
          const res = await safeFetchJson<{ success: boolean }>(
            `/api/properties/${itemRecord.id}/run-ai`,
            {
              method: "POST",
              headers: getAuthHeaders(),
              credentials: "include",
            }
          );
          if (res.ok) {
            success++;
          } else {
            failed.push(itemRecord.id);
          }
        } catch (_) {
          failed.push(itemRecord.id);
        }

        processed++;
        setAiBatchProgress((prev) => ({
          ...prev,
          processedCount: processed,
          successCount: success,
          failedIds: failed,
        }));
      }

      // Short delay between batches
      if (queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    setAiBatchProgress((prev) => ({
      ...prev,
      isRunning: false,
    }));

    showToast(`Bóc tách AI hoàn tất! Thành công: ${success}/${targetQueue.length}`);
    setRefreshTrigger((prev) => prev + 1);
  };

  // Confirm and set ready status
  const handleConfirmAiReady = async (itemsList: NormalizedWarehouseProperty[]) => {
    if (itemsList.length === 0) return;
    setBulkActionLoading(true);
    try {
      const idsArr = itemsList.map((x) => x.id);
      const res = await safeFetchJson<{ success: boolean }>(
        "/api/properties/bulk-set-processing-status",
        {
          method: "POST",
          headers: getAuthHeaders(true),
          body: JSON.stringify({ ids: idsArr, status: "san_sang" }),
          credentials: "include",
        }
      );
      if (res.ok) {
        showToast(`Đã duyệt xác nhận & chuyển SẴN SÀNG cho ${idsArr.length} tin!`);
        setSelectedIds(new Set());
        setRefreshTrigger((prev) => prev + 1);
      }
    } catch (err: any) {
      alert("Lỗi kết nối: " + err.message);
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Inline AI edit row save handler
  const openInlineAiEditor = (it: NormalizedWarehouseProperty) => {
    setInlineAiRowId(it.id);
    setInlineAiDraft({
      loai_vi_tri: it.loai_vi_tri || "",
      huong: it.huong || "",
      phap_ly: it.phap_ly || "",
      so_phong_ngu: it.so_phong_ngu !== null && it.so_phong_ngu !== undefined ? String(it.so_phong_ngu) : "",
      so_wc: it.so_wc !== null && it.so_wc !== undefined ? String(it.so_wc) : "",
      so_nha: it.so_nha || "",
      ten_duong: it.ten_duong || "",
      duong_vao_m: it.duong_vao_m !== null && it.duong_vao_m !== undefined ? String(it.duong_vao_m) : "",
      dac_diem: Array.isArray(it.dac_diem) ? it.dac_diem.join(", ") : "",
      hien_trang: it.hien_trang || "",
    });
  };

  const handleSaveInlineAiEdit = async (it: NormalizedWarehouseProperty, andSetReady = false) => {
    setInlineAiSaving(true);
    try {
      const updates: Partial<Property> = {
        loai_vi_tri: inlineAiDraft.loai_vi_tri || null,
        huong: inlineAiDraft.huong || null,
        phap_ly: inlineAiDraft.phap_ly || null,
        so_phong_ngu: inlineAiDraft.so_phong_ngu ? Number(inlineAiDraft.so_phong_ngu) : null,
        so_wc: inlineAiDraft.so_wc ? Number(inlineAiDraft.so_wc) : null,
        so_nha: inlineAiDraft.so_nha || null,
        ten_duong: inlineAiDraft.ten_duong || null,
        duong_vao_m: inlineAiDraft.duong_vao_m ? Number(inlineAiDraft.duong_vao_m) : null,
        dac_diem: inlineAiDraft.dac_diem ? inlineAiDraft.dac_diem.split(",").map((s) => s.trim()).filter(Boolean) : [],
        hien_trang: inlineAiDraft.hien_trang || null,
        da_boc_tach_ai: true,
      };

      if (andSetReady) {
        updates.trang_thai_xu_ly = "san_sang";
      }

      // Add to manual edited fields list to lock from AI overwrite
      const changedKeys: AiExtractedFieldKey[] = [...(it.ai_manual_fields || [])];
      (["loai_vi_tri", "huong", "phap_ly", "so_phong_ngu", "so_wc", "duong_vao_m", "hien_trang"] as AiExtractedFieldKey[]).forEach((k) => {
        if (!changedKeys.includes(k)) changedKeys.push(k);
      });
      updates.ai_manual_fields = changedKeys;

      const res = await safeFetchJson<{ success: boolean }>(
        `/api/properties/${it.id}`,
        {
          method: "PUT",
          headers: getAuthHeaders(true),
          body: JSON.stringify(updates),
          credentials: "include",
        }
      );

      if (res.ok) {
        showToast("Đã lưu sửa tay thành công!");
        setInlineAiRowId(null);
        setRefreshTrigger((prev) => prev + 1);
      } else {
        alert("Lỗi: " + res.error);
      }
    } catch (err: any) {
      alert("Lỗi: " + err.message);
    } finally {
      setInlineAiSaving(false);
    }
  };

  // Convert raw DB records to clean applet domain model
  const normalizedProperties = useMemo(() => {
    return properties.map(normalizePropertyRecord);
  }, [properties]);

  const qualityIssuesCount = useMemo(() => {
    return normalizedProperties.filter((p) => p.missingFieldKeys.length > 0).length;
  }, [normalizedProperties]);

  // Derived filter option: unique wards in warehouse dataset
  const wardFilterOptions = useMemo(() => {
    const s = new Set<string>();
    normalizedProperties.forEach((p) => {
      if (p.phuong) s.add(p.phuong);
    });
    return Array.from(s).sort();
  }, [normalizedProperties]);

  // Multi-dimensional filters (Search Query + Ward + AI status + completeness)
  const filteredItems = useMemo(() => {
    return normalizedProperties.filter((it) => {
      // 1. Text search index
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTk = (it.ma_tk || "").toLowerCase().includes(q);
        const matchAddress = (it.dia_chi || "").toLowerCase().includes(q);
        const matchName = (it.name || "").toLowerCase().includes(q);
        const matchBroker = (it.moi_gioi_nguon || "").toLowerCase().includes(q);
        const matchContent = (it.content || "").toLowerCase().includes(q);
        if (!matchTk && !matchAddress && !matchName && !matchBroker && !matchContent) {
          return false;
        }
      }

      // 2. Business Status (nguon_tho, da_ky, da_ban)
      if (filterBusinessStatus !== "all" && it.trang_thai_kinh_doanh !== filterBusinessStatus) {
        return false;
      }

      // 3. Processing status pipeline filter
      if (filterProcessingStatus !== "all") {
        if (filterProcessingStatus === "da_len_hometea") {
          if (it.hometea_trang_thai !== "nhap" && it.hometea_trang_thai !== "cong_khai") return false;
        } else {
          if (it.trang_thai_xu_ly !== filterProcessingStatus) return false;
        }
      }

      // 4. District / Ward filter
      if (filterDistrict !== "all" && it.phuong !== filterDistrict) {
        return false;
      }

      // 5. Completeness
      if (filterCompleteness === "complete" && it.missingFieldKeys.length > 0) {
        return false;
      }
      if (filterCompleteness === "incomplete" && it.missingFieldKeys.length === 0) {
        return false;
      }

      // 6. AI State
      if (filterAiState === "unextracted" && it.da_boc_tach_ai) return false;
      if (filterAiState === "extracted" && !it.da_boc_tach_ai) return false;
      if (filterAiState === "needs_confirm" && (!it.da_boc_tach_ai || it.aiNeedsConfirmKeys.length === 0)) {
        return false;
      }

      return true;
    });
  }, [normalizedProperties, searchQuery, filterBusinessStatus, filterProcessingStatus, filterDistrict, filterCompleteness, filterAiState]);

  // Selection toggle logic
  const toggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    const allSelected = filteredItems.length > 0 && filteredItems.every((it) => selectedIds.has(it.id));
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredItems.forEach((it) => next.delete(it.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredItems.forEach((it) => next.add(it.id));
        return next;
      });
    }
  };

  // Statistics counters
  const businessCounts = useMemo(() => {
    const counts = { nguon_tho: 0, da_ky: 0, da_ban: 0 };
    normalizedProperties.forEach((p) => {
      if (p.trang_thai_kinh_doanh === "nguon_tho") counts.nguon_tho++;
      else if (p.trang_thai_kinh_doanh === "da_ky") counts.da_ky++;
      else if (p.trang_thai_kinh_doanh === "da_ban") counts.da_ban++;
    });
    return counts;
  }, [normalizedProperties]);

  const activeDrawerItem = useMemo(() => {
    return normalizedProperties.find((x) => x.id === drawerItemId) || null;
  }, [drawerItemId, normalizedProperties]);

  const isViewer = currentUser?.role === "viewer";

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-300">
        <div className="space-y-4 text-center">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-mono">Đang kết nối hệ thống bảo mật...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <LoginScreen
        onLoginSuccess={(user, token) => {
          localStorage.setItem("admin_token", token);
          setCurrentUser(user);
          setIsAuthenticated(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none pb-12">
      
      {/* Toast Notification Banner */}
      {toastBanner && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-amber-500 text-slate-950 text-xs font-extrabold shadow-xl flex items-center gap-2 animate-bounce border border-amber-400">
          <CheckSquare className="w-4 h-4 shrink-0" />
          <span>{toastBanner}</span>
        </div>
      )}

      {/* NAVBAR */}
      <Navbar
        currentUser={currentUser}
        activeTab={activeTab}
        onChangeTab={(t) => {
          setActiveTab(t);
          setDrawerItemId(null);
          setInlineAiRowId(null);
        }}
        onAddNew={() => {
          setEditingProperty(null);
          setIsFormOpen(true);
        }}
        onOpenBulkImport={() => setIsBulkImportOpen(true)}
        totalCount={normalizedProperties.length}
        qualityIssuesCount={qualityIssuesCount}
        exportLogsCount={exportLogs.length}
        onLogout={() => {
          localStorage.removeItem("admin_token");
          setIsAuthenticated(false);
          setCurrentUser(null);
        }}
      />

      <div className="max-w-[1550px] w-full mx-auto px-4 sm:px-6 py-6 flex-1 space-y-6">
        
        {/* TAB 1: KHO NGUỒN CHUẨN (KHO CHUẨN DỮ LIỆU) */}
        {activeTab === "properties" && (
          <div className="space-y-6">
            
            {/* 1. DẢI BỘ LỌC KINH DOANH COMPACT (TẤT CẢ | THÔ | ĐÃ KÝ | ĐÃ BÁN) */}
            <div className="flex flex-wrap items-center gap-2 bg-slate-900/60 p-2.5 rounded-2xl border border-slate-800/80">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 px-2 shrink-0">
                Kinh doanh:
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setFilterBusinessStatus("all")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    filterBusinessStatus === "all"
                      ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/10"
                      : "bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700"
                  }`}
                >
                  Tất cả ({normalizedProperties.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterBusinessStatus("nguon_tho")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    filterBusinessStatus === "nguon_tho"
                      ? "bg-amber-500 text-slate-950 shadow-md"
                      : "bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700"
                  }`}
                >
                  Nguồn thô ({businessCounts.nguon_tho})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterBusinessStatus("da_ky")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    filterBusinessStatus === "da_ky"
                      ? "bg-amber-500 text-slate-950 shadow-md"
                      : "bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700"
                  }`}
                >
                  Đã ký ({businessCounts.da_ky})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterBusinessStatus("da_ban")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    filterBusinessStatus === "da_ban"
                      ? "bg-amber-500 text-slate-950 shadow-md"
                      : "bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700"
                  }`}
                >
                  Đã bán ({businessCounts.da_ban})
                </button>
              </div>
            </div>

            {/* 2. DẢI PHỄU TRẠNG THÁI XỬ LÝ (MỘT HÀNG GỌN, BẤM LỌC) */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/60 p-2.5 rounded-2xl border border-slate-800/80">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 px-2 shrink-0">
                Phễu xử lý:
              </span>
              <button
                type="button"
                onClick={() => setFilterProcessingStatus("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                  filterProcessingStatus === "all"
                    ? "bg-slate-800 text-slate-100 font-bold border border-slate-700"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Tất cả
              </button>
              <span className="text-slate-700">|</span>
              {(
                [
                  { key: "tho", label: "Thô", style: "border-slate-800 text-slate-400 hover:bg-slate-800/35" },
                  { key: "can_bo_sung", label: "Cần bổ bổ sung", style: "border-amber-800/40 text-amber-400 hover:bg-amber-950/20" },
                  { key: "san_sang", label: "Sẵn sàng", style: "border-emerald-800/40 text-emerald-400 hover:bg-emerald-950/20" },
                  { key: "da_len_hometea", label: "Hometea", style: "border-cyan-800/40 text-cyan-400 hover:bg-cyan-950/20" },
                  { key: "da_dang_fb", label: "Đã đăng FB (Post Writer)", style: "border-indigo-800/40 text-indigo-400 hover:bg-indigo-950/20" },
                ] as { key: "all" | ProcessingStatusType; label: string; style: string }[]
              ).map((st) => {
                const active = filterProcessingStatus === st.key;
                return (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => setFilterProcessingStatus(st.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                      active
                        ? "bg-amber-500 text-slate-950 border-amber-400"
                        : st.style
                    }`}
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>

            {/* 3. DÒNG BỘ LỌC CHÍNH (Ô TÌM KIẾM, PHƯỜNG, ĐỘ ĐẦY ĐỦ, AI) */}
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo Mã TK (VD: TK2JLH4L), số nhà, tên đường, phường, giá, môi giới nguồn..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-500 outline-none text-xs text-slate-100 placeholder-slate-500"
                />
              </div>

              {/* Bộ lọc lựa chọn */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Ward Filter */}
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 text-amber-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={filterDistrict}
                    onChange={(e) => setFilterDistrict(e.target.value)}
                    className="pl-8 pr-7 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 font-semibold outline-none cursor-pointer"
                  >
                    <option value="all">Tất cả Phường ({wardFilterOptions.length})</option>
                    {wardFilterOptions.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Completeness Filter */}
                <select
                  value={filterCompleteness}
                  onChange={(e) =>
                    setFilterCompleteness(
                      e.target.value as "all" | "complete" | "incomplete"
                    )
                  }
                  className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 font-semibold outline-none cursor-pointer"
                >
                  <option value="all">Mọi độ đầy đủ (x/11)</option>
                  <option value="complete">Đủ 11/11 trường chuẩn</option>
                  <option value="incomplete">Còn thiếu trường bắt buộc</option>
                </select>

                {/* AI Extraction Filter */}
                <select
                  value={filterAiState}
                  onChange={(e) =>
                    setFilterAiState(
                      e.target.value as
                        | "all"
                        | "needs_confirm"
                        | "extracted"
                        | "unextracted"
                    )
                  }
                  className="px-3 py-2 rounded-xl bg-violet-950/60 border border-violet-500/40 text-xs text-violet-200 font-semibold outline-none cursor-pointer"
                >
                  <option value="all">Mọi trạng thái AI</option>
                  <option value="unextracted">Chưa bóc tách AI</option>
                  <option value="extracted">Đã bóc tách AI</option>
                  <option value="needs_confirm">Cần xác nhận (NULL / Tin cậy thấp)</option>
                </select>

                {/* Refresh Button */}
                <button
                  type="button"
                  onClick={() => setRefreshTrigger((prev) => prev + 1)}
                  className="p-2 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-300 cursor-pointer"
                  title="Làm mới dữ liệu"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${loading ? "animate-spin text-amber-400" : ""}`}
                  />
                </button>

                {/* Switch view */}
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                      viewMode === "table"
                        ? "bg-amber-500 text-slate-950"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <LayoutList className="w-3.5 h-3.5" />
                    <span>Bảng dày</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("cards")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                      viewMode === "cards"
                        ? "bg-amber-500 text-slate-950"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Thẻ</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 4. THANH THAO TÁC HÀNG LOẠT (BULK ACTIONS BAR) - Cố định khi có dòng được chọn */}
            {!isViewer && (
              <div className="p-3 rounded-2xl bg-slate-900/95 border border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={toggleSelectAllFiltered}
                      className="px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      {filteredItems.length > 0 &&
                      filteredItems.every((it) => selectedIds.has(it.id)) ? (
                        <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>
                        {selectedIds.size > 0
                          ? `Đã chọn ${selectedIds.size} dòng`
                          : "Chọn tất cả (đang lọc)"}
                      </span>
                    </button>

                    {selectedIds.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedIds(new Set())}
                        className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                      >
                        Bỏ chọn
                      </button>
                    )}

                    <div className="h-4 w-px bg-slate-800" />

                    {/* NÚT BÓC TÁCH BẰNG AI: chỉ bật khi chọn dòng */}
                    <button
                      type="button"
                      disabled={selectedIds.size === 0 || aiBatchProgress.isRunning || bulkActionLoading}
                      onClick={() =>
                        handleRunAiBatchExtraction(
                          normalizedProperties.filter((it) =>
                            selectedIds.has(it.id)
                          )
                        )
                      }
                      className="px-3 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-400 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm disabled:cursor-not-allowed"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        Bóc tách AI ({selectedIds.size} dòng đã chọn)
                      </span>
                    </button>

                    {/* Xác nhận duyệt */}
                    <button
                      type="button"
                      disabled={selectedIds.size === 0 || bulkActionLoading}
                      onClick={() =>
                        handleConfirmAiReady(
                          normalizedProperties.filter((it) =>
                            selectedIds.has(it.id)
                          )
                        )
                      }
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 text-emerald-300 border border-emerald-500/35 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      Xác nhận → Sẵn sàng
                    </button>

                    {/* Menu đổi trạng thái */}
                    <select
                      disabled={selectedIds.size === 0 || bulkActionLoading}
                      defaultValue=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        if (val.startsWith("kd:")) {
                          handleBulkSetBusinessStatus(
                            val.replace("kd:", "") as BusinessStatusType
                          );
                        } else if (val.startsWith("xl:")) {
                          handleBulkSetProcessingStatus(
                            val.replace("xl:", "") as ProcessingStatusType
                          );
                        }
                        e.target.value = "";
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 disabled:opacity-40 text-xs text-slate-200 font-semibold outline-none cursor-pointer"
                    >
                      <option value="">Đổi trạng thái...</option>
                      <optgroup label="Trạng thái xử lý">
                        <option value="xl:tho">→ Thô</option>
                        <option value="xl:can_bo_sung">→ Cần bổ sung</option>
                        <option value="xl:san_sang">→ Sẵn sàng</option>
                      </optgroup>
                      <optgroup label="Trạng thái kinh doanh">
                        <option value="kd:nguon_tho">→ Nguồn thô</option>
                        <option value="kd:da_ky">→ Đã ký</option>
                        <option value="kd:da_ban">→ Đã bán</option>
                      </optgroup>
                    </select>

                    {/* Gán phường hàng loạt */}
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        list="bulk-ward-datalist"
                        value={bulkWardValue}
                        onChange={(e) => setBulkWardValue(e.target.value)}
                        placeholder="Gán phường..."
                        disabled={selectedIds.size === 0 || bulkActionLoading}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 disabled:opacity-40 text-xs text-slate-100 placeholder-slate-500 w-32 outline-none"
                      />
                      <datalist id="bulk-ward-datalist">
                        {DISTRICT_OPTIONS.map((d) => (
                          <option key={d} value={d} />
                        ))}
                      </datalist>
                      <button
                        type="button"
                        disabled={selectedIds.size === 0 || !bulkWardValue.trim() || bulkActionLoading}
                        onClick={handleBulkAssignWard}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-40 text-amber-300 border border-amber-500/35 text-xs font-bold cursor-pointer"
                      >
                        Gán
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={selectedIds.size === 0 || bulkActionLoading}
                      onClick={handleBulkDeleteSelected}
                      className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 disabled:opacity-40 text-rose-300 border border-rose-500/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                      title="Xóa tất cả các tin đã chọn"
                    >
                      🗑️ Xóa tin ({selectedIds.size})
                    </button>

                    <button
                      type="button"
                      disabled={bulkActionLoading}
                      onClick={handleBulkDeleteDuplicates}
                      className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 disabled:opacity-40 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      Xóa trùng
                    </button>
                  </div>
                </div>

                {/* AI progress loader */}
                {(aiBatchProgress.isRunning || aiBatchProgress.totalCount > 0) && (
                  <div className="mt-3 p-3 rounded-xl bg-violet-950/40 border border-violet-500/35 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-violet-200">
                        {aiBatchProgress.isRunning
                          ? `Đang chạy AI Lô (20 tin/lô)... Tiến độ: ${aiBatchProgress.processedCount}/${aiBatchProgress.totalCount}`
                          : "Hoàn tất lô bóc tách AI!"}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-900 overflow-hidden">
                      <div
                        className="h-full bg-violet-500"
                        style={{
                          width: `${Math.round((aiBatchProgress.processedCount / aiBatchProgress.totalCount) * 100) || 0}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 5. KHU VỰC BẢNG DỮ LIỆU - DÒNG GỌN (CAO ~56-64PX, GỒM 6 CỘT CHUẨN) */}
            {loading ? (
              <div className="p-12 text-center text-slate-400">Đang tải...</div>
            ) : filteredItems.length === 0 ? (
              <div className="p-12 text-center text-slate-500">Trống</div>
            ) : viewMode === "table" ? (
              <div className="rounded-2xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-xl">
                <div className="overflow-x-auto max-w-full">
                  <table
                    className="w-full text-left border-collapse text-xs"
                    id="warehouse-dense-table"
                    style={{ tableLayout: "fixed", minWidth: "1350px" }}
                  >
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px] font-bold sticky top-0 z-10">
                      <tr>
                        <th className="py-3 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={filteredItems.length > 0 && filteredItems.every((it) => selectedIds.has(it.id))}
                            onChange={toggleSelectAllFiltered}
                            className="rounded border-slate-700 bg-slate-900 text-amber-500 cursor-pointer"
                          />
                        </th>
                        <th className="py-3 px-3 w-[240px]">Tin (Mã & Địa chỉ)</th>
                        <th className="py-3 px-3 w-[180px]">Thông số</th>
                        <th className="py-3 px-3 w-[380px]">Dữ liệu bóc tách AI</th>
                        <th className="py-3 px-3 w-[130px]">Trạng thái</th>
                        <th className="py-3 px-3 w-[250px] text-center">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {filteredItems.map((it) => {
                        if (!it) return null;
                        const isSelected = selectedIds.has(it.id);
                        const isDrawerOpen = drawerItemId === it.id;
                        const isInlineEditing = inlineAiRowId === it.id;
                        const xlMeta = (it.trang_thai_xu_ly && PROCESSING_STATUS_META[it.trang_thai_xu_ly]) || PROCESSING_STATUS_META["tho"];

                        // Xác định trạng thái bóc tách AI (chấm tròn màu nhỏ)
                        // xám = chưa AI, vàng = cần xác nhận, xanh = đã duyệt
                        let aiDotColor = "bg-slate-500";
                        let aiTooltip = "Chưa bóc tách AI";
                        if (it.da_boc_tach_ai) {
                          if ((it.aiNeedsConfirmKeys?.length || 0) > 0) {
                            aiDotColor = "bg-amber-500";
                            aiTooltip = "Có trường cần xác nhận";
                          } else {
                            aiDotColor = "bg-emerald-500";
                            aiTooltip = "Đã duyệt đủ chuẩn";
                          }
                        }

                        // Cờ cảnh báo ⚠ nếu có dữ liệu bất thường (ví dụ: lệch rộng dài diện tích thực tế > 30%)
                        let hasWarning = false;
                        const dtSo = it.dien_tich_thuc_te || it.dien_tich_so;
                        if (it.rong && it.dai && dtSo) {
                          const numRong = Number(it.rong) || 0;
                          const numDai = Number(it.dai) || 0;
                          if (numRong > 0 && numDai > 0) {
                            const diffPct = Math.abs(numRong * numDai - dtSo) / dtSo;
                            if (diffPct > 0.3) hasWarning = true;
                          }
                        }

                        return (
                          <React.Fragment key={it.id}>
                            <tr
                              onClick={() => setDrawerItemId(it.id)}
                              className={`transition-colors cursor-pointer text-xs h-[56px] ${
                                isDrawerOpen
                                  ? "bg-amber-500/15 hover:bg-amber-500/20"
                                  : isSelected
                                  ? "bg-slate-800/80 hover:bg-slate-800"
                                  : "hover:bg-slate-800/45"
                              }`}
                            >
                              {/* Cột 1: Tick checkbox */}
                              <td className="py-1 px-3 text-center" onClick={(e) => toggleSelectOne(it.id, e)}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="rounded border-slate-700 bg-slate-900 text-amber-500 cursor-pointer"
                                />
                              </td>

                              {/* Cột 2: Tin (Dòng 1 địa chỉ sạch, dòng 2 mã TK + phường) */}
                              <td className="py-1 px-3 truncate">
                                <div className="font-bold text-slate-100 truncate text-xs" title={it.cleanAddress || it.dia_chi || it.name || it.raw?.name || ""}>
                                  {it.cleanAddress || it.dia_chi || it.name || it.raw?.name || it.ma_tk || "Tin Bất Động Sản"}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
                                  <span className="font-mono px-1 rounded bg-slate-950 border border-slate-800 text-amber-300 font-bold shrink-0">
                                    {it.ma_tk || "MÃ MỚI"}
                                  </span>
                                  <span className="text-slate-400 font-medium truncate">
                                    {it.phuong || "Thiếu phường"}
                                  </span>
                                </div>
                              </td>

                              {/* Cột 3: Thông số (Dòng 1 diện tích + tầng; dòng 2 giá + tr/m2) */}
                              <td className="py-1 px-3 font-mono">
                                <div className="text-slate-200 text-xs font-semibold truncate">
                                  {it.dien_tich_so || it.dien_tich_thuc_te ? (
                                    <span>
                                      {it.dien_tich_so ?? "—"}/{it.dien_tich_thuc_te ?? "—"}m²
                                    </span>
                                  ) : (
                                    <span className="text-rose-400">Trống DT</span>
                                  )}
                                  {it.rong && it.dai && <span className="text-slate-500 font-normal"> · {it.rong}x{it.dai}m</span>}
                                  {it.so_tang && <span className="text-slate-400 font-normal"> · {it.so_tang} tầng</span>}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5 font-bold flex items-center gap-1.5">
                                  <span className="text-emerald-400 font-extrabold">{it.gia_text || "Chưa giá"}</span>
                                  {it.pricePerM2Text && <span className="text-slate-500 font-normal">({it.pricePerM2Text})</span>}
                                </div>
                              </td>

                              {/* Cột 4: Dữ liệu bóc tách AI (Chỉnh sửa trực tiếp từng ô chip, giữ nguyên kích thước & bố cục) */}
                              <td className="py-1 px-3" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-2 flex-wrap min-w-0">
                                  {/* Chấm tròn trạng thái AI - Bấm để chuyển duyệt */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleQuickUpdateField(it.id, { da_xac_nhan_ai: !it.da_xac_nhan_ai });
                                    }}
                                    className={`w-2.5 h-2.5 rounded-full ${aiDotColor} shrink-0 cursor-pointer hover:scale-125 transition-transform`}
                                    title={`${aiTooltip} — Bấm để chuyển đổi trạng thái duyệt AI`}
                                  />

                                  {/* Chip Vị trí (Select trực tiếp) */}
                                  <select
                                    value={it.loai_vi_tri || ""}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      const val = (e.target.value || null) as LoaiViTriType | null;
                                      handleQuickUpdateField(it.id, { loai_vi_tri: val, da_xac_nhan_ai: true });
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 cursor-pointer outline-none transition-all appearance-none ${
                                      it.loai_vi_tri
                                        ? "bg-slate-800 text-slate-200 border border-slate-700 hover:border-amber-400"
                                        : "bg-slate-950/60 text-slate-500 border border-slate-800 hover:border-slate-700 hover:text-slate-300"
                                    }`}
                                    title="Bấm để chọn Vị trí"
                                  >
                                    <option value="" className="bg-slate-900 text-slate-400">Vị trí: —</option>
                                    {LOAI_VI_TRI_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-100 font-semibold">
                                        Vị trí: {opt.label.split("(")[0].trim()}
                                      </option>
                                    ))}
                                  </select>

                                  {/* Chip Hướng (Select trực tiếp) */}
                                  <select
                                    value={it.huong || ""}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      const val = e.target.value || null;
                                      handleQuickUpdateField(it.id, { huong: val, da_xac_nhan_ai: true });
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 cursor-pointer outline-none transition-all appearance-none ${
                                      it.huong
                                        ? "bg-slate-800 text-slate-200 border border-slate-700 hover:border-amber-400"
                                        : "bg-slate-950/60 text-slate-500 border border-slate-800 hover:border-slate-700 hover:text-slate-300"
                                    }`}
                                    title="Bấm để chọn Hướng"
                                  >
                                    <option value="" className="bg-slate-900 text-slate-400">Hướng: —</option>
                                    {HUONG_OPTIONS.map((h) => (
                                      <option key={h} value={h} className="bg-slate-900 text-slate-100 font-semibold">
                                        Hướng: {h}
                                      </option>
                                    ))}
                                  </select>

                                  {/* Chip Pháp lý (Select trực tiếp) */}
                                  <select
                                    value={it.phap_ly || ""}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      const val = e.target.value || null;
                                      handleQuickUpdateField(it.id, { phap_ly: val, da_xac_nhan_ai: true });
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 cursor-pointer outline-none transition-all appearance-none max-w-[150px] truncate ${
                                      it.phap_ly
                                        ? "bg-slate-800 text-slate-200 border border-slate-700 hover:border-amber-400"
                                        : "bg-slate-950/60 text-slate-500 border border-slate-800 hover:border-slate-700 hover:text-slate-300"
                                    }`}
                                    title="Bấm để chọn Pháp lý"
                                  >
                                    <option value="" className="bg-slate-900 text-slate-400">Pháp lý: —</option>
                                    {PHAP_LY_PRESETS.map((p) => (
                                      <option key={p} value={p} className="bg-slate-900 text-slate-100 font-semibold">
                                        Pháp lý: {p}
                                      </option>
                                    ))}
                                  </select>

                                  {/* Chip PN-WC (Chỉnh số trực tiếp trong ô) */}
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 flex items-center gap-0.5 transition-all ${
                                      it.so_phong_ngu || it.so_wc
                                        ? "bg-slate-800 text-slate-200 border border-slate-700 hover:border-amber-400"
                                        : "bg-slate-950/60 text-slate-500 border border-slate-800 hover:border-slate-700"
                                    }`}
                                  >
                                    <span className="text-slate-400 select-none">PN/WC:</span>
                                    <select
                                      value={it.so_phong_ngu ?? ""}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        const val = e.target.value === "" ? null : Number(e.target.value);
                                        handleQuickUpdateField(it.id, { so_phong_ngu: val, da_xac_nhan_ai: true });
                                      }}
                                      className="bg-transparent text-slate-200 font-bold outline-none cursor-pointer text-[10px] appearance-none"
                                      title="Đổi số phòng ngủ (PN)"
                                    >
                                      <option value="" className="bg-slate-900 text-slate-400">—</option>
                                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20].map((n) => (
                                        <option key={n} value={n} className="bg-slate-900 text-slate-100 font-semibold">
                                          {n}
                                        </option>
                                      ))}
                                    </select>
                                    <span className="text-slate-500 select-none">/</span>
                                    <select
                                      value={it.so_wc ?? ""}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        const val = e.target.value === "" ? null : Number(e.target.value);
                                        handleQuickUpdateField(it.id, { so_wc: val, da_xac_nhan_ai: true });
                                      }}
                                      className="bg-transparent text-slate-200 font-bold outline-none cursor-pointer text-[10px] appearance-none"
                                      title="Đổi số WC"
                                    >
                                      <option value="" className="bg-slate-900 text-slate-400">—</option>
                                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15].map((n) => (
                                        <option key={n} value={n} className="bg-slate-900 text-slate-100 font-semibold">
                                          {n}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  {/* Chip Ảnh (Bấm mở quản lý) */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDrawerItemId(it.id);
                                    }}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 cursor-pointer transition-colors ${
                                      it.imageCount > 0
                                        ? "bg-violet-950/60 text-violet-300 border border-violet-800/70 hover:bg-violet-900/80"
                                        : "bg-slate-950/60 text-slate-500 border border-slate-800 hover:border-violet-500/50"
                                    }`}
                                    title="Bấm để xem/quản lý ảnh tin này"
                                  >
                                    {it.imageCount} ảnh
                                  </button>

                                  {/* Biểu tượng cảnh báo ⚠ nếu có dữ liệu lệch */}
                                  {hasWarning && (
                                    <span
                                      className="text-amber-400 font-extrabold animate-pulse cursor-help text-xs"
                                      title="Cảnh báo: Kích thước rộng × dài chênh lệch quá 30% so với diện tích đất thực tế ghi trong sổ!"
                                    >
                                      ⚠️
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Cột 5: Trạng thái (Chip xử lý & dòng nhỏ hometea chỉ đọc) */}
                              <td className="py-1 px-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border inline-block ${xlMeta.badgeClass}`}>
                                  {xlMeta.label}
                                </span>
                                <div className="text-[10px] text-slate-500 mt-1 truncate">
                                  Hometea: {it.hometea_trang_thai === "cong_khai" ? "Công khai" : it.hometea_trang_thai === "nhap" ? "Nháp" : "Chưa đăng"}
                                </div>
                              </td>

                              {/* Cột 6: Hành động (Đăng Hometea + Duyệt + mở rộng + xóa) */}
                              <td className="py-1 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={hometeaPostingId === it.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePostToHometea(it);
                                    }}
                                    className="px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-[10px] font-extrabold shadow-sm transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                                    title="Đăng tin lên Hometea qua postMessage"
                                  >
                                    {hometeaPostingId === it.id ? (
                                      <span>⏳ Đang chờ Hometea...</span>
                                    ) : (
                                      <span>🚀 Đăng Hometea</span>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDrawerItemId(it.id)}
                                    className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 text-[10px] font-extrabold shadow-sm transition-colors cursor-pointer"
                                  >
                                    Duyệt
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (isInlineEditing) setInlineAiRowId(null);
                                      else openInlineAiEditor(it);
                                    }}
                                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] cursor-pointer"
                                    title="Sửa nhanh bóc tách"
                                  >
                                    ✎
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeletingProperty(it.raw || (it as unknown as Property));
                                    }}
                                    className="p-1 px-1.5 rounded bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 text-[10px] font-bold cursor-pointer transition-colors"
                                    title="Xóa tin này"
                                  >
                                    🗑️ Xóa
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Khung sửa bóc tách trực tiếp (inline editor) */}
                            {isInlineEditing && (
                              <tr className="bg-slate-950/90 border-b border-violet-500/30" onClick={(e) => e.stopPropagation()}>
                                <td colSpan={6} className="p-3">
                                  <div className="rounded-xl bg-slate-900 border border-violet-500/40 p-3 space-y-3">
                                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                      <span className="text-xs font-bold text-violet-300">Sửa nhanh bóc tách AI cho mã {it.ma_tk || "mới"}</span>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => handleSaveInlineAiEdit(it, false)}
                                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
                                        >
                                          Lưu lại
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleSaveInlineAiEdit(it, true)}
                                          className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                                        >
                                          Duyệt → Sẵn sàng
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setInlineAiRowId(null)}
                                          className="text-xs text-slate-500 hover:underline"
                                        >
                                          Hủy
                                        </button>
                                      </div>
                                    </div>

                                    {/* Form edit nhỏ */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                      <div>
                                        <label className="text-[10px] text-slate-400">Vị trí</label>
                                        <select
                                          value={inlineAiDraft.loai_vi_tri}
                                          onChange={(e) => setInlineAiDraft(p => ({ ...p, loai_vi_tri: e.target.value as LoaiViTriType | "" }))}
                                          className="w-full p-1 bg-slate-950 rounded border border-slate-700 text-slate-100"
                                        >
                                          <option value="">— NULL —</option>
                                          {LOAI_VI_TRI_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-slate-400">Hướng</label>
                                        <select
                                          value={inlineAiDraft.huong}
                                          onChange={(e) => setInlineAiDraft(p => ({ ...p, huong: e.target.value }))}
                                          className="w-full p-1 bg-slate-950 rounded border border-slate-700 text-slate-100"
                                        >
                                          <option value="">— NULL —</option>
                                          {HUONG_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-slate-400">Pháp lý</label>
                                        <input
                                          type="text"
                                          value={inlineAiDraft.phap_ly}
                                          onChange={(e) => setInlineAiDraft(p => ({ ...p, phap_ly: e.target.value }))}
                                          className="w-full p-1 bg-slate-950 rounded border border-slate-700 text-slate-100"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-slate-400">PN / WC</label>
                                        <div className="flex gap-1">
                                          <input
                                            type="number"
                                            value={inlineAiDraft.so_phong_ngu}
                                            onChange={(e) => setInlineAiDraft(p => ({ ...p, so_phong_ngu: e.target.value }))}
                                            placeholder="PN"
                                            className="w-1/2 p-1 bg-slate-950 rounded border border-slate-700 text-slate-100 text-center"
                                          />
                                          <input
                                            type="number"
                                            value={inlineAiDraft.so_wc}
                                            onChange={(e) => setInlineAiDraft(p => ({ ...p, so_wc: e.target.value }))}
                                            placeholder="WC"
                                            className="w-1/2 p-1 bg-slate-950 rounded border border-slate-700 text-slate-100 text-center"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* CHẾ ĐỘ THẺ (CARDS) */
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredItems.map((it) => it ? (
                  <PropertyCard
                    key={it.id}
                    property={it}
                    isSelected={selectedIds.has(it.id)}
                    onSelectToggle={(e) => toggleSelectOne(it.id, e)}
                    onClick={() => setDrawerItemId(it.id)}
                    onDelete={(e) => {
                      e.stopPropagation();
                      setDeletingProperty(it.raw || (it as unknown as Property));
                    }}
                    onPostHometea={(e) => {
                      e.stopPropagation();
                      handlePostToHometea(it);
                    }}
                  />
                ) : null)}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CHẤT LƯỢNG DỮ LIỆU */}
        {activeTab === "quality" && (
          <DataQualityView
            properties={properties}
            currentUser={currentUser}
            onBackToProperties={() => setActiveTab("properties")}
          />
        )}

        {/* TAB 3: NHẬT KÝ XUẤT */}
        {activeTab === "logs" && (
          <ExportLogsView
            logs={exportLogs}
            onBackToProperties={() => setActiveTab("properties")}
          />
        )}

        {/* TAB 4: HỆ THỐNG */}
        {activeTab === "system" && currentUser?.role === "admin" && (
          <SystemAndReportsView
            properties={properties}
            currentUser={currentUser}
            onBackToProperties={() => setActiveTab("properties")}
            onOpenMigrationModal={() => setIsMigrationModalOpen(true)}
          />
        )}
      </div>

      {/* MODAL MÔ HÌNH/CHẾ ĐỘ DUYỆT TỪNG TIN CHI TIẾT (NGĂN CHI TIẾT TÂN TRANG) */}
      {drawerItemId && (
        <WarehouseEditDrawer
          item={activeDrawerItem}
          isOpen={drawerItemId !== null}
          onClose={() => setDrawerItemId(null)}
          onSave={handleSaveProperty}
          onDelete={handleDeleteProperty}
          onPostHometea={handlePostToHometea}
          currentUser={currentUser}
          allItems={filteredItems}
          onSelectProperty={(id) => setDrawerItemId(id)}
        />
      )}

      {/* MODAL PHỤ KHÁC */}
      {isFormOpen && (
        <PropertyFormModal
          isOpen={isFormOpen}
          onClose={() => {
            setIsFormOpen(false);
            setEditingProperty(null);
          }}
          onSave={handleFormModalSave}
          property={editingProperty}
          cloudinaryConfig={cloudinaryConfig}
          currentUser={currentUser}
        />
      )}

      {isBulkImportOpen && (
        <BulkFolderImportModal
          isOpen={isBulkImportOpen}
          onClose={() => setIsBulkImportOpen(false)}
          onImportSuccess={() => setRefreshTrigger((prev) => prev + 1)}
          cloudinaryConfig={cloudinaryConfig}
          currentUser={currentUser}
        />
      )}

      {isMigrationModalOpen && (
        <MigrationProposalModal
          isOpen={isMigrationModalOpen}
          onClose={() => setIsMigrationModalOpen(false)}
          onMigrationSuccess={() => setRefreshTrigger((prev) => prev + 1)}
          items={normalizedProperties}
        />
      )}

      {/* MODAL XÁC NHẬN XÓA TIN */}
      {deletingProperty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-rose-400 flex items-center gap-2">
              ⚠️ Xác nhận xóa tin
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Bạn có chắc chắn muốn xóa vĩnh viễn tin{" "}
              <strong className="text-amber-400 font-mono">
                {deletingProperty.ma_tk || deletingProperty.name || deletingProperty.id}
              </strong>{" "}
              khỏi hệ thống? Hành động này không thể hoàn tác.
            </p>
            {deleteError && (
              <p className="text-xs text-rose-400 font-semibold">{deleteError}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeletingProperty(null);
                  setDeleteError(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await handleDeleteProperty(deletingProperty);
                    setDeletingProperty(null);
                    setDeleteError(null);
                  } catch (err: any) {
                    setDeleteError(err.message || "Lỗi khi xóa");
                  }
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer transition-colors"
              >
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
