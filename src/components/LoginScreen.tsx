import React, { useState } from "react";
import { Lock, User, Eye, EyeOff, Sun, Moon, ShieldCheck, Database, Building2 } from "lucide-react";
import { AuthUser } from "../types";
import { safeFetchJson } from "../utils/apiClient";

interface LoginScreenProps {
  onLoginSuccess: (user?: AuthUser, token?: string) => void;
  theme?: "light" | "dark";
  toggleTheme?: () => void;
}

export default function LoginScreen({ 
  onLoginSuccess, 
  theme = "dark", 
  toggleTheme = () => {} 
}: LoginScreenProps) {
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

    const trimmedInput = usernameOrEmail.trim().toLowerCase();
    const effectiveEmail = trimmedInput.includes("@") 
      ? trimmedInput 
      : `${trimmedInput}@hometeadata.local`;

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
        onLoginSuccess(res.data.user, res.data.token);
      } else {
        setError(
          res.errorMessage ||
            `Tên đăng nhập hoặc mật khẩu không chính xác.`
        );
      }
    } catch (err: any) {
      setError(err?.message || "Đã xảy ra lỗi kết nối với máy chủ (POST /api/login).");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-[#0a0d16] text-slate-100 relative overflow-hidden font-sans select-none">
      {/* Visual Ambient Blur Accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-[300px] h-[300px] bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Theme Toggle Button */}
      <button
        type="button"
        onClick={toggleTheme}
        id="btn-login-theme-toggle"
        className="absolute top-6 right-6 p-2.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-all cursor-pointer shadow-lg backdrop-blur-md"
        title={theme === "light" ? "Chuyển sang chế độ Tối" : "Chuyển sang chế độ Sáng"}
      >
        {theme === "light" ? (
          <Moon className="w-4 h-4 text-slate-300" />
        ) : (
          <Sun className="w-4 h-4 text-amber-400" />
        )}
      </button>

      {/* Main Container */}
      <div id="login-container" className="w-full max-w-[400px] p-8 sm:p-9 rounded-3xl bg-slate-900/90 border border-slate-800/90 shadow-2xl backdrop-blur-2xl relative z-10 space-y-7">
        
        {/* LOGO & HEADING - ĐƠN GIẢN TINH TẾ */}
        <div className="flex flex-col items-center text-center">
          {/* Handcrafted Minimalist Logo Badge */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-amber-500/30 flex items-center justify-center shadow-xl shadow-amber-500/10 mb-4 group transition-transform duration-300 hover:scale-[1.03]">
            <svg className="w-9 h-9" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22 62 L50 24 L78 62 H62 V78 H38 V62 Z" stroke="url(#amber-grad)" strokeWidth="6.5" strokeLinejoin="round" fill="none" />
              <circle cx="50" cy="48" r="6" fill="#06B6D4" />
              <path d="M38 62 H62" stroke="#06B6D4" strokeWidth="4" strokeLinecap="round" />
              <defs>
                <linearGradient id="amber-grad" x1="22" y1="24" x2="78" y2="78" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#F59E0B" />
                  <stop offset="1" stopColor="#D97706" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-extrabold tracking-wider uppercase text-slate-100 font-mono">
              HOMETEA<span className="text-amber-400">DATA</span>
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              Hệ thống Quản trị Dữ liệu BĐS
            </p>
          </div>
        </div>

        {/* FORM */}
        <form onSubmit={handleSubmit} className="space-y-4" id="login-form">
          {error && (
            <div id="login-error-msg" className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs font-medium animate-fadeIn text-center">
              {error}
            </div>
          )}

          {/* Username / Email Input */}
          <div className="space-y-1.5">
            <label htmlFor="username-input" className="text-xs font-bold text-slate-300 block">
              Tên đăng nhập
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                <User className="w-4 h-4" />
              </span>
              <input
                id="username-input"
                type="text"
                required
                autoComplete="username"
                placeholder="Tên đăng nhập hoặc Email..."
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                disabled={loading}
                className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500/80 focus:ring-2 focus:ring-amber-500/20 transition-all text-xs font-medium"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Chưa gõ @: Hệ thống ghép tự động miền <span className="font-mono text-slate-400">@hometeadata.local</span>
            </p>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label htmlFor="password-input" className="text-xs font-bold text-slate-300 block">
              Mật khẩu
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
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
                className="w-full pl-10 pr-11 py-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500/80 focus:ring-2 focus:ring-amber-500/20 transition-all text-xs font-medium"
              />
              <button
                type="button"
                id="btn-toggle-password-visibility"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 cursor-pointer transition-colors"
                title={showPassword ? "Ẩn mật khẩu" : "Hiển thị mật khẩu"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            id="btn-submit-login"
            disabled={loading}
            className="w-full mt-3 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-xs tracking-wide uppercase transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Đăng nhập Hometea Data</span>
              </>
            )}
          </button>
        </form>

        {/* FOOTER */}
        <div className="pt-4 border-t border-slate-800/80 text-center space-y-2">
          <div className="flex items-center justify-center gap-3 text-[11px] text-slate-500 font-medium">
            <span className="flex items-center gap-1">
              <Database className="w-3 h-3 text-cyan-400" /> Supabase DB
            </span>
            <span>&middot;</span>
            <span className="flex items-center gap-1">
              <Building2 className="w-3 h-3 text-amber-400" /> Kho Nguồn BĐS
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
