import React, { useState, useEffect, useMemo } from "react";
import { 
  BarChart3, Server, Activity, Database, ShieldCheck, ShieldAlert, 
  CheckCircle2, AlertTriangle, RefreshCw, Download, FileSpreadsheet, 
  Layers, UserCheck, Users, Calendar, ArrowUpRight, TrendingUp, 
  Filter, Copy, Check, Terminal, Shield, Clock, HardDrive, 
  Search, ArrowLeft, Home, Sparkles, Zap, Trash2, Plus
} from "lucide-react";
import { Property, AuthUser, UserProfile } from "../types";
import { safeFetchJson } from "../utils/apiClient";

interface SystemAndReportsViewProps {
  properties: Property[];
  currentUser: AuthUser | null;
  onBackToProperties?: () => void;
}

interface SystemInfoData {
  server?: {
    uptimeSeconds: number;
    nodeVersion: string;
    platform: string;
    environment: string;
    memoryRssMb?: number;
    memoryHeapUsedMb?: number;
    serverTime: string;
  };
  database?: {
    isConfigured: boolean;
    supabaseUrl: string;
    hasAnonKey: boolean;
    anonKeyPreview: string;
    hasServiceRoleKey: boolean;
    serviceRoleKeyPreview: string;
    health?: {
      connected: boolean;
      propertiesCount?: number | null;
      profilesCount?: number | null;
      propertiesError?: string | null;
      profilesError?: string | null;
    };
  };
  storage?: {
    isConfigured: boolean;
    provider: string;
    cloudName: string;
    uploadPreset: string;
  };
  localCache?: {
    propertiesCount: number;
    managersCount: number;
  };
  security?: {
    adminPasswordConfigured: boolean;
    jwtSecretConfigured: boolean;
    authMethod: string;
    roleBasedAccess: boolean;
  };
  setupSQL?: string;
}

export interface ActivityLog {
  id: string;
  time: string;
  timestamp: number;
  tag: "NAV" | "SUCCESS" | "LEAD" | "SYS" | "PROP" | "AUTH";
  message: string;
}

const DEFAULT_ACTIVITY_LOGS: ActivityLog[] = [];

