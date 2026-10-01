import React from "react";
import {
  Database,
  Plus,
  LogOut,
  Users,
  UserCircle,
  Settings,
  FolderUp,
  ShieldAlert,
  History,
} from "lucide-react";
import { AuthUser } from "../types";

export type ActiveTabType =
  | "properties"
  | "data_quality"
  | "export_logs"
  | "users"
  | "system"
  | "profile";

interface NavbarProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onAddNew: () => void;
  onOpenBulkImport?: () => void;
  onLogout: () => void;
  currentUser: AuthUser | null;
  activeTab: ActiveTabType;
  onChangeTab: (tab: ActiveTabType) => void;
  totalCount?: number;
  qualityIssuesCount?: number;
  exportLogsCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  onAddNew,
  onOpenBulkImport,
  onLogout,
  currentUser,
  activeTab,
  onChangeTab,
  totalCount = 0,
  qualityIssuesCount = 0,
  exportLogsCount = 0,
}) => {
  const isAdmin = currentUser?.role === "admin";
  const isViewer = currentUser?.role === "viewer";

  const roleBadge = {
    admin: {
      label: "Admin",
      color: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    },
    staff: {
      label: "Nhân viên",
      color: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    },
    viewer: {
      label: "Người xem",
      color: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    },
  }[currentUser?.role || "admin"];

  return (
    <>
      <header
        id="main-navbar"
        className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md transition-colors duration-200 w-full"
      >
        <div className="max-w-[1440px] mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 min-w-0">
          {/* Brand Logo + Warehouse Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              onClick={() => onChangeTab("properties")}
              className="flex items-center gap-2.5 cursor-pointer min-w-0"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 shadow-sm shrink-0">
                <Database className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="font-extrabold text-xs sm:text-sm tracking-tight text-slate-100 leading-none truncate">
                    NGUONNHA · KHO DỮ LIỆU CHUẨN
                  </h1>
                  <span className="hidden md:inline-flex px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono font-bold text-amber-400">
                    {totalCount} tin
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-medium block mt-0.5 truncate">
                  Chuẩn hóa xuất Hometea &amp; Post Writer
                </span>
              </div>
            </div>

            {/* Navigation Tabs (Desktop) */}
            <nav className="hidden lg:flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 ml-2">
              <button
                onClick={() => onChangeTab("properties")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "properties"
                    ? "bg-amber-500 text-slate-950 shadow-xs"
                    : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>Bảng Kho Chuẩn</span>
              </button>

              <button
                onClick={() => onChangeTab("data_quality")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "data_quality"
                    ? "bg-amber-500 text-slate-950 shadow-xs"
                    : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                <span>Chất lượng dữ liệu</span>
                {qualityIssuesCount > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-extrabold ${
                      activeTab === "data_quality"
                        ? "bg-slate-950 text-amber-400"
                        : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                    }`}
                  >
                    {qualityIssuesCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => onChangeTab("export_logs")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "export_logs"
                    ? "bg-amber-500 text-slate-950 shadow-xs"
                    : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <History className="w-3.5 h-3.5 text-cyan-400" />
                <span>Nhật ký xuất &amp; VIEW</span>
                {exportLogsCount > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      activeTab === "export_logs"
                        ? "bg-slate-950 text-amber-400"
                        : "bg-cyan-500/20 text-cyan-300"
                    }`}
                  >
                    {exportLogsCount}
                  </span>
                )}
              </button>

              {isAdmin && (
                <>
                  <button
                    onClick={() => onChangeTab("users")}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      activeTab === "users"
                        ? "bg-amber-500 text-slate-950 shadow-xs"
                        : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Tài khoản</span>
                  </button>

                  <button
                    onClick={() => onChangeTab("system")}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      activeTab === "system"
                        ? "bg-amber-500 text-slate-950 shadow-xs"
                        : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Hệ thống</span>
                  </button>
                </>
              )}
            </nav>
          </div>

          {/* Right Controls: Nhập từ thư mục + Thêm mới + User */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {currentUser && (
              <button
                onClick={() => onChangeTab("profile")}
                title="Bấm để quản lý thông tin cá nhân & đổi mật khẩu"
                className="hidden xl:flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 transition-all cursor-pointer"
              >
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-200 leading-none truncate max-w-[120px]">
                    {currentUser.full_name || currentUser.email.split("@")[0]}
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md border uppercase tracking-wider ${roleBadge.color}`}
                >
                  {roleBadge.label}
                </span>
              </button>
            )}

            {/* Nút Nhập từ thư mục (Giữ nguyên theo yêu cầu) */}
            {!isViewer && onOpenBulkImport && (
              <button
                onClick={onOpenBulkImport}
                id="btn-bulk-folder-import"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35 font-bold text-xs transition-all cursor-pointer shrink-0"
                title="Nhập hàng loạt thư mục nguồn nhà từ máy tính"
              >
                <FolderUp className="w-4 h-4 stroke-[2.2]" />
                <span className="hidden sm:inline">Nhập từ thư mục</span>
              </button>
            )}

            {/* Nút Thêm mới */}
            {!isViewer && (
              <button
                onClick={onAddNew}
                id="btn-add-property"
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-sm transition-all cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Thêm nguồn</span>
              </button>
            )}

            <button
              onClick={onLogout}
              id="btn-logout"
              className="flex items-center gap-1.5 p-2 rounded-xl border border-slate-800 bg-slate-900 hover:bg-rose-500/15 hover:text-rose-400 hover:border-rose-500/30 transition-all cursor-pointer text-slate-300"
              title="Đăng xuất khỏi hệ thống"
            >
              <LogOut className="w-4 h-4 stroke-[2]" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        id="mobile-bottom-nav"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 px-1 py-1.5 flex items-center justify-around shadow-lg"
      >
        <button
          onClick={() => onChangeTab("properties")}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
            activeTab === "properties" ? "text-amber-400" : "text-slate-400"
          }`}
        >
          <Database className="w-4 h-4 mb-0.5" />
          <span>Kho Chuẩn</span>
        </button>

        <button
          onClick={() => onChangeTab("data_quality")}
          className={`relative flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
            activeTab === "data_quality" ? "text-amber-400" : "text-slate-400"
          }`}
        >
          <ShieldAlert className="w-4 h-4 mb-0.5" />
          <span>Chất lượng</span>
          {qualityIssuesCount > 0 && (
            <span className="absolute top-0 right-1 px-1 rounded-full bg-rose-500 text-white text-[8px] font-mono">
              {qualityIssuesCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onChangeTab("export_logs")}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
            activeTab === "export_logs" ? "text-amber-400" : "text-slate-400"
          }`}
        >
          <History className="w-4 h-4 mb-0.5" />
          <span>Nhật ký xuất</span>
        </button>

        {isAdmin && (
          <button
            onClick={() => onChangeTab("system")}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
              activeTab === "system" ? "text-amber-400" : "text-slate-400"
            }`}
          >
            <Settings className="w-4 h-4 mb-0.5" />
            <span>Hệ thống</span>
          </button>
        )}

        <button
          onClick={() => onChangeTab("profile")}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
            activeTab === "profile" ? "text-amber-400" : "text-slate-400"
          }`}
        >
          <UserCircle className="w-4 h-4 mb-0.5" />
          <span>Cá nhân</span>
        </button>
      </nav>
    </>
  );
};
