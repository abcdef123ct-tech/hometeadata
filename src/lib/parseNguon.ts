export interface ParsedTitleResult {
  ma_tk: string | null;
  so_nha: string | null;
  thua: string | null;
  to: string | null;
  ten_duong: string | null;
  ghi_chu_vi_tri: string | null;
  khu: string | null;
  dien_tich_so: number | null;
  dien_tich_thuc_te: number | null;
  so_tang: number | null;
  loai_hinh: 'Nhà phố' | 'Đất' | 'Khác' | null;
  rong: number | null;
  dai: number | null;
  gia: number | null;
  canh_bao: string[];
}

export interface ParsedDetailResult {
  gia_chao: number | null;
  loai_hinh_chi_tiet: string | null;
  ma_nguon_chi_tiet: string | null;
  dien_tich_mo_ta: number | null;
  rong_mo_ta: number | null;
  dai_mo_ta: number | null;
  canh_bao: string[];
}

export interface CrossCheckFlags {
  lech_rong_dai_dt: boolean;
  gia_tieu_de_khac_gia_chao: boolean;
  gia_m2_la: boolean;
  tang_qua_nhieu: boolean;
  dat_nhung_co_tang: boolean;
  dt_mo_ta_khac_dt_tieu_de: boolean;
}

export function parseTieuDe(name: string): ParsedTitleResult {
  const result: ParsedTitleResult = {
    ma_tk: null,
    so_nha: null,
    thua: null,
    to: null,
    ten_duong: null,
    ghi_chu_vi_tri: null,
    khu: null,
    dien_tich_so: null,
    dien_tich_thuc_te: null,
    so_tang: null,
    loai_hinh: 'Nhà phố',
    rong: null,
    dai: null,
    gia: null,
    canh_bao: []
  };

  try {
    if (!name || typeof name !== 'string') {
      result.canh_bao.push('Tiêu đề trống hoặc không hợp lệ');
      return result;
    }

    let workingStr = name.trim();

    // 1. Bỏ tiền tố "<mã>_" ở đầu.
    const prefixMatch = workingStr.match(/^([A-Z0-9]+)_(.+)$/);
    if (prefixMatch) {
      const potentialCode = prefixMatch[1].toUpperCase();
      if (/^TK[A-Z0-9]{6}$/.test(potentialCode) || /^\d+$/.test(potentialCode)) {
        result.ma_tk = potentialCode;
        workingStr = prefixMatch[2].trim();
      }
    }

    // Trích xuất ngoặc đơn
    const bracketMatches: string[] = [];
    workingStr = workingStr.replace(/\(([^)]+)\)/g, (match, content) => {
      bracketMatches.push(content.trim());
      return ` __BRACKET_${bracketMatches.length - 1}__ `;
    });

    const thuaMatch = workingStr.match(/thửa\s*(\d+)/i);
    if (thuaMatch) {
      result.thua = thuaMatch[1];
      workingStr = workingStr.replace(/thửa\s*\d+/ig, '');
    }

    const toMatch = workingStr.match(/tờ\s*(\d+)/i);
    if (toMatch) {
      result.to = toMatch[1];
      workingStr = workingStr.replace(/tờ\s*\d+/ig, '');
    }

    let tokens = workingStr.split(/\s+/).filter(Boolean);
    let i = tokens.length - 1;

    // Đọc giá từ cuối lên
    if (i >= 0 && /tỷ/i.test(tokens[i])) {
      let priceVal = null;
      if (i > 0 && /^\d+([.,]\d+)?$/.test(tokens[i - 1])) {
        priceVal = parseFloat(tokens[i - 1].replace(',', '.')) * 1e9;
        i -= 2;
      } else {
        let numStr = tokens[i].replace(/tỷ/ig, '').replace(',', '.');
        if (/^\d+([.,]\d+)?$/.test(numStr)) {
          priceVal = parseFloat(numStr) * 1e9;
          i -= 1;
        } else if (i > 0) {
          let numCombined = parseFloat(tokens[i - 1].replace(',', '.'));
          if (!isNaN(numCombined)) {
            priceVal = numCombined * 1e9;
            i -= 2;
          }
        }
      }
      if (priceVal !== null) {
        result.gia = priceVal;
      }
    }

    let remainingTokens = tokens.slice(0, i + 1);

    const datIdx = remainingTokens.findIndex(t => /^đất$/i.test(t));
    if (datIdx !== -1) {
      result.loai_hinh = 'Đất';
      remainingTokens.splice(datIdx, 1);
    }

    // Đối với trường hợp có tên đường lặp lại (như "đường 12 ... đường 12") hoặc số đứng sau tên đường,
    // ta tìm các số ở cuối chuỗi remainingTokens.
    // Các token số ở cuối (trước giá):
    const isNum = (s: string) => /^\d+([.,]\d+)?$/.test(s);
    const isDtRange = (s: string) => /^\d+([–\-\/]\d+)?$/.test(s);

    const numericTailValues: { index: number; valStr: string }[] = [];
    let rIdx = remainingTokens.length - 1;

    while (rIdx >= 0 && (isDtRange(remainingTokens[rIdx]) || isNum(remainingTokens[rIdx]))) {
      numericTailValues.unshift({ index: rIdx, valStr: remainingTokens[rIdx] });
      rIdx--;
    }

    // Nếu numericTailValues có nhiều hơn số lượng thông số nhà/đất (ví dụ ở ca #2 có số "12" sau chữ "đường 12" bị nhận nhầm vào cuối),
    // ta lọc bỏ các số thuộc tên đường (ví dụ số đứng ngay sau chữ "đường", "hẻm", "số").
    // Tuy nhiên, để chính xác cho các ca #2 và #4:
    // Ca #2: "... đường 12 Tam Đa ... đường 12 56 4 5.5 10.5" -> các số thật sự là [56, 4, 5.5, 10.5] ở tận cùng.
    // Nếu numericTailValues lấy dư, ta chỉ lấy 4 số cuối cùng (hoặc 3 số cuối nếu là đất).
    let validTail = numericTailValues;
    if (validTail.length > 4) {
      validTail = validTail.slice(validTail.length - 4);
    }

    if (validTail.length >= 4) {
      parseArea(validTail[0].valStr, result);
      let tNum = parseFloat(validTail[1].valStr.replace(',', '.'));
      if (!isNaN(tNum)) result.so_tang = tNum;
      result.loai_hinh = 'Nhà phố';

      let rNum = parseFloat(validTail[2].valStr.replace(',', '.'));
      if (!isNaN(rNum)) result.rong = rNum;

      let dNum = parseFloat(validTail[3].valStr.replace(',', '.'));
      if (!isNaN(dNum)) result.dai = dNum;

      rIdx = validTail[0].index - 1;
    } else if (validTail.length === 3) {
      if (result.loai_hinh === 'Đất') {
        parseArea(validTail[0].valStr, result);
        let rNum = parseFloat(validTail[1].valStr.replace(',', '.'));
        if (!isNaN(rNum)) result.rong = rNum;
        let dNum = parseFloat(validTail[2].valStr.replace(',', '.'));
        if (!isNaN(dNum)) result.dai = dNum;
      } else {
        parseArea(validTail[0].valStr, result);
        let rNum = parseFloat(validTail[1].valStr.replace(',', '.'));
        let dNum = parseFloat(validTail[2].valStr.replace(',', '.'));
        if (!isNaN(rNum)) result.rong = rNum;
        if (!isNaN(dNum)) result.dai = dNum;
      }
      rIdx = validTail[0].index - 1;
    } else if (validTail.length === 2) {
      parseArea(validTail[0].valStr, result);
      let dNum = parseFloat(validTail[1].valStr.replace(',', '.'));
      if (!isNaN(dNum)) result.dai = dNum;
      rIdx = validTail[0].index - 1;
    } else if (validTail.length === 1) {
      parseArea(validTail[0].valStr, result);
      rIdx = validTail[0].index - 1;
    }

    let addressTokens = remainingTokens.slice(0, rIdx + 1);
    let addressStr = addressTokens.join(' ');

    if (bracketMatches.length > 0) {
      bracketMatches.forEach((bContent, bIdx) => {
        addressStr = addressStr.replace(`__BRACKET_${bIdx}__`, `(${bContent})`);
        if (/kdc|khu|pcr|đông tăng long|long phước mới/i.test(bContent)) {
          if (!result.khu) result.khu = bContent;
          else result.khu += `, ${bContent}`;
        } else {
          if (!result.ghi_chu_vi_tri) result.ghi_chu_vi_tri = bContent;
          else result.ghi_chu_vi_tri += `; ${bContent}`;
        }
      });
    }

    parseAddressAndRoad(addressStr, result);

  } catch (err: any) {
    result.canh_bao.push(`Lỗi parse tiêu đề: ${err?.message || err}`);
  }

  return result;
}

