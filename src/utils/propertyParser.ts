import { Property } from "../types";

export interface ParsedPropertyData {
  displayTitle: string;
  cleanAddress: string;
  ownerName: string;
  price: string;
  priceNumber?: number; // In billions
  priceUnit: string;
  pricePerM2?: string;
  area: string;
  areaNumber?: number;
  dimensions: string;
  floors: string;
  rooms?: string;
  sourceCode: string;
  commission: string;
  leadBrokerName: string;
  leadBrokerRole: string;
  leadBrokerRoleLabel: string;
  leadBrokerPhone: string;
  leadBrokerFacebook: string;
  googleMapsUrl: string;
  rentalIncome: string;
  highlights: string[];
  cleanDescription: string;
  surveyNotes: Array<{
    author: string;
    phone: string;
    date: string;
    comment: string;
  }>;
}

export function parsePropertyData(prop?: Property | null): ParsedPropertyData {
  const safeProp = prop || ({} as Property);
  const content = safeProp.content || "";
  const rawName = (safeProp.name || "").trim();

  // 1. Check if rawName is a Person Name or a Property Title/Address
  // A property title typically has numbers, "đường", "hẻm", "thửa", "nhà", "kdc", "TK", etc.
  const isLikelyPersonName =
    !/\d/.test(rawName) &&
    !/đường|hẻm|thửa|nhà|kdc|chung cư|dự án|đất|mặt tiền|lô|quận|phường|tỉnh|tp\./i.test(rawName) &&
    rawName.split(/\s+/).length <= 4 &&
    rawName.length > 0;

  const ownerName = isLikelyPersonName ? rawName : (safeProp.created_by_name || "");

  // 2. Extract Source Code (e.g. TK64NIGN)
  let sourceCode = "";
  const codeMatch = content.match(/Mã nguồn hàng:\s*([A-Za-z0-9_-]+)/i);
  if (codeMatch) {
    sourceCode = codeMatch[1].trim();
  } else {
    const codeFromName = rawName.match(/\b(TK[A-Za-z0-9]{5,10})\b/i);
    if (codeFromName) {
      sourceCode = codeFromName[1].toUpperCase();
    }
  }

  // 3. Price & Price Unit
  let price = "";
  let priceUnit = "tỷ";
  let priceNumber: number | undefined;

  // Patterns for price:
  // a) "Giá chào (VNĐ): 9.2 tỷ" or "Giá bán: 9.2 tỷ"
  const priceMatch1 = content.match(/(?:Giá chào|Giá bán|Giá niêm yết)\s*(?:\(VNĐ\))?:\s*([0-9]+(?:[.,][0-9]+)?(?:\s*(?:tỷ|triệu|ty|tr))?)/i);
  // b) "9.2 tỷ" in name
  const priceMatch2 = rawName.match(/([0-9]+(?:[.,][0-9]+)?)\s*(tỷ|ty|triệu|tr)\b/i);
  // c) "2.3B" (billion)
  const priceMatchB = content.match(/\b([0-9]+(?:[.,][0-9]+)?)\s*B\b/i) || rawName.match(/\b([0-9]+(?:[.,][0-9]+)?)\s*B\b/i);
  // d) "giá 17,5" or "giá 3.6 tỷ" in content
  const priceMatch3 = content.match(/giá\s*([0-9]+(?:[.,][0-9]+)?)(?:\s*(tỷ|triệu|tr|ty))?/i);

  if (priceMatch1) {
    price = priceMatch1[1].trim();
  } else if (priceMatch2) {
    price = `${priceMatch2[1]} ${priceMatch2[2]}`;
  } else if (priceMatchB) {
    price = `${priceMatchB[1]} tỷ`;
  } else if (priceMatch3) {
    const unit = priceMatch3[2] || "tỷ";
    price = `${priceMatch3[1]} ${unit}`;
  }

  if (price) {
    const numPart = price.replace(/[^\d.,]/g, "").replace(",", ".");
    const val = parseFloat(numPart);
    if (!isNaN(val)) {
      if (/triệu|tr/i.test(price)) {
        priceNumber = val / 1000;
        priceUnit = "triệu";
      } else {
        priceNumber = val;
        priceUnit = "tỷ";
      }
    }
  }

  // 4. Commission (Hoa hồng / Phần trăm trích thưởng)
  let commission = "";
  const comMatch1 = content.match(/(?:Phần trăm trích thưởng|Hoa hồng):\s*([0-9.,]+%?)/i);
  const comMatch2 = content.match(/\bhh\s*([0-9.,]+%?)/i);
  if (comMatch1) {
    commission = comMatch1[1].trim();
  } else if (comMatch2) {
    commission = comMatch2[1].trim();
  }
  if (commission && !commission.endsWith("%")) commission += "%";

  // 5. Area, Dimensions, Floors, Rooms
  let area = "";
  let areaNumber: number | undefined;
  let dimensions = "";
  let floors = "";
  let rooms = "";

  // Title pattern from Proptech: [Address] [Area] [Floors] [Width] [Length] [Price]
  // e.g. "36F2VP2 đường 18(KDC Vĩnh Phú 2 ) 140 2 7 20 9.2 tỷ" or "Hẻm 230 Lò Lu 67-75 3 4 18.5 6.8 tỷ"
  const titlePattern = /^(?:[A-Za-z0-9_-]+_)?(.*?)\s+([0-9]+(?:[.,][0-9]+)?(?:[/-][0-9]+(?:[.,][0-9]+)?)?)\s+([0-9]+|Đất)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?\s*(?:tỷ|ty|triệu|tr))/i;
  const titleMatch = rawName.match(titlePattern);

  let cleanAddress = rawName;

  if (titleMatch) {
    cleanAddress = titleMatch[1].trim();
    area = `${titleMatch[2]} m²`;
    const parts = titleMatch[2].split(/[/-]/);
    const numArea = parseFloat((parts[1] || parts[0]).replace(",", "."));
    if (!isNaN(numArea)) areaNumber = numArea;

    floors = titleMatch[3].toLowerCase() === "đất" ? "Đất" : `${titleMatch[3]} tầng`;
    dimensions = `${titleMatch[4]} × ${titleMatch[5]}m`;
  } else {
    // Try to extract area from content without ever concatenating "67-75" into 6775
    const areaMatch1 = content.match(/Diện tích:\s*([^\n\r,•]+)/i);
    const areaMatch2 = content.match(/([0-9]+(?:[.,][0-9]+)?(?:\s*[/-]\s*[0-9]+(?:[.,][0-9]+)?)?)\s*(?:m2|m²)\b/i);
    if (areaMatch1) {
      const rawLine = areaMatch1[1].trim();
      const firstPart = rawLine.split("(")[0].replace(/m2|m²/gi, "").trim();
      area = `${firstPart} m²`;
      const dualOrSingle = firstPart.match(/([0-9]+(?:[.,][0-9]+)?)(?:\s*[/-]\s*([0-9]+(?:[.,][0-9]+)?))?/);
      if (dualOrSingle) {
        const numArea = parseFloat((dualOrSingle[2] || dualOrSingle[1]).replace(",", "."));
        if (!isNaN(numArea)) areaNumber = numArea;
      }
    } else if (areaMatch2) {
      const token = areaMatch2[1].replace(/\s+/g, "");
      area = `${token} m²`;
      const parts = token.split(/[/-]/);
      const numArea = parseFloat((parts[1] || parts[0]).replace(",", "."));
      if (!isNaN(numArea)) areaNumber = numArea;
    }

    const dimMatch = content.match(/\(([0-9]+(?:[.,][0-9]+)?)\s*[x×]\s*([0-9]+(?:[.,][0-9]+)?)m?\)/i) ||
                     content.match(/([0-9]+(?:[.,][0-9]+)?)\s*m?\s*[x×]\s*([0-9]+(?:[.,][0-9]+)?)\s*m/i);
    if (dimMatch) {
      dimensions = `${dimMatch[1]} × ${dimMatch[2]}m`;
    }

    // Floors / Structure
    if (/cấp\s*4|nhà\s*c4\b/i.test(content)) {
      floors = "Nhà cấp 4";
    } else if (/1\s*trệt\s*1\s*lửng/i.test(content)) {
      floors = "1 trệt 1 lửng";
    } else if (/1\s*trệt\s*1\s*lầu/i.test(content)) {
      floors = "1 trệt 1 lầu (2 tầng)";
    } else if (/1\s*trệt\s*2\s*lầu/i.test(content)) {
      floors = "1 trệt 2 lầu (3 tầng)";
    } else {
      const floorMatch = content.match(/Kết cấu:\s*([0-9]+)\s*tầng/i) || content.match(/nhà\s*([0-9]+)\s*tầng/i);
      if (floorMatch) {
        floors = `${floorMatch[1]} tầng`;
      }
    }

    // Rooms (PN, WC)
    const roomMatch = content.match(/([0-9]+\s*pn|[0-9]+\s*phòng\s*ngủ)[^0-9\n]*([0-9]+\s*wc|[0-9]+\s*vệ\s*sinh)?/i);
    if (roomMatch) {
      const pn = roomMatch[1].toUpperCase().replace(/\s+/g, "");
      const wc = roomMatch[2] ? roomMatch[2].toUpperCase().replace(/\s+/g, "") : "";
      rooms = wc ? `${pn} · ${wc}` : pn;
    }
  }

  // If rawName was person name, extract clean title from content
  if (isLikelyPersonName && content) {
    const firstLine = content.split("\n")[0].trim().replace(/^[•\-\*#]+\s*/, "");
    if (firstLine.length > 5 && firstLine.length < 120) {
      cleanAddress = firstLine;
    } else {
      const addrMatch = content.match(/(?:Địa chỉ|Vị trí|ĐC):\s*([^\n\r.]+)/i);
      if (addrMatch) {
        cleanAddress = addrMatch[1].trim();
      }
    }
  }

  // Remove code prefix from cleanAddress if present
  cleanAddress = cleanAddress.replace(/^[A-Za-z0-9_-]+_/, "").trim();
  const displayTitle = cleanAddress || rawName || "Tin Bất Động Sản";

  // Calculate price per m2
  let pricePerM2: string | undefined;
  if (priceNumber && areaNumber && areaNumber > 0) {
    const millionPerM2 = (priceNumber * 1000) / areaNumber;
    if (millionPerM2 < 1000) {
      pricePerM2 = `~${millionPerM2.toFixed(1)} tr/m²`;
    } else {
      pricePerM2 = `~${(millionPerM2 / 1000).toFixed(2)} tỷ/m²`;
    }
  }

  // 6. Lead Broker / Person in charge (Đầu chủ / Phó phòng / Trưởng phòng / Giám đốc)
  let leadBrokerName = "";
  let leadBrokerRole = "Đầu chủ";

  // Match 1: "Name : Role - Unit" (e.g. "Nguyễn Tiến Mạnh : Phó phòng - Thiên Trí TĐ" or "Nguyễn Thành Tâm: Đầu chủ - Vạn Gia HCM.TĐ")
  const leadMatch1 = content.match(
    /(?:^|\n)([\p{L}\s.-]{2,35})\s*:\s*([^\n\r]*(?:Đầu chủ|Phó phòng|Trưởng phòng|Giám đốc|Giáp đốc|Phó giám đốc|Phó giáp đốc|Khối trưởng|Trưởng khối|Trợ lý|Chuyên viên|Quản lý)[^\n\r]*)/ui
  );
  if (leadMatch1) {
    const candidateName = leadMatch1[1].trim();
    if (!/Loại nguồn hàng|Chi tiết|Thông tin|Kênh phân phối|Trạng thái|Mã nguồn/i.test(candidateName)) {
      leadBrokerName = candidateName;
      leadBrokerRole = leadMatch1[2].trim();
    }
  }

  // Match 2: "ĐC / Đầu chủ / Phó phòng / Trưởng phòng [Name]"
  if (!leadBrokerName) {
    const leadMatch2 = content.match(
      /(?:ĐC|Đầu chủ|Phó phòng|Trưởng phòng|Giám đốc|Giáp đốc)\s+([\p{L}\s]{2,30}?)(?:\s+ký|\s+chốt|\s+nhận|[-–,.]|$|\s+(?:trước|inbox|hỗ trợ))/u
    );
    if (leadMatch2) {
      const candidate = leadMatch2[1].trim();
      if (!/Loại nguồn hàng|Chi tiết|Thông tin/i.test(candidate) && candidate.length > 2) {
        leadBrokerName = candidate;
      }
    }
  }

  if (!leadBrokerName && safeProp.created_by_name && safeProp.created_by_name !== "Chưa phân công") {
    leadBrokerName = safeProp.created_by_name;
  }
  if (!leadBrokerName && safeProp.manager?.full_name) {
    leadBrokerName = safeProp.manager.full_name;
  }

  // Determine standard role badge label
  let leadBrokerRoleLabel = "ĐẦU CHỦ";
  const r = (leadBrokerRole || "").toLowerCase();
  if (r.includes("phó phòng") || r.includes("phó p.")) {
    leadBrokerRoleLabel = "PHÓ PHÒNG";
  } else if (r.includes("trưởng phòng") || r.includes("trưởng p.")) {
    leadBrokerRoleLabel = "TRƯỜNG PHÒNG";
  } else if (r.includes("giám đốc") || r.includes("giáp đốc")) {
    leadBrokerRoleLabel = r.includes("phó") ? "PHÓ GIÁM ĐỐC" : "GIÁM ĐỐC";
  } else if (r.includes("khối trưởng") || r.includes("trưởng khối")) {
    leadBrokerRoleLabel = "KHỐI TRƯỜNG";
  } else if (r.includes("đầu chủ")) {
    leadBrokerRoleLabel = "ĐẦU CHỦ";
  } else if (r.includes("chuyên viên")) {
    leadBrokerRoleLabel = "CHUYÊN VIÊN";
  } else {
    leadBrokerRoleLabel = "PHỤ TRÁCH";
  }

  // 7. Lead Broker Phone
  let leadBrokerPhone = safeProp.phone ? safeProp.phone.trim() : "";
  if (!leadBrokerPhone) {
    // 1. Line with phone and Facebook: e.g. "0983370335 : Facebook"
    const phoneMatch1 = content.match(/(\b0[0-9]{9,10}\b)\s*:\s*Facebook/i);
    // 2. Line with Contact phrase
    const phoneMatch2 = content.match(/(?:Liên hệ ĐC|Liên hệ|SĐT|Hotline|Zalo|Tel)[^\d\n]*(\b0[0-9\s.]{9,12}\b)/i);
    // 3. Pointer emoji 👉 09...
    const phoneMatch3 = content.match(/👉\s*(0[0-9\s.]{9,12})/);
    // 4. Standalone valid Vietnamese phone number
    const phoneMatch4 = content.match(/\b(0[3|5|7|8|9][0-9]{8})\b/);

    if (phoneMatch1) {
      leadBrokerPhone = phoneMatch1[1].trim();
    } else if (phoneMatch2) {
      leadBrokerPhone = phoneMatch2[1].replace(/[\s.]/g, "");
    } else if (phoneMatch3) {
      leadBrokerPhone = phoneMatch3[1].replace(/[\s.]/g, "");
    } else if (phoneMatch4) {
      leadBrokerPhone = phoneMatch4[1].trim();
    }
  }

  if (!leadBrokerPhone && safeProp.manager?.phone) {
    leadBrokerPhone = safeProp.manager.phone;
  }
  if (!leadBrokerPhone && safeProp.created_by_phone) {
    leadBrokerPhone = safeProp.created_by_phone;
  }

  // 8. Lead Broker Facebook
  let leadBrokerFacebook = safeProp.facebook_link || "";
  if (!leadBrokerFacebook) {
    const fbMatch = content.match(/https:\/\/(?:www\.)?facebook\.com\/[^\s\n\r]+/i);
    if (fbMatch) {
      leadBrokerFacebook = fbMatch[0];
    }
  }

  // 9. Google Maps URL
  let googleMapsUrl = safeProp.website_link && /maps/i.test(safeProp.website_link) ? safeProp.website_link : "";
  if (!googleMapsUrl) {
    const mapMatch1 = content.match(/Dinh vi:\s*(https:\/\/[^\s\n\r]+)/i);
    const mapMatch2 = content.match(/https:\/\/goo\.gl\/maps\/[^\s\n\r]+/i);
    const mapMatch3 = content.match(/https:\/\/www\.google\.com\/maps\/[^\s\n\r]+/i);
    const mapMatch4 = content.match(/https:\/\/maps\.app\.goo\.gl\/[^\s\n\r]+/i);
    if (mapMatch1) {
      googleMapsUrl = mapMatch1[1];
    } else if (mapMatch2) {
      googleMapsUrl = mapMatch2[0];
    } else if (mapMatch3) {
      googleMapsUrl = mapMatch3[0];
    } else if (mapMatch4) {
      googleMapsUrl = mapMatch4[0];
    }
  }

  // 10. Rental Income (Dòng tiền)
  let rentalIncome = "";
  const rentMatch1 = content.match(
    /(?:Dòng tiền(?: cho thuê)?|cho thuê)\s*[:–-]?\s*(~?\s*[0-9]+(?:[.,][0-9]+)?\s*(?:triệu|tr|tỷ|k|usd)(?:\s*\/\s*(?:tháng|th|năm))?)/i
  );
  if (rentMatch1) {
    rentalIncome = rentMatch1[1].trim();
  } else if (/dòng tiền ổn định/i.test(content)) {
    rentalIncome = "ổn định";
  }

  // 11. Highlights
  const highlights: string[] = [];
  if (/mặt tiền\s*(kinh doanh)?/i.test(content) || /mặt tiền/i.test(rawName)) {
    highlights.push("Mặt tiền kinh doanh");
  }
  if (rentalIncome && !rentalIncome.includes("http") && !rentalIncome.includes("//")) {
    highlights.push(rentalIncome === "ổn định" ? "Dòng tiền ổn định" : `Dòng tiền ${rentalIncome}`);
  }
  if (/sổ hồng riêng|hoàn công/i.test(content)) {
    highlights.push("Sổ hồng riêng");
  }
  if (/đường ô tô|xe hơi|đường\s*[0-9]+m/i.test(content)) {
    highlights.push("Đường ô tô");
  }
  if (/ký chính chủ/i.test(content)) {
    highlights.push("Ký chính chủ");
  }

  // 12. Clean Description (Text after "--- MO TA ---" if present, else cleaned content)
  let cleanDescription = content;
  const descSplit = content.split(/---\s*MO TA\s*---/i);
  if (descSplit.length > 1) {
    cleanDescription = descSplit[1].trim();
  } else {
    const detailSplit = content.split(/---\s*THONG TIN CHI TIET\s*---/i);
    if (detailSplit.length > 1) {
      cleanDescription = detailSplit[1].trim();
    }
  }

  // 13. Survey Notes (Bình luận / Ghi chú khảo sát)
  const surveyNotes: ParsedPropertyData["surveyNotes"] = [];
  const surveyMatch = content.match(/Bình luận:\s*Ghi chú([\s\S]*?)(?:Dinh vi:|---\s*MO TA\s*---|$)/i);
  if (surveyMatch) {
    const rawNotes = surveyMatch[1].trim();
    const lines = rawNotes.split("\n").map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const commentMatch = line.match(/^([^:\n]+):\s*(.*)$/);
      if (commentMatch) {
        const authorPart = commentMatch[1].trim();
        const commentPart = commentMatch[2].trim();
        
        let datePart = "";
        let phonePart = "";
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const dateMatch = nextLine.match(/([0-9/.-]+\s*-\s*[0-9:]+)(?::\s*([0-9\s.]+))?/);
          if (dateMatch) {
            datePart = dateMatch[1];
            phonePart = dateMatch[2] ? dateMatch[2].trim() : "";
            i++;
          }
        }
        
        surveyNotes.push({
          author: authorPart,
          phone: phonePart,
          date: datePart,
          comment: commentPart
        });
      }
    }
  }

  return {
    displayTitle,
    cleanAddress,
    ownerName,
    price: price || "Thương lượng",
    priceNumber,
    priceUnit,
    pricePerM2,
    area: area || (prop.content ? "Chưa có" : ""),
    areaNumber,
    dimensions,
    floors,
    rooms,
    sourceCode,
    commission: commission || "3%",
    leadBrokerName: leadBrokerName || "Đang cập nhật",
    leadBrokerRole,
    leadBrokerRoleLabel,
    leadBrokerPhone,
    leadBrokerFacebook,
    googleMapsUrl,
    rentalIncome,
    highlights,
    cleanDescription,
    surveyNotes
  };
}
