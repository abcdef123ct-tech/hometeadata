import React, { useState, useEffect } from "react";
import { 
  Users, UserPlus, Edit2, Trash2, Shield, CheckCircle2, 
  XCircle, Search, RefreshCw, KeyRound, Mail, User, 
  Eye, EyeOff, AlertTriangle, X, Check, Copy, Terminal, ShieldAlert,
  UserCheck, Phone
} from "lucide-react";
import { UserProfile, AuthUser, UserStatus, UserRole } from "../types";
import { safeFetchJson } from "../utils/apiClient";

interface UserManagementViewProps {
  currentUser: AuthUser | null;
  onBackToProperties?: () => void;
}

export default function UserManagementView({ currentUser, onBackToProperties }: UserManagementViewProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | UserStatus>("all");
  const [filterRole, setFilterRole] = useState<"all" | UserRole>("all");

  // Create User Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createFullName, setCreateFullName] = useState("");
  const [createRole, setCreateRole] = useState<UserRole>("staff");
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit User Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("staff");
  const [editStatus, setEditStatus] = useState<UserStatus>("active");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete User Confirmation State
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<UserProfile | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // SQL Copy state for profiles setup
  const [copiedSql, setCopiedSql] = useState(false);
  const [showSqlGuide, setShowSqlGuide] = useState(false);

  const getAuthHeaders = (includeJson = false): Record<string, string> => {
    const headers: Record<string, string> = {};
    if (includeJson) headers["Content-Type"] = "application/json";
    const token = localStorage.getItem("admin_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  };

  const fetchUsers = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await safeFetchJson<{
        success?: boolean;
        users?: UserProfile[];
        error?: string;
      }>("/api/users", {
        headers: getAuthHeaders(),
        credentials: "include",
      });

      if (res.ok && res.data.success) {
        setUsers(res.data.users || []);
      } else {
        const errMsg =
          res.errorMessage ||
          `Không thể tải danh sách tài khoản (HTTP ${res.status} — GET /api/users)`;
        setError(errMsg);
        if (errMsg.includes("profiles") || errMsg.includes("42P01")) {
          setShowSqlGuide(true);
        }
      }
    } catch (err: any) {
      setError(err.message || "Lỗi kết nối khi tải danh sách tài khoản (GET /api/users).");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Flash success message
  const triggerSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => {
      setSuccessMsg(null);
    }, 4000);
  };

  // Helper to generate a random strong password
  const generateRandomPassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
    let pwd = "";
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCreatePassword(pwd);
  };

  // 1. Create User Handler
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawInput = createEmail.trim();
    if (!rawInput) {
      setCreateError("Vui lòng nhập tên đăng nhập hoặc email.");
      return;
    }
    if (!createPassword || createPassword.length < 6) {
      setCreateError("Mật khẩu phải có tối thiểu 6 ký tự.");
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    const isFullEmail = rawInput.includes("@");
    const normalizedIdentifier = rawInput.toLowerCase();
    const effectiveEmail = isFullEmail ? normalizedIdentifier : `${normalizedIdentifier}@hometeadata.local`;
    const defaultName = createFullName.trim() || (isFullEmail ? normalizedIdentifier.split("@")[0] : rawInput);

    try {
      const res = await safeFetchJson<{ success?: boolean; error?: string }>(
        "/api/users",
        {
          method: "POST",
          headers: getAuthHeaders(true),
          credentials: "include",
          body: JSON.stringify({
            username: normalizedIdentifier,
            email: effectiveEmail,
            password: createPassword,
            full_name: defaultName,
            role: createRole,
          }),
        }
      );

      if (res.ok && res.data.success) {
        setIsCreateOpen(false);
        setCreateEmail("");
        setCreatePassword("");
        setCreateFullName("");
        setCreateRole("staff");
        triggerSuccess(`Tạo tài khoản "${rawInput}" (${createRole === "admin" ? "Admin" : createRole === "staff" ? "Nhân viên" : "Người xem"}) thành công!`);
        await fetchUsers(true);
      } else {
        const msg =
          res.errorMessage ||
          `Lỗi tạo tài khoản mới (HTTP ${res.status} — POST /api/users)`;
        setCreateError(msg);
        if (msg.includes("profiles")) {
          setShowSqlGuide(true);
        }
      }
    } catch (err: any) {
      setCreateError(err.message || "Lỗi mạng khi tạo tài khoản (POST /api/users).");
    } finally {
      setCreateLoading(false);
    }
  };

  // 2. Open Edit Modal
  const openEditModal = (user: UserProfile) => {
    setEditingUser(user);
    setEditFullName(user.full_name || "");
    setEditRole((user.role as UserRole) || "staff");
    setEditStatus(user.status || "active");
    setEditError(null);
    setIsEditOpen(true);
  };

  // Edit User Handler
  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setEditLoading(true);
    setEditError(null);

    try {
      const targetUrl = `/api/users/${editingUser.id}`;
      const res = await safeFetchJson<{ success?: boolean; error?: string }>(
        targetUrl,
        {
          method: "PUT",
          headers: getAuthHeaders(true),
          credentials: "include",
          body: JSON.stringify({
            full_name: editFullName.trim(),
            role: editRole,
            status: editStatus,
          }),
        }
      );

      if (res.ok && res.data.success) {
        setIsEditOpen(false);
        setEditingUser(null);
        triggerSuccess(`Cập nhật thông tin "${editingUser.email}" thành công!`);
        await fetchUsers(true);
      } else {
        setEditError(
          res.errorMessage ||
            `Lỗi khi cập nhật tài khoản (HTTP ${res.status} — PUT ${targetUrl})`
        );
      }
    } catch (err: any) {
      setEditError(err.message || "Lỗi mạng khi cập nhật.");
    } finally {
      setEditLoading(false);
    }
  };

  // 3. Toggle Status directly
  const handleToggleStatus = async (user: UserProfile) => {
    const newStatus: UserStatus = user.status === "active" ? "disabled" : "active";
    const actionLabel = newStatus === "disabled" ? "vô hiệu hóa" : "kích hoạt lại";
    
    // Warn if user attempts to disable themselves
    if (currentUser && currentUser.email === user.email && newStatus === "disabled") {
      setError("Bạn không thể vô hiệu hóa chính tài khoản đang đăng nhập của mình!");
      return;
    }

    try {
      const targetUrl = `/api/users/${user.id}`;
      const res = await safeFetchJson<{ success?: boolean; error?: string }>(
        targetUrl,
        {
          method: "PUT",
          headers: getAuthHeaders(true),
          credentials: "include",
          body: JSON.stringify({
            status: newStatus,
          }),
        }
      );

      if (res.ok && res.data.success) {
        triggerSuccess(`Đã ${actionLabel} tài khoản ${user.email}.`);
        await fetchUsers(true);
      } else {
        setError(
          res.errorMessage ||
            `Không thể cập nhật trạng thái tài khoản (HTTP ${res.status} — PUT ${targetUrl})`
        );
      }
    } catch (err: any) {
      setError(err.message || "Lỗi kết nối khi cập nhật trạng thái.");
    }
  };

  // 4. Open Delete Modal
  const openDeleteModal = (user: UserProfile) => {
    if (currentUser && currentUser.email === user.email) {
      setError("Bạn không thể xóa chính tài khoản bạn đang dùng để đăng nhập!");
      return;
    }
    setDeletingUser(user);
    setDeleteError(null);
    setIsDeleteOpen(true);
  };

  // Delete User Handler
  const handleDeleteUser = async () => {
    if (!deletingUser) return;

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const targetUrl = `/api/users/${deletingUser.id}`;
      const res = await safeFetchJson<{ success?: boolean; error?: string }>(
        targetUrl,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
          credentials: "include",
        }
      );

      if (res.ok && res.data.success) {
        setIsDeleteOpen(false);
        triggerSuccess(`Đã xóa tài khoản ${deletingUser.email} khỏi hệ thống.`);
        setDeletingUser(null);
        await fetchUsers(true);
      } else {
        setDeleteError(
          res.errorMessage ||
            `Lỗi khi xóa tài khoản (HTTP ${res.status} — DELETE ${targetUrl})`
        );
      }
    } catch (err: any) {
      setDeleteError(err.message || "Lỗi mạng khi xóa tài khoản.");
    } finally {
      setDeleteLoading(false);
    }
  };

  // Copy SQL script
  const sqlScript = `-- 1. Tạo bảng profiles trong Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  phone text,
  role text NOT NULL DEFAULT 'staff',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;

-- 2. Thêm các cột người tạo tin vào bảng chu_nha_can_ban (nếu chưa có)
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE chu_nha_can_ban ADD COLUMN IF NOT EXISTS created_by_name text;

-- 3. Trigger tự động thêm dòng vào bảng profiles khi tạo User
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

-- 4. Đồng bộ ngay các tài khoản hiện có trong auth.users vào bảng profiles
INSERT INTO public.profiles (id, email, full_name, role, status)
SELECT 
  id, 
  email, 
  COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
  COALESCE(raw_user_meta_data->>'role', 'admin'),
  'active'
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email;`;

  const copySqlToClipboard = () => {
    navigator.clipboard.writeText(sqlScript);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  // Helper for role badge
  const renderRoleBadge = (role: string = "staff") => {
    const normalizedRole = (role || "").toLowerCase();
    if (normalizedRole === "admin") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
          <Shield className="w-3 h-3 text-amber-500" />
          <span>Quản trị viên (Admin)</span>
        </span>
      );
    }
    if (normalizedRole === "staff") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
          <UserCheck className="w-3 h-3 text-blue-500" />
          <span>Nhân viên (Staff)</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-500/15 text-slate-600 dark:text-slate-300 border border-slate-500/30">
        <Eye className="w-3 h-3 text-slate-400" />
        <span>Người xem (Viewer)</span>
      </span>
    );
  };

  // Filtered users
  const filteredUsers = users.filter((u) => {
    const matchesSearch = 
      (u.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.full_name || "").toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = 
      filterStatus === "all" || u.status === filterStatus;

    const matchesRole =
      filterRole === "all" || (u.role || "staff") === filterRole;

    return matchesSearch && matchesStatus && matchesRole;
  });

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6" id="user-management-view">
      {/* Top Breadcrumb / Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b custom-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold custom-text-primary tracking-tight">
              Quản lý tài khoản quản trị
            </h1>
            <p className="text-xs sm:text-sm custom-text-secondary">
              Danh sách và phân quyền người dùng kết nối qua Supabase Auth
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onBackToProperties && (
            <button
              onClick={onBackToProperties}
              className="px-3.5 py-2 rounded-xl border custom-border custom-text-primary text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
            >
              ← Quay lại Nguồn nhà
            </button>
          )}

          <button
            onClick={() => fetchUsers(true)}
            disabled={refreshing || loading}
            id="btn-refresh-users"
            className="p-2 sm:px-3 sm:py-2 rounded-xl border custom-border custom-text-secondary hover:custom-text-primary hover:bg-black/5 dark:hover:bg-white/5 text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5"
            title="Tải lại danh sách"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-amber-500" : ""}`} />
            <span className="hidden sm:inline">Làm mới</span>
          </button>

          <button
            onClick={() => {
              setCreateError(null);
              setCreateEmail("");
              setCreatePassword("");
              setCreateFullName("");
              generateRandomPassword();
              setIsCreateOpen(true);
            }}
            id="btn-open-create-user"
            className="px-4 py-2 rounded-xl custom-accent-bg text-white text-xs sm:text-sm font-semibold hover:opacity-95 transition-all shadow-md shadow-amber-500/15 cursor-pointer flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            <span>Thêm tài khoản mới</span>
          </button>
        </div>
      </div>

      {/* Success Notification Alert */}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-sm font-medium flex items-center gap-2.5 shadow-xs animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-sm font-medium flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setShowSqlGuide(!showSqlGuide)}
            className="text-xs underline font-semibold hover:opacity-80 shrink-0 cursor-pointer"
          >
            {showSqlGuide ? "Ẩn hướng dẫn SQL" : "Xem hướng dẫn tạo bảng profiles"}
          </button>
        </div>
      )}

      {/* Collapsible Supabase Profiles Setup Guide */}
      {showSqlGuide && (
        <div className="p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <Terminal className="w-4 h-4" />
                Cấu hình bảng `profiles` & Supabase Edge Function
              </h3>
              <p className="text-xs custom-text-secondary mt-1">
                Dán mã SQL sau vào <b>Supabase Dashboard &gt; SQL Editor</b> để hoàn tất cấu hình bảng profiles:
              </p>
            </div>
            <button
              onClick={copySqlToClipboard}
              className="px-3 py-1.5 rounded-lg custom-accent-bg text-white text-xs font-semibold hover:opacity-90 flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
            >
              {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSql ? "Đã sao chép!" : "Sao chép SQL"}</span>
            </button>
          </div>

          <pre className="p-3 rounded-xl bg-slate-900 text-slate-200 text-xs font-mono overflow-x-auto max-h-48 border border-slate-800">
            {sqlScript}
          </pre>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            Mẹo: Edge function được lưu tại <code>supabase/functions/manage-users/index.ts</code>. Để deploy qua CLI: <code>supabase functions deploy manage-users --no-verify-jwt</code>
          </p>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl custom-bg-secondary border custom-border">
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo email, họ tên..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border custom-border custom-bg-primary custom-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter by Role & Status Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Role Filter */}
          <div className="flex items-center gap-1">
            <span className="text-xs custom-text-secondary shrink-0 mr-1 hidden sm:inline">Vai trò:</span>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value as any)}
              className="px-2.5 py-1.5 rounded-lg border custom-border custom-bg-primary custom-text-primary text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
            >
              <option value="all">Tất cả vai trò ({users.length})</option>
              <option value="admin">Quản trị viên ({users.filter((u) => u.role === "admin").length})</option>
              <option value="staff">Nhân viên ({users.filter((u) => (u.role || "staff") === "staff").length})</option>
              <option value="viewer">Người xem ({users.filter((u) => u.role === "viewer").length})</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => setFilterStatus("all")}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                filterStatus === "all"
                  ? "custom-accent-bg text-white shadow-xs font-semibold"
                  : "border custom-border custom-text-secondary hover:custom-text-primary"
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => setFilterStatus("active")}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 flex items-center gap-1 ${
                filterStatus === "active"
                  ? "bg-emerald-600 text-white font-semibold"
                  : "border custom-border text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Hoạt động ({users.filter((u) => u.status === "active").length})
            </button>
            <button
              onClick={() => setFilterStatus("disabled")}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 flex items-center gap-1 ${
                filterStatus === "disabled"
                  ? "bg-rose-600 text-white font-semibold"
                  : "border custom-border text-rose-500 hover:bg-rose-500/10"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
              Vô hiệu hóa ({users.filter((u) => u.status === "disabled").length})
            </button>
          </div>
        </div>
      </div>

      {/* User Accounts Table */}
      <div className="rounded-2xl border custom-border custom-bg-secondary overflow-hidden shadow-xs">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <span className="w-7 h-7 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin"></span>
            <p className="text-xs custom-text-secondary">Đang tải danh sách tài khoản từ Supabase...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold custom-text-primary">
              {searchQuery ? "Không tìm thấy tài khoản phù hợp" : "Chưa có tài khoản người dùng nào"}
            </h3>
            <p className="text-xs custom-text-secondary mt-1 max-w-sm mx-auto">
              {searchQuery
                ? "Hãy thử tìm kiếm với từ khóa khác hoặc xóa bộ lọc."
                : "Bấm nút 'Thêm tài khoản mới' bên trên để tạo tài khoản đầu tiên trong Supabase Auth."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b custom-border bg-black/5 dark:bg-white/5 text-[11px] font-bold uppercase tracking-wider custom-text-secondary">
                  <th className="py-3 px-4 sm:px-6">Tài khoản</th>
                  <th className="py-3 px-4 hidden md:table-cell">Vai trò</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4 hidden lg:table-cell">Ngày tạo</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y custom-border">
                {filteredUsers.map((u) => {
                  const isCurrent = currentUser && (currentUser.email === u.email || currentUser.id === u.id);
                  const initial = (u.full_name || u.email || "U").charAt(0).toUpperCase();

                  return (
                    <tr 
                      key={u.id || u.email}
                      className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
                    >
                      {/* Avatar & Email & Full Name */}
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-xs ${
                            u.status === "active"
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                              : "bg-slate-200 dark:bg-slate-800 text-slate-500 border border-slate-300 dark:border-slate-700"
                          }`}>
                            {initial}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold custom-text-primary text-xs sm:text-sm truncate">
                                {u.full_name || "Chưa đặt tên"}
                              </span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                  Bạn (Đang đăng nhập)
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              {u.email && (u.email.endsWith("@hometeadata.local") || u.email.endsWith("@nguonnhapk.local")) ? (
                                <>
                                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 font-mono">
                                    {u.email.replace(/@(hometeadata|nguonnhapk)\.local$/i, "")}
                                  </span>
                                  <span className="text-[10px] custom-text-secondary font-mono opacity-70">
                                    (@hometeadata.local)
                                  </span>
                                </>
                              ) : (
                                <span className="text-xs custom-text-secondary block font-mono truncate">
                                  {u.email || "—"}
                                </span>
                              )}
                              {u.phone && (
                                <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-mono font-medium bg-amber-500/10 px-1.5 py-0.5 rounded">
                                  <Phone className="w-2.5 h-2.5" />
                                  <span>{u.phone}</span>
                                </span>
                              )}
                              <span className="md:hidden block mt-1">
                                {renderRoleBadge(u.role)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-3.5 px-4 hidden md:table-cell">
                        {renderRoleBadge(u.role)}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => handleToggleStatus(u)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                            u.status === "active"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                              : "bg-rose-500/10 text-rose-500 border-rose-500/30 hover:bg-rose-500/20"
                          }`}
                          title={`Bấm để chuyển thành ${u.status === "active" ? "Vô hiệu hóa" : "Hoạt động"}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${u.status === "active" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`}></span>
                          <span>{u.status === "active" ? "Hoạt động" : "Vô hiệu hóa"}</span>
                        </button>
                      </td>

                      {/* Created At */}
                      <td className="py-3.5 px-4 hidden lg:table-cell text-xs custom-text-secondary font-mono">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString("vi-VN", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        }) : "—"}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Edit Button */}
                          <button
                            onClick={() => openEditModal(u)}
                            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border custom-border hover:bg-black/5 dark:hover:bg-white/5 custom-text-secondary hover:custom-text-primary text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                            title="Chỉnh sửa tài khoản"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Sửa</span>
                          </button>

                          {/* Delete Button */}
                          <button
                            onClick={() => openDeleteModal(u)}
                            disabled={isCurrent}
                            className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border transition-colors flex items-center gap-1 text-xs font-medium ${
                              isCurrent 
                                ? "opacity-30 border-transparent text-slate-400 cursor-not-allowed" 
                                : "border-red-500/20 bg-red-500/5 text-red-500 hover:bg-red-500/20 cursor-pointer"
                            }`}
                            title={isCurrent ? "Không thể xóa tài khoản của chính bạn" : "Xóa tài khoản"}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Xóa</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. Modal: THÊM TÀI KHOẢN MỚI */}
      {/* ========================================================================= */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border custom-border custom-bg-secondary p-6 shadow-2xl space-y-5 relative">
            <div className="flex items-center justify-between pb-3 border-b custom-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold custom-text-primary">Thêm tài khoản quản trị mới</h3>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 custom-text-secondary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-medium">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              {/* Username or Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold custom-text-primary block">
                  Tên đăng nhập hoặc Email <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="vd: nhanvien1 hoặc email..."
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    disabled={createLoading}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border custom-border custom-bg-primary custom-text-primary text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <p className="text-[11px] custom-text-secondary">
                  Chỉ cần nhập tên đăng nhập (không cần @). Hệ thống tự ghép đuôi <span className="font-mono text-amber-500">@hometeadata.local</span>.
                </p>
              </div>

              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold custom-text-primary block">
                  Họ và tên
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="vd: Nguyễn Văn A"
                    value={createFullName}
                    onChange={(e) => setCreateFullName(e.target.value)}
                    disabled={createLoading}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border custom-border custom-bg-primary custom-text-primary text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              {/* Role Dropdown */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold custom-text-primary block">
                  Vai trò (Phân quyền) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Shield className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value as UserRole)}
                    disabled={createLoading}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border custom-border custom-bg-primary custom-text-primary text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
                  >
                    <option value="admin">Quản trị viên (Admin) - Toàn quyền hệ thống</option>
                    <option value="staff">Nhân viên (Staff) - Xem, thêm, sửa tin của mình, đổi trạng thái</option>
                    <option value="viewer">Người xem (Viewer) - Chỉ xem dữ liệu</option>
                  </select>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-500/5 border border-slate-500/10 text-[11px] leading-relaxed">
                  {createRole === "admin" && (
                    <span className="text-amber-600 dark:text-amber-400 font-medium block">
                      👑 <b>Admin:</b> Toàn quyền xem, thêm, sửa, xóa tất cả tin nhà, đổi trạng thái và quản lý tài khoản.
                    </span>
                  )}
                  {createRole === "staff" && (
                    <span className="text-blue-600 dark:text-blue-400 font-medium block">
                      👤 <b>Nhân viên:</b> Xem tất cả tin, thêm tin mới, sửa tin do chính mình tạo, đổi trạng thái tin; không thể xóa tin và không quản lý tài khoản.
                    </span>
                  )}
                  {createRole === "viewer" && (
                    <span className="text-slate-500 font-medium block">
                      👁️ <b>Người xem:</b> Chỉ được xem danh sách và chi tiết tin nhà; ẩn toàn bộ các nút thêm, sửa, xóa và đổi trạng thái.
                    </span>
                  )}
                </div>
              </div>

              {/* Temporary Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold custom-text-primary block">
                    Mật khẩu tạm thời <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="text-[11px] text-amber-500 hover:text-amber-600 font-semibold cursor-pointer"
                  >
                    Tạo ngẫu nhiên
                  </button>
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showCreatePassword ? "text" : "password"}
                    required
                    minLength={6}
                    placeholder="Tối thiểu 6 ký tự..."
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    disabled={createLoading}
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl border custom-border custom-bg-primary custom-text-primary text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] custom-text-secondary">
                  Tài khoản sẽ được kích hoạt ngay trong Supabase Auth và có thể dùng mật khẩu này để đăng nhập.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t custom-border">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={createLoading}
                  className="px-4 py-2.5 rounded-xl border custom-border text-xs font-semibold custom-text-primary hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-5 py-2.5 rounded-xl custom-accent-bg text-white text-xs font-semibold hover:opacity-95 disabled:opacity-50 cursor-pointer shadow-md shadow-amber-500/15 flex items-center gap-1.5"
                >
                  {createLoading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Tạo tài khoản</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. Modal: CHỈNH SỬA TÀI KHOẢN */}
      {/* ========================================================================= */}
      {isEditOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border custom-border custom-bg-secondary p-6 shadow-2xl space-y-5 relative">
            <div className="flex items-center justify-between pb-3 border-b custom-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center">
                  <Edit2 className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold custom-text-primary">Chỉnh sửa thông tin tài khoản</h3>
              </div>
              <button
                onClick={() => setIsEditOpen(false)}
                className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 custom-text-secondary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-medium">
                {editError}
              </div>
            )}

            <form onSubmit={handleEditUser} className="space-y-4">
              {/* Email / Username (Read-only) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold custom-text-primary block">
                  Tên đăng nhập / Email (Cố định)
                </label>
                <input
                  type="text"
                  disabled
                  value={
                    editingUser.email && (editingUser.email.endsWith("@hometeadata.local") || editingUser.email.endsWith("@nguonnhapk.local"))
                      ? `${editingUser.email.replace(/@(hometeadata|nguonnhapk)\.local$/i, "")} (@hometeadata.local)`
                      : (editingUser.email || "")
                  }
                  className="w-full px-3 py-2.5 rounded-xl border custom-border bg-black/5 dark:bg-white/5 text-slate-400 text-xs sm:text-sm font-mono cursor-not-allowed"
                />
              </div>

              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold custom-text-primary block">
                  Họ và tên
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="Họ và tên người dùng..."
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    disabled={editLoading}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border custom-border custom-bg-primary custom-text-primary text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              {/* Role Dropdown */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold custom-text-primary block">
                  Vai trò (Phân quyền) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Shield className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    disabled={editLoading}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border custom-border custom-bg-primary custom-text-primary text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
                  >
                    <option value="admin">Quản trị viên (Admin) - Toàn quyền hệ thống</option>
                    <option value="staff">Nhân viên (Staff) - Xem, thêm, sửa tin của mình, đổi trạng thái</option>
                    <option value="viewer">Người xem (Viewer) - Chỉ xem dữ liệu</option>
                  </select>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-500/5 border border-slate-500/10 text-[11px] leading-relaxed">
                  {editRole === "admin" && (
                    <span className="text-amber-600 dark:text-amber-400 font-medium block">
                      👑 <b>Admin:</b> Toàn quyền quản trị nội dung tin và người dùng.
                    </span>
                  )}
                  {editRole === "staff" && (
                    <span className="text-blue-600 dark:text-blue-400 font-medium block">
                      👤 <b>Nhân viên:</b> Thêm tin mới, sửa tin của mình, đổi trạng thái tin.
                    </span>
                  )}
                  {editRole === "viewer" && (
                    <span className="text-slate-500 font-medium block">
                      👁️ <b>Người xem:</b> Chỉ có quyền xem tin, ẩn mọi nút thao tác.
                    </span>
                  )}
                </div>
              </div>

              {/* Status Toggle */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold custom-text-primary block">
                  Trạng thái tài khoản
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditStatus("active")}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      editStatus === "active"
                        ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 shadow-xs"
                        : "border custom-border text-slate-500 hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Hoạt động</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditStatus("disabled")}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      editStatus === "disabled"
                        ? "bg-rose-500/15 border-rose-500/50 text-rose-500 shadow-xs"
                        : "border custom-border text-slate-500 hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    <XCircle className="w-4 h-4 text-rose-500" />
                    <span>Vô hiệu hóa</span>
                  </button>
                </div>
                {editStatus === "disabled" && (
                  <p className="text-[11px] text-rose-500">
                    * Tài khoản bị vô hiệu hóa sẽ không thể đăng nhập vào hệ thống quản trị.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t custom-border">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  disabled={editLoading}
                  className="px-4 py-2.5 rounded-xl border custom-border text-xs font-semibold custom-text-primary hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-5 py-2.5 rounded-xl custom-accent-bg text-white text-xs font-semibold hover:opacity-95 disabled:opacity-50 cursor-pointer shadow-md shadow-amber-500/15 flex items-center gap-1.5"
                >
                  {editLoading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Lưu thay đổi</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. Modal: XÁC NHẬN XÓA TÀI KHOẢN */}
      {/* ========================================================================= */}
      {isDeleteOpen && deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border custom-border custom-bg-secondary p-6 shadow-2xl space-y-4 relative">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold custom-text-primary">Xác nhận xóa tài khoản?</h3>
              <p className="text-xs custom-text-secondary">
                Hành động này sẽ xóa hoàn toàn tài khoản{" "}
                <b>
                  {deletingUser.email && (deletingUser.email.endsWith("@hometeadata.local") || deletingUser.email.endsWith("@nguonnhapk.local"))
                    ? deletingUser.email.replace(/@(hometeadata|nguonnhapk)\.local$/i, "")
                    : (deletingUser.email || "")}
                </b>{" "}
                khỏi <b>Supabase Auth</b> và bảng <b>profiles</b>. Người dùng sẽ không thể truy cập lại hệ thống.
              </p>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-medium">
                {deleteError}
              </div>
            )}

            <div className="p-3 rounded-xl bg-black/5 dark:bg-white/5 border custom-border text-xs space-y-1 font-mono">
              <div className="text-slate-500">
                Tài khoản:{" "}
                <span className="custom-text-primary font-semibold">
                  {deletingUser.email && (deletingUser.email.endsWith("@hometeadata.local") || deletingUser.email.endsWith("@nguonnhapk.local"))
                    ? `${deletingUser.email.replace(/@(hometeadata|nguonnhapk)\.local$/i, "")} (@hometeadata.local)`
                    : (deletingUser.email || "")}
                </span>
              </div>
              <div className="text-slate-500">Họ tên: <span className="custom-text-primary">{deletingUser.full_name || "—"}</span></div>
              <div className="text-slate-500">ID: <span className="text-[10px] text-slate-400">{deletingUser.id}</span></div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteOpen(false)}
                disabled={deleteLoading}
                className="w-full py-2.5 rounded-xl border custom-border text-xs font-semibold custom-text-primary hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={deleteLoading}
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer shadow-md shadow-red-500/20 flex items-center justify-center gap-1.5"
              >
                {deleteLoading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Xác nhận xóa</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