function parseArea(areaStr: string, result: ParsedTitleResult) {
  if (!areaStr) return;
  if (areaStr.includes('-')) {
    const parts = areaStr.split('-');
    const s1 = parseFloat(parts[0]);
    const s2 = parseFloat(parts[1]);
    if (!isNaN(s1)) result.dien_tich_so = s1;
    if (!isNaN(s2)) result.dien_tich_thuc_te = s2;
  } else if (areaStr.includes('/') || areaStr.includes('–')) {
    const sep = areaStr.includes('/') ? '/' : '–';
    const parts = areaStr.split(sep);
    const s1 = parseFloat(parts[0]);
    const s2 = parseFloat(parts[1]);
    if (!isNaN(s1)) result.dien_tich_so = s1;
    if (!isNaN(s2)) result.dien_tich_thuc_te = s2;
  } else {
    const val = parseFloat(areaStr.replace(',', '.'));
    if (!isNaN(val)) {
      result.dien_tich_so = val;
      result.dien_tich_thuc_te = val;
    }
  }
}

function parseAddressAndRoad(addressStr: string, result: ParsedTitleResult) {
  if (!addressStr) return;

  const nearKeywordsRegex = /(kế|cạnh|gần|đối diện)\s+[^,]+/ig;
  const matchesNear = addressStr.match(nearKeywordsRegex);
  if (matchesNear) {
    matchesNear.forEach(m => {
      if (!result.ghi_chu_vi_tri) result.ghi_chu_vi_tri = m.trim();
      else result.ghi_chu_vi_tri += `; ${m.trim()}`;
      addressStr = addressStr.replace(m, '');
    });
  }

  addressStr = addressStr.replace(/\s+/g, ' ').trim();

  let cleaned = addressStr;

  cleaned = cleaned.replace(/(\d+)\.(\d+)(?:\.(\d+))?(?:\.(\d+))?/g, (match, p1, p2, p3, p4) => {
    return [p1, p2, p3, p4].filter(Boolean).join('/');
  });

  const roadKeywordMatch = cleaned.match(/(?:hẻm|đường|đường số|lô|phố|p\.)\s+([a-zA-Z0-9\s]+)/i);

  let houseNumberPart = '';
  let streetPart = '';

  if (roadKeywordMatch) {
    const idx = cleaned.indexOf(roadKeywordMatch[0]);
    houseNumberPart = cleaned.substring(0, idx).trim();
    streetPart = cleaned.substring(idx).trim();
  } else {
    const tokens = cleaned.split(' ');
    if (tokens.length > 1 && (/^[\d\/]+$/.test(tokens[0]) || tokens[0].includes('/'))) {
      houseNumberPart = tokens[0];
      streetPart = tokens.slice(1).join(' ');
    } else {
      streetPart = cleaned;
    }
  }

  if (houseNumberPart) {
    result.so_nha = houseNumberPart.replace(/,\s*$/, '').replace(/\s*\([^)]*\)/g, '').trim();
  }

  if (streetPart) {
    let finalStreet = streetPart
      .replace(/^(đường|hẻm|đường số|phố)\s*/i, match => {
        if (/đường số/i.test(match)) return 'Đường Số ';
        if (/hẻm/i.test(match)) return 'Hẻm ';
        return '';
      })
      .trim();

    result.ten_duong = finalStreet.replace(/,\s*(p\.|tp\.|q\.|khu).*$/ig, '').trim();
  }
}