export default function SystemAndReportsView({
  properties,
  currentUser,
  onBackToProperties
}: SystemAndReportsViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<"reports" | "logs" | "system">("reports");
  const [systemInfo, setSystemInfo] = useState<SystemInfoData | null>(null);
  const [loadingSystemInfo, setLoadingSystemInfo] = useState(false);
  const [systemInfoError, setSystemInfoError] = useState<string | null>(null);
  const [dbTestResult, setDbTestResult] = useState<any | null>(null);
  const [testingDb, setTestingDb] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Realtime Activity Logs state
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>(() => {
    try {
      const saved = localStorage.getItem("app_realtime_activity_logs");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_ACTIVITY_LOGS;
  });
  const [logFilterTag, setLogFilterTag] = useState<string>("all");
  const [logSearchQuery, setLogSearchQuery] = useState<string>("");

  const addActivityLog = (tag: ActivityLog["tag"], message: string) => {
    const now = new Date();
    const timeStr = [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0")
    ].join(":");

    const newLog: ActivityLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      time: timeStr,
      timestamp: now.getTime(),
      tag,
      message
    };

    setActivityLogs((prev) => {
      const updated = [newLog, ...prev.slice(0, 99)];
      try {
        localStorage.setItem("app_realtime_activity_logs", JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const handleClearLogs = () => {
    setActivityLogs([]);
    try {
      localStorage.setItem("app_realtime_activity_logs", JSON.stringify([]));
    } catch (e) {}
  };

  const handleRestoreSampleLogs = () => {
    setActivityLogs(DEFAULT_ACTIVITY_LOGS);
    try {
      localStorage.setItem("app_realtime_activity_logs", JSON.stringify(DEFAULT_ACTIVITY_LOGS));
    } catch (e) {}
  };

  // Time filter for reports
  const [timeFilter, setTimeFilter] = useState<"all" | "7days" | "30days" | "this_month">("all");
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [searchStaff, setSearchStaff] = useState("");

  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem("admin_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Fetch System Information
  const fetchSystemInfo = async () => {
    setLoadingSystemInfo(true);
    setSystemInfoError(null);
    try {
      const res = await safeFetchJson<SystemInfoData>("/api/system/info", {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(
          res.errorMessage ||
            `HTTP ${res.status} — GET /api/system/info: Không thể tải thông tin hệ thống`
        );
      }
      setSystemInfo(res.data);
    } catch (err: any) {
      console.error("Lỗi lấy thông tin hệ thống:", err);
      setSystemInfoError(err.message || "Không thể kết nối đến API thông tin hệ thống.");
    } finally {
      setLoadingSystemInfo(false);
    }
  };

  // Run DB Connection Diagnostic
  const runDbDiagnostic = async () => {
    setTestingDb(true);
    setDbTestResult(null);
    addActivityLog("SYS", "Chạy kiểm tra chẩn đoán kết nối cơ sở dữ liệu Supabase.");
    try {
      const res = await safeFetchJson<any>("/api/test-db", {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        setDbTestResult({
          connected: false,
          status: "http_error",
          message:
            res.errorMessage || `HTTP ${res.status} — GET /api/test-db`,
        });
        addActivityLog("SYS", `Cảnh báo Supabase: ${res.errorMessage || `HTTP ${res.status}`}`);
        return;
      }
      const data = res.data;
      setDbTestResult(data);
      if (data.connected) {
        addActivityLog("SUCCESS", "Kết nối Supabase ổn định: " + (data.message || "200 OK"));
      } else {
        addActivityLog("SYS", "Cảnh báo Supabase: " + (data.message || "Không phản hồi"));
      }
      // Also refresh system info
      fetchSystemInfo();
    } catch (err: any) {
      setDbTestResult({
        connected: false,
        status: "error",
        message: err.message || "Lỗi khi gọi API kiểm tra kết nối."
      });
      addActivityLog("SYS", "Lỗi kiểm tra kết nối Supabase: " + (err.message || "Lỗi mạng"));
    } finally {
      setTestingDb(false);
    }
  };

  useEffect(() => {
    fetchSystemInfo();
  }, []);

  // Format Uptime helper
  const formatUptime = (seconds?: number) => {
    if (!seconds && seconds !== 0) return "--";
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (days > 0) return `${days} ngày ${hours} giờ ${minutes} phút`;
    if (hours > 0) return `${hours} giờ ${minutes} phút`;
    return `${minutes} phút ${secs} giây`;
  };

  // Filter properties based on timeFilter
  const filteredProperties = useMemo(() => {
    const now = new Date().getTime();
    return properties.filter((item) => {
      // Time filter
      if (timeFilter !== "all" && item.created_at) {
        const itemTime = new Date(item.created_at).getTime();
        const diffDays = (now - itemTime) / (1000 * 60 * 60 * 24);
        if (timeFilter === "7days" && diffDays > 7) return false;
        if (timeFilter === "30days" && diffDays > 30) return false;
        if (timeFilter === "this_month") {
          const itemDate = new Date(item.created_at);
          const nowDate = new Date();
          if (itemDate.getMonth() !== nowDate.getMonth() || itemDate.getFullYear() !== nowDate.getFullYear()) {
            return false;
          }
        }
      }

      // Staff filter
      if (staffFilter !== "all") {
        const managerId = item.manager?.id || item.created_by || "unassigned";
        if (managerId !== staffFilter) return false;
      }

      return true;
    });
  }, [properties, timeFilter, staffFilter]);

  // Status metrics
  const statusStats = useMemo(() => {
    const total = filteredProperties.length;
    const countMoi = filteredProperties.filter((p) => p.status === "moi").length;
    const countDangLienHe = filteredProperties.filter((p) => p.status === "dang_lien_he").length;
    const countDaKy = filteredProperties.filter((p) => p.status === "da_ky").length;
    const countDaChot = filteredProperties.filter((p) => p.status === "da_chot").length;
    const countDaBan = filteredProperties.filter((p) => p.status === "da_ban").length;

    const countSuccess = countDaChot + countDaBan;
    const countInProgress = countDangLienHe + countDaKy;
    const successRate = total > 0 ? Math.round((countSuccess / total) * 100) : 0;

    return {
      total,
      moi: countMoi,
      dang_lien_he: countDangLienHe,
      da_ky: countDaKy,
      da_chot: countDaChot,
      da_ban: countDaBan,
      success: countSuccess,
      inProgress: countInProgress,
      successRate
    };
  }, [filteredProperties]);

  // Transaction type stats
  const typeStats = useMemo(() => {
    const khachBan = filteredProperties.filter((p) => p.loai_giao_dich === "khach_ban").length;
    const khachMua = filteredProperties.filter((p) => p.loai_giao_dich === "khach_mua").length;
    const moiGioi = filteredProperties.filter((p) => p.loai_giao_dich === "moi_gioi").length;
    return { khachBan, khachMua, moiGioi };
  }, [filteredProperties]);

  // Image stats
  const imageStats = useMemo(() => {
    const withImages = filteredProperties.filter((p) => p.image_urls && p.image_urls.length > 0).length;
    const totalImages = filteredProperties.reduce((acc, p) => acc + (p.image_urls?.length || 0), 0);
    return {
      withImages,
      withoutImages: filteredProperties.length - withImages,
      totalImages,
      percentage: filteredProperties.length > 0 ? Math.round((withImages / filteredProperties.length) * 100) : 0
    };
  }, [filteredProperties]);

  // Staff performance metrics
  const staffList = useMemo(() => {
    const map = new Map<string, {
      id: string;
      name: string;
      email?: string;
      phone?: string;
      role?: string;
      total: number;
      moi: number;
      dang_lien_he: number;
      da_ky: number;
      da_chot: number;
      da_ban: number;
      successCount: number;
      successRate: number;
      lastActive?: string;
    }>();

    properties.forEach((p) => {
      const id = p.manager?.id || p.created_by || "unassigned";
      const name = p.manager?.full_name || p.created_by_name || (id === "unassigned" ? "Chưa chỉ định quản lý" : id);
      const email = p.manager?.email || p.created_by_email || "";
      const phone = p.manager?.phone || p.created_by_phone || "";
      const role = p.manager?.role || p.created_by_role || "";

      let item = map.get(id);
      if (!item) {
        item = {
          id,
          name,
          email,
          phone,
          role,
          total: 0,
          moi: 0,
          dang_lien_he: 0,
          da_ky: 0,
          da_chot: 0,
          da_ban: 0,
          successCount: 0,
          successRate: 0,
          lastActive: p.created_at
        };
        map.set(id, item);
      }

      item.total += 1;
      if (p.status === "moi") item.moi += 1;
      else if (p.status === "dang_lien_he") item.dang_lien_he += 1;
      else if (p.status === "da_ky") item.da_ky += 1;
      else if (p.status === "da_chot") item.da_chot += 1;
      else if (p.status === "da_ban") item.da_ban += 1;

      item.successCount = item.da_chot + item.da_ban;
      item.successRate = item.total > 0 ? Math.round((item.successCount / item.total) * 100) : 0;

      if (p.created_at && (!item.lastActive || new Date(p.created_at) > new Date(item.lastActive))) {
        item.lastActive = p.created_at;
      }
    });

    const list = Array.from(map.values());
    list.sort((a, b) => b.total - a.total);
    return list;
  }, [properties]);

  // Filtered staff list for table search
  const filteredStaffList = useMemo(() => {
    if (!searchStaff.trim()) return staffList;
    const q = searchStaff.toLowerCase();
    return staffList.filter(
      (s) => s.name.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.phone?.includes(q)
    );
  }, [staffList, searchStaff]);

  // Export CSV Report
  const handleExportCSV = () => {
    if (filteredProperties.length === 0) {
      alert("Không có dữ liệu tin đăng để xuất báo cáo.");
      return;
    }

    const headers = [
      "ID",
      "Tiêu đề / Tên khách",
      "Số điện thoại",
      "Loại giao dịch",
      "Trạng thái",
      "Chuyên viên quản lý",
      "Email chuyên viên",
      "Số lượng ảnh",
      "Ngày tạo",
      "Facebook Link",
      "Website Link",
      "Nội dung chi tiết"
    ];

    const rows = filteredProperties.map((p) => {
      const typeLabel = 
        p.loai_giao_dich === "khach_ban" ? "Khách bán" :
        p.loai_giao_dich === "khach_mua" ? "Khách mua" : "Môi giới";
      const statusLabel = 
        p.status === "moi" ? "Mới" :
        p.status === "dang_lien_he" ? "Đang liên hệ" :
        p.status === "da_ky" ? "Đã ký" :
        p.status === "da_chot" ? "Đã chốt" : "Đã bán";
      const managerName = p.manager?.full_name || p.created_by_name || "Chưa gán";
      const managerEmail = p.manager?.email || p.created_by_email || "";
      const cleanContent = (p.content || "").replace(/"/g, '""').replace(/\n/g, " ");

      return [
        `"${p.id || ""}"`,
        `"${(p.name || "").replace(/"/g, '""')}"`,
        `"${p.phone || ""}"`,
        `"${typeLabel}"`,
        `"${statusLabel}"`,
        `"${managerName.replace(/"/g, '""')}"`,
        `"${managerEmail}"`,
        `"${p.image_urls?.length || 0}"`,
        `"${p.created_at ? new Date(p.created_at).toLocaleString("vi-VN") : ""}"`,
        `"${(p.facebook_link || "").replace(/"/g, '""')}"`,
        `"${(p.website_link || "").replace(/"/g, '""')}"`,
        `"${cleanContent}"`
      ].join(",");
    });

    // Add UTF-8 BOM so Excel opens Vietnamese characters correctly without encoding bugs
    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `Bao_Cao_Nguon_Nha_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addActivityLog("SUCCESS", "Xuất file báo cáo tổng hợp nguồn nhà (.csv) thành công.");
  };

  const copySqlToClipboard = () => {
    if (systemInfo?.setupSQL) {
      navigator.clipboard.writeText(systemInfo.setupSQL);
      setCopiedSql(true);
      addActivityLog("SYS", "Đã sao chép mã SQL khởi tạo cơ sở dữ liệu Supabase.");
      setTimeout(() => setCopiedSql(false), 3000);
    }
  };

  // Render Realtime Activity Log Card matching the reference design exactly
  const renderActivityLogsCard = (isDedicatedView: boolean = false) => {
    const filteredLogs = activityLogs.filter((log) => {
      if (logFilterTag !== "all" && log.tag !== logFilterTag) return false;
      if (logSearchQuery.trim()) {
        const q = logSearchQuery.toLowerCase();
        return log.message.toLowerCase().includes(q) || log.tag.toLowerCase().includes(q) || log.time.includes(q);
      }
      return true;
    });

    return (
      <div className="p-4 sm:p-6 rounded-2xl border custom-border custom-bg-secondary shadow-xs space-y-4" id="realtime-activity-logs-card">
        {/* Header strictly formatted like the user's reference image */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b custom-border pb-3.5">
          <div className="flex items-center gap-2">
            <span className="text-amber-500 font-bold text-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-amber-500 fill-amber-500" />
            </span>
            <h3 className="text-base sm:text-lg font-bold text-[#b45309] dark:text-amber-400 tracking-tight">
              Nhật Ký Hoạt Động Thời Gian Thực
            </h3>
            {isDedicatedView && (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-mono font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                {activityLogs.length} bản ghi
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isDedicatedView && (
              <button
                onClick={() => {
                  const sampleActions = [
                    { tag: "LEAD" as const, msg: "Yêu cầu tư vấn mới từ khách hàng Nguyễn Hoàng Long (0912.888.xxx)." },
                    { tag: "SUCCESS" as const, msg: "Đã cập nhật trạng thái tin nguồn nhà: Chốt cọc giao dịch thành công." },
                    { tag: "SYS" as const, msg: "Tự động đồng bộ bộ nhớ đệm với Supabase hoàn tất." },
                    { tag: "NAV" as const, msg: "Người dùng chuyển hướng xem chi tiết bất động sản." }
                  ];
                  const pick = sampleActions[Math.floor(Math.random() * sampleActions.length)];
                  addActivityLog(pick.tag, pick.msg);
                }}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-all cursor-pointer"
                title="Ghi thêm sự kiện mẫu thời gian thực"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm sự kiện test</span>
              </button>
            )}

            <button
              onClick={handleClearLogs}
              id="btn-clear-activity-logs"
              className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#dc2626] hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors cursor-pointer"
              title="Xóa toàn bộ lịch sử hoạt động"
            >
              <Trash2 className="w-4 h-4" />
              <span>Xóa nhật ký</span>
            </button>
          </div>
        </div>

        {/* Filter and search bar when on dedicated tab */}
        {isDedicatedView && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-black/5 dark:bg-white/5 border custom-border">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider custom-text-secondary mr-1">
                Lọc loại:
              </span>
              {[
                { key: "all", label: "Tất cả" },
                { key: "NAV", label: "NAV" },
                { key: "SUCCESS", label: "SUCCESS" },
                { key: "LEAD", label: "LEAD" },
                { key: "SYS", label: "SYS" }
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setLogFilterTag(f.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    logFilterTag === f.key
                      ? "bg-amber-500 text-white shadow-xs"
                      : "bg-white dark:bg-slate-900 custom-text-secondary hover:custom-text-primary border custom-border"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative max-w-xs w-full">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                placeholder="Tìm nội dung nhật ký..."
                className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border custom-border bg-white dark:bg-slate-900 custom-text-primary focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        )}

        {/* List of items strictly matching the user's reference image */}
        {filteredLogs.length === 0 ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-xs sm:text-sm custom-text-secondary">
              Chưa có nhật ký hoạt động nào được ghi nhận.
            </p>
            <button
              onClick={handleRestoreSampleLogs}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 hover:bg-amber-500/20 transition-all cursor-pointer"
            >
              Khôi phục nhật ký mẫu
            </button>
          </div>
        ) : (
          <div className="divide-y divide-dashed divide-slate-200 dark:divide-slate-800">
            {filteredLogs.map((log) => (
              <div 
                key={log.id} 
                className="py-3 sm:py-3.5 flex items-start gap-2.5 sm:gap-3.5 first:pt-1 last:pb-1"
              >
                {/* [HH:mm:ss] */}
                <span className="font-mono text-xs sm:text-sm text-slate-500 dark:text-slate-400 shrink-0 font-medium pt-0.5">
                  [{log.time}]
                </span>

                {/* Tag Badge */}
                <div className="shrink-0 pt-0.5">
                  {log.tag === "NAV" && (
                    <span className="px-2 py-0.5 rounded text-[11px] sm:text-xs font-bold font-mono bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                      NAV
                    </span>
                  )}
                  {log.tag === "SUCCESS" && (
                    <span className="px-2 py-0.5 rounded text-[11px] sm:text-xs font-bold font-mono bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      SUCCESS
                    </span>
                  )}
                  {log.tag === "LEAD" && (
                    <span className="px-2 py-0.5 rounded text-[11px] sm:text-xs font-bold font-mono bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      LEAD
                    </span>
                  )}
                  {log.tag === "SYS" && (
                    <span className="px-2 py-0.5 rounded text-[11px] sm:text-xs font-bold font-mono bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      SYS
                    </span>
                  )}
                  {log.tag === "PROP" && (
                    <span className="px-2 py-0.5 rounded text-[11px] sm:text-xs font-bold font-mono bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      PROP
                    </span>
                  )}
                  {log.tag === "AUTH" && (
                    <span className="px-2 py-0.5 rounded text-[11px] sm:text-xs font-bold font-mono bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      AUTH
                    </span>
                  )}
                </div>

                {/* Message */}
                <span className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 leading-relaxed flex-1">
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 w-full min-w-0 max-w-full overflow-hidden" id="system-and-reports-view">
      {/* Top Banner / Breadcrumb & View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl border custom-border custom-bg-secondary shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {onBackToProperties && (
              <button
                onClick={onBackToProperties}
                className="p-1.5 rounded-lg border custom-border hover:bg-black/5 dark:hover:bg-white/5 custom-text-secondary hover:custom-text-primary transition-colors cursor-pointer mr-1"
                title="Quay lại danh sách nguồn nhà"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-mono">
              <Sparkles className="w-3 h-3" />
              Admin Management
            </span>
            <span className="text-xs px-2 py-0.5 rounded-md font-mono bg-black/5 dark:bg-white/5 border custom-border custom-text-secondary">
              v2.4.0 Pro
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold custom-text-primary tracking-tight">
            Quản trị Hệ thống & Báo cáo Thống kê
          </h1>
          <p className="text-xs sm:text-sm custom-text-secondary font-medium">
            Theo dõi tổng quan dữ liệu nguồn nhà, hiệu suất chuyên viên và chẩn đoán hạ tầng máy chủ
          </p>
        </div>

        {/* Action Controls & Sub-tabs */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center p-1 rounded-xl bg-black/5 dark:bg-white/5 border custom-border">
            <button
              onClick={() => {
                setActiveSubTab("reports");
                addActivityLog("NAV", "Click mục Báo cáo & Quản trị.");
              }}
              id="btn-subtab-reports"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeSubTab === "reports"
                  ? "custom-accent-bg text-white shadow-xs"
                  : "custom-text-secondary hover:custom-text-primary"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Báo cáo & Thống kê</span>
            </button>
            <button
              onClick={() => {
                setActiveSubTab("logs");
                addActivityLog("NAV", "Xem bảng Nhật ký hoạt động thời gian thực.");
              }}
              id="btn-subtab-logs"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeSubTab === "logs"
                  ? "custom-accent-bg text-white shadow-xs"
                  : "custom-text-secondary hover:custom-text-primary"
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Nhật Ký</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold">
                {activityLogs.length}
              </span>
            </button>
            <button
              onClick={() => {
                setActiveSubTab("system");
                addActivityLog("SYS", "Mở giao diện cấu hình & chẩn đoán hệ thống.");
              }}
              id="btn-subtab-system"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeSubTab === "system"
                  ? "custom-accent-bg text-white shadow-xs"
                  : "custom-text-secondary hover:custom-text-primary"
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>Quản lý Hệ thống</span>
            </button>
          </div>

          {activeSubTab === "reports" && (
            <button
              onClick={handleExportCSV}
              id="btn-export-csv-report"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition-all cursor-pointer"
              title="Xuất dữ liệu nguồn nhà dạng file Excel / CSV"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span className="hidden sm:inline">Xuất CSV</span>
            </button>
          )}

          <button
            onClick={() => {
              fetchSystemInfo();
              if (activeSubTab === "system") runDbDiagnostic();
            }}
            id="btn-refresh-system-view"
            className="p-2 rounded-xl border custom-border hover:bg-black/5 dark:hover:bg-white/5 custom-text-primary transition-all cursor-pointer"
            title="Làm mới thông tin"
          >
            <RefreshCw className={`w-4 h-4 ${loadingSystemInfo || testingDb ? "animate-spin text-amber-500" : ""}`} />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: BÁO CÁO & THỐNG KÊ (REPORTS & ANALYTICS) */}
      {/* ========================================================================= */}
      {activeSubTab === "reports" && (
        <div className="space-y-6">
          {/* Quick Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-xl border custom-border custom-bg-secondary">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider custom-text-secondary flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" />
                Thời gian:
              </span>
              {[
                { key: "all", label: "Toàn bộ" },
                { key: "this_month", label: "Tháng này" },
                { key: "30days", label: "30 ngày qua" },
                { key: "7days", label: "7 ngày qua" }
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setTimeFilter(tab.key as any)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    timeFilter === tab.key
                      ? "bg-amber-500 text-white shadow-xs font-semibold"
                      : "bg-black/5 dark:bg-white/5 custom-text-secondary hover:custom-text-primary"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider custom-text-secondary shrink-0">
                Lọc chuyên viên:
              </span>
              <select
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border custom-border bg-white dark:bg-slate-900 custom-text-primary focus:outline-none focus:border-amber-500 cursor-pointer max-w-[200px] truncate"
              >
                <option value="all">Tất cả chuyên viên ({staffList.length})</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.total} tin)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4 KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* KPI 1: Tổng số tin */}
            <div className="p-4 sm:p-5 rounded-2xl border custom-border custom-bg-secondary shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider custom-text-secondary">
                  Tổng nguồn nhà
                </span>
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold custom-text-primary tracking-tight">
                {statusStats.total}
              </div>
              <div className="text-[11px] custom-text-secondary font-medium flex items-center gap-1">
                <span className="text-blue-500 font-bold">{statusStats.moi}</span> tin mới cần tiếp cận
              </div>
            </div>

            {/* KPI 2: Đã giao dịch thành công */}
            <div className="p-4 sm:p-5 rounded-2xl border custom-border custom-bg-secondary shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider custom-text-secondary">
                  Thành công
                </span>
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight">
                {statusStats.success}
              </div>
              <div className="text-[11px] custom-text-secondary font-medium">
                {statusStats.da_ban} Đã bán + {statusStats.da_chot} Đã chốt cọc
              </div>
            </div>

            {/* KPI 3: Tỷ lệ chốt thành công */}
            <div className="p-4 sm:p-5 rounded-2xl border custom-border custom-bg-secondary shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider custom-text-secondary">
                  Tỷ lệ chốt giao dịch
                </span>
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-amber-600 dark:text-amber-400 tracking-tight">
                {statusStats.successRate}%
              </div>
              <div className="text-[11px] custom-text-secondary font-medium">
                {statusStats.inProgress} nguồn đang đàm phán ({statusStats.da_ky} Đã ký, {statusStats.dang_lien_he} Đang liên hệ)
              </div>
            </div>

            {/* KPI 4: Đội ngũ & Quản lý */}
            <div className="p-4 sm:p-5 rounded-2xl border custom-border custom-bg-secondary shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider custom-text-secondary">
                  Đội ngũ phụ trách
                </span>
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold custom-text-primary tracking-tight">
                {staffList.length}
              </div>
              <div className="text-[11px] custom-text-secondary font-medium truncate">
                {imageStats.withImages}/{statusStats.total} tin có hình ảnh ({imageStats.percentage}%)
              </div>
            </div>
          </div>

          {/* Section: Phân bố trạng thái & Loại giao dịch */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Breakdown theo trạng thái */}
            <div className="p-4 sm:p-6 rounded-2xl border custom-border custom-bg-secondary shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm sm:text-base font-bold custom-text-primary flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-500" />
                  Phân bổ Trạng thái Giao dịch
                </h3>
                <span className="text-xs font-mono custom-text-secondary">
                  Tổng: {statusStats.total}
                </span>
              </div>

              {/* Progress visual bar */}
              {statusStats.total > 0 && (
                <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800">
                  <div 
                    style={{ width: `${(statusStats.moi / statusStats.total) * 100}%` }}
                    className="bg-slate-400 transition-all"
                    title={`Mới: ${statusStats.moi}`}
                  />
                  <div 
                    style={{ width: `${(statusStats.dang_lien_he / statusStats.total) * 100}%` }}
                    className="bg-amber-400 transition-all"
                    title={`Đang liên hệ: ${statusStats.dang_lien_he}`}
                  />
                  <div 
                    style={{ width: `${(statusStats.da_ky / statusStats.total) * 100}%` }}
                    className="bg-blue-500 transition-all"
                    title={`Đã ký: ${statusStats.da_ky}`}
                  />
                  <div 
                    style={{ width: `${(statusStats.da_chot / statusStats.total) * 100}%` }}
                    className="bg-emerald-400 transition-all"
                    title={`Đã chốt: ${statusStats.da_chot}`}
                  />
                  <div 
                    style={{ width: `${(statusStats.da_ban / statusStats.total) * 100}%` }}
                    className="bg-emerald-600 transition-all"
                    title={`Đã bán: ${statusStats.da_ban}`}
                  />
                </div>
              )}

              {/* Status rows */}
              <div className="space-y-2.5 pt-1">
                {[
                  { label: "Mới tạo / Cần khảo sát", count: statusStats.moi, color: "bg-slate-400 text-slate-700 dark:text-slate-300", badgeColor: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
                  { label: "Đang liên hệ / Tư vấn", count: statusStats.dang_lien_he, color: "bg-amber-400 text-amber-600 dark:text-amber-400", badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
                  { label: "Đã ký hợp đồng gửi bán", count: statusStats.da_ky, color: "bg-blue-500 text-blue-600 dark:text-blue-400", badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
                  { label: "Đã chốt cọc giao dịch", count: statusStats.da_chot, color: "bg-emerald-400 text-emerald-600 dark:text-emerald-400", badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
                  { label: "Đã bán thành công", count: statusStats.da_ban, color: "bg-emerald-600 text-emerald-700 dark:text-emerald-300", badgeColor: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border-emerald-600/30 font-bold" },
                ].map((item, idx) => {
                  const pct = statusStats.total > 0 ? Math.round((item.count / statusStats.total) * 100) : 0;
                  return (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-black/5 dark:bg-white/5 border custom-border">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full ${item.color.split(" ")[0]} shrink-0`} />
                        <span className="text-xs font-semibold custom-text-primary truncate">
                          {item.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono font-bold custom-text-primary">
                          {item.count}
                        </span>
                        <span className="text-[11px] font-mono custom-text-secondary w-10 text-right">
                          {pct}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Breakdown theo Loại giao dịch & Dữ liệu ảnh */}
            <div className="p-4 sm:p-6 rounded-2xl border custom-border custom-bg-secondary shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm sm:text-base font-bold custom-text-primary flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-500" />
                  Phân loại Nguồn hàng & Dữ liệu
                </h3>
              </div>

              {/* 3 Categories */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-center space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 block">
                    Khách Bán
                  </span>
                  <div className="text-xl sm:text-2xl font-extrabold text-red-600 dark:text-red-400">
                    {typeStats.khachBan}
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {statusStats.total > 0 ? Math.round((typeStats.khachBan / statusStats.total) * 100) : 0}% nguồn
                  </span>
                </div>

                <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 text-center space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                    Khách Mua
                  </span>
                  <div className="text-xl sm:text-2xl font-extrabold text-blue-600 dark:text-blue-400">
                    {typeStats.khachMua}
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {statusStats.total > 0 ? Math.round((typeStats.khachMua / statusStats.total) * 100) : 0}% nguồn
                  </span>
                </div>

                <div className="p-3 rounded-xl border border-purple-500/20 bg-purple-500/5 text-center space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 block">
                    Môi Giới
                  </span>
                  <div className="text-xl sm:text-2xl font-extrabold text-purple-600 dark:text-purple-400">
                    {typeStats.moiGioi}
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {statusStats.total > 0 ? Math.round((typeStats.moiGioi / statusStats.total) * 100) : 0}% nguồn
                  </span>
                </div>
              </div>

              {/* Media Status Info */}
              <div className="p-3.5 rounded-xl border custom-border bg-black/5 dark:bg-white/5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold custom-text-primary">
                    Mức độ hoàn thiện hình ảnh sản phẩm:
                  </span>
                  <span className="font-bold text-amber-500 font-mono">
                    {imageStats.percentage}% hoàn chỉnh
                  </span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700">
                  <div 
                    className="h-full bg-amber-500 rounded-full transition-all"
                    style={{ width: `${imageStats.percentage}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] custom-text-secondary pt-1">
                  <span>{imageStats.withImages} tin có hình ({imageStats.totalImages} tệp ảnh)</span>
                  <span>{imageStats.withoutImages} tin chưa có ảnh</span>
                </div>
              </div>

              {/* Quick tip box */}
              <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed font-medium">
                  Tin đăng có đính kèm từ 3 hình ảnh thực tế và số điện thoại rõ ràng có tỷ lệ chốt giao dịch cao hơn 4.2 lần so với tin chỉ có văn bản thô.
                </p>
              </div>
            </div>
          </div>

          {/* Section: Nhật Ký Hoạt Động Thời Gian Thực Card */}
          {renderActivityLogsCard(false)}

          {/* Section: Bảng Hiệu suất Chuyên viên / Quản trị phụ trách */}
          <div className="p-4 sm:p-6 rounded-2xl border custom-border custom-bg-secondary shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold custom-text-primary flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-purple-500" />
                  Báo cáo Hiệu suất Chuyên viên & Quản lý Nguồn hàng
                </h3>
                <p className="text-xs custom-text-secondary">
                  Thống kê số lượng tin đăng, tiến độ đàm phán và tỷ lệ chốt giao dịch theo từng chuyên viên
                </p>
              </div>

              {/* Search Staff */}
              <div className="relative max-w-xs w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchStaff}
                  onChange={(e) => setSearchStaff(e.target.value)}
                  placeholder="Tìm theo tên, email, sđt..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border custom-border bg-white dark:bg-slate-900 custom-text-primary focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border custom-border rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b custom-border bg-black/5 dark:bg-white/5 custom-text-secondary font-bold uppercase tracking-wider">
                    <th className="py-3 px-3.5">Chuyên viên / QL</th>
                    <th className="py-3 px-3 text-center">Tổng nguồn</th>
                    <th className="py-3 px-3 text-center">Mới</th>
                    <th className="py-3 px-3 text-center">Đang liên hệ</th>
                    <th className="py-3 px-3 text-center">Đã ký</th>
                    <th className="py-3 px-3 text-center">Đã bán / Chốt</th>
                    <th className="py-3 px-3 text-center">Tỷ lệ thành công</th>
                    <th className="py-3 px-3.5 text-right">Hoạt động cuối</th>
                  </tr>
                </thead>
                <tbody className="divide-y custom-border custom-text-primary">
                  {filteredStaffList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center custom-text-secondary">
                        Không tìm thấy chuyên viên nào phù hợp với tìm kiếm
                      </td>
                    </tr>
                  ) : (
                    filteredStaffList.map((st, idx) => (
                      <tr key={st.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                        <td className="py-3 px-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold flex items-center justify-center shrink-0 border border-amber-500/30">
                              {st.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold truncate max-w-[160px] sm:max-w-[200px]">
                                {st.name}
                              </div>
                              <div className="text-[10px] custom-text-secondary truncate">
                                {st.email || st.phone || st.role || "Chuyên viên"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center font-bold font-mono text-sm">
                          {st.total}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-slate-500">
                          {st.moi}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-amber-600 dark:text-amber-400 font-semibold">
                          {st.dang_lien_he}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-blue-600 dark:text-blue-400 font-semibold">
                          {st.da_ky}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                          {st.successCount}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            {st.successRate}%
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono text-[11px] custom-text-secondary whitespace-nowrap">
                          {st.lastActive ? new Date(st.lastActive).toLocaleDateString("vi-VN") : "--"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: NHẬT KÝ HOẠT ĐỘNG THỜI GIAN THỰC (REALTIME ACTIVITY LOGS) */}
      {/* ========================================================================= */}
      {activeSubTab === "logs" && (
        <div className="space-y-6">
          {renderActivityLogsCard(true)}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: QUẢN LÝ HỆ THỐNG & CHẨN ĐOÁN (SYSTEM HEALTH & DIAGNOSTICS) */}
      {/* ========================================================================= */}
      {activeSubTab === "system" && (
        <div className="space-y-6">
          {/* Quick diagnostic alert if any */}
          {dbTestResult && (
            <div className={`p-4 sm:p-5 rounded-2xl border flex flex-col sm:flex-row items-start gap-3 shadow-xs ${
              dbTestResult.connected 
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                : "bg-red-500/10 border-red-500/30 text-red-800 dark:text-red-300"
            }`}>
              <div className="p-2 rounded-xl bg-white/50 dark:bg-black/20 shrink-0">
                {dbTestResult.connected ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-red-500" />
                )}
              </div>
              <div className="space-y-1 flex-1 min-w-0">
                <div className="font-bold text-sm">
                  {dbTestResult.connected ? "Kết nối Cơ sở dữ liệu Supabase hoạt động xuất sắc!" : "Cảnh báo kết nối Supabase"}
                </div>
                <div className="text-xs leading-relaxed">
                  {dbTestResult.message}
                </div>
                {dbTestResult.details && (
                  <div className="text-[11px] opacity-85 font-mono pt-1 break-all">
                    Chi tiết: {dbTestResult.details}
                  </div>
                )}
              </div>
              <button
                onClick={runDbDiagnostic}
                disabled={testingDb}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/70 dark:bg-black/40 border border-current hover:opacity-80 transition-opacity cursor-pointer shrink-0"
              >
                {testingDb ? "Đang kiểm tra..." : "Chạy lại"}
              </button>
            </div>
          )}

          {/* Infrastructure Health Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Supabase Database Status */}
            <div className="p-5 rounded-2xl border custom-border custom-bg-secondary shadow-xs space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Database className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-sm custom-text-primary">
                    Supabase PostgreSQL
                  </h3>
                </div>
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  systemInfo?.database?.isConfigured
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                    : "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${systemInfo?.database?.isConfigured ? "bg-emerald-500" : "bg-red-500"}`} />
                  {systemInfo?.database?.isConfigured ? "Đã cấu hình" : "Chưa cấu hình"}
                </span>
              </div>

              <div className="space-y-2 text-xs divide-y custom-border pt-1">
                <div className="flex justify-between py-1">
                  <span className="custom-text-secondary">Project URL:</span>
                  <span className="font-mono custom-text-primary text-[11px] truncate max-w-[170px]">
                    {systemInfo?.database?.supabaseUrl || "Chưa có"}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="custom-text-secondary">Anon Key:</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 text-[11px]">
                    {systemInfo?.database?.hasAnonKey ? systemInfo.database.anonKeyPreview : "Thiếu"}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="custom-text-secondary">Service Role Key:</span>
                  <span className={`font-mono text-[11px] ${systemInfo?.database?.hasServiceRoleKey ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}`}>
                    {systemInfo?.database?.hasServiceRoleKey ? systemInfo.database.serviceRoleKeyPreview : "Chưa nạp (cần cho Admin)"}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="custom-text-secondary">Bảng chu_nha_can_ban:</span>
                  <span className="font-mono font-bold custom-text-primary">
                    {systemInfo?.database?.health?.propertiesCount !== null && systemInfo?.database?.health?.propertiesCount !== undefined
                      ? `${systemInfo.database.health.propertiesCount} bản ghi`
                      : "Sẵn sàng"}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="custom-text-secondary">Bảng profiles:</span>
                  <span className="font-mono font-bold custom-text-primary">
                    {systemInfo?.database?.health?.profilesCount !== null && systemInfo?.database?.health?.profilesCount !== undefined
                      ? `${systemInfo.database.health.profilesCount} tài khoản`
                      : "Sẵn sàng"}
                  </span>
                </div>
              </div>

              <button
                onClick={runDbDiagnostic}
                disabled={testingDb}
                className="w-full py-2 px-3 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 custom-text-primary text-xs font-semibold border custom-border transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Activity className={`w-3.5 h-3.5 text-emerald-500 ${testingDb ? "animate-spin" : ""}`} />
                <span>{testingDb ? "Đang chạy test ping..." : "Kiểm tra kết nối Supabase"}</span>
              </button>
            </div>

            {/* 2. Cloudinary Storage Status */}
            <div className="p-5 rounded-2xl border custom-border custom-bg-secondary shadow-xs space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <HardDrive className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-sm custom-text-primary">
                    Lưu trữ ảnh Cloudinary
                  </h3>
                </div>
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  systemInfo?.storage?.isConfigured
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${systemInfo?.storage?.isConfigured ? "bg-emerald-500" : "bg-amber-500"}`} />
                  {systemInfo?.storage?.isConfigured ? "Hoạt động" : "Cần cấu hình"}
                </span>
              </div>

              <div className="space-y-2 text-xs divide-y custom-border pt-1">
                <div className="flex justify-between py-1">
                  <span className="custom-text-secondary">Dịch vụ:</span>
                  <span className="font-medium custom-text-primary">
                    Cloudinary CDN Media API
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="custom-text-secondary">Cloud Name:</span>
                  <span className="font-mono custom-text-primary text-[11px]">
                    {systemInfo?.storage?.cloudName || "Chưa có"}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="custom-text-secondary">Upload Preset:</span>
                  <span className="font-mono custom-text-primary text-[11px]">
                    {systemInfo?.storage?.uploadPreset || "Chưa có"}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="custom-text-secondary">Chế độ tải ảnh:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    Trực tiếp từ Trình duyệt (Tối ưu tốc độ)
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
                Ảnh chụp nhà và giấy tờ được nén tự động và truyền trực tiếp lên CDN Cloudinary, không làm nặng tài nguyên máy chủ.
              </div>
            </div>

            {/* 3. Server & Runtime Status */}
            <div className="p-5 rounded-2xl border custom-border custom-bg-secondary shadow-xs space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                    <Server className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-sm custom-text-primary">
                    Máy chủ ứng dụng (Runtime)
                  </h3>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Trực tuyến
                </span>
              </div>

              <div className="space-y-2 text-xs divide-y custom-border pt-1">
                <div className="flex justify-between py-1">
                  <span className="custom-text-secondary">Môi trường:</span>
                  <span className="font-mono uppercase font-bold text-purple-600 dark:text-purple-400">
                    {systemInfo?.server?.environment || "Production"}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="custom-text-secondary">Thời gian hoạt động (Uptime):</span>
                  <span className="font-mono font-medium custom-text-primary">
                    {formatUptime(systemInfo?.server?.uptimeSeconds)}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="custom-text-secondary">Node.js Engine:</span>
                  <span className="font-mono custom-text-primary text-[11px]">
                    {systemInfo?.server?.nodeVersion || "--"}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="custom-text-secondary">Bộ nhớ đệm máy chủ (Local Cache):</span>
                  <span className="font-mono font-bold custom-text-primary">
                    {systemInfo?.localCache?.propertiesCount ?? 0} tin lưu tạm
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="custom-text-secondary">Mật khẩu Admin dự phòng:</span>
                  <span className={`font-semibold ${systemInfo?.security?.adminPasswordConfigured ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}`}>
                    {systemInfo?.security?.adminPasswordConfigured ? "Đã kích hoạt" : "Mặc định (admin123)"}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 text-[11px] text-purple-700 dark:text-purple-300 leading-relaxed">
                Hệ thống hỗ trợ cơ chế lưu trữ đệm 2 lớp (Supabase Cloud + Local Backup Sync), đảm bảo không bao giờ gián đoạn nghiệp vụ.
              </div>
            </div>
          </div>

          {/* Environment Variables Audit Table */}
          <div className="p-5 sm:p-6 rounded-2xl border custom-border custom-bg-secondary shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold custom-text-primary flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-amber-500" />
                  Kiểm toán Biến Môi trường Hệ thống (Environment Variables Audit)
                </h3>
                <p className="text-xs custom-text-secondary">
                  Trạng thái cấu hình các biến bảo mật quan trọng (giá trị đã được che dấu ký tự bảo mật)
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border custom-border rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b custom-border bg-black/5 dark:bg-white/5 custom-text-secondary font-bold uppercase tracking-wider">
                    <th className="py-2.5 px-3.5">Tên biến</th>
                    <th className="py-2.5 px-3">Mục đích</th>
                    <th className="py-2.5 px-3 text-center">Trạng thái</th>
                    <th className="py-2.5 px-3.5">Giá trị nhận diện (Masked)</th>
                  </tr>
                </thead>
                <tbody className="divide-y custom-border font-mono text-[11px]">
                  <tr>
                    <td className="py-2.5 px-3.5 font-bold custom-text-primary">SUPABASE_URL</td>
                    <td className="py-2.5 px-3 font-sans text-xs custom-text-secondary">Đường dẫn máy chủ API Supabase</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        {systemInfo?.database?.isConfigured ? "Đã nạp" : "Thiếu"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 custom-text-secondary truncate max-w-[200px]">
                      {systemInfo?.database?.supabaseUrl || "Chưa thiết lập"}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2.5 px-3.5 font-bold custom-text-primary">SUPABASE_ANON_KEY</td>
                    <td className="py-2.5 px-3 font-sans text-xs custom-text-secondary">Khóa xác thực khách (Anonymous API Key)</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        {systemInfo?.database?.hasAnonKey ? "Đã nạp" : "Thiếu"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 custom-text-secondary truncate max-w-[200px]">
                      {systemInfo?.database?.anonKeyPreview || "Chưa thiết lập"}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2.5 px-3.5 font-bold custom-text-primary">SUPABASE_SERVICE_ROLE_KEY</td>
                    <td className="py-2.5 px-3 font-sans text-xs custom-text-secondary">Khóa quản trị Auth Admin (Vượt qua RLS)</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        systemInfo?.database?.hasServiceRoleKey 
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      }`}>
                        {systemInfo?.database?.hasServiceRoleKey ? "Đã nạp" : "Chưa có"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 custom-text-secondary truncate max-w-[200px]">
                      {systemInfo?.database?.serviceRoleKeyPreview || "Cần cấu hình trên Vercel/Settings"}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2.5 px-3.5 font-bold custom-text-primary">VITE_CLOUDINARY_CLOUD_NAME</td>
                    <td className="py-2.5 px-3 font-sans text-xs custom-text-secondary">Tên tài khoản lưu trữ hình ảnh Cloudinary</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        {systemInfo?.storage?.isConfigured ? "Đã nạp" : "Mặc định"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 custom-text-secondary truncate max-w-[200px]">
                      {systemInfo?.storage?.cloudName || "Chưa thiết lập"}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2.5 px-3.5 font-bold custom-text-primary">ADMIN_PASSWORD</td>
                    <td className="py-2.5 px-3 font-sans text-xs custom-text-secondary">Mật khẩu quản trị viên khẩn cấp (Cấp cứu)</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        systemInfo?.security?.adminPasswordConfigured
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-slate-500/10 text-slate-500"
                      }`}>
                        {systemInfo?.security?.adminPasswordConfigured ? "Đã đổi" : "Mặc định"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 custom-text-secondary">
                      {systemInfo?.security?.adminPasswordConfigured ? "Đã mã hóa trong biến môi trường" : "Sử dụng mật khẩu dự phòng"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Complete SQL Setup Code Accordion/Card */}
          <div className="p-5 sm:p-6 rounded-2xl border custom-border custom-bg-secondary shadow-xs space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm sm:text-base font-bold custom-text-primary">
                  Mã SQL Khởi tạo Cơ sở dữ liệu Chuẩn (Supabase SQL Editor)
                </h3>
              </div>
              <button
                onClick={copySqlToClipboard}
                id="btn-copy-system-sql"
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/25 text-xs font-semibold cursor-pointer transition-all shrink-0"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSql ? "Đã sao chép SQL!" : "Sao chép toàn bộ SQL"}</span>
              </button>
            </div>
            <p className="text-xs custom-text-secondary">
              Nếu tạo dự án Supabase mới hoặc thêm tài khoản, dán mã SQL này vào mục <b>SQL Editor</b> trên Supabase Dashboard và bấm <b>Run</b> để tạo bảng `chu_nha_can_ban`, `profiles` và phân quyền RLS chuẩn xác.
            </p>
            {systemInfo?.setupSQL && (
              <div className="relative rounded-xl overflow-hidden border custom-border bg-slate-950 text-slate-200">
                <pre className="p-4 text-[11px] font-mono overflow-x-auto max-h-56 leading-relaxed">
                  {systemInfo.setupSQL}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
