import React, { useState, useEffect } from "react";
import { AlertTriangle, Check, X, ExternalLink, Tag, RefreshCw } from "lucide-react";
import { NormalizedWarehouseProperty } from "../utils/dataWarehouseUtils";

interface SoldConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: { ngay_ban: string | null; ghi_chu_ban: string | null; isRestore: boolean }) => Promise<void>;
  items: NormalizedWarehouseProperty[]; // Items being updated (1 or bulk)
  isRestore?: boolean;
}

export default function SoldConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  items,
  isRestore = false,
}: SoldConfirmModalProps) {
  const [ngayBan, setNgayBan] = useState<string>("");
  const [ghiChuBan, setGhiChuBan] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      // Default to today's date YYYY-MM-DD
      const today = new Date().toISOString().slice(0, 10);
      setNgayBan(today);
      setGhiChuBan("");
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen || items.length === 0) return null;

  const singleItem = items.length === 1 ? items[0] : null;
  const hasHometea = singleItem
    ? Boolean(singleItem.hometea_id || singleItem.da_xuat_hometea)
    : items.some((it) => it.hometea_id || it.da_xuat_hometea);

  const hometeaId = singleItem?.hometea_id || items.find((it) => it.hometea_id)?.hometea_id;
  const hasFacebook = singleItem
    ? Boolean(singleItem.da_xuat_fb)
    : items.some((it) => it.da_xuat_fb);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isRestore) {
        await onConfirm({ ngay_ban: null, ghi_chu_ban: null, isRestore: true });
      } else {
        await onConfirm({
          ngay_ban: ngayBan || new Date().toISOString().slice(0, 10),
          ghi_chu_ban: ghiChuBan.trim() || null,
          isRestore: false,
        });
      }
      onClose();
    } catch (err: any) {
      alert("Lỗi khi cập nhật trạng thái: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5 relative">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
            isRestore ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
          }`}>
            {isRestore ? <RefreshCw className="w-6 h-6" /> : <Tag className="w-6 h-6" />}
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">
              {isRestore
                ? `Khôi phục ${items.length === 1 ? "tin" : `${items.length} tin`} về Đang bán`
                : items.length === 1
                ? `Xác nhận ĐÁNH DẤU ĐÃ BÁN`
                : `Xác nhận ĐÁNH DẤU ĐÃ BÁN (${items.length} tin)`}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {singleItem
                ? `${singleItem.ma_tk || "Mã mới"} — ${singleItem.cleanAddress || singleItem.name}`
                : `Đang chọn ${items.length} bất động sản`}
            </p>
          </div>
        </div>

        {/* Hometea & Facebook Warning Box (Requirement 6) */}
        {!isRestore && (hasHometea || hasFacebook) && (
          <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-xs space-y-2.5">
            {hasHometea && (
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-amber-200 font-semibold leading-relaxed">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Tin này đang có trên Hometea {hometeaId ? `(ID ${hometeaId})` : ""}. Đánh dấu ở đây <b>KHÔNG tự ẩn tin trên Hometea</b>.
                  </span>
                </div>
                {hometeaId && (
                  <a
                    href={`https://thanhtrabds.vercel.app/bat-dong-san/${hometeaId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors shadow-sm cursor-pointer"
                  >
                    <span>Mở tin trên Hometea</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            )}

            {hasFacebook && (
              <div className="text-rose-300 font-medium text-[11px] pt-2 border-t border-amber-500/20">
                📌 Bài Facebook không tự gỡ, hãy xóa/sửa thủ công.
              </div>
            )}
          </div>
        )}

        {/* Form inputs */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isRestore ? (
            <>
              {/* Ô ngày bán */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-200 block">
                  Ngày bán <span className="text-rose-400">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={ngayBan}
                  onChange={(e) => setNgayBan(e.target.value)}
                  disabled={loading}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs font-medium focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Ô ghi chú */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-200 block">
                  Ghi chú bán <span className="text-slate-500 font-normal">(tùy chọn)</span>
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Bán qua đồng nghiệp, bán chính chủ..."
                  value={ghiChuBan}
                  onChange={(e) => setGhiChuBan(e.target.value)}
                  disabled={loading}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-600 text-xs font-medium focus:border-amber-500 focus:outline-none"
                />
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
              Bạn có chắc chắn muốn khôi phục {items.length === 1 ? "tin này" : `${items.length} tin này`} về danh sách <b>Đang bán</b>? Ngày bán và ghi chú bán sẽ được xóa.
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-5 py-2.5 rounded-xl text-slate-950 font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-lg disabled:opacity-50 ${
                isRestore
                  ? "bg-amber-500 hover:bg-amber-400 shadow-amber-500/20"
                  : "bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20"
              }`}
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{isRestore ? "Xác nhận Khôi phục" : "Xác nhận Đã bán"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