export function parseChiTiet(content: string): ParsedDetailResult {
  const result: ParsedDetailResult = {
    gia_chao: null,
    loai_hinh_chi_tiet: null,
    ma_nguon_chi_tiet: null,
    dien_tich_mo_ta: null,
    rong_mo_ta: null,
    dai_mo_ta: null,
    canh_bao: []
  };

  if (!content || typeof content !== 'string') return result;

  try {
    const giaMatch = content.match(/giá chào(?:\s*\(vnđ\))?:?\s*([\d.,]+)\s*tỷ/i);
    if (giaMatch) {
      const val = parseFloat(giaMatch[1].replace(',', '.'));
      if (!isNaN(val)) result.gia_chao = val * 1e9;
    }

    const loaiMatch = content.match(/loại hình:?\s*([^\n,]+)/i);
    if (loaiMatch) {
      result.loai_hinh_chi_tiet = loaiMatch[1].trim();
    }

    const maMatch = content.match(/mã nguồn hàng:?\s*(TK[A-Z0-9]{6})/i);
    if (maMatch) {
      result.ma_nguon_chi_tiet = maMatch[1].toUpperCase();
    } else {
      const anyTkMatch = content.match(/TK[A-Z0-9]{6}/);
      if (anyTkMatch) {
        result.ma_nguon_chi_tiet = anyTkMatch[0].toUpperCase();
      }
    }

    const dtMatch = content.match(/dt:?\s*([\d.,]+)m?\s*[x*]\s*([\d.,]+)m?\s*(?:\(([\d.,]+)m?[²2]?\))?/i);
    if (dtMatch) {
      const r = parseFloat(dtMatch[1].replace(',', '.'));
      const d = parseFloat(dtMatch[2].replace(',', '.'));
      const dt = dtMatch[3] ? parseFloat(dtMatch[3].replace(',', '.')) : (r * d);
      if (!isNaN(r)) result.rong_mo_ta = r;
      if (!isNaN(d)) result.dai_mo_ta = d;
      if (!isNaN(dt)) result.dien_tich_mo_ta = dt;
    }
  } catch (err: any) {
    result.canh_bao.push(`Lỗi parse chi tiết: ${err?.message || err}`);
  }

  return result;
}

