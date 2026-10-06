import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  X,
  FolderUp,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  Image as ImageIcon,
  Star,
  Eye,
  EyeOff,
  Play,
  Square,
  RotateCcw,
  Download,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Database,
  Check,
  Trash2,
  FileText,
  Sparkles,
  ShieldAlert,
  MapPin,
  Clock,
} from "lucide-react";
import {
  BulkPropertyItem,
  BulkImageItem,
  BulkRowPreviewStatus,
  parseFolderName,
  parseAreaNumbers,
  parsePropertyTxtFile,
  parsePriceToVnd,
  formatVndToReadable,
  inspectImageMetadata,
  evaluateRowStatus,
  compressImageForBulkUpload,
  resolveRealMaTk,
  isValidRealMaTk,
  isNhaPhoLoaiHinh,
} from "../utils/bulkFolderParser";
import { safeFetchJson } from "../utils/apiClient";
import {
  BulkQueueLogEntry,
  BulkFailedRecord,
  BulkImportPersistedSession,
  saveBulkSessionToIndexedDB,
  loadBulkSessionFromIndexedDB,
  clearBulkSessionInIndexedDB,
} from "../utils/indexedDbQueue";
import { AuthUser, SourceStatusType, DISTRICT_OPTIONS } from "../types";

interface BulkFolderImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
  cloudinaryConfig?: { cloudName: string; uploadPreset: string };
  currentUser?: AuthUser | null;
}

const IMAGE_CONCURRENCY = 4; // Tối đa 3-4 ảnh chạy song song
const BATCH_SIZE = 25; // Mỗi lô 20-30 nguồn
const MAX_IMAGE_RETRIES = 3; // Thử lại 2-3 lần khi ảnh lỗi

