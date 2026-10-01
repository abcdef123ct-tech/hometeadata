export interface ApiCallResult<T = any> {
  ok: boolean;
  status: number;
  url: string;
  method: string;
  contentType: string;
  data: T;
  errorMessage?: string;
}

/**
 * Kiểm tra chặt chẽ `response.ok` và `Content-Type: application/json` trước khi gọi `.json()`.
 * Tuyệt đối không gọi `.json()` nếu phản hồi là HTML (`<!doctype html>`) hoặc không phải JSON.
 */
export async function readJsonResponseSafe<T = any>(
  response: Response,
  requestUrl: string,
  method = "GET"
): Promise<ApiCallResult<T>> {
  const upperMethod = method.toUpperCase();
  const targetUrl = requestUrl || response.url || "/api/unknown";
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const isJson = contentType.includes("application/json");

  if (!isJson) {
    const statusLabel = `HTTP ${response.status}${
      response.statusText ? ` ${response.statusText}` : ""
    }`;
    const errorMessage = `Lỗi phản hồi API (${statusLabel} — ${upperMethod} ${targetUrl}): Định dạng trả về là "${
      contentType || "không xác định"
    }", không phải application/json.`;

    return {
      ok: false,
      status: response.status,
      url: targetUrl,
      method: upperMethod,
      contentType,
      data: {} as T,
      errorMessage,
    };
  }

  let parsedData: any = {};
  try {
    parsedData = await response.json();
  } catch {
    const errorMessage = `Lỗi đọc JSON (${upperMethod} ${targetUrl} — HTTP ${response.status}): Nội dung phản hồi không phải JSON hợp lệ.`;
    return {
      ok: false,
      status: response.status,
      url: targetUrl,
      method: upperMethod,
      contentType,
      data: {} as T,
      errorMessage,
    };
  }

  if (!response.ok) {
    const serverReason =
      parsedData?.error ||
      parsedData?.message ||
      `Yêu cầu thất bại`;
    const errorMessage = `${serverReason} (HTTP ${response.status} — ${upperMethod} ${targetUrl})`;
    return {
      ok: false,
      status: response.status,
      url: targetUrl,
      method: upperMethod,
      contentType,
      data: parsedData as T,
      errorMessage,
    };
  }

  return {
    ok: true,
    status: response.status,
    url: targetUrl,
    method: upperMethod,
    contentType,
    data: parsedData as T,
  };
}

/**
 * Gọi fetch() và kiểm tra `response.ok` + `Content-Type: application/json` trước khi `.json()`.
 */
export async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<ApiCallResult<T>> {
  const method = (options?.method || "GET").toUpperCase();
  const response = await fetch(url, options);
  return readJsonResponseSafe<T>(response, url, method);
}