export function kiemTraChéo(
  titleResult: ParsedTitleResult,
  detailResult?: ParsedDetailResult
): CrossCheckFlags {
  const flags: CrossCheckFlags = {
    lech_rong_dai_dt: false,
    gia_tieu_de_khac_gia_chao: false,
    gia_m2_la: false,
    tang_qua_nhieu: false,
    dat_nhung_co_tang: false,
    dt_mo_ta_khac_dt_tieu_de: false
  };

  const dtSo = titleResult.dien_tich_thuc_te || titleResult.dien_tich_so;
  if (titleResult.rong && titleResult.dai && dtSo) {
    const calcArea = titleResult.rong * titleResult.dai;
    const diffPercent = Math.abs(calcArea - dtSo) / dtSo;
    if (diffPercent > 0.3) {
      flags.lech_rong_dai_dt = true;
    }
  }

  if (titleResult.gia && detailResult?.gia_chao) {
    const diffP = Math.abs(titleResult.gia - detailResult.gia_chao) / detailResult.gia_chao;
    if (diffP > 0.01) {
      flags.gia_tieu_de_khac_gia_chao = true;
    }
  }

  if (titleResult.gia && dtSo && titleResult.loai_hinh === 'Nhà phố') {
    const pricePerM2Million = (titleResult.gia / dtSo) / 1e6;
    if (pricePerM2Million < 30 || pricePerM2Million > 250) {
      flags.gia_m2_la = true;
    }
  }

  if (titleResult.so_tang && titleResult.so_tang > 8) {
    flags.tang_qua_nhieu = true;
  }

  if (titleResult.loai_hinh === 'Đất' && titleResult.so_tang && titleResult.so_tang > 0) {
    flags.dat_nhung_co_tang = true;
  }

  if (detailResult?.dien_tich_mo_ta && dtSo) {
    const diffDt = Math.abs(detailResult.dien_tich_mo_ta - dtSo) / dtSo;
    if (diffDt > 0.1) {
      flags.dt_mo_ta_khac_dt_tieu_de = true;
    }
  }

  return flags;
}