export default function BulkFolderImportModal({
  isOpen,
  onClose,
  onImportSuccess,
  cloudinaryConfig,
  currentUser,
}: BulkFolderImportModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [parentFolderName, setParentFolderName] = useState<string>("");
  const [batchPhuong, setBatchPhuong] = useState<string>("");
  const [scanning, setScanning] = useState<boolean>(false);
  const [scanProgressText, setScanProgressText] = useState<string>("");
  const [isDraggingFolder, setIsDraggingFolder] = useState<boolean>(false);

  // Parsed items for Preview & Upload
  const [items, setItems] = useState<BulkPropertyItem[]>([]);

  // Step 2 Filters & Options
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | BulkRowPreviewStatus | "can_xem_lai">(
    "all"
  );
  const [updateExisting, setUpdateExisting] = useState<boolean>(false);
  const [activeImageModalItemId, setActiveImageModalItemId] = useState<string | null>(null);
  const [activeRawTxtItemId, setActiveRawTxtItemId] = useState<string | null>(null);

  // Step 3 Queue states
  const [isRunningQueue, setIsRunningQueue] = useState<boolean>(false);
  const [isStopped, setIsStopped] = useState<boolean>(false);
  const stopSignalRef = useRef<boolean>(false);

  const [currentBatchIndex, setCurrentBatchIndex] = useState<number>(0);
  const [totalBatches, setTotalBatches] = useState<number>(0);
  const [importedCount, setImportedCount] = useState<number>(0);
  const [failedCount, setFailedCount] = useState<number>(0);
  const [skippedCount, setSkippedCount] = useState<number>(0);
  const [totalTargetCount, setTotalTargetCount] = useState<number>(0);

  const [logs, setLogs] = useState<BulkQueueLogEntry[]>([]);
  const [failedRecords, setFailedRecords] = useState<BulkFailedRecord[]>([]);
  const [persistedSession, setPersistedSession] = useState<BulkImportPersistedSession | null>(null);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const appendFolderInputRef = useRef<HTMLInputElement>(null);

  // Load any saved IndexedDB session when modal opens
  useEffect(() => {
    if (isOpen) {
      loadBulkSessionFromIndexedDB().then((sess) => {
        if (sess && (sess.completedMaTks.length > 0 || sess.failedRecords.length > 0)) {
          setPersistedSession(sess);
        } else {
          setPersistedSession(null);
        }
      });
    }
  }, [isOpen]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      items.forEach((item) => {
        item.images.forEach((img) => {
          if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
        });
      });
    };
  }, []);

  // Filtered items in Step 2
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return items.filter((item) => {
      if (statusFilter === "can_xem_lai") {
        if (!item.needsReview && !item.needsLightCheck) return false;
      } else if (statusFilter !== "all" && item.previewStatus !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.ma_tk.toLowerCase().includes(q) ||
        item.dia_chi.toLowerCase().includes(q) ||
        item.duong.toLowerCase().includes(q) ||
        item.so_nha.toLowerCase().includes(q) ||
        item.phuong.toLowerCase().includes(q) ||
        item.ten_thu_muc_goc.toLowerCase().includes(q)
      );
    });
  }, [items, searchQuery, statusFilter]);

  const counts = useMemo(() => {
    return {
      total: items.length,
      selected: items.filter((i) => i.selected).length,
      moi: items.filter((i) => i.previewStatus === "moi").length,
      da_co: items.filter((i) => i.previewStatus === "da_co").length,
      thieu_thong_tin: items.filter((i) => i.previewStatus === "thieu_thong_tin").length,
      loi_doc: items.filter((i) => i.previewStatus === "loi_doc").length,
      can_xem_lai: items.filter((i) => i.needsReview || i.needsLightCheck).length,
    };
  }, [items]);

  if (!isOpen) return null;

  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem("admin_token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  };

  const addLog = (
    ma_tk: string,
    status: BulkQueueLogEntry["status"],
    message: string,
    folderName?: string
  ) => {
    const now = new Date();
    const time = now.toTimeString().split(" ")[0];
    const entry: BulkQueueLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      time,
      ma_tk,
      folderName,
      status,
      message,
    };
    setLogs((prev) => [entry, ...prev]);
    return entry;
  };

  /**
   * Apply batch-level `phuong` (khu vực chọn khi nhập lô) to all items in the preview list
   */
  const handleApplyBatchPhuong = (newPhuong: string) => {
    setBatchPhuong(newPhuong);
    const trimmed = newPhuong.trim();
    setItems((prev) =>
      prev.map((item) => {
        const updated: BulkPropertyItem = {
          ...item,
          phuong: trimmed,
        };
        const evalRes = evaluateRowStatus(updated, false);
        updated.previewStatus = evalRes.previewStatus;
        updated.trang_thai_nguon = evalRes.trang_thai_nguon;
        updated.trang_thai_xu_ly = evalRes.trang_thai_xu_ly;
        updated.statusNote = evalRes.statusNote;
        return updated;
      })
    );
  };

  /**
   * Check if incoming .txt `ngay_lay` is newer than stored record's `_stored_ngay_lay`
   */
  const evaluateExistingUpdateEligibility = (
    item: BulkPropertyItem
  ): {
    canUpdateByDate: boolean;
    dateComparisonNote: string;
  } => {
    if (!item.existingRecord) {
      return { canUpdateByDate: true, dateComparisonNote: "" };
    }
    const storedIso: string | null = item.existingRecord._stored_ngay_lay || null;
    const storedRaw: string =
      item.existingRecord._stored_ngay_lay_raw ||
      (storedIso ? new Date(storedIso).toLocaleDateString("vi-VN") : "");
    const incomingIso: string | null = item.ngay_lay || null;
    const incomingRaw: string =
      item.ngay_lay_raw ||
      (incomingIso ? new Date(incomingIso).toLocaleDateString("vi-VN") : "");

    if (storedIso && incomingIso) {
      const inMs = new Date(incomingIso).getTime();
      const stMs = new Date(storedIso).getTime();
      if (inMs > stMs) {
        return {
          canUpdateByDate: true,
          dateComparisonNote: `Ngày lấy .txt (${incomingRaw}) mới hơn bản lưu (${storedRaw}) -> Cho phép cập nhật phần thô`,
        };
      }
      return {
        canUpdateByDate: false,
        dateComparisonNote: `Ngày lấy .txt (${incomingRaw}) không mới hơn bản lưu (${storedRaw}) -> Giữ nguyên bản đang lưu`,
      };
    }

    if (storedIso && !incomingIso) {
      return {
        canUpdateByDate: false,
        dateComparisonNote: `Bản lưu có Ngày lấy (${storedRaw}), .txt không có Ngày lấy -> Giữ nguyên`,
      };
    }

    if (!storedIso && incomingIso) {
      return {
        canUpdateByDate: true,
        dateComparisonNote: `Ngày lấy .txt: ${incomingRaw} (Bản lưu chưa có ngày lấy)`,
      };
    }

    return {
      canUpdateByDate: true,
      dateComparisonNote: "Chỉ cập nhật phần thô & trường chưa chỉnh tay",
    };
  };

  /**
   * Group files by first-level subfolder and run Phase 1 browser scan
   */
  const processSelectedFiles = async (
    fileList: Array<{ file: File; relativePath: string }>,
    append = false
  ) => {
    if (!fileList || fileList.length === 0) return;

    setScanning(true);
    setScanProgressText("Đang gom nhóm các thư mục con...");

    try {
      if (!append) {
        // Release old object URLs if starting fresh
        items.forEach((item) =>
          item.images.forEach((img) => {
            if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
          })
        );
      }

      const folderGroups = new Map<
        string,
        { parentName: string; subFolderName: string; files: File[] }
      >();
      const detectedParentsSet = new Set<string>();

      for (const entry of fileList) {
        const cleanPath = entry.relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
        const parts = cleanPath.split("/").filter(Boolean);
        if (parts.length === 0) continue;

        let subFolderName = "";
        let parentName = "";

        if (parts.length >= 2) {
          // File is inside at least 1 folder
          // parts[parts.length - 1] is the file name
          // parts[parts.length - 2] is the immediate property subfolder name
          subFolderName = parts[parts.length - 2];

          if (parts.length >= 3) {
            // There are parent folder(s) above the property subfolder
            const parentParts = parts.slice(0, parts.length - 2);
            parentName = parentParts.join(" / ");
            // Use immediate parent folder as area/phuong candidate
            const immediateParent = parentParts[parentParts.length - 1];
            if (immediateParent) detectedParentsSet.add(immediateParent);
          }
        } else {
          // Loose file without directory structure (parts.length === 1)
          const fileName = parts[0];
          const tkMatch = fileName.match(/\b(TK[A-Za-z0-9_-]{4,15})\b/i);
          if (tkMatch) {
            subFolderName = tkMatch[1].toUpperCase();
          } else {
            const baseWithoutExt = fileName.replace(/\.[^/.]+$/, "");
            subFolderName = baseWithoutExt || "Tep_Le";
          }
          parentName = "";
        }

        const groupKey = parentName ? `${parentName}/${subFolderName}` : subFolderName;

        if (!folderGroups.has(groupKey)) {
          folderGroups.set(groupKey, { parentName, subFolderName, files: [] });
        }
        folderGroups.get(groupKey)!.files.push(entry.file);
      }

      if (folderGroups.size === 0 && fileList.length > 0) {
        const firstPath = fileList[0].relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
        const rootName = firstPath.split("/")[0] || "Thu_Muc_Nguon";
        folderGroups.set(rootName, {
          parentName: "",
          subFolderName: rootName,
          files: fileList.map((f) => f.file),
        });
      }

      const parentsArr = Array.from(detectedParentsSet);
      let detectedParentDisplayName = "";
      if (parentsArr.length === 1) {
        detectedParentDisplayName = parentsArr[0];
      } else if (parentsArr.length > 1) {
        detectedParentDisplayName = `Nhiều khu vực (${parentsArr.slice(0, 3).join(", ")}${parentsArr.length > 3 ? "..." : ""})`;
      }

      const defaultBatchArea = batchPhuong.trim() || parentsArr[0] || "";
      if (!append || !parentFolderName) {
        setParentFolderName(detectedParentDisplayName || "Thư mục đã chọn");
      }
      if (!batchPhuong.trim() && parentsArr.length > 0) {
        setBatchPhuong(parentsArr[0]);
      }

      const folderEntries = Array.from(folderGroups.entries());
      const parsedItems: BulkPropertyItem[] = [];
      const usedCodesInBatch = new Set<string>();

      if (append) {
        items.forEach((it) => {
          if (it.ma_tk) usedCodesInBatch.add(it.ma_tk.toUpperCase());
        });
      }

      for (let i = 0; i < folderEntries.length; i++) {
        const [groupKey, group] = folderEntries[i];
        const subFolderName = group.subFolderName;
        setScanProgressText(
          `Đang phân tích (${i + 1}/${folderEntries.length}): ${subFolderName.substring(0, 45)}...`
        );

        // 1. Parse folder name (strips numeric prefixes, locks street numbers, parses dual area & Nhà phố floors)
        const folderMeta = parseFolderName(
          subFolderName,
          defaultBatchArea || group.parentName
        );

        // 2. Find .txt file and image files
        const txtFile = group.files.find((f) => f.name.toLowerCase().endsWith(".txt"));
        const imageFiles = group.files.filter((f) =>
          /\.(jpg|jpeg|png|webp)$/i.test(f.name)
        );

        imageFiles.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
        );

        let txtMeta = {
          ma_tk_txt: "",
          ngay_lay: null as string | null,
          ngay_lay_raw: "",
          moi_gioi_nguon: "",
          sdt_nguon: "",
          gia_txt: null as number | null,
          gia_txt_display: "",
          hoa_hong: "3%",
          toa_do: "",
          link_thien_khoi: "",
          link_ban_do: "",
          trang_thai_nguon: "đã bổ sung" as SourceStatusType,
          phuong_txt: "",
          mo_ta_tho: "",
          blockMoTa: "",
        };

        let txtReadError = false;
        if (txtFile) {
          try {
            const rawText = await txtFile.text();
            txtMeta = parsePropertyTxtFile(rawText);
          } catch (e) {
            txtReadError = true;
          }
        }

        // 3. Requirement 1: Resolve primary key `ma_tk` strictly:
        // (a) Real TK code at start of folder name
        // (b) "Mã nguồn hàng: TKxxxxxx" in .txt
        // (c) Deterministic "NT-xxxxxx"
        // NEVER uses numeric prefix of folder name!
        const { ma_tk: effectiveMaTk, ma_tk_source } = resolveRealMaTk(
          folderMeta.ma_tk,
          txtMeta.ma_tk_txt,
          subFolderName,
          usedCodesInBatch
        );

        // 4. Inspect images in parallel
        const inspectedImages: BulkImageItem[] = await Promise.all(
          imageFiles.map(async (imgFile, idx) => {
            const meta = await inspectImageMetadata(imgFile);
            return {
              id: `img-${i}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
              file: imgFile,
              fileName: imgFile.name,
              previewUrl: meta.previewUrl,
              width: meta.width,
              height: meta.height,
              selected: !meta.autoExcluded,
              isAvatar: false,
              autoExcluded: meta.autoExcluded,
              excludeReason: meta.excludeReason,
            };
          })
        );

        const firstSelectedIdx = inspectedImages.findIndex((img) => img.selected);
        if (firstSelectedIdx !== -1) {
          inspectedImages[firstSelectedIdx].isAvatar = true;
        } else if (inspectedImages.length > 0) {
          inspectedImages[0].isAvatar = true;
        }

        const effectiveGia = folderMeta.gia || txtMeta.gia_txt || null;
        const effectiveGiaText =
          folderMeta.gia_text ||
          txtMeta.gia_txt_display ||
          (effectiveGia ? formatVndToReadable(effectiveGia) : "");

        // Requirement 4: phuong lấy theo khu vực chọn khi nhập lô (ưu tiên batchPhuong / thư mục cha khu vực)
        const effectivePhuong =
          defaultBatchArea || group.parentName || txtMeta.phuong_txt || folderMeta.phuong || "";

        const effectiveLoaiHinh = folderMeta.loai_hinh || "Nhà phố";
        // Requirement 4: Số tầng chỉ khi loại hình là nhà phố
        const effectiveSoTang = isNhaPhoLoaiHinh(effectiveLoaiHinh) ? folderMeta.so_tang : "";
        const effectiveDiaChi =
          folderMeta.dia_chi ||
          [folderMeta.so_nha, folderMeta.duong].filter(Boolean).join(" ").trim();

        const baseItem: BulkPropertyItem = {
          id: `bulk-row-${i}-${effectiveMaTk}`,
          selected: true,
          ten_thu_muc_goc: subFolderName,
          parent_folder_name: group.parentName,
          ma_tk: effectiveMaTk,
          ma_tk_source,
          so_nha: folderMeta.so_nha,
          duong: folderMeta.duong,
          dia_chi: effectiveDiaChi,
          phuong: effectivePhuong,
          dien_tich: folderMeta.dien_tich,
          dien_tich_so: folderMeta.dien_tich_so,
          dien_tich_thuc_te: folderMeta.dien_tich_thuc_te,
          so_tang: effectiveSoTang,
          rong: folderMeta.rong,
          dai: folderMeta.dai,
          gia: effectiveGia,
          gia_text: effectiveGiaText,
          loai_hinh: effectiveLoaiHinh,
          trang_thai_nguon: txtMeta.trang_thai_nguon || "đã bổ sung",
          trang_thai_xu_ly: "tho",
          mo_ta_tho: txtMeta.mo_ta_tho,
          moi_gioi_nguon: txtMeta.moi_gioi_nguon,
          sdt_nguon: txtMeta.sdt_nguon,
          hoa_hong: txtMeta.hoa_hong || "3%",
          toa_do: txtMeta.toa_do,
          link_thien_khoi: txtMeta.link_thien_khoi || "",
          link_ban_do: txtMeta.link_ban_do || "",
          ngay_lay: txtMeta.ngay_lay,
          ngay_lay_raw: txtMeta.ngay_lay_raw,
          images: inspectedImages,
          txtFileName: txtFile?.name,
          previewStatus: "moi",
          existingRecord: null,
          queueState: "idle",
        };

        const evalRes = evaluateRowStatus(baseItem, txtReadError);
        baseItem.previewStatus = evalRes.previewStatus;
        baseItem.trang_thai_nguon = evalRes.trang_thai_nguon;
        baseItem.trang_thai_xu_ly = evalRes.trang_thai_xu_ly;
        baseItem.statusNote = evalRes.statusNote;
        baseItem.needsReview = evalRes.needsReview;
        baseItem.needsLightCheck = evalRes.needsLightCheck;
        baseItem.reviewNote = evalRes.reviewNote;
        baseItem.lightCheckNote = evalRes.lightCheckNote;
        baseItem.calcArea = evalRes.calcArea;
        baseItem.deviationPercent = evalRes.deviationPercent;

        if (baseItem.previewStatus === "loi_doc") {
          baseItem.selected = false;
        }

        parsedItems.push(baseItem);
      }

      // 5. Requirement 2: Query Supabase ONCE with the list of ma_tk to mark "Đã có"
      const validMaTks = parsedItems.map((it) => it.ma_tk).filter(Boolean);
      if (validMaTks.length > 0) {
        setScanProgressText(
          `Đang kiểm tra ${validMaTks.length} mã TK trên Supabase (1 lần duy nhất)...`
        );
        try {
          const checkRes = await safeFetchJson<{
            existingMap?: Record<string, any>;
          }>("/api/properties/check-ma-tk", {
            method: "POST",
            headers: getAuthHeaders(),
            credentials: "include",
            body: JSON.stringify({ ma_tk_list: validMaTks }),
          });
          if (checkRes.ok) {
            const existingMap: Record<string, any> =
              checkRes.data.existingMap || {};

            for (const item of parsedItems) {
              const key = item.ma_tk.toUpperCase();
              if (key && existingMap[key]) {
                item.existingRecord = existingMap[key];
                const reEval = evaluateRowStatus(item, false);
                item.previewStatus = reEval.previewStatus;
                item.trang_thai_nguon = reEval.trang_thai_nguon;
                item.trang_thai_xu_ly = reEval.trang_thai_xu_ly;
                item.statusNote = reEval.statusNote;
                item.needsReview = reEval.needsReview;
                item.needsLightCheck = reEval.needsLightCheck;
                item.reviewNote = reEval.reviewNote;
                item.lightCheckNote = reEval.lightCheckNote;
                item.calcArea = reEval.calcArea;
                item.deviationPercent = reEval.deviationPercent;
                // Default unselected unless user toggles "Cập nhật nguồn đã có"
                item.selected = false;
              }
            }
          } else {
            console.warn(
              "Kiểm tra Mã TK không thành công:",
              checkRes.errorMessage
            );
          }
        } catch (err) {
          console.warn("Không thể kiểm tra danh sách Mã TK trên máy chủ:", err);
        }
      }

      // 6. Check IndexedDB persisted session to automatically skip already-completed sources from an interrupted run
      const savedSess = await loadBulkSessionFromIndexedDB();
      if (savedSess && savedSess.completedMaTks.length > 0) {
        const completedSet = new Set(savedSess.completedMaTks.map((m) => m.toUpperCase()));
        for (const item of parsedItems) {
          if (item.ma_tk && completedSet.has(item.ma_tk.toUpperCase())) {
            item.selected = false;
            item.queueState = "done";
            item.statusNote = "Đã tải lên hoàn tất trong phiên trước (IndexedDB)";
          }
        }
      }

      if (append) {
        setItems((prev) => [...prev, ...parsedItems]);
      } else {
        setItems(parsedItems);
      }
      setStep(2);
    } finally {
      setScanning(false);
      setScanProgressText("");
      if (folderInputRef.current) folderInputRef.current.value = "";
      if (multiFileInputRef.current) multiFileInputRef.current.value = "";
      if (appendFolderInputRef.current) appendFolderInputRef.current.value = "";
    }
  };

  // Input webkitdirectory change handler
  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const list: Array<{ file: File; relativePath: string }> = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relPath = (file as any).webkitRelativePath || file.name;
      list.push({ file, relativePath: relPath });
    }
    processSelectedFiles(list, false);
  };

  // Multi-file / multi-folder input handler
  const handleMultiFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const list: Array<{ file: File; relativePath: string }> = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relPath = (file as any).webkitRelativePath || file.name;
      list.push({ file, relativePath: relPath });
    }
    processSelectedFiles(list, false);
  };

  // Append folder in Step 2 handler
  const handleAppendFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const list: Array<{ file: File; relativePath: string }> = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relPath = (file as any).webkitRelativePath || file.name;
      list.push({ file, relativePath: relPath });
    }
    processSelectedFiles(list, true);
  };

  // Drag & Drop directory tree reader using webkitGetAsEntry
  const readDirectoryEntryRecursive = async (
    dirEntry: any,
    currentPath: string
  ): Promise<Array<{ file: File; relativePath: string }>> => {
    const results: Array<{ file: File; relativePath: string }> = [];
    const reader = dirEntry.createReader();

    const readBatch = (): Promise<any[]> =>
      new Promise((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });

    let entries: any[] = [];
    let batch: any[] = [];
    do {
      batch = await readBatch();
      entries = entries.concat(batch);
    } while (batch.length > 0);

    for (const entry of entries) {
      const nextPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      if (entry.isFile) {
        const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject));
        results.push({ file, relativePath: nextPath });
      } else if (entry.isDirectory) {
        const subResults = await readDirectoryEntryRecursive(entry, nextPath);
        results.push(...subResults);
      }
    }
    return results;
  };

  const handleFolderDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFolder(false);

    const dataTransferItems = e.dataTransfer.items;
    if (!dataTransferItems || dataTransferItems.length === 0) return;

    setScanning(true);
    setScanProgressText("Đang đọc cấu trúc thư mục kéo thả...");

    try {
      const collected: Array<{ file: File; relativePath: string }> = [];
      for (let i = 0; i < dataTransferItems.length; i++) {
        const item = dataTransferItems[i];
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        if (entry) {
          if (entry.isDirectory) {
            const subFiles = await readDirectoryEntryRecursive(entry, entry.name);
            collected.push(...subFiles);
          } else if (entry.isFile) {
            const file: File = await new Promise((res, rej) => (entry as any).file(res, rej));
            collected.push({ file, relativePath: entry.name });
          }
        }
      }
      await processSelectedFiles(collected);
    } catch (err) {
      console.error("Lỗi đọc thư mục kéo thả:", err);
      setScanning(false);
    }
  };

  // Inline editing helpers in Step 2
  const handleUpdateItemField = (
    itemId: string,
    field: keyof BulkPropertyItem,
    value: any
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const updated: BulkPropertyItem = { ...item, [field]: value };

        if (field === "so_nha" || field === "duong") {
          updated.dia_chi = [updated.so_nha, updated.duong].filter(Boolean).join(" ").trim();
        } else if (field === "loai_hinh") {
          // Requirement 4: Số tầng chỉ khi loại hình là nhà phố
          if (!isNhaPhoLoaiHinh(String(value))) {
            updated.so_tang = "";
          }
        } else if (field === "so_tang") {
          if (!isNhaPhoLoaiHinh(updated.loai_hinh)) {
            updated.so_tang = "";
          }
        } else if (field === "gia_text") {
          const parsedPrice = parsePriceToVnd(String(value));
          updated.gia = parsedPrice.vnd;
        } else if (field === "dien_tich") {
          const parsedArea = parseAreaNumbers(String(value));
          updated.dien_tich_so = parsedArea.dien_tich_so;
          updated.dien_tich_thuc_te = parsedArea.dien_tich_thuc_te;
        } else if (field === "dien_tich_so" || field === "dien_tich_thuc_te") {
          const numVal =
            value !== "" && value !== null && value !== undefined
              ? parseFloat(String(value).replace(",", "."))
              : null;
          const cleanNum = numVal !== null && !isNaN(numVal) && numVal > 0 ? numVal : null;
          if (field === "dien_tich_so") {
            updated.dien_tich_so = cleanNum;
            if (updated.dien_tich_thuc_te === null || updated.dien_tich_thuc_te === undefined) {
              updated.dien_tich_thuc_te = cleanNum;
            }
          } else {
            updated.dien_tich_thuc_te = cleanNum;
            if (updated.dien_tich_so === null || updated.dien_tich_so === undefined) {
              updated.dien_tich_so = cleanNum;
            }
          }
          const s = updated.dien_tich_so;
          const t = updated.dien_tich_thuc_te;
          if (s !== null && t !== null) {
            updated.dien_tich = s === t ? `${s}` : `${s}-${t}`;
          } else if (s !== null) {
            updated.dien_tich = `${s}`;
          } else if (t !== null) {
            updated.dien_tich = `${t}`;
          } else {
            updated.dien_tich = "";
          }
        }

        const evalRes = evaluateRowStatus(updated, false);
        updated.previewStatus = evalRes.previewStatus;
        updated.trang_thai_nguon = evalRes.trang_thai_nguon;
        updated.trang_thai_xu_ly = evalRes.trang_thai_xu_ly;
        updated.statusNote = evalRes.statusNote;
        updated.needsReview = evalRes.needsReview;
        updated.needsLightCheck = evalRes.needsLightCheck;
        updated.reviewNote = evalRes.reviewNote;
        updated.lightCheckNote = evalRes.lightCheckNote;
        updated.calcArea = evalRes.calcArea;
        updated.deviationPercent = evalRes.deviationPercent;
        return updated;
      })
    );
  };

  const handleToggleRowSelect = (itemId: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleToggleUpdateExisting = (checked: boolean) => {
    setUpdateExisting(checked);
    setItems((prev) =>
      prev.map((item) => {
        if (item.previewStatus === "da_co") {
          const { canUpdateByDate } = evaluateExistingUpdateEligibility(item);
          return { ...item, selected: checked && canUpdateByDate };
        }
        return item;
      })
    );
  };

  // Image selection & avatar controls inside Step 2
  const handleToggleImageSelected = (itemId: string, imageId: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const nextImages = item.images.map((img) =>
          img.id === imageId ? { ...img, selected: !img.selected } : img
        );
        const hasSelectedAvatar = nextImages.some((img) => img.selected && img.isAvatar);
        if (!hasSelectedAvatar) {
          nextImages.forEach((img) => (img.isAvatar = false));
          const firstSel = nextImages.find((img) => img.selected);
          if (firstSel) firstSel.isAvatar = true;
        }
        return { ...item, images: nextImages };
      })
    );
  };

  const handleSetAvatarImage = (itemId: string, imageId: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const nextImages = item.images.map((img) => ({
          ...img,
          selected: img.id === imageId ? true : img.selected,
          isAvatar: img.id === imageId,
        }));
        return { ...item, images: nextImages };
      })
    );
  };

  /**
   * Requirement 5: Thư mục ảnh trong Storage đặt theo mã TK thật (`TKxxxxxx` hoặc `NT-xxxxxx`).
   */
  const uploadSingleImageWithRetry = async (
    imgItem: BulkImageItem,
    rawMaTk: string,
    fallbackFolderName: string
  ): Promise<string> => {
    const compressedFile = await compressImageForBulkUpload(imgItem.file, 1600, 0.8);

    // Ensure Storage folder is strictly the real `ma_tk` (never numeric prefix)
    const realStorageFolder = isValidRealMaTk(rawMaTk)
      ? rawMaTk.trim().toUpperCase()
      : resolveRealMaTk(rawMaTk, "", fallbackFolderName).ma_tk;

    const rawCloudName =
      (import.meta as any).env?.VITE_CLOUDINARY_CLOUD_NAME || cloudinaryConfig.cloudName || "";
    const cloudName = rawCloudName.trim().replace(/^["']|["']$/g, "").split("/")[0].trim();
    const uploadPreset = (
      (import.meta as any).env?.VITE_CLOUDINARY_UPLOAD_PRESET ||
      cloudinaryConfig.uploadPreset ||
      ""
    ).trim();

    let lastErr = "Lỗi tải ảnh lên Storage";

    for (let attempt = 1; attempt <= MAX_IMAGE_RETRIES; attempt++) {
      try {
        // Channel 1: Server-side Storage upload (/api/upload-image -> Supabase Storage `<ma_tk>/...` -> Cloudinary -> Local)
        const formData = new FormData();
        formData.append("file", compressedFile);
        if (uploadPreset) formData.append("upload_preset", uploadPreset);
        formData.append("folder", realStorageFolder);
        formData.append("ma_tk", realStorageFolder);

        const token = localStorage.getItem("admin_token") || "";
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await safeFetchJson<{
          secure_url?: string;
          error?: string;
        }>("/api/upload-image", {
          method: "POST",
          body: formData,
          credentials: "include",
          headers,
        });

        if (res.ok && res.data.secure_url) {
          return res.data.secure_url;
        } else {
          lastErr =
            res.errorMessage ||
            `HTTP ${res.status} — POST /api/upload-image`;
        }

        // Channel 2: Direct browser unsigned upload if cloudName & uploadPreset are present
        if (cloudName && uploadPreset && !uploadPreset.startsWith("cloudinary://")) {
          const directForm = new FormData();
          directForm.append("file", compressedFile);
          directForm.append("upload_preset", uploadPreset);
          directForm.append("folder", realStorageFolder);

          const directUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
          const directRes = await safeFetchJson<{
            secure_url?: string;
            error?: { message?: string };
          }>(directUrl, {
            method: "POST",
            body: directForm,
          });
          if (directRes.ok && directRes.data.secure_url) {
            return directRes.data.secure_url;
          } else {
            const msg =
              directRes.data?.error?.message || directRes.errorMessage || "";
            if (msg.includes("Upload preset not found")) {
              break;
            }
            lastErr = msg || lastErr;
          }
        }
      } catch (err: any) {
        lastErr = err.message || "Lỗi kết nối mạng khi tải ảnh";
      }

      if (attempt < MAX_IMAGE_RETRIES) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Không thể đọc dữ liệu ảnh"));
        reader.readAsDataURL(compressedFile);
      });
      if (dataUrl) return dataUrl;
    } catch (_) {}

    throw new Error(`Ảnh "${imgItem.fileName}" lỗi sau ${MAX_IMAGE_RETRIES} lần thử: ${lastErr}`);
  };

  /**
   * Upload all selected images of a single property item with concurrency limit (4 parallel uploads).
   */
  const uploadPropertyImagesConcurrency = async (
    item: BulkPropertyItem
  ): Promise<{ orderedUrls: string[]; anhMetadata: any[] }> => {
    const selectedImages = item.images.filter((img) => img.selected);
    const hiddenImages = item.images.filter((img) => !img.selected);

    if (selectedImages.length === 0) {
      return {
        orderedUrls: [],
        anhMetadata: hiddenImages.map((img) => ({
          url: "",
          file_name: img.fileName,
          is_avatar: false,
          is_hidden: true,
          exclude_reason: img.excludeReason || "Đã ẩn thủ công",
        })),
      };
    }

    const uploadedMap = new Map<string, string>();
    let currentIndex = 0;
    let completedCount = 0;
    let fatalError: Error | null = null;

    const worker = async () => {
      while (currentIndex < selectedImages.length && !fatalError && !stopSignalRef.current) {
        const idx = currentIndex++;
        const imgItem = selectedImages[idx];
        try {
          const url =
            imgItem.uploadedUrl ||
            (await uploadSingleImageWithRetry(imgItem, item.ma_tk, item.ten_thu_muc_goc));
          imgItem.uploadedUrl = url;
          uploadedMap.set(imgItem.id, url);
          completedCount++;

          setItems((prev) =>
            prev.map((it) =>
              it.id === item.id ? { ...it, uploadedImagesCount: completedCount } : it
            )
          );
        } catch (err: any) {
          fatalError = err instanceof Error ? err : new Error(String(err));
          break;
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(IMAGE_CONCURRENCY, selectedImages.length) },
      () => worker()
    );
    await Promise.all(workers);

    if (stopSignalRef.current) {
      throw new Error("Đã dừng theo yêu cầu người dùng");
    }

    if (fatalError) {
      throw fatalError;
    }

    const sortedSelected = [...selectedImages].sort((a, b) =>
      a.isAvatar === b.isAvatar ? 0 : a.isAvatar ? -1 : 1
    );

    const orderedUrls = sortedSelected
      .map((img) => uploadedMap.get(img.id) || "")
      .filter(Boolean);

    const anhMetadata = [
      ...sortedSelected.map((img) => ({
        url: uploadedMap.get(img.id) || "",
        file_name: img.fileName,
        is_avatar: !!img.isAvatar,
        is_hidden: false,
      })),
      ...hiddenImages.map((img) => ({
        url: "",
        file_name: img.fileName,
        is_avatar: false,
        is_hidden: true,
        exclude_reason: img.excludeReason || "Ảnh bị ẩn",
      })),
    ];

    return { orderedUrls, anhMetadata };
  };

  /**
   * Phase 2 Queue Runner: Processes selected items in batches of 25
   */
  const startUploadQueue = async (onlyFailed = false) => {
    const candidates = items.filter((it) => {
      if (onlyFailed) return it.queueState === "error";
      return it.selected && it.queueState !== "done";
    });

    if (candidates.length === 0) return;

    setStep(3);
    setIsRunningQueue(true);
    setIsStopped(false);
    stopSignalRef.current = false;

    if (!onlyFailed) {
      setTotalTargetCount(candidates.length);
      setImportedCount(0);
      setFailedCount(0);
      setSkippedCount(0);
      setFailedRecords([]);
    } else {
      setFailedCount(0);
      setFailedRecords([]);
    }

    const batches: BulkPropertyItem[][] = [];
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      batches.push(candidates.slice(i, i + BATCH_SIZE));
    }
    setTotalBatches(batches.length);

    const savedSess = await loadBulkSessionFromIndexedDB();
    const completedSet = new Set<string>(savedSess?.completedMaTks || []);
    const skippedSet = new Set<string>(savedSess?.skippedMaTks || []);
    const currentFailedList: BulkFailedRecord[] = [];
    const currentLogs: BulkQueueLogEntry[] = [...logs];

    const persistState = async () => {
      await saveBulkSessionToIndexedDB({
        parentFolderName,
        totalCount: candidates.length,
        completedMaTks: Array.from(completedSet),
        skippedMaTks: Array.from(skippedSet),
        failedRecords: currentFailedList,
        logs: currentLogs.slice(0, 200),
        updateExisting,
      });
    };

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      if (stopSignalRef.current) break;
      setCurrentBatchIndex(bIdx + 1);
      const batch = batches[bIdx];

      addLog(
        `LÔ ${bIdx + 1}/${batches.length}`,
        "info",
        `Bắt đầu xử lý lô ${bIdx + 1} (${batch.length} nguồn nhà)...`
      );

      for (const item of batch) {
        if (stopSignalRef.current) break;

        // Ensure real `ma_tk` (never numeric prefix)
        const realMaTk = isValidRealMaTk(item.ma_tk)
          ? item.ma_tk.trim().toUpperCase()
          : resolveRealMaTk(item.ma_tk, "", item.ten_thu_muc_goc).ma_tk;

        // Requirement 2 & 3: Check if existing
        if (item.previewStatus === "da_co") {
          if (!updateExisting) {
            skippedSet.add(realMaTk);
            setSkippedCount((prev) => prev + 1);
            setItems((prev) =>
              prev.map((it) =>
                it.id === item.id
                  ? { ...it, queueState: "skipped", queueMessage: "Bỏ qua (Mã TK đã tồn tại)" }
                  : it
              )
            );
            const l = addLog(
              realMaTk,
              "skip",
              `Bỏ qua nguồn đã có trên Supabase (${item.dia_chi || item.ten_thu_muc_goc})`
            );
            currentLogs.unshift(l);
            await persistState();
            continue;
          }

          // Check Ngay lay before uploading images if stored record has newer/same Ngay lay
          const dateEval = evaluateExistingUpdateEligibility(item);
          if (!dateEval.canUpdateByDate) {
            skippedSet.add(realMaTk);
            setSkippedCount((prev) => prev + 1);
            setItems((prev) =>
              prev.map((it) =>
                it.id === item.id
                  ? {
                      ...it,
                      queueState: "skipped",
                      queueMessage: dateEval.dateComparisonNote,
                    }
                  : it
              )
            );
            const l = addLog(realMaTk, "skip", dateEval.dateComparisonNote);
            currentLogs.unshift(l);
            await persistState();
            continue;
          }
        }

        // Step A: Upload all selected images to Storage folder named by `realMaTk`
        const selectedImgCount = item.images.filter((i) => i.selected).length;
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  queueState: "uploading_images",
                  uploadedImagesCount: 0,
                  queueMessage: `Đang tải ${selectedImgCount} ảnh vào Storage/${realMaTk}...`,
                }
              : it
          )
        );

        try {
          const { orderedUrls, anhMetadata } = await uploadPropertyImagesConcurrency({
            ...item,
            ma_tk: realMaTk,
          });

          // Step B: Upsert record into Supabase (`onConflict: 'ma_tk'`)
          setItems((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? {
                    ...it,
                    queueState: "saving_db",
                    queueMessage: `Đang upsert Supabase (onConflict: 'ma_tk' = ${realMaTk})...`,
                  }
                : it
            )
          );

          const effectivePhuong = (item.phuong || batchPhuong || "").trim();
          const effectiveDiaChi = (
            item.dia_chi || [item.so_nha, item.duong].filter(Boolean).join(" ")
          ).trim();
          const effectiveLoaiHinh = (item.loai_hinh || "Nhà phố").trim();
          const effectiveSoTang = isNhaPhoLoaiHinh(effectiveLoaiHinh)
            ? String(item.so_tang || "").trim()
            : "";

          const hasValidArea =
            (item.dien_tich_thuc_te !== null &&
              item.dien_tich_thuc_te !== undefined &&
              Number(item.dien_tich_thuc_te) > 0) ||
            (item.dien_tich_so !== null &&
              item.dien_tich_so !== undefined &&
              Number(item.dien_tich_so) > 0) ||
            !!item.dien_tich?.trim();

          const isMissingMandatory =
            !effectiveDiaChi || !hasValidArea || !item.gia || item.gia <= 0;
          const finalTrangThaiNguon = isMissingMandatory ? "thô" : item.trang_thai_nguon;

          const upsertRes = await safeFetchJson<{
            success?: boolean;
            skipped?: boolean;
            message?: string;
            error?: string;
          }>("/api/properties/bulk-upsert", {
            method: "POST",
            headers: getAuthHeaders(),
            credentials: "include",
            body: JSON.stringify({
              updateExisting,
              record: {
                ma_tk: realMaTk,
                loai_hinh: effectiveLoaiHinh,
                dia_chi: effectiveDiaChi,
                so_nha: item.so_nha,
                duong: item.duong,
                phuong: effectivePhuong,
                gia: item.gia,
                gia_text: item.gia_text || formatVndToReadable(item.gia),
                dien_tich: item.dien_tich,
                dien_tich_so: item.dien_tich_so,
                dien_tich_thuc_te: item.dien_tich_thuc_te,
                rong: item.rong,
                dai: item.dai,
                so_tang: effectiveSoTang,
                trang_thai_xu_ly: item.trang_thai_xu_ly,
                trang_thai_nguon: finalTrangThaiNguon,
                mo_ta_tho: item.mo_ta_tho,
                moi_gioi_nguon: item.moi_gioi_nguon,
                sdt_nguon: item.sdt_nguon,
                hoa_hong: item.hoa_hong,
                toa_do: item.toa_do,
                link_thien_khoi: (item.existingRecord?.link_thien_khoi?.trim())
                  ? item.existingRecord.link_thien_khoi
                  : item.link_thien_khoi,
                link_ban_do: (item.existingRecord?.link_ban_do?.trim())
                  ? item.existingRecord.link_ban_do
                  : item.link_ban_do,
                ngay_lay: item.ngay_lay,
                ngay_lay_raw: item.ngay_lay_raw,
                anh: anhMetadata,
                image_urls: orderedUrls,
                ten_thu_muc_goc: item.ten_thu_muc_goc,
                ngay_nhap: new Date().toISOString(),
                created_by: currentUser?.id || currentUser?.email,
                created_by_name:
                  currentUser?.full_name || currentUser?.email?.split("@")[0] || "Quản trị viên",
                created_by_phone: currentUser?.phone || "",
                created_by_email: currentUser?.email || "",
                created_by_role: currentUser?.role || "admin",
              },
            }),
          });

          const upsertData = upsertRes.data || {};
          if (!upsertRes.ok || !upsertData.success) {
            throw new Error(
              upsertRes.errorMessage ||
                upsertData.error ||
                `Lỗi lưu Supabase (HTTP ${upsertRes.status} — POST /api/properties/bulk-upsert)`
            );
          }

          if (upsertData.skipped) {
            skippedSet.add(realMaTk);
            setSkippedCount((prev) => prev + 1);
            setItems((prev) =>
              prev.map((it) =>
                it.id === item.id
                  ? {
                      ...it,
                      queueState: "skipped",
                      queueMessage: upsertData.message || "Bỏ qua cập nhật",
                    }
                  : it
              )
            );
            const l = addLog(realMaTk, "skip", upsertData.message || "Bỏ qua cập nhật");
            currentLogs.unshift(l);
            await persistState();
            continue;
          }

          completedSet.add(realMaTk);
          setImportedCount((prev) => prev + 1);
          setItems((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? {
                    ...it,
                    ma_tk: realMaTk,
                    queueState: "done",
                    queueMessage: `Hoàn tất (${orderedUrls.length} ảnh -> Storage/${realMaTk})`,
                  }
                : it
            )
          );

          const l = addLog(
            realMaTk,
            "success",
            `Upsert thành công [${realMaTk}]: ${[effectiveDiaChi, effectivePhuong].filter(Boolean).join(", ")} (${orderedUrls.length} ảnh)`,
            item.ten_thu_muc_goc
          );
          currentLogs.unshift(l);
          await persistState();
        } catch (err: any) {
          if (stopSignalRef.current) {
            const l = addLog(realMaTk, "info", "Đã tạm dừng xử lý nguồn này.");
            currentLogs.unshift(l);
            break;
          }

          const errMsg = err.message || "Lỗi không xác định khi tải nguồn";
          setFailedCount((prev) => prev + 1);
          const failRec: BulkFailedRecord = {
            ma_tk: realMaTk,
            ten_thu_muc_goc: item.ten_thu_muc_goc,
            address: [item.dia_chi, item.phuong].filter(Boolean).join(", "),
            error: errMsg,
            time: new Date().toLocaleTimeString("vi-VN"),
          };
          currentFailedList.push(failRec);
          setFailedRecords([...currentFailedList]);

          setItems((prev) =>
            prev.map((it) =>
              it.id === item.id ? { ...it, queueState: "error", queueMessage: errMsg } : it
            )
          );

          const l = addLog(
            realMaTk,
            "error",
            `Lỗi: ${errMsg}`,
            item.ten_thu_muc_goc
          );
          currentLogs.unshift(l);
          await persistState();
        }
      }
    }

    setIsRunningQueue(false);
    onImportSuccess();

    if (!stopSignalRef.current) {
      clearBulkSessionInIndexedDB().catch(() => {});
      // Auto close modal after brief delay when queue finishes successfully
      setTimeout(() => {
        onClose();
      }, 1000);
    }
  };

  const handleStopQueue = () => {
    stopSignalRef.current = true;
    setIsStopped(true);
    setIsRunningQueue(false);
    addLog("HỆ THỐNG", "info", "Đã gửi lệnh dừng hàng đợi. Các nguồn đã xong được lưu trong IndexedDB.");
  };

  const handleExportFailedCsv = () => {
    if (failedRecords.length === 0) return;
    const headers = ["Mã TK", "Tên thư mục gốc", "Địa chỉ", "Nguyên nhân lỗi", "Thời gian"];
    const escapeCsv = (val: string) => `"${String(val || "").replace(/"/g, '""')}"`;
    const rows = failedRecords.map((r) =>
      [r.ma_tk, r.ten_thu_muc_goc, r.address, r.error, r.time].map(escapeCsv).join(",")
    );
    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `danh-sach-loi-nhap-nguon-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const activeImageModalItem = items.find((i) => i.id === activeImageModalItemId) || null;
  const activeRawTxtItem = items.find((i) => i.id === activeRawTxtItemId) || null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-hidden">
      <div className="w-full max-w-7xl h-[92vh] flex flex-col rounded-2xl border border-slate-800 bg-[#0f1420] text-slate-100 shadow-2xl overflow-hidden">
        {/* Top Header & 3-Step Indicator */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-800 bg-[#141b2d] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <FolderUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Nhập từ thư mục (Chống trùng theo Mã TK thật)</span>
                {parentFolderName && (
                  <span className="px-2 py-0.5 text-xs rounded-md bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                    {parentFolderName}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Khóa chính <code>ma_tk</code> (TKxxxxxx / NT-xxxxxx) · Upsert{" "}
                <code>onConflict: 'ma_tk'</code> · Storage theo <code>ma_tk</code> thật
              </p>
            </div>
          </div>

          {/* 3-Step Progress Bar */}
          <div className="flex items-center gap-2">
            {[
              { num: 1, label: "1. Chọn thư mục & Khu vực" },
              { num: 2, label: "2. Xem trước & Đối chiếu" },
              { num: 3, label: "3. Tải lên Kho" },
            ].map((s, idx) => (
              <React.Fragment key={s.num}>
                <button
                  type="button"
                  disabled={
                    isRunningQueue ||
                    (s.num === 2 && items.length === 0) ||
                    (s.num === 3 && items.length === 0)
                  }
                  onClick={() => setStep(s.num as 1 | 2 | 3)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    step === s.num
                      ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20"
                      : step > s.num
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : "bg-slate-800/80 text-slate-400 border border-slate-700"
                  }`}
                >
                  <span>{s.label}</span>
                </button>
                {idx < 2 && <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
              </React.Fragment>
            ))}

            <button
              type="button"
              disabled={isRunningQueue}
              onClick={onClose}
              className="ml-2 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
              title="Đóng cửa sổ"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* STEP 1: CHỌN KHU VỰC LÔ NHẬP & THƯ MỤC CHA */}
        {/* ========================================================= */}
        {step === 1 && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex flex-col items-center justify-center">
            <div className="max-w-3xl w-full space-y-5">
              {/* Saved IndexedDB session banner if present */}
              {persistedSession && (
                <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-amber-300 flex items-center gap-1.5">
                      <Database className="w-4 h-4" />
                      <span>
                        Phát hiện tiến độ lưu trong IndexedDB ({persistedSession.parentFolderName})
                      </span>
                    </div>
                    <p className="text-slate-300">
                      Đã hoàn tất <b>{persistedSession.completedMaTks.length}</b> nguồn, bỏ qua{" "}
                      <b>{persistedSession.skippedMaTks.length}</b> nguồn, lỗi{" "}
                      <b>{persistedSession.failedRecords.length}</b> nguồn.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await clearBulkSessionInIndexedDB();
                      setPersistedSession(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-semibold shrink-0 cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa bộ nhớ phiên cũ</span>
                  </button>
                </div>
              )}

              {/* Requirement 4: Khu vực / Phường chọn khi nhập lô */}
              <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <label className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" />
                    <span>Khu vực / Phường áp dụng cho lô nhập (cột phuong):</span>
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Nếu để trống, hệ thống tự lấy tên thư mục cha khi chọn (VD: &quot;Lái Thiêu&quot;, &quot;Hiệp Bình Phước&quot;)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={DISTRICT_OPTIONS.includes(batchPhuong as any) ? batchPhuong : ""}
                    onChange={(e) => {
                      if (e.target.value) setBatchPhuong(e.target.value);
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- Chọn nhanh khu vực --</option>
                    {DISTRICT_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={batchPhuong}
                    onChange={(e) => setBatchPhuong(e.target.value)}
                    placeholder="Hoặc nhập Phường / Khu vực..."
                    className="w-48 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Dropzone / Folder Picker */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!scanning) setIsDraggingFolder(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingFolder(false);
                }}
                onDrop={handleFolderDrop}
                className={`p-8 sm:p-10 rounded-2xl border-2 border-dashed transition-all text-center flex flex-col items-center justify-center gap-4 ${
                  isDraggingFolder
                    ? "border-amber-400 bg-amber-500/10"
                    : "border-slate-700 bg-slate-900/60 hover:bg-slate-900 hover:border-amber-500/60"
                }`}
              >
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  {...({ webkitdirectory: "", directory: "" } as any)}
                  onChange={handleFolderInputChange}
                  className="hidden"
                />
                <input
                  ref={multiFileInputRef}
                  type="file"
                  multiple
                  onChange={handleMultiFileInputChange}
                  className="hidden"
                />

                {scanning ? (
                  <div className="space-y-3 py-6">
                    <Loader2 className="w-12 h-12 text-amber-400 animate-spin mx-auto" />
                    <div className="text-base font-bold text-white">
                      Đang phân tích & đối chiếu Mã TK trên trình duyệt...
                    </div>
                    <div className="text-xs text-amber-300 font-mono">{scanProgressText}</div>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg">
                      <FolderUp className="w-8 h-8" />
                    </div>
                    <div className="space-y-1.5 max-w-lg">
                      <h3 className="text-lg font-bold text-white">
                        Nạp nhiều thư mục con tự động phân tách
                      </h3>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        • <b>Cách 1 (Nhanh nhất)</b>: Bấm <b>&quot;Chọn thư mục từ máy tính&quot;</b> và chọn thư mục cha (VD: <code>Long Phước</code>), hệ thống sẽ tự động quét và tách <b>toàn bộ thư mục con</b> bên trong thành từng căn riêng biệt.<br />
                        • <b>Cách 2 (Kéo thả)</b>: Bôi đen chọn nhiều thư mục con cùng lúc trong Windows/Mac rồi <b>Kéo thả trực tiếp</b> vào đây.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => folderInputRef.current?.click()}
                        className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all cursor-pointer flex items-center gap-2"
                      >
                        <FolderUp className="w-4 h-4 stroke-[2.5]" />
                        <span>Chọn thư mục (Chọn Folder cha)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => multiFileInputRef.current?.click()}
                        className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-2"
                      >
                        <FileText className="w-4 h-4" />
                        <span>Chọn tệp tin / Thư mục con</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Format Specification Card */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-2">
                  <div className="font-bold text-amber-400 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" />
                    <span>Quy tắc Khóa chính Mã TK & Tách cấu trúc</span>
                  </div>
                  <ul className="space-y-1.5 text-slate-400 list-disc list-inside text-[11px]">
                    <li>
                      <b>Khóa chính ma_tk</b>: Ưu tiên (a) mã TK ở đầu tên thư mục, (b) dòng{" "}
                      <code>Mã nguồn hàng: TKxxxxxx</code> trong <code>.txt</code>, (c) nếu không có
                      thì tạo <code>NT-xxxxxx</code>. <b>Tuyệt đối không dùng tiền tố số</b> của tên
                      thư mục làm mã.
                    </li>
                    <li>
                      <b>Diện tích</b>: <code>67-75</code> hoặc <code>50/50</code> tách thành{" "}
                      <code>dien_tich_so = 67</code>, <code>dien_tich_thuc_te = 75</code> (không ghép
                      thành 6775).
                    </li>
                    <li>
                      <b>Số tầng & Tên đường</b>: Số tầng chỉ ghi khi loại hình là{" "}
                      <b>Nhà phố</b>. Số trong tên đường (VD <code>đường 12</code>) không tính vào
                      diện tích hay tầng.
                    </li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-2">
                  <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <Database className="w-4 h-4" />
                    <span>Upsert chống trùng & Bảo vệ dữ liệu xuất</span>
                  </div>
                  <ul className="space-y-1.5 text-slate-400 list-disc list-inside text-[11px]">
                    <li>
                      Ghi vào <code>chu_nha_can_ban</code> bằng{" "}
                      <code>upsert onConflict: &apos;ma_tk&apos;</code>.
                    </li>
                    <li>
                      Khi bật <b>Cập nhật nguồn đã có</b>: so sánh <code>Ngay lay</code> trong{" "}
                      <code>.txt</code>, chỉ cập nhật phần thô & trường chưa chỉnh tay nếu mới hơn
                      bản đang lưu.
                    </li>
                    <li>
                      <b>KHÔNG đụng vào</b>: <code>da_len_hometea</code>, <code>hometea_id</code>,{" "}
                      <code>da_xep_lich_fb</code>, <code>da_dang_fb</code>, <code>draft_*</code>.
                    </li>
                    <li>
                      Thư mục ảnh trong <b>Storage</b> đặt theo <b>mã TK thật</b>.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* STEP 2: XEM TRƯỚC VÀ CHỈNH SỬA TRỰC TIẾP (PREVIEW & INLINE EDIT) */}
        {/* ========================================================= */}
        {step === 2 && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Filter, Batch Area & Summary Bar */}
            <div className="p-3 sm:p-4 border-b border-slate-800 bg-[#121826] flex flex-col gap-2.5 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: "all", label: `Tất cả (${counts.total})`, color: "text-slate-200" },
                    { id: "moi", label: `Mới (${counts.moi})`, color: "text-emerald-400" },
                    { id: "da_co", label: `Đã có (${counts.da_co})`, color: "text-blue-400" },
                    {
                      id: "can_xem_lai",
                      label: `Cần xem lại (${counts.can_xem_lai})`,
                      color: "text-orange-400",
                    },
                    {
                      id: "thieu_thong_tin",
                      label: `Thiếu thông tin (${counts.thieu_thong_tin})`,
                      color: "text-amber-400",
                    },
                    { id: "loi_doc", label: `Lỗi đọc (${counts.loi_doc})`, color: "text-rose-400" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusFilter(tab.id as any)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        statusFilter === tab.id
                          ? "bg-slate-800 border-amber-500/50 text-white"
                          : "bg-slate-900/60 border-slate-800 hover:bg-slate-800/50 " + tab.color
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Search */}
                  <div className="relative w-52">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Tìm Mã TK, địa chỉ, đường..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* Add Additional Folders Button */}
                  <input
                    ref={appendFolderInputRef}
                    type="file"
                    multiple
                    {...({ webkitdirectory: "", directory: "" } as any)}
                    onChange={handleAppendFolderInputChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => appendFolderInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                    title="Bổ sung thêm các thư mục khác vào danh sách đối chiếu"
                  >
                    <FolderUp className="w-3.5 h-3.5" />
                    <span>+ Thêm thư mục khác</span>
                  </button>

                  {/* Toggle Update Existing */}
                  <label className="flex items-center gap-2 text-xs text-slate-300 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={updateExisting}
                      onChange={(e) => handleToggleUpdateExisting(e.target.checked)}
                      className="rounded accent-amber-500"
                    />
                    <span>
                      Cập nhật nguồn đã có (so sánh <code>Ngay lay</code> mới hơn, chỉ cập nhật phần thô)
                    </span>
                  </label>
                </div>
              </div>

              {/* Batch Area / Phuong Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-amber-400 font-semibold flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    Khu vực / Phường của lô nhập (<code>phuong</code>):
                  </span>
                  <select
                    value={DISTRICT_OPTIONS.includes(batchPhuong as any) ? batchPhuong : ""}
                    onChange={(e) => {
                      if (e.target.value) handleApplyBatchPhuong(e.target.value);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- Chọn khu vực --</option>
                    {DISTRICT_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={batchPhuong}
                    onChange={(e) => handleApplyBatchPhuong(e.target.value)}
                    placeholder="Nhập Phường / Khu vực cho cả lô..."
                    className="w-48 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="text-[11px] text-slate-400 font-mono">
                  Ghi các cột: <code>ma_tk, loai_hinh, dia_chi, phuong, gia, dien_tich_so, dien_tich_thuc_te, rong, dai, so_tang, trang_thai_xu_ly</code>
                </div>
              </div>
            </div>

            {/* Editable Preview Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-[#161f33] text-slate-300 border-b border-slate-700 uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          filteredItems.length > 0 && filteredItems.every((it) => it.selected)
                        }
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const visibleIds = new Set(filteredItems.map((i) => i.id));
                          setItems((prev) =>
                            prev.map((it) =>
                              visibleIds.has(it.id) ? { ...it, selected: checked } : it
                            )
                          );
                        }}
                        className="rounded accent-amber-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-2.5 px-2.5 w-36">Mã TK thật</th>
                    <th className="py-2.5 px-2.5 min-w-[250px]">
                      Địa chỉ (<code>dia_chi</code> · <code>phuong</code>)
                    </th>
                    <th className="py-2.5 px-2.5 w-52">Diện tích & Kết cấu</th>
                    <th className="py-2.5 px-2.5 w-36">Giá chào (VNĐ)</th>
                    <th className="py-2.5 px-2.5 w-36">Ảnh (Storage/Mã TK)</th>
                    <th className="py-2.5 px-2.5 w-40">Nội bộ & Ngày lấy</th>
                    <th className="py-2.5 px-2.5 w-40">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredItems.map((item) => {
                    const selectedImgs = item.images.filter((img) => img.selected);
                    const avatarImg =
                      selectedImgs.find((img) => img.isAvatar) || selectedImgs[0] || item.images[0];
                    const isNhaPho = isNhaPhoLoaiHinh(item.loai_hinh);
                    const existingEligibility =
                      item.previewStatus === "da_co"
                        ? evaluateExistingUpdateEligibility(item)
                        : null;

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${
                          item.selected ? "bg-slate-900/40" : "bg-slate-950/60 opacity-60"
                        } hover:bg-slate-800/40`}
                      >
                        {/* Checkbox */}
                        <td className="py-2.5 px-3 text-center align-top pt-4">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={() => handleToggleRowSelect(item.id)}
                            className="rounded accent-amber-500 cursor-pointer"
                          />
                        </td>

                        {/* Mã TK thật */}
                        <td className="py-2.5 px-2.5 align-top space-y-1">
                          <input
                            type="text"
                            value={item.ma_tk}
                            onChange={(e) =>
                              handleUpdateItemField(item.id, "ma_tk", e.target.value.toUpperCase())
                            }
                            placeholder="TKxxxxxx / NT-xxxxxx"
                            className={`w-full px-2 py-1 rounded bg-slate-950 border font-mono font-bold focus:outline-none ${
                              isValidRealMaTk(item.ma_tk)
                                ? "border-slate-700 text-amber-400 focus:border-amber-500"
                                : "border-rose-500 text-rose-400"
                            }`}
                          />
                          <div className="flex items-center gap-1 flex-wrap">
                            {item.ma_tk_source === "folder" && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-semibold">
                                (a) Từ thư mục
                              </span>
                            )}
                            {item.ma_tk_source === "txt" && (
                              <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[9px] font-semibold">
                                (b) Từ .txt
                              </span>
                            )}
                            {item.ma_tk_source === "generated_nt" && (
                              <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[9px] font-semibold">
                                (c) Tự tạo NT-xxxxxx
                              </span>
                            )}
                          </div>
                          <div
                            className="text-[10px] text-slate-500 truncate max-w-[135px]"
                            title={item.ten_thu_muc_goc}
                          >
                            {item.ten_thu_muc_goc}
                          </div>
                        </td>

                        {/* Địa chỉ: so_nha, duong, dia_chi, phuong */}
                        <td className="py-2.5 px-2.5 align-top space-y-1.5">
                          <div className="grid grid-cols-12 gap-1.5">
                            <input
                              type="text"
                              value={item.so_nha}
                              onChange={(e) =>
                                handleUpdateItemField(item.id, "so_nha", e.target.value)
                              }
                              placeholder="Số nhà / Thửa"
                              title="Số nhà hoặc Số thửa, tờ"
                              className="col-span-4 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-white focus:border-amber-500 focus:outline-none"
                            />
                            <input
                              type="text"
                              value={item.duong}
                              onChange={(e) =>
                                handleUpdateItemField(item.id, "duong", e.target.value)
                              }
                              placeholder="Tên đường..."
                              className="col-span-8 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-white font-medium focus:border-amber-500 focus:outline-none"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400 shrink-0">dia_chi:</span>
                            <input
                              type="text"
                              value={item.dia_chi}
                              onChange={(e) =>
                                handleUpdateItemField(item.id, "dia_chi", e.target.value)
                              }
                              placeholder="Địa chỉ đầy đủ..."
                              className="flex-1 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-200 text-[11px] focus:border-amber-500 focus:outline-none"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-amber-400/90 shrink-0">phuong:</span>
                            <input
                              type="text"
                              value={item.phuong}
                              onChange={(e) =>
                                handleUpdateItemField(item.id, "phuong", e.target.value)
                              }
                              placeholder="Phường / Khu vực"
                              className="flex-1 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-amber-200 text-[11px] focus:border-amber-500 focus:outline-none"
                            />
                          </div>
                        </td>

                        {/* Diện tích (Sổ & Thực tế), rộng, dài, số tầng, loại hình */}
                        <td className="py-2.5 px-2.5 align-top space-y-1.5 min-w-[230px]">
                          <div className="grid grid-cols-2 gap-1">
                            <div>
                              <span
                                className="text-[9px] text-slate-400 block"
                                title="Diện tích đất công nhận trên sổ (dien_tich_so)"
                              >
                                DT Sổ (m²)
                              </span>
                              <input
                                type="number"
                                step="any"
                                value={item.dien_tich_so ?? ""}
                                onChange={(e) =>
                                  handleUpdateItemField(item.id, "dien_tich_so", e.target.value)
                                }
                                placeholder="DT sổ"
                                className="w-full px-1.5 py-1 rounded bg-slate-950 border border-slate-700 text-cyan-300 font-mono font-bold focus:border-amber-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <span
                                className="text-[9px] text-slate-400 block"
                                title="Diện tích đất sử dụng thực tế (dien_tich_thuc_te)"
                              >
                                DT Thực tế (m²)
                              </span>
                              <input
                                type="number"
                                step="any"
                                value={item.dien_tich_thuc_te ?? ""}
                                onChange={(e) =>
                                  handleUpdateItemField(
                                    item.id,
                                    "dien_tich_thuc_te",
                                    e.target.value
                                  )
                                }
                                placeholder="DT thực tế"
                                className={`w-full px-1.5 py-1 rounded bg-slate-950 border font-mono font-bold focus:outline-none ${
                                  item.needsReview
                                    ? "border-orange-500 text-orange-300"
                                    : item.needsLightCheck
                                    ? "border-amber-500/80 text-amber-300"
                                    : "border-slate-700 text-emerald-300 focus:border-amber-500"
                                }`}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-1">
                            <div>
                              <span className="text-[9px] text-slate-400 block">Rộng (m)</span>
                              <input
                                type="text"
                                value={item.rong}
                                onChange={(e) =>
                                  handleUpdateItemField(item.id, "rong", e.target.value)
                                }
                                placeholder="Rộng"
                                className="w-full px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-slate-200 font-mono focus:border-amber-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 block">Dài (m)</span>
                              <input
                                type="text"
                                value={item.dai}
                                onChange={(e) =>
                                  handleUpdateItemField(item.id, "dai", e.target.value)
                                }
                                placeholder="Dài"
                                className="w-full px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-slate-200 font-mono focus:border-amber-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 block">
                                Tầng {isNhaPho ? "" : "(Chỉ Nhà phố)"}
                              </span>
                              <input
                                type="text"
                                value={isNhaPho ? item.so_tang : ""}
                                disabled={!isNhaPho}
                                onChange={(e) =>
                                  handleUpdateItemField(item.id, "so_tang", e.target.value)
                                }
                                placeholder={isNhaPho ? "Số tầng" : "-"}
                                title="Số tầng chỉ áp dụng khi loại hình là Nhà phố"
                                className="w-full px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 font-mono disabled:opacity-40 disabled:cursor-not-allowed"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-1">
                            <select
                              value={item.loai_hinh}
                              onChange={(e) =>
                                handleUpdateItemField(item.id, "loai_hinh", e.target.value)
                              }
                              className="w-full px-1.5 py-1 rounded bg-slate-950 border border-slate-800 text-[11px] text-amber-300 focus:outline-none focus:border-amber-500"
                            >
                              <option value="Nhà phố">Nhà phố</option>
                              <option value="Đất">Đất</option>
                              <option value="Nhà cấp 4">Nhà cấp 4</option>
                              <option value="Biệt thự">Biệt thự</option>
                              <option value="Kho xưởng">Kho xưởng</option>
                              <option value="Căn hộ">Căn hộ</option>
                            </select>
                          </div>

                          {item.needsReview && (
                            <div
                              className="px-2 py-1 rounded-md bg-orange-500/15 border border-orange-500/40 text-orange-300 text-[10px] font-semibold leading-tight flex items-start gap-1"
                              title={item.reviewNote}
                            >
                              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-orange-400" />
                              <span>
                                <b>Cần xem lại:</b> R×D ({item.calcArea}m²) lệch{" "}
                                {item.deviationPercent}% so với DT thực tế ({item.dien_tich_thuc_te}
                                m²)
                              </span>
                            </div>
                          )}
                          {item.needsLightCheck && (
                            <div
                              className="px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] leading-tight flex items-start gap-1"
                              title={item.lightCheckNote}
                            >
                              <ShieldAlert className="w-3 h-3 shrink-0 mt-0.5 text-amber-400" />
                              <span>
                                Kiểm tra: DT thực tế ({item.dien_tich_thuc_te}m²) &lt; DT sổ (
                                {item.dien_tich_so}m²)
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Giá chào */}
                        <td className="py-2.5 px-2.5 align-top space-y-1">
                          <input
                            type="text"
                            value={item.gia_text}
                            onChange={(e) =>
                              handleUpdateItemField(item.id, "gia_text", e.target.value)
                            }
                            placeholder="vd: 4.8 tỷ"
                            className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-amber-400 font-bold focus:border-amber-500 focus:outline-none"
                          />
                          <div className="text-[10px] font-mono text-slate-400">
                            {item.gia ? `${item.gia.toLocaleString("vi-VN")} đ` : "Chưa có giá"}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            HH:{" "}
                            <input
                              type="text"
                              value={item.hoa_hong}
                              onChange={(e) =>
                                handleUpdateItemField(item.id, "hoa_hong", e.target.value)
                              }
                              className="w-12 px-1 py-0.2 bg-slate-950 border border-slate-800 rounded text-slate-300 font-mono"
                            />
                          </div>
                        </td>

                        {/* Số ảnh & Thumbnail */}
                        <td className="py-2.5 px-2.5 align-top">
                          <button
                            type="button"
                            onClick={() => setActiveImageModalItemId(item.id)}
                            className="w-full p-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:border-amber-500/50 flex items-center gap-2 transition-all cursor-pointer"
                          >
                            {avatarImg ? (
                              <img
                                src={avatarImg.previewUrl}
                                alt="thumb"
                                className="w-10 h-10 rounded-lg object-cover shrink-0 border border-slate-700"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                                <ImageIcon className="w-4 h-4" />
                              </div>
                            )}
                            <div className="text-left min-w-0">
                              <div className="font-bold text-white text-xs">
                                {selectedImgs.length}/{item.images.length} ảnh
                              </div>
                              <div className="text-[9px] font-mono text-slate-400 truncate">
                                Storage/{item.ma_tk}/
                              </div>
                              <div className="text-[10px] text-blue-400 underline">
                                Xem & chọn ảnh
                              </div>
                            </div>
                          </button>
                        </td>

                        {/* Môi giới nguồn (Nội bộ) & Ngày lấy */}
                        <td className="py-2.5 px-2.5 align-top space-y-1">
                          <input
                            type="text"
                            value={item.moi_gioi_nguon}
                            onChange={(e) =>
                              handleUpdateItemField(item.id, "moi_gioi_nguon", e.target.value)
                            }
                            placeholder="Tên MG nguồn"
                            className="w-full px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300"
                          />
                          <input
                            type="text"
                            value={item.sdt_nguon}
                            onChange={(e) =>
                              handleUpdateItemField(item.id, "sdt_nguon", e.target.value)
                            }
                            placeholder="SĐT nguồn"
                            className="w-full px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300"
                          />
                          {item.ngay_lay_raw && (
                            <div
                              className="text-[10px] text-cyan-300 font-mono flex items-center gap-1"
                              title="Ngày lấy trích xuất từ file .txt"
                            >
                              <Clock className="w-3 h-3 shrink-0" />
                              <span>Ngày lấy: {item.ngay_lay_raw}</span>
                            </div>
                          )}
                          {item.mo_ta_tho && (
                            <button
                              type="button"
                              onClick={() => setActiveRawTxtItemId(item.id)}
                              className="text-[10px] text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <FileText className="w-3 h-3" />
                              <span>Xem mô tả thô (.txt)</span>
                            </button>
                          )}
                        </td>

                        {/* Trạng thái */}
                        <td className="py-2.5 px-2.5 align-top space-y-1">
                          <div className="flex flex-wrap gap-1">
                            {item.previewStatus === "moi" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold text-[11px]">
                                <CheckCircle2 className="w-3 h-3" /> Mới
                              </span>
                            )}
                            {item.previewStatus === "da_co" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/30 font-bold text-[11px]">
                                <Database className="w-3 h-3" /> Đã có
                              </span>
                            )}
                            {item.previewStatus === "thieu_thong_tin" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold text-[11px]">
                                <AlertTriangle className="w-3 h-3" /> Thiếu thông tin
                              </span>
                            )}
                            {item.previewStatus === "loi_doc" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/30 font-bold text-[11px]">
                                <XCircle className="w-3 h-3" /> Lỗi đọc
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 leading-snug">
                            {item.statusNote}
                          </div>
                          {existingEligibility && (
                            <div
                              className={`text-[10px] leading-snug px-1.5 py-0.5 rounded border ${
                                existingEligibility.canUpdateByDate
                                  ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                                  : "bg-slate-800 border-slate-700 text-slate-400"
                              }`}
                            >
                              {existingEligibility.dateComparisonNote}
                            </div>
                          )}
                          <div className="text-[10px] font-mono text-slate-500">
                            trang_thai_xu_ly: <b>{item.trang_thai_xu_ly}</b>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Step 2 Footer */}
            <div className="px-4 sm:px-6 py-3.5 border-t border-slate-800 bg-[#141b2d] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 text-xs text-slate-300">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Chọn lại thư mục khác</span>
                </button>
                <span>
                  Đã chọn <b>{counts.selected}</b> / {counts.total} nguồn để tải lên (Upsert{" "}
                  <code>onConflict: &apos;ma_tk&apos;</code>)
                </span>
              </div>

              <button
                type="button"
                disabled={counts.selected === 0}
                onClick={() => startUploadQueue(false)}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Bắt đầu tải lên ({counts.selected} nguồn)</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* STEP 3: TẢI LÊN THEO HÀNG ĐỢI (QUEUE & PROGRESS) */}
        {/* ========================================================= */}
        {step === 3 && (
          <div className="flex-1 flex flex-col min-h-0 p-4 sm:p-6 gap-4 overflow-hidden">
            {/* Overall Progress Card */}
            <div className="p-4 sm:p-5 rounded-2xl border border-slate-800 bg-slate-900/80 space-y-4 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                    {isRunningQueue ? (
                      <>
                        <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                        <span>
                          Đang xử lý hàng đợi (Lô {currentBatchIndex}/{Math.max(1, totalBatches)})...
                        </span>
                      </>
                    ) : isStopped ? (
                      <span className="text-amber-400">Đã tạm dừng hàng đợi</span>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Hoàn tất tiến trình xử lý hàng đợi — Tự động đóng cửa sổ...
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Storage đặt theo <code>ma_tk</code> thật · Upsert{" "}
                    <code>onConflict: &apos;ma_tk&apos;</code> · Bảo vệ các cột{" "}
                    <code>da_len_hometea, hometea_id, da_xep_lich_fb, da_dang_fb, draft_*</code>
                  </p>
                </div>

                {/* Queue Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {isRunningQueue ? (
                    <button
                      type="button"
                      onClick={handleStopQueue}
                      className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Dừng hàng đợi</span>
                    </button>
                  ) : (
                    <>
                      {isStopped && (
                        <button
                          type="button"
                          onClick={() => startUploadQueue(false)}
                          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Tiếp tục các nguồn còn lại</span>
                        </button>
                      )}
                      {failedRecords.length > 0 && (
                        <button
                          type="button"
                          onClick={() => startUploadQueue(true)}
                          className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Thử lại {failedRecords.length} nguồn lỗi</span>
                        </button>
                      )}
                      {failedRecords.length > 0 && (
                        <button
                          type="button"
                          onClick={handleExportFailedCsv}
                          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Xuất danh sách lỗi (CSV)</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 4 Stat Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-400 font-bold">
                    Đã nhập thành công
                  </span>
                  <div className="text-xl font-extrabold text-emerald-400 font-mono mt-0.5">
                    {importedCount} / {totalTargetCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-400 font-bold">Nguồn lỗi</span>
                  <div className="text-xl font-extrabold text-rose-400 font-mono mt-0.5">
                    {failedCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-400 font-bold">Đã bỏ qua</span>
                  <div className="text-xl font-extrabold text-blue-400 font-mono mt-0.5">
                    {skippedCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-400 font-bold">
                    Tiến độ tổng
                  </span>
                  <div className="text-xl font-extrabold text-amber-400 font-mono mt-0.5">
                    {totalTargetCount > 0
                      ? Math.min(
                          100,
                          Math.round(
                            ((importedCount + failedCount + skippedCount) / totalTargetCount) * 100
                          )
                        )
                      : 0}
                    %
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-300"
                  style={{
                    width: `${
                      totalTargetCount > 0
                        ? Math.min(
                            100,
                            Math.round(
                              ((importedCount + failedCount + skippedCount) / totalTargetCount) *
                                100
                            )
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* Per-source Realtime Queue Status & Logs Split View */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 overflow-hidden">
              {/* Left: Per-item live status */}
              <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900 font-bold text-xs text-slate-300">
                  Trạng thái từng nguồn trong hàng đợi
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70 p-2">
                  {items
                    .filter((i) => i.selected || i.queueState !== "idle")
                    .map((item) => (
                      <div
                        key={item.id}
                        className="p-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-amber-400">
                              {item.ma_tk || "N/A"}
                            </span>
                            <span className="text-slate-200 font-medium truncate">
                              {item.dia_chi || [item.so_nha, item.duong].filter(Boolean).join(" ")}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate mt-0.5">
                            {item.queueMessage || "Đang chờ tới lượt..."}
                          </div>
                        </div>

                        <div className="shrink-0">
                          {item.queueState === "uploading_images" && (
                            <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Ảnh {item.uploadedImagesCount || 0}/
                              {item.images.filter((i) => i.selected).length}
                            </span>
                          )}
                          {item.queueState === "saving_db" && (
                            <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-300 font-mono text-[10px] flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Upsert DB...
                            </span>
                          )}
                          {item.queueState === "done" && (
                            <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
                              ✓ Đã xong
                            </span>
                          )}
                          {item.queueState === "skipped" && (
                            <span className="px-2 py-1 rounded bg-slate-700 text-slate-300 font-bold text-[10px]">
                              Bỏ qua
                            </span>
                          )}
                          {item.queueState === "error" && (
                            <span className="px-2 py-1 rounded bg-rose-500/20 text-rose-300 font-bold text-[10px]">
                              ✕ Lỗi
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Right: Detailed Activity Log */}
              <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900 font-bold text-xs text-slate-300 flex items-center justify-between">
                  <span>Nhật ký thực thi (Realtime)</span>
                  <span className="text-[10px] font-mono text-slate-500">{logs.length} dòng</span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-1.5 font-mono text-[11px]">
                  {logs.length === 0 ? (
                    <div className="text-slate-500 text-center py-8">Chưa có nhật ký...</div>
                  ) : (
                    logs.map((log) => (
                      <div
                        key={log.id}
                        className={`p-2 rounded-lg border ${
                          log.status === "success"
                            ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-300"
                            : log.status === "error"
                            ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                            : log.status === "skip"
                            ? "bg-blue-500/5 border-blue-500/20 text-blue-300"
                            : "bg-slate-900 border-slate-800 text-slate-300"
                        }`}
                      >
                        <span className="text-slate-500 mr-2">[{log.time}]</span>
                        <span className="font-bold mr-2">[{log.ma_tk}]</span>
                        <span>{log.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SUB-MODAL 1: QUẢN LÝ & LỌC ẢNH CỦA MỘT NGUỒN NHÀ */}
        {/* ========================================================= */}
        {activeImageModalItem && (
          <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
            <div className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-700 bg-[#111726] overflow-hidden shadow-2xl">
              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <span className="text-amber-400 font-mono">{activeImageModalItem.ma_tk}</span>
                    <span>— Chọn ảnh & Đặt ảnh đại diện</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Thư mục Storage: <code>{activeImageModalItem.ma_tk}/</code> · Các ảnh chụp màn
                    hình (Capture/Screenshot) đã được tự động bỏ chọn
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveImageModalItemId(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {activeImageModalItem.images.map((img) => (
                  <div
                    key={img.id}
                    className={`rounded-xl border overflow-hidden flex flex-col justify-between transition-all ${
                      img.selected
                        ? img.isAvatar
                          ? "border-amber-400 ring-2 ring-amber-400/30 bg-slate-900"
                          : "border-emerald-500/50 bg-slate-900"
                        : "border-slate-800 bg-slate-950 opacity-55"
                    }`}
                  >
                    <div className="relative aspect-4/3 bg-black">
                      <img
                        src={img.previewUrl}
                        alt={img.fileName}
                        className="w-full h-full object-cover"
                      />
                      {img.isAvatar && img.selected && (
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-bold text-[10px] flex items-center gap-1 shadow">
                          <Star className="w-3 h-3 fill-current" /> Ảnh đại diện
                        </span>
                      )}
                      {img.autoExcluded && (
                        <span className="absolute bottom-2 left-2 right-2 px-1.5 py-0.5 rounded bg-rose-950/90 border border-rose-500/40 text-rose-200 text-[9px] truncate">
                          {img.excludeReason || "Tự động ẩn"}
                        </span>
                      )}
                    </div>

                    <div className="p-2 space-y-1.5 text-[11px]">
                      <div className="truncate text-slate-300 font-mono text-[10px]" title={img.fileName}>
                        {img.fileName}
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleImageSelected(activeImageModalItem.id, img.id)
                          }
                          className={`flex-1 py-1 px-2 rounded font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                            img.selected
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {img.selected ? (
                            <>
                              <Eye className="w-3 h-3" /> Lấy ảnh
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3 h-3" /> Đang ẩn
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetAvatarImage(activeImageModalItem.id, img.id)}
                          className={`py-1 px-2 rounded font-semibold flex items-center gap-1 cursor-pointer ${
                            img.isAvatar && img.selected
                              ? "bg-amber-500 text-slate-950"
                              : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                          }`}
                          title="Đặt làm ảnh đại diện"
                        >
                          <Star className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-5 py-3 border-t border-slate-800 bg-slate-900 flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveImageModalItemId(null)}
                  className="px-4 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Xong</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SUB-MODAL 2: XEM NỘI DUNG FILE .TXT GỐC (MÔ TẢ THÔ) */}
        {/* ========================================================= */}
        {activeRawTxtItem && (
          <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl border border-slate-700 bg-[#111726] overflow-hidden shadow-2xl">
              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-white">
                    Nội dung .txt gốc ({activeRawTxtItem.txtFileName || "mo_ta_tho"})
                  </h3>
                  <p className="text-[11px] text-amber-400">
                    Mã TK: {activeRawTxtItem.ma_tk}
                    {activeRawTxtItem.ngay_lay_raw
                      ? ` · Ngày lấy: ${activeRawTxtItem.ngay_lay_raw}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveRawTxtItemId(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <pre className="flex-1 overflow-y-auto p-4 text-xs text-slate-200 font-mono whitespace-pre-wrap bg-slate-950 leading-relaxed">
                {activeRawTxtItem.mo_ta_tho}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
