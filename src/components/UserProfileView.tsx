import React, { useState, useEffect } from "react";
import { 
  User, 
  Mail, 
  Shield, 
  KeyRound, 
  Home, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Eye, 
  EyeOff, 
  Calendar,
  Building2,
  Phone
} from "lucide-react";
import { AuthUser, Property, TransactionType, PropertyStatus } from "../types";
import PropertyCard from "./PropertyCard";
import { safeFetchJson } from "../utils/apiClient";

interface UserProfileViewProps {
  currentUser: AuthUser | null;
  properties: Property[];
  onBackToProperties: () => void;
  onAddNewProperty: () => void;
  onEditProperty: (property: Property) => void;
  onDeleteProperty: (property: Property) => void;
  onViewProperty: (property: Property) => void;
  onStatusChange: (e: React.MouseEvent, property: Property, status: PropertyStatus) => void;
  onProfileUpdated?: (updatedUser: AuthUser) => void;
}

export default function UserProfileView({
  currentUser,
  properties,
  onBackToProperties,
  onAddNewProperty,
  onEditProperty,
  onDeleteProperty,
  onViewProperty,
  onStatusChange,
  onProfileUpdated,
}: UserProfileViewProps) {
  // Tabs within Profile: 'my_properties' or 'security_profile'
  const [activeSubTab, setActiveSubTab] = useState<"my_properties" | "security">("my_properties");

  // Profile Info state
  const [fullName, setFullName] = useState(currentUser?.full_name || "");
  const [phone, setPhone] = useState(currentUser?.phone || "");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null);

  // Sync state when currentUser prop updates
  useEffect(() => {
    if (currentUser) {
      setFullName(currentUser.full_name || "");
      setPhone(currentUser.phone || "");
    }
  }, [currentUser]);

  // Password Change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState<string | null>(null);
  const [passwordErrorMsg, setPasswordErrorMsg] = useState<string | null>(null);

  // Search & filter state for user's properties
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const currentUserId = currentUser?.id || "";
  const currentUserEmail = currentUser?.email || "";

  // Filter properties belonging to current user
  // (or if admin, can also see all or their own, but here it specifically filters the user's properties)
  const myProperties = properties.filter((prop) => {
    const isOwner = prop.created_by === currentUserId || 
                    prop.created_by === currentUserEmail ||
                    (currentUser?.role === "admin" && (!prop.created_by || prop.created_by === "admin" || prop.created_by === "master-admin"));
    return isOwner;
  });

  // Filtered by search and dropdowns
  const filteredMyProperties = myProperties.filter((prop) => {
    const matchesSearch = 
      prop.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (prop.phone && prop.phone.includes(searchQuery)) ||
      (prop.content && prop.content.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === "all" || prop.status === statusFilter;
    const matchesType = typeFilter === "all" || prop.loai_giao_dich === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  // Handle Update Profile Name & Phone
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccessMsg(null);
    setProfileErrorMsg(null);

    if (!fullName.trim()) {
      setProfileErrorMsg("Vui lòng nhập họ và tên.");
      return;
    }

    setIsUpdatingProfile(true);
    try {
      const token = localStorage.getItem("admin_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await safeFetchJson<{ user?: AuthUser; error?: string }>(
        "/api/user/profile",
        {
          method: "PUT",
          headers,
          credentials: "include",
          body: JSON.stringify({
            full_name: fullName.trim(),
            phone: phone.trim(),
          }),
        }
      );

      if (!res.ok) {
        throw new Error(
          res.errorMessage ||
            `Không thể cập nhật thông tin cá nhân (HTTP ${res.status} — PUT /api/user/profile)`
        );
      }

      setProfileSuccessMsg("Cập nhật thông tin cá nhân thành công!");
      if (onProfileUpdated && res.data.user) {
        onProfileUpdated(res.data.user);
      }
    } catch (err: any) {
      setProfileErrorMsg(err.message || "Lỗi cập nhật thông tin cá nhân.");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // Handle Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSuccessMsg(null);
    setPasswordErrorMsg(null);

    if (newPassword.length < 6) {
      setPasswordErrorMsg("Mật khẩu mới phải có ít nhất 6 ký tự.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordErrorMsg("Mật khẩu xác nhận không khớp.");
      return;
    }

    setIsChangingPassword(true);
    try {
      const token = localStorage.getItem("admin_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await safeFetchJson<{ error?: string }>(
        "/api/user/change-password",
        {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            currentPassword,
            newPassword,
          }),
        }
      );

      if (!res.ok) {
        throw new Error(
          res.errorMessage ||
            `Không thể đổi mật khẩu (HTTP ${res.status} — POST /api/user/change-password)`
        );
      }

      setPasswordSuccessMsg("Đổi mật khẩu thành công! Bạn có thể dùng mật khẩu mới trong lần đăng nhập tiếp theo.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordErrorMsg(err.message || "Lỗi thay đổi mật khẩu.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case "admin":
        return {
          label: "Quản trị viên (Admin)",
          className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
        };
      case "staff":
        return {
          label: "Nhân viên (Staff)",
          className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
        };
      case "viewer":
        return {
          label: "Người xem (Viewer)",
          className: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20",
        };
      default:
        return {
          label: role || "Người dùng",
          className: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20",
        };
    }
  };

  const roleInfo = getRoleBadge(currentUser?.role);

  return (
    <div className="space-y-6 w-full max-w-full pb-16">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl custom-bg-secondary border custom-border shadow-xs">
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 font-bold text-xl sm:text-2xl shadow-inner shrink-0">
            {(currentUser?.full_name || currentUser?.email || "U").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold custom-text-primary truncate">
                {currentUser?.full_name || currentUser?.email}
              </h1>
              <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${roleInfo.className}`}>
                {roleInfo.label}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-slate-500 dark:text-slate-400 font-mono">
              <span>{currentUser?.email}</span>
              {currentUser?.phone && (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded-md">
                  <Phone className="w-3 h-3" />
                  {currentUser.phone}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onBackToProperties}
            className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl border custom-border bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer text-slate-700 dark:text-slate-200"
          >
            ← Về danh sách chung
          </button>
        </div>
      </div>

      {/* Main Tabs: Nguồn nhà của tôi & Thông tin / Đổi mật khẩu */}
      <div className="flex items-center gap-2 border-b custom-border pb-3">
        <button
          onClick={() => setActiveSubTab("my_properties")}
          id="btn-subtab-my-properties"
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            activeSubTab === "my_properties"
              ? "custom-accent-bg text-white shadow-md shadow-amber-500/10"
              : "border custom-border custom-bg-secondary custom-text-secondary hover:custom-text-primary"
          }`}
        >
          <Home className="w-4 h-4" />
          <span>Nguồn nhà của tôi</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
            activeSubTab === "my_properties" ? "bg-white/20 text-white" : "bg-black/5 dark:bg-white/5 text-slate-600 dark:text-slate-300"
          }`}>
            {myProperties.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab("security")}
          id="btn-subtab-security"
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            activeSubTab === "security"
              ? "custom-accent-bg text-white shadow-md shadow-amber-500/10"
              : "border custom-border custom-bg-secondary custom-text-secondary hover:custom-text-primary"
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>Thông tin cá nhân & Đổi mật khẩu</span>
        </button>
      </div>

      {/* SUBTAB 1: NGUỒN NHÀ CỦA TÔI */}
      {activeSubTab === "my_properties" && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl custom-bg-secondary border custom-border">
            <div className="flex-1 flex flex-col sm:flex-row gap-2.5 min-w-0">
              {/* Search */}
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo tên chủ, SĐT, nội dung tin..."
                  className="w-full pl-9 pr-3.5 py-2 text-xs sm:text-sm rounded-xl border custom-border bg-white dark:bg-slate-900/60 custom-text-primary placeholder:text-slate-400 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs sm:text-sm rounded-xl border custom-border bg-white dark:bg-slate-900/60 custom-text-primary focus:outline-none focus:border-amber-500 cursor-pointer shrink-0"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="moi">Nguồn thô</option>
                <option value="dang_lien_he">Đang liên hệ</option>
                <option value="da_chot">Đã chốt</option>
                <option value="da_ky">Đã ký nhận</option>
                <option value="da_ban">Đã bán</option>
              </select>

              {/* Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 text-xs sm:text-sm rounded-xl border custom-border bg-white dark:bg-slate-900/60 custom-text-primary focus:outline-none focus:border-amber-500 cursor-pointer shrink-0"
              >
                <option value="all">Tất cả giao dịch</option>
                <option value="khach_ban">Cần bán</option>
                <option value="khach_mua">Khách mua</option>
                <option value="moi_gioi">Môi giới</option>
              </select>
            </div>

            {/* Add Property Button (if not viewer) */}
            {currentUser?.role !== "viewer" && (
              <button
                onClick={onAddNewProperty}
                id="btn-profile-add-property"
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl custom-accent-bg hover:opacity-95 text-white text-xs sm:text-sm font-semibold transition-all shadow-xs cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Thêm tin nhà mới</span>
              </button>
            )}
          </div>

          {/* Role guidance banner */}
          <div className="text-xs custom-text-secondary px-1 flex items-center justify-between">
            <span>
              Hiển thị <b>{filteredMyProperties.length}</b> / <b>{myProperties.length}</b> căn nhà do bạn tạo hoặc phụ trách.
            </span>
            <span className="text-[11px] text-amber-600 dark:text-amber-400">
              * Bạn có quyền chỉnh sửa & xóa các căn nhà do chính bạn đã thêm vào hệ thống.
            </span>
          </div>

          {/* Properties Grid */}
          {filteredMyProperties.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {filteredMyProperties.map((prop) => (
                <PropertyCard
                  key={prop.id}
                  prop={prop}
                  currentUser={currentUser}
                  onEdit={(e) => {
                    e.stopPropagation();
                    onEditProperty(prop);
                  }}
                  onDelete={(e) => {
                    e.stopPropagation();
                    onDeleteProperty(prop);
                  }}
                  onClick={() => onViewProperty(prop)}
                  onStatusChange={(e, status) => onStatusChange(e, prop, status)}
                />
              ))}
            </div>
          ) : (
            <div className="p-8 sm:p-12 text-center rounded-2xl custom-bg-secondary border custom-border space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <Building2 className="w-7 h-7" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-bold custom-text-primary">
                  {myProperties.length === 0 ? "Bạn chưa có nguồn nhà nào" : "Không tìm thấy căn nhà phù hợp"}
                </h3>
                <p className="text-xs sm:text-sm custom-text-secondary leading-relaxed">
                  {myProperties.length === 0
                    ? "Hãy bấm 'Thêm tin nhà mới' bên trên để tạo và quản lý nguồn nhà riêng của bạn."
                    : "Thử thay đổi bộ lọc trạng thái hoặc từ khóa tìm kiếm."}
                </p>
              </div>
              {myProperties.length === 0 && currentUser?.role !== "viewer" && (
                <button
                  onClick={onAddNewProperty}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl custom-accent-bg text-white text-xs sm:text-sm font-semibold hover:opacity-95 transition-all shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Tạo nguồn nhà đầu tiên</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: THÔNG TIN CÁ NHÂN & ĐỔI MẬT KHẨU */}
      {activeSubTab === "security" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Cập nhật thông tin cá nhân */}
          <div className="p-5 sm:p-6 rounded-2xl custom-bg-secondary border custom-border space-y-5 shadow-xs">
            <div className="flex items-center gap-3 border-b custom-border pb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold custom-text-primary">Thông tin cá nhân</h2>
                <p className="text-xs custom-text-secondary">Cập nhật họ tên hiển thị trong hệ thống</p>
              </div>
            </div>

            {profileSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{profileSuccessMsg}</span>
              </div>
            )}

            {profileErrorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{profileErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold custom-text-secondary mb-1.5">
                  Email đăng nhập
                </label>
                <input
                  type="text"
                  disabled
                  value={currentUser?.email || ""}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border custom-border bg-black/5 dark:bg-white/5 text-slate-400 cursor-not-allowed font-mono"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Email là định danh cố định do quản trị viên cấp.</span>
              </div>

              <div>
                <label className="block text-xs font-semibold custom-text-secondary mb-1.5">
                  Họ và tên hiển thị <span className="text-amber-500">*</span>
                </label>
                <input
                  type="text"
                  id="input-profile-fullname"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nhập họ và tên của bạn..."
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border custom-border bg-white dark:bg-slate-900 custom-text-primary focus:outline-none focus:border-amber-500 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold custom-text-secondary mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-amber-500" />
                  <span>Số điện thoại</span>
                </label>
                <input
                  type="tel"
                  id="input-profile-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ví dụ: 0912 345 678 hoặc 0988..."
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border custom-border bg-white dark:bg-slate-900 custom-text-primary focus:outline-none focus:border-amber-500 transition-colors font-mono"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Số điện thoại để tiện liên lạc trao đổi nguồn nhà nội bộ.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold custom-text-secondary mb-1.5">
                  Vai trò tài khoản
                </label>
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border custom-border bg-black/5 dark:bg-white/5 text-xs font-medium custom-text-secondary">
                  <Shield className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>{roleInfo.label}</span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isUpdatingProfile}
                  id="btn-submit-update-profile"
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl custom-accent-bg text-white text-xs sm:text-sm font-semibold hover:opacity-95 disabled:opacity-50 transition-all shadow-xs cursor-pointer"
                >
                  {isUpdatingProfile ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang lưu thông tin...</span>
                    </>
                  ) : (
                    <span>Lưu thông tin cá nhân</span>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Card 2: Thay đổi mật khẩu */}
          <div className="p-5 sm:p-6 rounded-2xl custom-bg-secondary border custom-border space-y-5 shadow-xs">
            <div className="flex items-center gap-3 border-b custom-border pb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold custom-text-primary">Đổi mật khẩu</h2>
                <p className="text-xs custom-text-secondary">Cập nhật mật khẩu mới an toàn cho tài khoản của bạn</p>
              </div>
            </div>

            {passwordSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{passwordSuccessMsg}</span>
              </div>
            )}

            {passwordErrorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{passwordErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold custom-text-secondary mb-1.5">
                  Mật khẩu hiện tại (Tùy chọn nếu đang đăng nhập)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Nhập mật khẩu hiện tại..."
                    className="w-full pl-3.5 pr-10 py-2.5 text-xs sm:text-sm rounded-xl border custom-border bg-white dark:bg-slate-900 custom-text-primary focus:outline-none focus:border-amber-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold custom-text-secondary mb-1.5">
                  Mật khẩu mới <span className="text-amber-500">*</span>
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự..."
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border custom-border bg-white dark:bg-slate-900 custom-text-primary focus:outline-none focus:border-amber-500 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold custom-text-secondary mb-1.5">
                  Xác nhận mật khẩu mới <span className="text-amber-500">*</span>
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới..."
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border custom-border bg-white dark:bg-slate-900 custom-text-primary focus:outline-none focus:border-amber-500 transition-colors"
                  required
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isChangingPassword}
                  id="btn-submit-change-password"
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl custom-accent-bg text-white text-xs sm:text-sm font-semibold hover:opacity-95 disabled:opacity-50 transition-all shadow-xs cursor-pointer"
                >
                  {isChangingPassword ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang cập nhật mật khẩu...</span>
                    </>
                  ) : (
                    <span>Cập nhật mật khẩu</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
