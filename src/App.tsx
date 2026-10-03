import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  Database,
  AlertCircle,
  RefreshCw,
  ShieldAlert,
  FileCheck,
  Handshake,
  MapPin,
  LayoutList,
  LayoutGrid,
  CheckCircle2,
  Send,
  Share2,
  Trash2,
  Sparkles,
  CheckSquare,
  Square,
  ArrowRightLeft,
  Image as ImageIcon,
  Download,
  Plus,
} from "lucide-react";
import {
  Property,
  ConfigStatus,
  PropertyStatus,
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
  AI_EXTRACTED_FIELDS_META,
  sanitizeTenDuong,
  sanitizeSoNha,
} from "./utils/dataWarehouseUtils";
import { safeFetchJson } from "./utils/apiClient";
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
        const authHeaders = getAuthHeaders();
        const [sysRes, cldRes] = await Promise.all([
          safeFetchJson<ConfigStatus>("/api/config-status", {
            headers: authHeaders,
            credentials: "include",
          }),
          safeFetchJson<{ cloudName: string; uploadPreset: string }>(
            "/api/cloudinary-config",
            {
              headers: authHeaders,
              credentials: "include",
            }
          ),
        ]);

        if (sysRes.status === 401 || cldRes.status === 401) {
          localStorage.removeItem("admin_token");
          setIsAuthenticated(false);
          return;
        }

        if (!sysRes.ok) {
          throw new Error(
            sysRes.errorMessage ||
              `Không thể tải cấu hình hệ thống (HTTP ${sysRes.status} — GET /api/config-status)`
          );
        }
        if (!cldRes.ok) {
          throw new Error(
            cldRes.errorMessage ||
              `Không thể tải cấu hình lưu trữ (HTTP ${cldRes.status} — GET /api/cloudinary-config)`
          );
        }

        setConfigStatus(sysRes.data);
        setCloudinaryConfig(cldRes.data);

        const propRes = await safeFetchJson<{
          properties?: Property[];
          isFallbackMode?: boolean;
          isConfigError?: boolean;
          setupSQL?: string;
          error?: string;
        }>("/api/properties", {
          headers: authHeaders,
          credentials: "include",
        });
        if (propRes.status === 401) {
          localStorage.removeItem("admin_token");
          setIsAuthenticated(false);
          return;
        }

        if (!propRes.ok) {
          if (propRes.data?.isConfigError && propRes.data?.setupSQL) {
            setConfigStatus((prev) =>
              prev ? { ...prev, setupSQL: propRes.data.setupSQL } : null
            );
          }
          throw new Error(
            propRes.errorMessage ||
              `Không thể tải dữ liệu kho chuẩn (HTTP ${propRes.status} — GET /api/properties)`
          );
        }

        setProperties(propRes.data.properties || []);
        setIsFallbackMode(Boolean(propRes.data.isFallbackMode));
        fetchExportLogs();
      } catch (err: any) {
        setError(err.message || "Lỗi kết nối máy chủ.");
      } finally {
        setLoading(false);
      }
    };

    loadAppData();
  }, [isAuthenticated, refreshTrigger, fetchExportLogs]);

  // Chuẩn hóa toàn bộ danh sách nguồn nhà sang mô hình Kho Dữ Liệu Chuẩn
  const normalizedProperties: NormalizedWarehouseProperty[] = useMemo(() => {
    return properties.map((prop, idx) => normalizePropertyRecord(prop, idx + 1));
  }, [properties]);

  // Bản ghi đang mở trong ngăn chỉnh sửa bên phải
  const activeDrawerItem: NormalizedWarehouseProperty | null = useMemo(() => {
    if (!drawerItemId) return null;
    return normalizedProperties.find((it) => it.id === drawerItemId) || null;
  }, [drawerItemId, normalizedProperties]);

  // Bộ đếm đầu trang theo `trang_thai_kinh_doanh` (Sửa lỗi đếm bằng 0 trước đây)
  const businessCounts = useMemo(() => {
    let nguon_tho = 0;
    let da_ky = 0;
    let da_ban = 0;
    for (const item of normalizedProperties) {
      if (item.trang_thai_kinh_doanh === "da_ban") da_ban++;
      else if (item.trang_thai_kinh_doanh === "da_ky") da_ky++;
      else nguon_tho++;
    }
    return {
      total: normalizedProperties.length,
      nguon_tho,
      da_ky,
      da_ban,
    };
  }, [normalizedProperties]);

  // Dải thống kê theo `trang_thai_xu_ly`
  const processingCounts = useMemo(() => {
    const counts: Record<ProcessingStatusType, number> = {
      tho: 0,
      can_bo_sung: 0,
      san_sang: 0,
      da_len_hometea: 0,
      da_dang_fb: 0,
    };
    for (const item of normalizedProperties) {
      counts[item.trang_thai_xu_ly] = (counts[item.trang_thai_xu_ly] || 0) + 1;
    }
    return counts;
  }, [normalizedProperties]);

  // Tổng số cảnh báo chất lượng dữ liệu
  const qualitySummary = useMemo(() => {
    const codeFreq = new Map<string, number>();
    let legacyMaTkCount = 0;
    let missingFieldsCount = 0;
    let abnormalCount = 0;

    for (const it of normalizedProperties) {
      if (it.isLegacyOrMissingMaTk) {
        legacyMaTkCount++;
      } else {
        const c = it.ma_tk.toUpperCase();
        codeFreq.set(c, (codeFreq.get(c) || 0) + 1);
      }
      if (it.missingFieldKeys.length > 0) missingFieldsCount++;
      if (
        it.isAbnormalPricePerM2 ||
        it.needsAreaReview ||
        it.needsAreaLightCheck
      ) {
        abnormalCount++;
      }
    }

    let duplicateGroupCount = 0;
    for (const cnt of codeFreq.values()) {
      if (cnt > 1) duplicateGroupCount++;
    }

    return {
      duplicateGroupCount,
      legacyMaTkCount,
      missingFieldsCount,
      abnormalCount,
      totalIssues: duplicateGroupCount + legacyMaTkCount + abnormalCount,
    };
  }, [normalizedProperties]);

  // Danh sách phường thực tế có trong kho + danh sách chuẩn
  const wardFilterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const it of normalizedProperties) {
      if (it.phuong) set.add(it.phuong);
    }
    for (const d of DISTRICT_OPTIONS) {
      set.add(d);
    }
    return Array.from(set);
  }, [normalizedProperties]);

  // Lọc danh sách hiển thị trên bảng / thẻ
  const filteredItems = useMemo(() => {
    return normalizedProperties.filter((item) => {
      if (
        filterBusinessStatus !== "all" &&
        item.trang_thai_kinh_doanh !== filterBusinessStatus
      ) {
        return false;
      }
      if (
        filterProcessingStatus !== "all" &&
        item.trang_thai_xu_ly !== filterProcessingStatus
      ) {
        return false;
      }
      if (filterDistrict !== "all") {
        if ((item.phuong || "").toLowerCase() !== filterDistrict.toLowerCase()) {
          return false;
        }
      }
      if (filterCompleteness === "complete" && item.missingFieldKeys.length > 0) {
        return false;
      }
      if (
        filterCompleteness === "incomplete" &&
        item.missingFieldKeys.length === 0
      ) {
        return false;
      }
      if (filterAiState === "needs_confirm") {
        if (!item.da_boc_tach_ai || (item.da_xac_nhan_ai && item.aiNeedsConfirmCount === 0)) {
          return false;
        }
      } else if (filterAiState === "extracted") {
        if (!item.da_boc_tach_ai) return false;
      } else if (filterAiState === "unextracted") {
        if (item.da_boc_tach_ai) return false;
      }

      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;

      const haystack = [
        item.ma_tk,
        item.suggestedMaTk,
        item.legacyToken,
        item.so_nha,
        item.ten_duong,
        item.duong,
        item.phuong,
        item.gia_text,
        item.dien_tich,
        item.phap_ly,
        item.huong,
        item.hien_trang,
        ...(item.dac_diem || []),
        item.moi_gioi_nguon,
        item.sdt_nguon,
        item.raw.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [
    normalizedProperties,
    filterBusinessStatus,
    filterProcessingStatus,
    filterDistrict,
    filterCompleteness,
    filterAiState,
    searchQuery,
  ]);

  // Selection helpers
  const toggleSelectOne = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    if (
      filteredItems.length > 0 &&
      filteredItems.every((it) => selectedIds.has(it.id))
    ) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((it) => it.id)));
    }
  };

  // Lưu thay đổi từ ngăn chỉnh sửa bên phải (WarehouseEditDrawer)
  const handleSaveDrawerUpdates = async (
    id: string,
    updates: Partial<Property>
  ) => {
    const res = await safeFetchJson<{ property?: Property; error?: string }>(
      `/api/properties/${id}`,
      {
        method: "PUT",
        headers: getAuthHeaders(true),
        credentials: "include",
        body: JSON.stringify(updates),
      }
    );
    if (!res.ok) {
      throw new Error(
        res.errorMessage ||
          `Không thể lưu cập nhật bản ghi (HTTP ${res.status} — PUT /api/properties/${id})`
      );
    }
    if (res.data.property) {
      setProperties((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, ...updates, ...res.data.property } : p
        )
      );
    }
    showToast("Đã lưu chuẩn hóa bản ghi!");
  };

  // Lưu từ modal thêm/sửa truyền thống
  const handleSavePropertyModal = async (
    propertyData: Property
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const isEditing = Boolean(editingProperty?.id);
      const url = isEditing
        ? `/api/properties/${editingProperty!.id}`
        : "/api/properties";
      const method = isEditing ? "PUT" : "POST";

      const res = await safeFetchJson<{ error?: string }>(url, {
        method,
        headers: getAuthHeaders(true),
        credentials: "include",
        body: JSON.stringify(propertyData),
      });
      if (!res.ok) {
        return {
          success: false,
          error:
            res.errorMessage ||
            `Có lỗi xảy ra khi lưu thông tin (HTTP ${res.status} — ${method} ${url})`,
        };
      }
      setRefreshTrigger((prev) => prev + 1);
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Có lỗi xảy ra khi lưu thông tin",
      };
    }
  };

  // Thực thi thao tác hàng loạt qua `/api/properties/bulk-action`
  const executeBatchUpdate = async (
    batchItems: Array<{ id: string; changes: Record<string, any> }>,
    exportLog?: Partial<ExportLogEntry>
  ) => {
    setBulkActionLoading(true);
    try {
      const res = await safeFetchJson<{ error?: string }>(
        "/api/properties/bulk-action",
        {
          method: "POST",
          headers: getAuthHeaders(true),
          credentials: "include",
          body: JSON.stringify({
            items: batchItems,
            payload: exportLog ? { exportLog } : undefined,
          }),
        }
      );
      if (!res.ok) {
        throw new Error(
          res.errorMessage ||
            `Lỗi cập nhật hàng loạt (HTTP ${res.status} — POST /api/properties/bulk-action)`
        );
      }

      // Cập nhật ngay state trên giao diện để phản hồi tức thì
      const changeMap = new Map(batchItems.map((b) => [b.id, b.changes]));
      setProperties((prev) =>
        prev.map((p) => {
          const ch = p.id ? changeMap.get(p.id) : undefined;
          if (!ch) return p;
          return {
            ...p,
            ...ch,
            district: ch.phuong !== undefined ? ch.phuong : p.district,
          };
        })
      );

      if (exportLog) {
        fetchExportLogs();
      }
    } finally {
      setBulkActionLoading(false);
    }
  };

  // =========================================================================
  // BÓC TÁCH BẰNG AI THEO LÔ 20 TIN (Có tiến độ, tự thử lại khi lỗi, không ghi đè sửa tay)
  // =========================================================================
  const handleRunAiBatchExtraction = async (
    targetItems: NormalizedWarehouseProperty[]
  ) => {
    if (targetItems.length === 0 || aiBatchProgress.isRunning) return;

    const BATCH_SIZE = 20;
    const totalCount = targetItems.length;
    const batches: NormalizedWarehouseProperty[][] = [];
    for (let i = 0; i < targetItems.length; i += BATCH_SIZE) {
      batches.push(targetItems.slice(i, i + BATCH_SIZE));
    }

    setAiBatchProgress({
      isRunning: true,
      currentBatch: 1,
      totalBatches: batches.length,
      processedCount: 0,
      totalCount,
      successCount: 0,
      failedIds: [],
      lastError: null,
    });

    let cumulativeProcessed = 0;
    let cumulativeSuccess = 0;
    const cumulativeFailedIds: string[] = [];
    let latestErr: string | null = null;

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      const batch = batches[bIdx];
      setAiBatchProgress((prev) => ({
        ...prev,
        currentBatch: bIdx + 1,
      }));

      // Thử lại tối đa 3 lần cho các tin lỗi trong lô 20 tin
      let pendingItems = [...batch];
      let batchExtractedMap = new Map<string, Record<string, any>>();

      for (let retry = 0; retry < 3 && pendingItems.length > 0; retry++) {
        try {
          const payloadRecords = pendingItems.map((it) => ({
            id: it.id,
            content: it.raw.content,
            name: it.raw.name,
            dia_chi: it.raw.dia_chi || [it.so_nha, it.duong].filter(Boolean).join(" "),
            phuong: it.phuong,
            so_nha: it.so_nha || null,
            ten_duong: it.ten_duong || it.duong || null,
            duong: it.duong || null,
            ai_manual_fields: it.ai_manual_fields,
          }));

          const res = await safeFetchJson<{
            success?: boolean;
            results?: Array<{
              id: string;
              success: boolean;
              error?: string;
              extracted?: Record<string, any>;
            }>;
            error?: string;
          }>("/api/properties/ai-extract", {
            method: "POST",
            headers: getAuthHeaders(true),
            credentials: "include",
            body: JSON.stringify({ records: payloadRecords }),
          });

          if (!res.ok || !Array.isArray(res.data?.results)) {
            latestErr =
              res.errorMessage ||
              res.data?.error ||
              `Lỗi lô ${bIdx + 1} (HTTP ${res.status})`;
            if (retry < 2) {
              await new Promise((r) => setTimeout(r, 800 * (retry + 1)));
              continue;
            }
            break;
          }

          const stillFailed: NormalizedWarehouseProperty[] = [];
          for (const itemResult of res.data.results) {
            if (itemResult.success && itemResult.extracted) {
              batchExtractedMap.set(itemResult.id, itemResult.extracted);
            } else {
              if (itemResult.error) latestErr = itemResult.error;
              const found = pendingItems.find((p) => p.id === itemResult.id);
              if (found) stillFailed.push(found);
            }
          }

          pendingItems = stillFailed;
          if (pendingItems.length > 0 && retry < 2) {
            await new Promise((r) => setTimeout(r, 800 * (retry + 1)));
          }
        } catch (err: any) {
          latestErr = err?.message || "Lỗi kết nối khi bóc tách bằng AI";
          if (retry < 2) {
            await new Promise((r) => setTimeout(r, 800 * (retry + 1)));
          }
        }
      }

      // Cập nhật ngay lập tức state properties cho các tin thành công trong lô này
      if (batchExtractedMap.size > 0) {
        setProperties((prev) =>
          prev.map((p) => {
            const ext = p.id ? batchExtractedMap.get(p.id) : undefined;
            if (!ext) return p;
            return {
              ...p,
              ...ext,
            };
          })
        );
      }

      for (const failedItem of pendingItems) {
        cumulativeFailedIds.push(failedItem.id);
      }

      cumulativeProcessed += batch.length;
      cumulativeSuccess += batchExtractedMap.size;

      setAiBatchProgress({
        isRunning: bIdx < batches.length - 1,
        currentBatch: bIdx + 1,
        totalBatches: batches.length,
        processedCount: cumulativeProcessed,
        totalCount,
        successCount: cumulativeSuccess,
        failedIds: [...cumulativeFailedIds],
        lastError: cumulativeFailedIds.length > 0 ? latestErr : null,
      });
    }

    if (cumulativeFailedIds.length === 0) {
      showToast(
        `Đã bóc tách AI thành công ${cumulativeSuccess}/${totalCount} tin! Vui lòng kiểm tra và bấm "Xác nhận" để chuyển sang Sẵn sàng.`
      );
    } else {
      showToast(
        `Đã bóc tách ${cumulativeSuccess}/${totalCount} tin (${cumulativeFailedIds.length} tin lỗi — có thể bấm Thử lại).`
      );
    }
  };

  // Xác nhận kết quả AI & chuyển sang `trang_thai_xu_ly = 'san_sang'`
  const handleConfirmAiReady = async (
    targetItems: NormalizedWarehouseProperty[]
  ) => {
    if (targetItems.length === 0) return;

    const batch = targetItems.map((it) => {
      const nextEvidence = { ...(it.nguon_trich_xuat || {}) };
      for (const meta of AI_EXTRACTED_FIELDS_META) {
        const k = meta.key;
        if (nextEvidence[k]) {
          nextEvidence[k] = {
            ...nextEvidence[k]!,
            da_xac_nhan: true,
          };
        }
      }
      return {
        id: it.id,
        changes: {
          da_xac_nhan_ai: true,
          da_boc_tach_ai: true,
          nguon_trich_xuat: nextEvidence,
          trang_thai_xu_ly: "san_sang" as ProcessingStatusType,
          ma_tk: it.isLegacyOrMissingMaTk ? it.suggestedMaTk : it.ma_tk,
          _fromAiExtraction: true,
        },
      };
    });

    await executeBatchUpdate(batch);
    showToast(
      `Đã xác nhận duyệt ${batch.length} tin & chuyển sang trạng thái "Sẵn sàng" (\`san_sang\`)!`
    );
  };

  // Mở khung Sửa / Duyệt nhanh ngay trong dòng bảng
  const openInlineAiEditor = (
    it: NormalizedWarehouseProperty,
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    if (inlineAiRowId === it.id) {
      setInlineAiRowId(null);
      return;
    }
    setInlineAiRowId(it.id);
    setInlineAiDraft({
      loai_vi_tri: it.loai_vi_tri || "",
      huong: it.huong || "",
      phap_ly: it.phap_ly || "",
      so_phong_ngu:
        it.so_phong_ngu !== null && it.so_phong_ngu !== undefined
          ? String(it.so_phong_ngu)
          : "",
      so_wc:
        it.so_wc !== null && it.so_wc !== undefined ? String(it.so_wc) : "",
      so_nha: it.so_nha || "",
      ten_duong: it.ten_duong || it.duong || "",
      duong_vao_m:
        it.duong_vao_m !== null && it.duong_vao_m !== undefined
          ? String(it.duong_vao_m)
          : "",
      dac_diem: Array.isArray(it.dac_diem) ? it.dac_diem.join(", ") : "",
      hien_trang: it.hien_trang || "",
    });
  };

  // Lưu sửa tay / xác nhận trực tiếp từ khung inline trong bảng
  const handleSaveInlineAiEdit = async (
    it: NormalizedWarehouseProperty,
    confirmReady: boolean
  ) => {
    setInlineAiSaving(true);
    try {
      const cleanSoNha = sanitizeSoNha(inlineAiDraft.so_nha) || inlineAiDraft.so_nha.trim() || null;
      const cleanTenDuong =
        sanitizeTenDuong(inlineAiDraft.ten_duong) || inlineAiDraft.ten_duong.trim() || null;
      const parsedPn =
        inlineAiDraft.so_phong_ngu.trim() &&
        !isNaN(Number(inlineAiDraft.so_phong_ngu)) &&
        Number(inlineAiDraft.so_phong_ngu) > 0
          ? Math.round(Number(inlineAiDraft.so_phong_ngu))
          : null;
      const parsedWc =
        inlineAiDraft.so_wc.trim() &&
        !isNaN(Number(inlineAiDraft.so_wc)) &&
        Number(inlineAiDraft.so_wc) > 0
          ? Math.round(Number(inlineAiDraft.so_wc))
          : null;
      const parsedDuongVao =
        inlineAiDraft.duong_vao_m.trim() &&
        !isNaN(Number(inlineAiDraft.duong_vao_m)) &&
        Number(inlineAiDraft.duong_vao_m) > 0
          ? Number(inlineAiDraft.duong_vao_m)
          : null;
      const parsedDacDiem = inlineAiDraft.dac_diem.trim()
        ? inlineAiDraft.dac_diem
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : null;

      const nextVals: Record<AiExtractedFieldKey, any> = {
        loai_vi_tri: inlineAiDraft.loai_vi_tri
          ? (inlineAiDraft.loai_vi_tri as LoaiViTriType)
          : null,
        huong: inlineAiDraft.huong.trim() || null,
        phap_ly: inlineAiDraft.phap_ly.trim() || null,
        so_phong_ngu: parsedPn,
        so_wc: parsedWc,
        so_nha: cleanSoNha,
        ten_duong: cleanTenDuong,
        duong_vao_m: parsedDuongVao,
        dac_diem: parsedDacDiem,
        hien_trang: inlineAiDraft.hien_trang.trim() || null,
      };

      const prevVals: Record<AiExtractedFieldKey, any> = {
        loai_vi_tri: it.loai_vi_tri,
        huong: it.huong,
        phap_ly: it.phap_ly,
        so_phong_ngu: it.so_phong_ngu,
        so_wc: it.so_wc,
        so_nha: it.so_nha || null,
        ten_duong: it.ten_duong || it.duong || null,
        duong_vao_m: it.duong_vao_m,
        dac_diem: it.dac_diem,
        hien_trang: it.hien_trang,
      };

      const manualSet = new Set<AiExtractedFieldKey>(it.ai_manual_fields || []);
      const nextEvMap = { ...(it.nguon_trich_xuat || {}) };

      for (const meta of AI_EXTRACTED_FIELDS_META) {
        const k = meta.key;
        const changed =
          JSON.stringify(prevVals[k] ?? null) !== JSON.stringify(nextVals[k] ?? null);
        if (changed) {
          manualSet.add(k);
          nextEvMap[k] = {
            gia_tri: nextVals[k],
            bang_chung: nextEvMap[k]?.bang_chung || "Đã chỉnh sửa / xác nhận thủ công",
            tin_cay: "cao",
            da_sua_tay: true,
            da_xac_nhan: true,
          };
        } else if (confirmReady && nextEvMap[k]) {
          nextEvMap[k] = {
            ...nextEvMap[k]!,
            da_xac_nhan: true,
          };
        }
      }

      const updates: Partial<Property> = {
        loai_vi_tri: nextVals.loai_vi_tri,
        huong: nextVals.huong,
        phap_ly: nextVals.phap_ly,
        so_phong_ngu: nextVals.so_phong_ngu,
        so_wc: nextVals.so_wc,
        so_nha: nextVals.so_nha,
        ten_duong: nextVals.ten_duong,
        duong: nextVals.ten_duong || "",
        duong_vao_m: nextVals.duong_vao_m,
        dac_diem: nextVals.dac_diem,
        hien_trang: nextVals.hien_trang,
        nguon_trich_xuat: nextEvMap,
        ai_manual_fields: Array.from(manualSet),
        da_boc_tach_ai: true,
        da_xac_nhan_ai: confirmReady ? true : it.da_xac_nhan_ai,
        trang_thai_xu_ly: confirmReady ? "san_sang" : it.trang_thai_xu_ly,
      };

      await handleSaveDrawerUpdates(it.id, updates);
      setInlineAiRowId(null);
      if (confirmReady) {
        showToast(`Đã xác nhận & chuyển tin ${it.ma_tk} sang Sẵn sàng!`);
      }
    } finally {
      setInlineAiSaving(false);
    }
  };

  // Thao tác hàng loạt 1: Đánh dấu Sẵn sàng (hoặc trạng thái xử lý bất kỳ)
  const handleBulkSetProcessingStatus = async (
    newStatus: ProcessingStatusType
  ) => {
    const targets = normalizedProperties.filter((it) => selectedIds.has(it.id));
    if (targets.length === 0) return;

    const batch = targets.map((it) => ({
      id: it.id,
      changes: {
        trang_thai_xu_ly: newStatus,
        da_xac_nhan_ai: newStatus === "san_sang" ? true : it.da_xac_nhan_ai,
        ma_tk: it.isLegacyOrMissingMaTk ? it.suggestedMaTk : it.ma_tk,
      },
    }));

    await executeBatchUpdate(batch);
    showToast(
      `Đã chuyển ${batch.length} nguồn sang trạng thái "${PROCESSING_STATUS_META[newStatus].label}"!`
    );
  };

  // Thao tác hàng loạt 2: Đánh dấu trạng thái kinh doanh
  const handleBulkSetBusinessStatus = async (newStatus: BusinessStatusType) => {
    const targets = normalizedProperties.filter((it) => selectedIds.has(it.id));
    if (targets.length === 0) return;

    const batch = targets.map((it) => ({
      id: it.id,
      changes: {
        trang_thai_kinh_doanh: newStatus,
      },
    }));

    await executeBatchUpdate(batch);
    showToast(
      `Đã cập nhật ${batch.length} nguồn sang "${BUSINESS_STATUS_META[newStatus].label}"!`
    );
  };

  // Thao tác hàng loạt 3: Gán phường
  const handleBulkAssignWard = async () => {
    const trimmedWard = bulkWardValue.trim();
    if (!trimmedWard) return;
    const targets = normalizedProperties.filter((it) => selectedIds.has(it.id));
    if (targets.length === 0) return;

    const batch = targets.map((it) => ({
      id: it.id,
      changes: {
        phuong: trimmedWard,
        district: trimmedWard,
      },
    }));

    await executeBatchUpdate(batch);
    showToast(`Đã gán phường "${trimmedWard}" cho ${batch.length} nguồn!`);
    setBulkWardValue("");
  };

  // Thao tác hàng loạt 4: Xóa trùng (trong các dòng đang chọn hoặc toàn bộ kho)
  const handleBulkDeleteDuplicates = async (explicitIdsToDelete?: string[]) => {
    let idsToDelete: string[] = explicitIdsToDelete || [];

    if (!explicitIdsToDelete) {
      const pool =
        selectedIds.size > 1
          ? normalizedProperties.filter((it) => selectedIds.has(it.id))
          : normalizedProperties;

      const byCode = new Map<string, NormalizedWarehouseProperty[]>();
      for (const it of pool) {
        const key = (
          !it.isLegacyOrMissingMaTk
            ? it.ma_tk
            : `${it.so_nha}_${it.duong}_${it.phuong}`
        )
          .trim()
          .toUpperCase();
        if (!key || key === "__") continue;
        const list = byCode.get(key) || [];
        list.push(it);
        byCode.set(key, list);
      }

      for (const group of byCode.values()) {
        if (group.length > 1) {
          group.sort((a, b) => b.filledCount - a.filledCount);
          for (let i = 1; i < group.length; i++) {
            idsToDelete.push(group[i].id);
          }
        }
      }
    }

    if (idsToDelete.length === 0) {
      showToast("Không phát hiện bản ghi trùng lặp nào cần xóa!");
      return;
    }

    setBulkActionLoading(true);
    try {
      const res = await safeFetchJson("/api/properties/bulk-action", {
        method: "POST",
        headers: getAuthHeaders(true),
        credentials: "include",
        body: JSON.stringify({
          action: "delete_many",
          ids: idsToDelete,
        }),
      });
      if (res.ok) {
        const delSet = new Set(idsToDelete);
        setProperties((prev) => prev.filter((p) => !p.id || !delSet.has(p.id)));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of idsToDelete) next.delete(id);
          return next;
        });
        showToast(`Đã xóa ${idsToDelete.length} bản ghi trùng lặp!`);
      } else {
        showToast(
          res.errorMessage ||
            `Lỗi xóa trùng (HTTP ${res.status} — POST /api/properties/bulk-action)`
        );
      }
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Thao tác 5: Xuất dữ liệu chuẩn sang Hometea hoặc Post Writer
  const handleExportToChannel = async (
    targetItems: NormalizedWarehouseProperty[],
    channel: "hometea" | "post_writer"
  ) => {
    if (targetItems.length === 0) return;

    const cleanRows = targetItems.map((it) => toVNguonXuatRow(it));
    const jsonString = JSON.stringify(cleanRows, null, 2);
    try {
      await navigator.clipboard.writeText(jsonString);
    } catch (_) {}

    // Download JSON file for immediate import into Hometea / Post Writer
    const blob = new Blob([jsonString], {
      type: "application/json;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${channel}_v_nguon_xuat_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    const nextStatus: ProcessingStatusType =
      channel === "hometea" ? "da_len_hometea" : "da_dang_fb";

    const batch = targetItems.map((it) => ({
      id: it.id,
      changes: {
        trang_thai_xu_ly: nextStatus,
        da_xuat_hometea:
          channel === "hometea" ? true : it.da_xuat_hometea,
        da_xuat_fb: channel === "post_writer" ? true : it.da_xuat_fb,
        ma_tk: it.isLegacyOrMissingMaTk ? it.suggestedMaTk : it.ma_tk,
      },
    }));

    await executeBatchUpdate(batch, {
      target: channel,
      target_label:
        channel === "hometea" ? "Xuất sang Hometea" : "Xuất sang Post Writer",
      record_count: targetItems.length,
      ma_tk_list: cleanRows.map((r) => r.ma_tk),
      note: `Đã chép clipboard & tải gói chuẩn (${targetItems.length} nguồn, ẩn thông tin nội bộ)`,
    });

    showToast(
      `Đã xuất ${targetItems.length} nguồn sang ${
        channel === "hometea" ? "Hometea" : "Post Writer"
      } (đã lưu Nhật ký xuất)!`
    );
  };

  // Xuất toàn bộ VIEW v_nguon_xuat (JSON / CSV)
  const handleExportFullViewData = async (format: "json" | "csv") => {
    const rows = normalizedProperties.map((it) => toVNguonXuatRow(it));

    if (format === "json") {
      const jsonStr = JSON.stringify(rows, null, 2);
      const blob = new Blob([jsonStr], {
        type: "application/json;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `v_nguon_xuat_${rows.length}_dong.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      const headers = [
        "ma_tk",
        "so_nha",
        "duong",
        "phuong",
        "dien_tich_so",
        "dien_tich_thuc_te",
        "so_tang",
        "rong",
        "dai",
        "gia",
        "so_luong_anh",
        "trang_thai_xu_ly",
        "thieu",
      ];
      const csvLines = [
        headers.join(","),
        ...rows.map((r) =>
          [
            `"${(r.ma_tk || "").replace(/"/g, '""')}"`,
            `"${(r.so_nha || "").replace(/"/g, '""')}"`,
            `"${(r.duong || "").replace(/"/g, '""')}"`,
            `"${(r.phuong || "").replace(/"/g, '""')}"`,
            r.dien_tich_so ?? "",
            r.dien_tich_thuc_te ?? "",
            `"${(r.so_tang || "").replace(/"/g, '""')}"`,
            `"${(r.rong || "").replace(/"/g, '""')}"`,
            `"${(r.dai || "").replace(/"/g, '""')}"`,
            r.gia ?? "",
            Array.isArray(r.anh) ? r.anh.length : 0,
            `"${r.trang_thai_xu_ly}"`,
            `"${(r.thieu || "").replace(/"/g, '""')}"`,
          ].join(",")
        ),
      ];
      const blob = new Blob(["\uFEFF" + csvLines.join("\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `v_nguon_xuat_${rows.length}_dong.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    await safeFetchJson("/api/export-logs", {
      method: "POST",
      headers: getAuthHeaders(true),
      credentials: "include",
      body: JSON.stringify({
        target:
          format === "json" ? "v_nguon_xuat_json" : "v_nguon_xuat_csv",
        target_label: `Tải VIEW v_nguon_xuat (${format.toUpperCase()})`,
        record_count: rows.length,
        ma_tk_list: rows.map((r) => r.ma_tk),
        note: `Xuất toàn bộ ${rows.length} dòng chuẩn từ v_nguon_xuat`,
      }),
    }).catch(() => {});

    fetchExportLogs();
    showToast(
      `Đã tải xuống ${rows.length} dòng chuẩn từ VIEW v_nguon_xuat (${format.toUpperCase()})!`
    );
  };

  // Gán ma_tk chuẩn cho các bản ghi kiểu cũ (#10, #11 hoặc rỗng)
  const handleAssignLegacyMaTk = async (
    records: NormalizedWarehouseProperty[]
  ) => {
    if (records.length === 0) return;
    const batch = records.map((it) => ({
      id: it.id,
      changes: {
        ma_tk: it.suggestedMaTk,
      },
    }));
    await executeBatchUpdate(batch);
    showToast(`Đã gán Mã TK chuẩn cho ${records.length} bản ghi!`);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingProperty?.id) return;
    setDeleteError(null);
    try {
      const targetUrl = `/api/properties/${deletingProperty.id}`;
      const res = await safeFetchJson<{ error?: string }>(targetUrl, {
        method: "DELETE",
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(
          res.errorMessage ||
            `Không thể xóa bản ghi (HTTP ${res.status} — DELETE ${targetUrl})`
        );
      }
      setProperties((prev) => prev.filter((p) => p.id !== deletingProperty.id));
      if (drawerItemId === deletingProperty.id) {
        setDrawerItemId(null);
      }
      setDeletingProperty(null);
      showToast("Đã xóa bản ghi khỏi kho!");
    } catch (err: any) {
      setDeleteError(err.message || "Lỗi khi xóa bản ghi.");
    }
  };

  const handleLogout = async () => {
    try {
      await safeFetchJson("/api/logout", {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
      });
    } finally {
      localStorage.removeItem("admin_token");
      setIsAuthenticated(false);
      setCurrentUser(null);
      setProperties([]);
    }
  };

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-mono text-slate-400">
            ĐANG KHỞI TẠO KHO DỮ LIỆU CHUẨN...
          </p>
        </div>
      </div>
    );
  }

  if (isAuthenticated === false) {
    return (
      <LoginScreen
        onLoginSuccess={(user) => {
          if (user) setCurrentUser(user);
          setIsAuthenticated(true);
        }}
        theme="dark"
        toggleTheme={() => {}}
      />
    );
  }

  const isViewer = currentUser?.role === "viewer";

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Main Top Navbar */}
      <Navbar
        isDarkMode={isDarkMode}
        onToggleTheme={() => {}}
        onAddNew={() => {
          setEditingProperty(null);
          setIsFormOpen(true);
        }}
        onOpenBulkImport={() => setIsBulkImportOpen(true)}
        onLogout={handleLogout}
        currentUser={currentUser}
        activeTab={activeTab}
        onChangeTab={(tab) => setActiveTab(tab)}
        totalCount={normalizedProperties.length}
        qualityIssuesCount={qualitySummary.totalIssues}
        exportLogsCount={exportLogs.length}
      />

      {/* Floating Toast Notification */}
      {toastBanner && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastBanner}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-24 lg:pb-10 space-y-5">
        {activeTab === "users" && currentUser?.role === "admin" ? (
          <UserManagementView currentUser={currentUser} />
        ) : activeTab === "system" && currentUser?.role === "admin" ? (
          <SystemAndReportsView
            properties={properties}
            currentUser={currentUser}
            onBackToProperties={() => setActiveTab("properties")}
            onOpenMigrationModal={() => setIsMigrationModalOpen(true)}
          />
        ) : activeTab === "profile" ? (
          <UserProfileView
            currentUser={currentUser}
            properties={properties}
            onBackToProperties={() => setActiveTab("properties")}
            onAddNewProperty={() => {
              setEditingProperty(null);
              setIsFormOpen(true);
            }}
            onEditProperty={(prop) => {
              if (prop.id) setDrawerItemId(prop.id);
            }}
            onDeleteProperty={(prop) => {
              setDeletingProperty(prop);
              setDeleteError(null);
            }}
            onViewProperty={(prop) => {
              if (prop.id) setDrawerItemId(prop.id);
            }}
            onStatusChange={async (e, prop, status) => {
              e.stopPropagation();
              if (prop.id) {
                await handleSaveDrawerUpdates(prop.id, { status });
              }
            }}
            onProfileUpdated={(updatedUser) => setCurrentUser(updatedUser)}
          />
        ) : activeTab === "data_quality" ? (
          <DataQualityView
            items={normalizedProperties}
            onSelectItem={(it) => setDrawerItemId(it.id)}
            onAssignAllLegacyMaTk={handleAssignLegacyMaTk}
            onDeleteDuplicates={handleBulkDeleteDuplicates}
            isAdminOrStaff={!isViewer}
          />
        ) : activeTab === "export_logs" ? (
          <ExportLogsView
            items={normalizedProperties}
            exportLogs={exportLogs}
            onRefreshLogs={fetchExportLogs}
            onExportViewData={handleExportFullViewData}
            onSelectItem={(it) => setDrawerItemId(it.id)}
          />
        ) : (
          <>
            {/* Config Warning if Database not connected */}
            {configStatus && !configStatus.supabaseConfigured && (
              <ConfigGuide
                missingVars={configStatus.missingVars}
                supabaseConfigured={configStatus.supabaseConfigured}
                cloudinaryConfigured={configStatus.cloudinaryConfigured}
                sqlSchema={configStatus.setupSQL}
                onRefresh={() => setRefreshTrigger((prev) => prev + 1)}
              />
            )}

            {/* Thanh Đề xuất ánh xạ dữ liệu cũ sang 2 cột trạng thái chuẩn */}
            <div className="p-3.5 sm:px-5 sm:py-3.5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/30 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
                  <ArrowRightLeft className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs sm:text-sm font-bold text-slate-100">
                      Chuẩn hóa 2 cột trạng thái (`trang_thai_kinh_doanh` &amp; `trang_thai_xu_ly`) &amp; VIEW `v_nguon_xuat`
                    </span>
                    {qualitySummary.legacyMaTkCount > 0 && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold">
                        {qualitySummary.legacyMaTkCount} tin cần gán ma_tk chuẩn
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Đang quản lý <b>{businessCounts.total}</b> nguồn nhà. Bấm{" "}
                    <b>"Xem đề xuất ánh xạ"</b> để đối chiếu quy tắc chuyển dữ liệu cũ sang 2 cột mới trước khi xác nhận chạy.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsMigrationModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Xem đề xuất ánh xạ ({businessCounts.total} tin)
                </button>
                <button
                  type="button"
                  onClick={() => handleExportFullViewData("json")}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  title="Tải dữ liệu VIEW v_nguon_xuat"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">v_nguon_xuat</span>
                </button>
              </div>
            </div>

            {/* 1. BỘ ĐẾM ĐẦU TRANG: TRẠNG THÁI KINH DOANH (`nguon_tho` / `da_ky` / `da_ban`) */}
            <div
              className="grid grid-cols-3 gap-2.5 sm:gap-4"
              id="business-status-counters"
            >
              {/* Nguồn thô */}
              <div
                onClick={() =>
                  setFilterBusinessStatus((prev) =>
                    prev === "nguon_tho" ? "all" : "nguon_tho"
                  )
                }
                className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                  filterBusinessStatus === "nguon_tho"
                    ? "bg-slate-800/90 border-amber-500 ring-2 ring-amber-500/20"
                    : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Nguồn thô (`nguon_tho`)
                    </span>
                    {filterBusinessStatus === "nguon_tho" && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 text-[9px] font-extrabold">
                        ĐANG LỌC
                      </span>
                    )}
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-100 font-mono mt-1">
                    {businessCounts.nguon_tho}
                  </div>
                  <p className="text-[11px] text-slate-400 hidden sm:block">
                    Nguồn đang mở bán trong kho chuẩn
                  </p>
                </div>
                <div className="hidden sm:flex p-3 rounded-xl bg-slate-800 text-slate-300">
                  <Database className="w-5 h-5" />
                </div>
              </div>

              {/* Đã ký */}
              <div
                onClick={() =>
                  setFilterBusinessStatus((prev) =>
                    prev === "da_ky" ? "all" : "da_ky"
                  )
                }
                className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                  filterBusinessStatus === "da_ky"
                    ? "bg-sky-950/50 border-sky-500 ring-2 ring-sky-500/20"
                    : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
                      Đã ký (`da_ky`)
                    </span>
                    {filterBusinessStatus === "da_ky" && (
                      <span className="px-1.5 py-0.2 rounded bg-sky-500 text-slate-950 text-[9px] font-extrabold">
                        ĐANG LỌC
                      </span>
                    )}
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-sky-400 font-mono mt-1">
                    {businessCounts.da_ky}
                  </div>
                  <p className="text-[11px] text-slate-400 hidden sm:block">
                    Đã ký hợp đồng / xác nhận hoa hồng
                  </p>
                </div>
                <div className="hidden sm:flex p-3 rounded-xl bg-sky-500/15 text-sky-400">
                  <FileCheck className="w-5 h-5" />
                </div>
              </div>

              {/* Đã bán */}
              <div
                onClick={() =>
                  setFilterBusinessStatus((prev) =>
                    prev === "da_ban" ? "all" : "da_ban"
                  )
                }
                className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                  filterBusinessStatus === "da_ban"
                    ? "bg-rose-950/50 border-rose-500 ring-2 ring-rose-500/20"
                    : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
                      Đã bán (`da_ban`)
                    </span>
                    {filterBusinessStatus === "da_ban" && (
                      <span className="px-1.5 py-0.2 rounded bg-rose-500 text-white text-[9px] font-extrabold">
                        ĐANG LỌC
                      </span>
                    )}
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-rose-400 font-mono mt-1">
                    {businessCounts.da_ban}
                  </div>
                  <p className="text-[11px] text-slate-400 hidden sm:block">
                    Đã giao dịch thành công / đóng nguồn
                  </p>
                </div>
                <div className="hidden sm:flex p-3 rounded-xl bg-rose-500/15 text-rose-400">
                  <Handshake className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* 2. DẢI THỐNG KÊ THEO TRẠNG THÁI XỬ LÝ (`trang_thai_xu_ly`), BẤM ĐỂ LỌC */}
            <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Dải thống kê Trạng thái xử lý (`trang_thai_xu_ly`) — Bấm để lọc nhanh
                </span>
                {(filterProcessingStatus !== "all" ||
                  filterBusinessStatus !== "all" ||
                  filterDistrict !== "all" ||
                  filterCompleteness !== "all" ||
                  filterAiState !== "all" ||
                  searchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterProcessingStatus("all");
                      setFilterBusinessStatus("all");
                      setFilterDistrict("all");
                      setFilterCompleteness("all");
                      setFilterAiState("all");
                      setSearchQuery("");
                    }}
                    className="text-[11px] text-amber-400 hover:underline font-semibold cursor-pointer"
                  >
                    Xóa bộ lọc
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <button
                  type="button"
                  onClick={() => setFilterProcessingStatus("all")}
                  className={`px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                    filterProcessingStatus === "all"
                      ? "bg-amber-500 text-slate-950 border-amber-400 font-bold"
                      : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <span className="text-xs font-semibold">Tất cả nguồn</span>
                  <span className="font-mono text-sm font-extrabold">
                    {normalizedProperties.length}
                  </span>
                </button>

                {(
                  [
                    "tho",
                    "can_bo_sung",
                    "san_sang",
                    "da_len_hometea",
                    "da_dang_fb",
                  ] as ProcessingStatusType[]
                ).map((stKey) => {
                  const meta = PROCESSING_STATUS_META[stKey];
                  const active = filterProcessingStatus === stKey;
                  return (
                    <button
                      key={stKey}
                      type="button"
                      onClick={() =>
                        setFilterProcessingStatus((prev) =>
                          prev === stKey ? "all" : stKey
                        )
                      }
                      className={`px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                        active
                          ? `${meta.badgeClass} ring-2 ring-amber-500/30`
                          : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${meta.dotColor}`}
                        />
                        <div className="truncate">
                          <div className="text-xs font-bold truncate">
                            {meta.label}
                          </div>
                          <div className="text-[10px] font-mono opacity-75">
                            {stKey}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-sm font-extrabold ml-2">
                        {processingCounts[stKey]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* THANH TÌM KIẾM, LỌC PHƯỜNG & CHUYỂN ĐỔI BẢNG DÀY / THẺ */}
            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              {/* Search Box */}
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

              {/* Filters & View Mode Switch */}
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

                {/* View Mode Toggle: Mặc định Bảng dày, tùy chọn phụ Thẻ */}
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                      viewMode === "table"
                        ? "bg-amber-500 text-slate-950"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                    title="Chế độ Bảng dày (Mặc định)"
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
                    title="Chế độ Thẻ (Tùy chọn phụ)"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Thẻ</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 5. THANH THAO TÁC HÀNG LOẠT (BULK ACTIONS BAR) & NÚT BÓC TÁCH BẰNG AI */}
            {!isViewer && (
              <div className="p-3 rounded-2xl bg-slate-900/95 border border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
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
                          : "Chọn tất cả"}
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

                    <div className="h-4 w-px bg-slate-800 hidden sm:block" />

                    {/* NÚT BÓC TÁCH BẰNG AI (CHỌN NHIỀU DÒNG HOẶC TẤT CẢ) */}
                    {selectedIds.size > 0 ? (
                      <>
                        <button
                          type="button"
                          disabled={aiBatchProgress.isRunning || bulkActionLoading}
                          onClick={() =>
                            handleRunAiBatchExtraction(
                              normalizedProperties.filter((it) =>
                                selectedIds.has(it.id)
                              )
                            )
                          }
                          className="px-3 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-400 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                          title="Đọc cột content bằng AI theo lô 20 tin; không ghi đè các trường đã sửa tay"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>
                            Bóc tách bằng AI ({selectedIds.size} dòng chọn)
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={
                            aiBatchProgress.isRunning ||
                            bulkActionLoading ||
                            filteredItems.length === 0
                          }
                          onClick={() =>
                            handleRunAiBatchExtraction(filteredItems)
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-violet-500/15 hover:bg-violet-500/25 disabled:opacity-40 text-violet-300 border border-violet-500/35 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          title="Bóc tách bằng AI cho toàn bộ danh sách đang lọc"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Tất cả ({filteredItems.length})</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          aiBatchProgress.isRunning ||
                          bulkActionLoading ||
                          filteredItems.length === 0
                        }
                        onClick={() =>
                          handleRunAiBatchExtraction(filteredItems)
                        }
                        className="px-3 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-400 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                        title="Đọc cột content bằng AI cho tất cả tin đang hiển thị (theo lô 20 tin, không ghi đè trường đã sửa tay)"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>
                          Bóc tách bằng AI (Tất cả {filteredItems.length} dòng)
                        </span>
                      </button>
                    )}

                    {/* Xác nhận AI & Chuyển Sẵn sàng */}
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
                      title="Xác nhận duyệt các trường AI và chuyển trang_thai_xu_ly = 'san_sang'"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Xác nhận duyệt → Sẵn sàng
                    </button>

                    {/* Chuyển trạng thái kinh doanh nhanh */}
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
                      <option value="">Đổi trạng thái hàng loạt...</option>
                      <optgroup label="Trạng thái xử lý (trang_thai_xu_ly)">
                        <option value="xl:tho">→ tho (Thô)</option>
                        <option value="xl:can_bo_sung">→ can_bo_sung (Cần bổ sung)</option>
                        <option value="xl:san_sang">→ san_sang (Sẵn sàng)</option>
                        <option value="xl:da_len_hometea">→ da_len_hometea</option>
                        <option value="xl:da_dang_fb">→ da_dang_fb</option>
                      </optgroup>
                      <optgroup label="Trạng thái kinh doanh (trang_thai_kinh_doanh)">
                        <option value="kd:nguon_tho">→ nguon_tho (Nguồn thô)</option>
                        <option value="kd:da_ky">→ da_ky (Đã ký)</option>
                        <option value="kd:da_ban">→ da_ban (Đã bán)</option>
                      </optgroup>
                    </select>

                    {/* Gán phường hàng loạt */}
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        list="bulk-ward-datalist"
                        value={bulkWardValue}
                        onChange={(e) => setBulkWardValue(e.target.value)}
                        placeholder="Nhập/chọn Phường..."
                        disabled={selectedIds.size === 0 || bulkActionLoading}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 disabled:opacity-40 text-xs text-slate-100 placeholder-slate-500 w-36 outline-none focus:border-amber-500"
                      />
                      <datalist id="bulk-ward-datalist">
                        {DISTRICT_OPTIONS.map((d) => (
                          <option key={d} value={d} />
                        ))}
                      </datalist>
                      <button
                        type="button"
                        disabled={
                          selectedIds.size === 0 ||
                          !bulkWardValue.trim() ||
                          bulkActionLoading
                        }
                        onClick={handleBulkAssignWard}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-40 text-amber-300 border border-amber-500/35 text-xs font-bold cursor-pointer"
                      >
                        Gán phường
                      </button>
                    </div>

                    {/* Xóa trùng */}
                    <button
                      type="button"
                      disabled={bulkActionLoading}
                      onClick={() => handleBulkDeleteDuplicates()}
                      className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 disabled:opacity-40 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      title="Tự động dọn các dòng trùng Mã TK hoặc trùng địa chỉ (giữ bản đầy đủ nhất)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Xóa trùng
                    </button>
                  </div>

                  {/* Nút Xuất Hometea & Post Writer */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={selectedIds.size === 0 || bulkActionLoading}
                      onClick={() =>
                        handleExportToChannel(
                          normalizedProperties.filter((it) =>
                            selectedIds.has(it.id)
                          ),
                          "hometea"
                        )
                      }
                      className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Xuất Hometea ({selectedIds.size})
                    </button>
                    <button
                      type="button"
                      disabled={selectedIds.size === 0 || bulkActionLoading}
                      onClick={() =>
                        handleExportToChannel(
                          normalizedProperties.filter((it) =>
                            selectedIds.has(it.id)
                          ),
                          "post_writer"
                        )
                      }
                      className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      Xuất Post Writer ({selectedIds.size})
                    </button>
                  </div>
                </div>

                {/* THANH TIẾN ĐỘ BÓC TÁCH BẰNG AI THEO LÔ 20 TIN */}
                {(aiBatchProgress.isRunning || aiBatchProgress.totalCount > 0) && (
                  <div className="p-3 rounded-xl bg-violet-950/40 border border-violet-500/35 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Sparkles
                          className={`w-4 h-4 text-violet-300 ${
                            aiBatchProgress.isRunning ? "animate-spin" : ""
                          }`}
                        />
                        <span className="text-xs font-bold text-violet-200">
                          {aiBatchProgress.isRunning
                            ? `Đang bóc tách bằng AI: Lô ${aiBatchProgress.currentBatch}/${aiBatchProgress.totalBatches} (20 tin/lô)...`
                            : `Hoàn tất bóc tách AI (${aiBatchProgress.processedCount}/${aiBatchProgress.totalCount} tin)`}
                        </span>
                        <span className="text-[11px] font-mono text-emerald-300">
                          Thành công: {aiBatchProgress.successCount}
                        </span>
                        {aiBatchProgress.failedIds.length > 0 && (
                          <span className="text-[11px] font-mono text-rose-300">
                            Lỗi: {aiBatchProgress.failedIds.length}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {!aiBatchProgress.isRunning &&
                          aiBatchProgress.failedIds.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                handleRunAiBatchExtraction(
                                  normalizedProperties.filter((it) =>
                                    aiBatchProgress.failedIds.includes(it.id)
                                  )
                                )
                              }
                              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Thử lại {aiBatchProgress.failedIds.length} tin lỗi
                            </button>
                          )}
                        {!aiBatchProgress.isRunning && (
                          <button
                            type="button"
                            onClick={() =>
                              setAiBatchProgress((prev) => ({
                                ...prev,
                                totalCount: 0,
                                processedCount: 0,
                                failedIds: [],
                                lastError: null,
                              }))
                            }
                            className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
                          >
                            Đóng
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                      <div
                        className="h-full bg-violet-500 transition-all duration-300"
                        style={{
                          width: `${
                            aiBatchProgress.totalCount > 0
                              ? Math.round(
                                  (aiBatchProgress.processedCount /
                                    aiBatchProgress.totalCount) *
                                    100
                                )
                              : 0
                          }%`,
                        }}
                      />
                    </div>

                    {aiBatchProgress.lastError && (
                      <div className="text-[11px] text-rose-300 font-mono">
                        Chi tiết lỗi: {aiBatchProgress.lastError}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{error}</span>
                </div>
                <button
                  onClick={() => setRefreshTrigger((prev) => prev + 1)}
                  className="px-3 py-1 rounded-lg bg-rose-500 text-white font-bold cursor-pointer"
                >
                  Thử lại
                </button>
              </div>
            )}

            {/* 3. DANH SÁCH CHÍNH: MẶC ĐỊNH BẢNG DÀY (DENSE TABLE) HOẶC THẺ PHỤ */}
            {loading ? (
              <div className="p-12 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-mono text-slate-400">
                  Đang tải dữ liệu Kho Chuẩn...
                </p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-12 rounded-2xl bg-slate-900/70 border border-slate-800 text-center space-y-3">
                <Database className="w-8 h-8 text-slate-500 mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-200">
                    Không có bản ghi nào khớp với bộ lọc hiện tại
                  </h3>
                  <p className="text-xs text-slate-400">
                    Thử đổi bộ lọc trạng thái xử lý, phường hoặc từ khóa tìm kiếm.
                  </p>
                </div>
              </div>
            ) : viewMode === "table" ? (
              /* CHẾ ĐỘ MẶC ĐỊNH: BẢNG DÀY (DENSE DATA WAREHOUSE TABLE) */
              <div className="rounded-2xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table
                    className="w-full text-left border-collapse text-xs"
                    id="warehouse-dense-table"
                  >
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px] font-bold">
                      <tr>
                        <th className="py-3 px-3 w-9 text-center">
                          <input
                            type="checkbox"
                            checked={
                              filteredItems.length > 0 &&
                              filteredItems.every((it) =>
                                selectedIds.has(it.id)
                              )
                            }
                            onChange={toggleSelectAllFiltered}
                            className="rounded border-slate-700 bg-slate-900 text-amber-500 cursor-pointer"
                          />
                        </th>
                        <th className="py-3 px-3">Mã TK</th>
                        <th className="py-3 px-3">Địa chỉ (Số nhà, Tên đường, Phường)</th>
                        <th className="py-3 px-3">DT (Sổ / Thực tế)</th>
                        <th className="py-3 px-3">Giá</th>
                        <th className="py-3 px-3 min-w-[340px]">
                          Bóc tách AI & Bằng chứng (Sửa / Duyệt)
                        </th>
                        <th className="py-3 px-3 text-center">Số ảnh</th>
                        <th className="py-3 px-3">Độ đầy đủ</th>
                        <th className="py-3 px-3">Trường còn thiếu (`thieu`)</th>
                        <th className="py-3 px-3">Trạng thái (KD / Xử lý)</th>
                        <th className="py-3 px-3">Đã xuất đâu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {filteredItems.map((it) => {
                        const isSelected = selectedIds.has(it.id);
                        const isDrawerOpen = drawerItemId === it.id;
                        const isInlineEditing = inlineAiRowId === it.id;
                        const kdMeta =
                          BUSINESS_STATUS_META[it.trang_thai_kinh_doanh];
                        const xlMeta =
                          PROCESSING_STATUS_META[it.trang_thai_xu_ly];
                        const completenessPct = Math.round(
                          (it.filledCount / it.totalMandatory) * 100
                        );
                        const dacDiemList = Array.isArray(it.dac_diem)
                          ? it.dac_diem
                          : [];

                        return (
                          <React.Fragment key={it.id}>
                            <tr
                              onClick={() => setDrawerItemId(it.id)}
                              className={`transition-colors cursor-pointer ${
                                isDrawerOpen
                                  ? "bg-amber-500/15 hover:bg-amber-500/20"
                                  : isSelected
                                  ? "bg-slate-800/80 hover:bg-slate-800"
                                  : "hover:bg-slate-800/45"
                              }`}
                            >
                              {/* Checkbox */}
                              <td
                                className="py-2.5 px-3 text-center"
                                onClick={(e) => toggleSelectOne(it.id, e)}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="rounded border-slate-700 bg-slate-900 text-amber-500 cursor-pointer"
                                />
                              </td>

                              {/* 1. Mã TK */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className="flex flex-col gap-0.5">
                                  <span
                                    className={`font-mono font-bold text-xs px-2 py-0.5 rounded border inline-block w-fit ${
                                      it.isLegacyOrMissingMaTk
                                        ? "bg-rose-500/15 text-rose-300 border-rose-500/40"
                                        : "bg-slate-950 text-amber-300 border-slate-700"
                                    }`}
                                  >
                                    {it.ma_tk || it.suggestedMaTk}
                                  </span>
                                  {it.isLegacyOrMissingMaTk && (
                                    <span className="text-[10px] text-rose-400 font-mono">
                                      Gốc: {it.legacyToken || "Chưa có mã"}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* 2. Địa chỉ */}
                              <td className="py-2.5 px-3 max-w-[240px]">
                                <div className="font-bold text-slate-100 truncate">
                                  {[it.so_nha, it.ten_duong || it.duong]
                                    .filter(Boolean)
                                    .join(" ") || (
                                    <span className="text-slate-400 italic">
                                      {it.raw.name}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                                  <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                                  <span
                                    className={
                                      it.phuong
                                        ? "text-slate-300 font-medium"
                                        : "text-rose-400 font-semibold"
                                    }
                                  >
                                    {it.phuong || "Thiếu phường"}
                                  </span>
                                </div>
                              </td>

                              {/* 3. Diện tích (Sổ / Thực tế + Kích thước + Tầng) */}
                              <td className="py-2.5 px-3 whitespace-nowrap font-mono">
                                <div className="text-slate-100 font-bold">
                                  {it.dien_tich_so !== null ||
                                  it.dien_tich_thuc_te !== null ? (
                                    <>
                                      <span>{it.dien_tich_so ?? "—"}</span>
                                      <span className="text-slate-500 mx-0.5">
                                        /
                                      </span>
                                      <span className="text-amber-300">
                                        {it.dien_tich_thuc_te ?? "—"}
                                      </span>{" "}
                                      <span className="text-[10px] text-slate-400 font-normal">
                                        m²
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-rose-400 text-[11px]">
                                      Thiếu DT
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {it.rong || "?"}×{it.dai || "?"}m ·{" "}
                                  {it.so_tang ? `${it.so_tang} tầng` : "? tầng"}
                                </div>
                              </td>

                              {/* 4. Giá */}
                              <td className="py-2.5 px-3 whitespace-nowrap font-mono">
                                {it.gia && it.gia > 0 ? (
                                  <>
                                    <div className="font-extrabold text-emerald-400 text-xs">
                                      {it.gia_text}
                                    </div>
                                    {it.pricePerM2Text && (
                                      <div
                                        className={`text-[10px] ${
                                          it.isAbnormalPricePerM2
                                            ? "text-rose-400 font-bold"
                                            : "text-slate-400"
                                        }`}
                                      >
                                        {it.pricePerM2Text}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-rose-400 text-[11px] font-semibold">
                                    Thiếu giá
                                  </span>
                                )}
                              </td>

                              {/* 5. CỘT BÓC TÁCH AI & BẰNG CHỨNG (SỬA / DUYỆT) */}
                              <td
                                className="py-2.5 px-3 max-w-[390px]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="space-y-1.5">
                                  {/* Hàng nhãn trạng thái AI & nút thao tác */}
                                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                                    <div className="flex flex-wrap items-center gap-1">
                                      {it.da_boc_tach_ai ? (
                                        <span className="px-1.5 py-0.5 rounded bg-violet-500/20 border border-violet-500/40 text-violet-200 text-[10px] font-bold">
                                          Đã bóc tách AI
                                        </span>
                                      ) : (
                                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-medium">
                                          Chưa chạy AI
                                        </span>
                                      )}

                                      {it.aiNeedsConfirmKeys.length > 0 ? (
                                        <span
                                          className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-extrabold"
                                          title={`Các trường NULL hoặc tin cậy thấp cần xác nhận: ${it.aiNeedsConfirmKeys.join(", ")}`}
                                        >
                                          Cần xác nhận ({it.aiNeedsConfirmKeys.length})
                                        </span>
                                      ) : it.da_boc_tach_ai ? (
                                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold">
                                          Đã duyệt đủ
                                        </span>
                                      ) : null}
                                    </div>

                                    {!isViewer && (
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (isInlineEditing) {
                                              setInlineAiRowId(null);
                                            } else {
                                              openInlineAiEditor(it);
                                            }
                                          }}
                                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-[10px] font-bold cursor-pointer"
                                        >
                                          {isInlineEditing ? "Đóng ô sửa" : "Sửa/Duyệt"}
                                        </button>
                                        {it.trang_thai_xu_ly !== "san_sang" && (
                                          <button
                                            type="button"
                                            disabled={inlineAiSaving}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleConfirmAiReady([it]);
                                            }}
                                            className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold cursor-pointer"
                                            title="Xác nhận duyệt tất cả trường và chuyển sang trang_thai_xu_ly = 'san_sang'"
                                          >
                                            Xác nhận → Sẵn sàng
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {/* Tóm tắt giá trị AI kèm đoạn bằng chứng */}
                                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] bg-slate-950/70 p-2 rounded-lg border border-slate-800/90">
                                    <div>
                                      <span className="text-slate-400">Vị trí: </span>
                                      {it.loai_vi_tri ? (
                                        <span className="text-slate-100 font-semibold">
                                          {LOAI_VI_TRI_LABELS[it.loai_vi_tri]}
                                        </span>
                                      ) : (
                                        <span className="text-amber-400 font-bold">
                                          NULL (Cần xác nhận)
                                        </span>
                                      )}
                                      {it.nguon_trich_xuat?.loai_vi_tri?.bang_chung && (
                                        <div
                                          className="text-[10px] text-slate-400 italic truncate"
                                          title={it.nguon_trich_xuat.loai_vi_tri.bang_chung}
                                        >
                                          “{it.nguon_trich_xuat.loai_vi_tri.bang_chung}”
                                        </div>
                                      )}
                                    </div>

                                    <div>
                                      <span className="text-slate-400">Hướng: </span>
                                      {it.huong ? (
                                        <span className="text-slate-100 font-semibold">
                                          {it.huong}
                                        </span>
                                      ) : (
                                        <span className="text-amber-400 font-bold">
                                          NULL
                                        </span>
                                      )}
                                      {it.nguon_trich_xuat?.huong?.bang_chung && (
                                        <div
                                          className="text-[10px] text-slate-400 italic truncate"
                                          title={it.nguon_trich_xuat.huong.bang_chung}
                                        >
                                          “{it.nguon_trich_xuat.huong.bang_chung}”
                                        </div>
                                      )}
                                    </div>

                                    <div className="col-span-2">
                                      <span className="text-slate-400">Pháp lý: </span>
                                      {it.phap_ly ? (
                                        <span className="text-emerald-300 font-semibold">
                                          {it.phap_ly}
                                        </span>
                                      ) : (
                                        <span className="text-amber-400 font-bold">
                                          NULL (Cần xác nhận)
                                        </span>
                                      )}
                                      {it.nguon_trich_xuat?.phap_ly?.bang_chung && (
                                        <span
                                          className="text-[10px] text-slate-400 italic ml-1"
                                          title={it.nguon_trich_xuat.phap_ly.bang_chung}
                                        >
                                          — “{it.nguon_trich_xuat.phap_ly.bang_chung}”
                                        </span>
                                      )}
                                    </div>

                                    <div>
                                      <span className="text-slate-400">PN/WC: </span>
                                      <span className="text-slate-200 font-mono">
                                        {it.so_phong_ngu ?? "NULL"} PN /{" "}
                                        {it.so_wc ?? "NULL"} WC
                                      </span>
                                    </div>

                                    <div>
                                      <span className="text-slate-400">Đường vào: </span>
                                      <span className="text-slate-200 font-mono">
                                        {it.duong_vao_m !== null
                                          ? `${it.duong_vao_m}m`
                                          : "NULL"}
                                      </span>
                                    </div>

                                    {(dacDiemList.length > 0 || it.hien_trang) && (
                                      <div className="col-span-2 text-[10px] text-slate-300 truncate">
                                        {dacDiemList.length > 0 && (
                                          <span>
                                            ĐĐ: {dacDiemList.join(", ")}
                                          </span>
                                        )}
                                        {dacDiemList.length > 0 &&
                                          it.hien_trang &&
                                          " · "}
                                        {it.hien_trang && (
                                          <span>HT: {it.hien_trang}</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* 6. Số ảnh */}
                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-950 border border-slate-800">
                                  {it.imageUrls[0] ? (
                                    <div className="w-6 h-6 rounded overflow-hidden shrink-0 bg-slate-900">
                                      <SmartImage
                                        src={it.imageUrls[0]}
                                        alt=""
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  ) : (
                                    <ImageIcon className="w-3.5 h-3.5 text-rose-400" />
                                  )}
                                  <span
                                    className={`font-mono font-bold text-xs ${
                                      it.imageCount === 0
                                        ? "text-rose-400"
                                        : "text-slate-200"
                                    }`}
                                  >
                                    {it.imageCount}
                                  </span>
                                </div>
                              </td>

                              {/* 7. Độ đầy đủ (x/11 trường bắt buộc) */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`font-mono font-extrabold text-xs ${
                                      it.missingFieldKeys.length === 0
                                        ? "text-emerald-400"
                                        : it.filledCount >= 8
                                        ? "text-amber-300"
                                        : "text-rose-400"
                                    }`}
                                  >
                                    {it.filledCount}/{it.totalMandatory}
                                  </span>
                                  <div className="w-14 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        it.missingFieldKeys.length === 0
                                          ? "bg-emerald-500"
                                          : it.filledCount >= 8
                                          ? "bg-amber-500"
                                          : "bg-rose-500"
                                      }`}
                                      style={{ width: `${completenessPct}%` }}
                                    />
                                  </div>
                                </div>
                              </td>

                              {/* 8. Trường còn thiếu */}
                              <td className="py-2.5 px-3 max-w-[230px]">
                                {it.missingFieldLabels.length === 0 ? (
                                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold inline-flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Đủ chuẩn
                                  </span>
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {it.missingFieldLabels.map((lbl) => (
                                      <span
                                        key={lbl}
                                        className="px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/35 text-rose-300 text-[10px] font-semibold"
                                      >
                                        {lbl}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>

                              {/* 9. Trạng thái (2 cột: Kinh doanh + Xử lý) */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className="flex flex-col gap-1">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold border w-fit ${xlMeta.badgeClass}`}
                                  >
                                    {xlMeta.label}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[9px] font-medium border w-fit ${kdMeta.badgeClass}`}
                                  >
                                    KD: {kdMeta.shortLabel}
                                  </span>
                                </div>
                              </td>

                              {/* 10. Đã xuất đâu */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className="flex flex-col gap-1">
                                  {it.da_xuat_hometea && (
                                    <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/35 text-cyan-300 text-[10px] font-bold inline-flex items-center gap-1 w-fit">
                                      <Send className="w-2.5 h-2.5" />
                                      Hometea
                                    </span>
                                  )}
                                  {it.da_xuat_fb && (
                                    <span className="px-2 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/35 text-indigo-300 text-[10px] font-bold inline-flex items-center gap-1 w-fit">
                                      <Share2 className="w-2.5 h-2.5" />
                                      Post Writer
                                    </span>
                                  )}
                                  {!it.da_xuat_hometea && !it.da_xuat_fb && (
                                    <span className="text-[10px] text-slate-500">
                                      Chưa xuất
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* Ô SỬA / DUYỆT TRỰC TIẾP TRONG BẢNG (INLINE AI EDITOR & EVIDENCE ROW) */}
                            {isInlineEditing && (
                              <tr
                                className="bg-slate-950/95 border-b border-violet-500/40"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <td colSpan={11} className="p-4">
                                  <div className="rounded-xl bg-slate-900 border border-violet-500/40 p-3.5 space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                                      <div className="flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-violet-400" />
                                        <span className="text-xs font-bold text-violet-200">
                                          Sửa / Duyệt Bóc Tách AI & Bằng Chứng Gốc — Mã{" "}
                                          <span className="font-mono text-amber-300">
                                            {it.ma_tk || it.suggestedMaTk}
                                          </span>
                                        </span>
                                        <span className="text-[11px] text-slate-400">
                                          (Các trường sửa tại đây sẽ được đánh dấu Đã sửa tay, chạy lại AI không ghi đè)
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          disabled={inlineAiSaving}
                                          onClick={() =>
                                            handleSaveInlineAiEdit(it, false)
                                          }
                                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs cursor-pointer"
                                        >
                                          Lưu sửa tay
                                        </button>
                                        <button
                                          type="button"
                                          disabled={inlineAiSaving}
                                          onClick={() =>
                                            handleSaveInlineAiEdit(it, true)
                                          }
                                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                                        >
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                          Xác nhận duyệt & Chuyển Sẵn sàng
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setInlineAiRowId(null)
                                          }
                                          className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 text-xs cursor-pointer"
                                        >
                                          Đóng
                                        </button>
                                      </div>
                                    </div>

                                    {/* Văn bản gốc (content) để đối chiếu */}
                                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300 font-mono whitespace-pre-wrap max-h-28 overflow-y-auto">
                                      <span className="text-amber-400 font-bold">
                                        [Văn bản gốc content]:{" "}
                                      </span>
                                      {it.raw.content ||
                                        it.raw.description ||
                                        it.raw.name ||
                                        "Không có nội dung văn bản gốc"}
                                    </div>

                                    {/* Lưới 10 trường AI kèm bằng chứng và ô nhập sửa */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2.5">
                                      {/* 1. loai_vi_tri */}
                                      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                                        <div className="flex items-center justify-between">
                                          <label className="text-[10px] font-bold text-slate-300 uppercase">
                                            1. Vị trí (`loai_vi_tri`)
                                          </label>
                                          {it.aiNeedsConfirmKeys.includes(
                                            "loai_vi_tri"
                                          ) && (
                                            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                                              Cần xác nhận
                                            </span>
                                          )}
                                        </div>
                                        <select
                                          value={inlineAiDraft.loai_vi_tri}
                                          onChange={(e) =>
                                            setInlineAiDraft((prev) => ({
                                              ...prev,
                                              loai_vi_tri: e.target
                                                .value as LoaiViTriType | "",
                                            }))
                                          }
                                          className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100 outline-none focus:border-amber-500"
                                        >
                                          <option value="">
                                            -- NULL (Chưa rõ) --
                                          </option>
                                          {LOAI_VI_TRI_OPTIONS.map((opt) => (
                                            <option
                                              key={opt.value}
                                              value={opt.value}
                                            >
                                              {opt.value} — {opt.label}
                                            </option>
                                          ))}
                                        </select>
                                        <div className="text-[10px] text-slate-400 italic truncate">
                                          BC:{" "}
                                          {it.nguon_trich_xuat?.loai_vi_tri
                                            ?.bang_chung || "Không có"}
                                        </div>
                                      </div>

                                      {/* 2. huong */}
                                      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                                        <div className="flex items-center justify-between">
                                          <label className="text-[10px] font-bold text-slate-300 uppercase">
                                            2. Hướng (`huong`)
                                          </label>
                                          {it.aiNeedsConfirmKeys.includes(
                                            "huong"
                                          ) && (
                                            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                                              Cần xác nhận
                                            </span>
                                          )}
                                        </div>
                                        <select
                                          value={inlineAiDraft.huong}
                                          onChange={(e) =>
                                            setInlineAiDraft((prev) => ({
                                              ...prev,
                                              huong: e.target.value,
                                            }))
                                          }
                                          className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100 outline-none focus:border-amber-500"
                                        >
                                          <option value="">
                                            -- NULL (Hometea: Không xác định) --
                                          </option>
                                          {HUONG_OPTIONS.map((h) => (
                                            <option key={h} value={h}>
                                              {h}
                                            </option>
                                          ))}
                                        </select>
                                        <div className="text-[10px] text-slate-400 italic truncate">
                                          BC:{" "}
                                          {it.nguon_trich_xuat?.huong
                                            ?.bang_chung || "Không có"}
                                        </div>
                                      </div>

                                      {/* 3. phap_ly */}
                                      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                                        <div className="flex items-center justify-between">
                                          <label className="text-[10px] font-bold text-slate-300 uppercase">
                                            3. Pháp lý (`phap_ly`)
                                          </label>
                                          {it.aiNeedsConfirmKeys.includes(
                                            "phap_ly"
                                          ) && (
                                            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                                              Cần xác nhận
                                            </span>
                                          )}
                                        </div>
                                        <input
                                          type="text"
                                          list={`phap-ly-inline-${it.id}`}
                                          value={inlineAiDraft.phap_ly}
                                          onChange={(e) =>
                                            setInlineAiDraft((prev) => ({
                                              ...prev,
                                              phap_ly: e.target.value,
                                            }))
                                          }
                                          placeholder="NULL nếu không nói rõ..."
                                          className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100 outline-none focus:border-amber-500"
                                        />
                                        <datalist id={`phap-ly-inline-${it.id}`}>
                                          {PHAP_LY_PRESETS.map((p) => (
                                            <option key={p} value={p} />
                                          ))}
                                        </datalist>
                                        <div className="text-[10px] text-slate-400 italic truncate">
                                          BC:{" "}
                                          {it.nguon_trich_xuat?.phap_ly
                                            ?.bang_chung || "Không có"}
                                        </div>
                                      </div>

                                      {/* 4. so_phong_ngu & so_wc */}
                                      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                                        <div className="flex items-center justify-between">
                                          <label className="text-[10px] font-bold text-slate-300 uppercase">
                                            4. Số PN / Số WC
                                          </label>
                                          {(it.aiNeedsConfirmKeys.includes(
                                            "so_phong_ngu"
                                          ) ||
                                            it.aiNeedsConfirmKeys.includes(
                                              "so_wc"
                                            )) && (
                                            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                                              Cần xác nhận
                                            </span>
                                          )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-1.5">
                                          <input
                                            type="number"
                                            min="0"
                                            value={inlineAiDraft.so_phong_ngu}
                                            onChange={(e) =>
                                              setInlineAiDraft((prev) => ({
                                                ...prev,
                                                so_phong_ngu: e.target.value,
                                              }))
                                            }
                                            placeholder="PN (NULL)"
                                            className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100 outline-none focus:border-amber-500"
                                          />
                                          <input
                                            type="number"
                                            min="0"
                                            value={inlineAiDraft.so_wc}
                                            onChange={(e) =>
                                              setInlineAiDraft((prev) => ({
                                                ...prev,
                                                so_wc: e.target.value,
                                              }))
                                            }
                                            placeholder="WC (NULL)"
                                            className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100 outline-none focus:border-amber-500"
                                          />
                                        </div>
                                        <div className="text-[10px] text-slate-400 italic truncate">
                                          BC:{" "}
                                          {it.nguon_trich_xuat?.so_phong_ngu
                                            ?.bang_chung ||
                                            it.nguon_trich_xuat?.so_wc
                                              ?.bang_chung ||
                                            "Không có"}
                                        </div>
                                      </div>

                                      {/* 5. so_nha & ten_duong */}
                                      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                                        <div className="flex items-center justify-between">
                                          <label className="text-[10px] font-bold text-slate-300 uppercase">
                                            5. Số nhà & Tên đường
                                          </label>
                                          {(it.aiNeedsConfirmKeys.includes(
                                            "so_nha"
                                          ) ||
                                            it.aiNeedsConfirmKeys.includes(
                                              "ten_duong"
                                            )) && (
                                            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                                              Cần xác nhận
                                            </span>
                                          )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-1.5">
                                          <input
                                            type="text"
                                            value={inlineAiDraft.so_nha}
                                            onChange={(e) =>
                                              setInlineAiDraft((prev) => ({
                                                ...prev,
                                                so_nha: e.target.value,
                                              }))
                                            }
                                            placeholder="Số nhà"
                                            className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100 outline-none focus:border-amber-500"
                                          />
                                          <input
                                            type="text"
                                            value={inlineAiDraft.ten_duong}
                                            onChange={(e) =>
                                              setInlineAiDraft((prev) => ({
                                                ...prev,
                                                ten_duong: e.target.value,
                                              }))
                                            }
                                            placeholder="Tên đường (bỏ chữ Đường)"
                                            className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100 outline-none focus:border-amber-500"
                                          />
                                        </div>
                                        <div className="text-[10px] text-slate-400 italic truncate">
                                          BC:{" "}
                                          {it.nguon_trich_xuat?.ten_duong
                                            ?.bang_chung ||
                                            it.nguon_trich_xuat?.so_nha
                                              ?.bang_chung ||
                                            "Không có"}
                                        </div>
                                      </div>

                                      {/* 6. duong_vao_m */}
                                      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                                        <div className="flex items-center justify-between">
                                          <label className="text-[10px] font-bold text-slate-300 uppercase">
                                            6. Đường vào (m)
                                          </label>
                                          {it.aiNeedsConfirmKeys.includes(
                                            "duong_vao_m"
                                          ) && (
                                            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                                              Cần xác nhận
                                            </span>
                                          )}
                                        </div>
                                        <input
                                          type="number"
                                          step="0.1"
                                          min="0"
                                          value={inlineAiDraft.duong_vao_m}
                                          onChange={(e) =>
                                            setInlineAiDraft((prev) => ({
                                              ...prev,
                                              duong_vao_m: e.target.value,
                                            }))
                                          }
                                          placeholder="Số mét (NULL)"
                                          className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100 outline-none focus:border-amber-500"
                                        />
                                        <div className="text-[10px] text-slate-400 italic truncate">
                                          BC:{" "}
                                          {it.nguon_trich_xuat?.duong_vao_m
                                            ?.bang_chung || "Không có"}
                                        </div>
                                      </div>

                                      {/* 7. dac_diem */}
                                      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1 lg:col-span-2">
                                        <div className="flex items-center justify-between">
                                          <label className="text-[10px] font-bold text-slate-300 uppercase">
                                            7. Đặc điểm (`dac_diem`, cách nhau dấu phẩy)
                                          </label>
                                          {it.aiNeedsConfirmKeys.includes(
                                            "dac_diem"
                                          ) && (
                                            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                                              Cần xác nhận
                                            </span>
                                          )}
                                        </div>
                                        <input
                                          type="text"
                                          value={inlineAiDraft.dac_diem}
                                          onChange={(e) =>
                                            setInlineAiDraft((prev) => ({
                                              ...prev,
                                              dac_diem: e.target.value,
                                            }))
                                          }
                                          placeholder="VD: lô góc, view sông, thang máy..."
                                          className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100 outline-none focus:border-amber-500"
                                        />
                                        <div className="text-[10px] text-slate-400 italic truncate">
                                          BC:{" "}
                                          {it.nguon_trich_xuat?.dac_diem
                                            ?.bang_chung || "Không có"}
                                        </div>
                                      </div>

                                      {/* 8. hien_trang */}
                                      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1 lg:col-span-2">
                                        <div className="flex items-center justify-between">
                                          <label className="text-[10px] font-bold text-slate-300 uppercase">
                                            8. Hiện trạng (`hien_trang`)
                                          </label>
                                          {it.aiNeedsConfirmKeys.includes(
                                            "hien_trang"
                                          ) && (
                                            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                                              Cần xác nhận
                                            </span>
                                          )}
                                        </div>
                                        <input
                                          type="text"
                                          value={inlineAiDraft.hien_trang}
                                          onChange={(e) =>
                                            setInlineAiDraft((prev) => ({
                                              ...prev,
                                              hien_trang: e.target.value,
                                            }))
                                          }
                                          placeholder="VD: nhà mới, đang cho thuê 15 triệu/tháng..."
                                          className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100 outline-none focus:border-amber-500"
                                        />
                                        <div className="text-[10px] text-slate-400 italic truncate">
                                          BC:{" "}
                                          {it.nguon_trich_xuat?.hien_trang
                                            ?.bang_chung || "Không có"}
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
              /* CHẾ ĐỘ TÙY CHỌN PHỤ: THẺ (CARDS) */
              <div
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                id="properties-grid"
              >
                {filteredItems.map((it) => (
                  <PropertyCard
                    key={it.id}
                    prop={it.raw}
                    currentUser={currentUser}
                    selected={selectedIds.has(it.id)}
                    onToggleSelect={(e) => toggleSelectOne(it.id, e)}
                    onEdit={(e) => {
                      e.stopPropagation();
                      setDrawerItemId(it.id);
                    }}
                    onDelete={(e) => {
                      e.stopPropagation();
                      setDeletingProperty(it.raw);
                      setDeleteError(null);
                    }}
                    onClick={() => setDrawerItemId(it.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Mobile FAB */}
      {activeTab === "properties" && !isViewer && (
        <button
          onClick={() => {
            setEditingProperty(null);
            setIsFormOpen(true);
          }}
          id="mobile-fab-add"
          className="sm:hidden fixed bottom-16 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-amber-500 text-slate-950 font-bold text-xs shadow-xl cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Thêm nguồn</span>
        </button>
      )}

      {/* 4. NGĂN CHỈNH SỬA BÊN PHẢI KHI BẤM DÒNG (WAREHOUSE EDIT DRAWER) */}
      <WarehouseEditDrawer
        item={activeDrawerItem}
        isOpen={Boolean(activeDrawerItem)}
        onClose={() => setDrawerItemId(null)}
        onSave={handleSaveDrawerUpdates}
        onDelete={(prop) => {
          setDeletingProperty(prop);
          setDeleteError(null);
        }}
        onExportSingle={(item, target) =>
          handleExportToChannel([item], target)
        }
        currentUser={currentUser}
      />

      {/* Modal Đề xuất ánh xạ dữ liệu cũ sang 2 cột trạng thái chuẩn */}
      <MigrationProposalModal
        isOpen={isMigrationModalOpen}
        onClose={() => setIsMigrationModalOpen(false)}
        items={normalizedProperties}
        onConfirmMigration={async (batch) => {
          await executeBatchUpdate(batch);
          showToast(`Đã ánh xạ thành công ${batch.length} bản ghi!`);
        }}
      />

      {/* Modal Thêm / Sửa nguồn mới */}
      <PropertyFormModal
        property={editingProperty}
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingProperty(null);
        }}
        onSave={handleSavePropertyModal}
        cloudinaryConfig={cloudinaryConfig}
        currentUser={currentUser}
      />

      {/* Modal Nhập hàng loạt từ thư mục (Giữ nguyên 100%) */}
      <BulkFolderImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        onImportSuccess={() => setRefreshTrigger((prev) => prev + 1)}
        cloudinaryConfig={cloudinaryConfig}
        currentUser={currentUser}
      />

      {/* Delete Confirmation Dialog */}
      {deletingProperty && (
        <div
          id="delete-confirm-overlay"
          className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-[60]"
        >
          <div className="w-full max-w-md p-5 bg-slate-900 rounded-2xl border border-rose-500/30 shadow-2xl space-y-4">
            <div className="flex gap-3 items-start text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-500/10 shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-100">
                  Xác nhận xóa nguồn nhà
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Bạn có chắc chắn muốn xóa vĩnh viễn bản ghi{" "}
                  <b className="text-slate-200">{deletingProperty.name}</b> khỏi Kho dữ liệu chuẩn?
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl text-rose-400 text-xs font-semibold">
                {deleteError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setDeletingProperty(null);
                  setDeleteError(null);
                }}
                className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
              >
                Đồng ý xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
