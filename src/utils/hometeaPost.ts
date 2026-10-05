import { safeFetchJson } from "./apiClient";

export interface HometeaPostTarget {
  id?: string;
  ma_tk?: string;
  content?: string;
  image_urls?: string[];
  imageUrls?: string[];
  raw?: {
    id?: string;
    content?: string;
    image_urls?: string[];
  };
}

/**
 * Extracts raw text for Hometea:
 * If "--- MO TA ---" line exists, takes ONLY the text AFTER that line.
 * Otherwise, takes the full cleaned content.
 */
export function extractRawTextForHometea(rawContent?: string): string {
  if (!rawContent) return "";
  let text = rawContent
    .replace(/<!--creator:[\s\S]*?-->/gi, "")
    .replace(/<!--meta:[\s\S]*?-->/gi, "")
    .trim();

  const moTaTag = "--- MO TA ---";
  const moTaIdx = text.indexOf(moTaTag);
  if (moTaIdx !== -1) {
    text = text.substring(moTaIdx + moTaTag.length).trim();
  }
  return text;
}

export interface PostToHometeaOptions {
  item: HometeaPostTarget;
  getAuthHeaders: (includeJson?: boolean) => Record<string, string>;
  onStatusChange?: (msg: string) => void;
  onSuccess?: (hometeaId: string, maTk: string) => void;
  onError?: (err: string) => void;
}

/**
 * Posts property data to Hometea via window.open & postMessage handshake.
 */
export function postToHometea({
  item,
  getAuthHeaders,
  onStatusChange,
  onSuccess,
  onError,
}: PostToHometeaOptions): () => void {
  const maTk = (item.ma_tk || "").trim();
  if (!maTk) {
    onError?.("Không tìm thấy Mã TK của tin này.");
    return () => {};
  }

  // 1. Extract content (text after "--- MO TA ---" if present, else full content)
  const fullContent = item.content || item.raw?.content || "";
  const rawText = extractRawTextForHometea(fullContent);

  // 2. Extract image_urls
  const imageUrls = Array.isArray(item.image_urls)
    ? item.image_urls
    : Array.isArray(item.imageUrls)
    ? item.imageUrls
    : item.raw?.image_urls || [];

  // 3. Open target URL
  const targetOrigin = "https://thanhtrabds.vercel.app";
  const targetUrl = `${targetOrigin}/?nguon=${encodeURIComponent(maTk)}`;

  onStatusChange?.("Đang chờ Hometea...");

  const hometeaWin = window.open(targetUrl, "hometea_admin");

  if (!hometeaWin) {
    onStatusChange?.("");
    onError?.("Trình duyệt đã chặn cửa sổ bật lên (popup). Vui lòng cho phép popup để mở Hometea.");
    return () => {};
  }

  let intervalId: any = null;
  let timeoutId: any = null;
  let isHandshakeComplete = false;

  const cleanup = () => {
    if (intervalId) clearInterval(intervalId);
    if (timeoutId) clearTimeout(timeoutId);
    window.removeEventListener("message", messageHandler);
  };

  // 4. Send postMessage data every 500ms
  const sendNguonData = () => {
    if (!hometeaWin || hometeaWin.closed) {
      cleanup();
      onStatusChange?.("");
      return;
    }
    hometeaWin.postMessage(
      {
        type: "nguon-data",
        ma_tk: maTk,
        raw_text: rawText,
        image_urls: imageUrls,
      },
      targetOrigin
    );
  };

  intervalId = setInterval(sendNguonData, 500);
  sendNguonData();

  // Timeout 60 seconds
  timeoutId = setTimeout(() => {
    cleanup();
    if (!isHandshakeComplete) {
      onStatusChange?.("");
      onError?.("Quá thời gian 60s chờ kết nối với Hometea.");
    }
  }, 60000);

  // 5. Receive messages from Hometea
  const messageHandler = async (event: MessageEvent) => {
    if (event.origin !== targetOrigin) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "nguon-ready") {
      isHandshakeComplete = true;
      onStatusChange?.("Đang chờ Hometea...");
      sendNguonData();
    } else if (data.type === "nguon-saved") {
      const savedMaTk = String(data.ma_tk || "").trim();
      const savedId = String(data.id || "").trim();

      if (savedMaTk && savedMaTk.toUpperCase() === maTk.toUpperCase()) {
        cleanup();
        onStatusChange?.("");

        // Update nguonnha da_len_hometea=true, hometea_id=id ONLY now
        const targetId = item.id || item.raw?.id || "";
        try {
          const res = await safeFetchJson<{ success: boolean }>(
            `/api/properties/${targetId}`,
            {
              method: "PUT",
              headers: getAuthHeaders(true),
              body: JSON.stringify({
                da_len_hometea: true,
                hometea_id: savedId,
                hometea_trang_thai: "cong_khai",
              }),
              credentials: "include",
            }
          );

          if (res.ok) {
            onSuccess?.(savedId, maTk);
          } else {
            onError?.(`Hometea đã lưu (ID: ${savedId}) nhưng gặp lỗi cập nhật hệ thống: ${res.errorMessage}`);
          }
        } catch (err: any) {
          onError?.(`Lỗi lưu cờ Hometea: ${err.message}`);
        }
      }
    }
  };

  window.addEventListener("message", messageHandler);

  return cleanup;
}
