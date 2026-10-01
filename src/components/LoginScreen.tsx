import React, { useState } from "react";
import { Lock, Mail, User, Eye, EyeOff, Sun, Moon, Sparkles, ShieldCheck } from "lucide-react";
import appLogo from "../assets/images/app_logo_1784536894341.jpg";
import { AuthUser } from "../types";
import { safeFetchJson } from "../utils/apiClient";

interface LoginScreenProps {
  onLoginSuccess: (user?: AuthUser) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
}

export default function LoginScreen({ onLoginSuccess, theme, toggleTheme }: LoginScreenProps) {
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameOrEmail.trim()) {
      setError("Vui lòng nhập tên đăng nhập hoặc email");
      return;
    }
    if (!password.trim()) {
      setError("Vui lòng nhập mật khẩu");
      return;
    }

    setLoading(true);
    setError(null);

    // If no @ is provided, automatically append the internal domain
    const trimmedInput = usernameOrEmail.trim().toLowerCase();
    const effectiveEmail = trimmedInput.includes("@") 
      ? trimmedInput 
      : `${trimmedInput}@nguonnhapk.local`;

    try {
      const res = await safeFetchJson<{
        success?: boolean;
        token?: string;
        user?: AuthUser;
        error?: string;
      }>("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: trimmedInput,
          email: effectiveEmail,
          password,
        }),
      });

      if (res.ok && res.data.success) {
        if (res.data.token) {
          localStorage.setItem("admin_token", res.data.token);
        }
        onLoginSuccess(res.data.user);
      } else {
        setError(
          res.errorMessage ||
            `Tên đăng nhập hoặc mật khẩu không chính xác (HTTP ${res.status} — POST /api/login)`
        );
      }
    } catch (err: any) {
      setError(err?.message || "Đã xảy ra lỗi kết nối với máy chủ (POST /api/login).");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-height-screen flex flex-col justify-center items-center p-4 custom-bg-primary transition-all duration-300 relative overflow-hidden" style={{ minHeight: "100vh" }}>
      {/* Decorative ambient background elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[350px] h-[350px] rounded-full blur-3xl opacity-20 custom-accent-bg"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[350px] h-[350px] rounded-full blur-3xl opacity-10 bg-blue-500"></div>

      {/* Theme Toggle Button */}
      <button
        onClick={toggleTheme}
        id="btn-login-theme-toggle"
        className="absolute top-6 right-6 p-2.5 rounded-full border custom-border custom-bg-secondary hover:opacity-80 transition-all duration-200 cursor-pointer shadow-sm"
        title={theme === "light" ? "Chuyển sang tối" : "Chuyển sang sáng"}
      >
        {theme === "light" ? (
          <Moon className="w-5 h-5 text-slate-700" />
        ) : (
          <Sun className="w-5 h-5 text-amber-400" />
        )}
      </button>

      {/* Main Container */}
      <div id="login-container" className="w-full max-w-md p-8 rounded-2xl border custom-border custom-bg-secondary shadow-xl relative z-10">
        <div className="flex flex-col items-center mb-7">
          <div className="w-16 h-16 rounded-2xl overflow-hidden mb-4 shadow-lg shadow-amber-500/10 border border-slate-200 dark:border-slate-800 bg-white flex items-center justify-center transition-all hover:scale-[1.03]">
            <img 
              src={appLogo} 
              alt="nguonnhapk Logo" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <h1 className="text-2xl font-bold custom-text-primary tracking-tight text-center">
            Hệ Thống Quản Trị
          </h1>
          <p className="text-sm custom-text-secondary mt-1 text-center">
            Đăng nhập tài khoản quản trị viên
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" id="login-form">
          {error && (
            <div id="login-error-msg" className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-sm font-medium">
              {error}
            </div>
          )}

          {/* Username / Email Input */}
          <div className="space-y-1.5">
            <label htmlFor="username-input" className="text-sm font-semibold custom-text-primary block">
              Tên đăng nhập hoặc Email
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <User className="w-4 h-4" />
              </span>
              <input
                id="username-input"
                type="text"
                required
                autoComplete="username"
                placeholder="vd: nhanvien1 hoặc email..."
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                disabled={loading}
                className="w-full pl-10 pr-4 py-3 rounded-xl border custom-border custom-bg-primary custom-text-primary focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all text-sm"
              />
            </div>
            <p className="text-[11px] custom-text-secondary">
              Có thể nhập tên đăng nhập (không cần @) hoặc email đầy đủ.
            </p>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label htmlFor="password-input" className="text-sm font-semibold custom-text-primary block">
              Mật khẩu
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <Lock className="w-4 h-4" />
              </span>
              <input
                id="password-input"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder="Nhập mật khẩu..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full pl-10 pr-11 py-3 rounded-xl border custom-border custom-bg-primary custom-text-primary focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all text-sm"
              />
              <button
                type="button"
                id="btn-toggle-password-visibility"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:opacity-80 custom-text-secondary cursor-pointer"
                title={showPassword ? "Ẩn mật khẩu" : "Hiển thị mật khẩu"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            id="btn-submit-login"
            disabled={loading}
            className="w-full mt-2 py-3.5 px-4 rounded-xl custom-accent-bg hover:opacity-95 text-white font-semibold transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-amber-500/15 disabled:opacity-50"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Đăng nhập hệ thống</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-7 pt-5 border-t custom-border text-center space-y-2">
          <p className="text-[11px] custom-text-secondary font-mono">
            Xác thực an toàn qua Supabase Auth &middot; RBAC Profiles
          </p>
          <div>
            <a
              href="https://thanhtrabds.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-amber-500 hover:text-amber-400 font-medium hover:underline transition-colors"
            >
              <span>Truy cập website Thanh Trà BĐS</span>
              <span className="text-[10px]">↗</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
