import { describe, it, expect } from 'vitest';
import { parseTieuDe, parseChiTiet, kiemTraChéo } from './parseNguon';

describe('parseNguon - Bóc tách tiêu đề và kiểm tra chéo', () => {
  const testCases = [
    {
      id: 1,
      input: 'TKXZ2KZ8_Thửa 1442, Tờ 105 Hẻm 230 Lò Lu 67-75 3 4 18.5 7 tỷ',
      expected: {
        ma_tk: 'TKXZ2KZ8',
        thua: '1442',
        to: '105',
        ten_duong: 'Hẻm 230 Lò Lu',
        dien_tich_so: 67,
        dien_tich_thuc_te: 75,
        so_tang: 3,
        rong: 4,
        dai: 18.5,
        gia: 7e9,
        loai_hinh: 'Nhà phố'
      }
    },
    {
      id: 2,
      input: 'TK18QHPF_51.18 đường 12 Tam Đa, p. Trường Thạnh( Long phước mới),tp. Thủ Đức đường 12 56 4 5.5 10.5 5.2 tỷ',
      expected: {
        ma_tk: 'TK18QHPF',
        so_nha: '51/18',
        ten_duong: 'Đường 12',
        dien_tich_so: 56,
        so_tang: 4,
        rong: 5.5,
        dai: 10.5,
        gia: 5.2e9
      }
    },
    {
      id: 3,
      input: 'TK6BC4VY_Thửa 821, Tờ 19 Hẻm 230 Nguyễn Xiển 50-51 3 4 12.7 5.4 tỷ',
      expected: {
        ma_tk: 'TK6BC4VY',
        thua: '821',
        to: '19',
        ten_duong: 'Hẻm 230 Nguyễn Xiển',
        dien_tich_so: 50,
        dien_tich_thuc_te: 51,
        so_tang: 3,
        rong: 4,
        dai: 12.7,
        gia: 5.4e9
      }
    },
    {
      id: 4,
      input: 'TKBX4P5S_45 Đường Số 5 200-222 2 9 25 12.5 tỷ',
      expected: {
        ma_tk: 'TKBX4P5S',
        so_nha: '45',
        ten_duong: 'Đường Số 5',
        dien_tich_so: 200,
        dien_tich_thuc_te: 222,
        so_tang: 2,
        rong: 9,
        dai: 25,
        gia: 12.5e9
      }
    },
    {
      id: 5,
      input: 'TK6UB86R_55/9/6 lò lu 80 Đất 4 20 5.75 tỷ',
      expected: {
        ma_tk: 'TK6UB86R',
        so_nha: '55/9/6',
        ten_duong: 'Lò Lu',
        loai_hinh: 'Đất',
        dien_tich_so: 80,
        so_tang: null,
        rong: 4,
        dai: 20,
        gia: 5.75e9
      }
    },
    {
      id: 6,
      input: 'TK7DNENS_369/6 đường lolu 60 3 4 4 6.6 tỷ',
      expected: {
        ma_tk: 'TK7DNENS',
        so_nha: '369/6',
        ten_duong: 'Lolu',
        dien_tich_so: 60,
        so_tang: 3,
        rong: 4,
        dai: 4,
        gia: 6.6e9
      },
      checkFlag: 'lech_rong_dai_dt'
    },
    {
      id: 7,
      input: 'TK1TD2T8_Thửa 709, Tờ 31 Đường N1 (Khu 52 Nguyễn Xiển) 82 Đất 5.3 15.5 6.5 tỷ',
      expected: {
        ma_tk: 'TK1TD2T8',
        thua: '709',
        to: '31',
        ten_duong: 'Đường N1',
        khu: 'Khu 52 Nguyễn Xiển',
        loai_hinh: 'Đất',
        dien_tich_so: 82,
        rong: 5.3,
        dai: 15.5,
        gia: 6.5e9
      }
    },
    {
      id: 8,
      input: '14_180 ( kdc Đông Tăng Long) Đường A4 100 4 5 20 13.6 tỷ',
      expected: {
        ma_tk: '14',
        so_nha: '180',
        khu: 'kdc Đông Tăng Long',
        ten_duong: 'Đường A4',
        dien_tich_so: 100,
        so_tang: 4,
        rong: 5,
        dai: 20,
        gia: 13.6e9
      }
    },
    {
      id: 9,
      input: 'TKJG05PF_Thửa 708, Tờ 51 ( khu nhà ở PCR ) Tam Đa 134 1 5.3 25 6.7 tỷ',
      expected: {
        ma_tk: 'TKJG05PF',
        thua: '708',
        to: '51',
        khu: 'khu nhà ở PCR',
        ten_duong: 'Tam Đa',
        dien_tich_so: 134,
        so_tang: 1,
        rong: 5.3,
        dai: 25,
        gia: 6.7e9
      }
    }
  ];

  testCases.forEach((tc) => {
    it(`Ca kiểm thử #${tc.id}: ${tc.input}`, () => {
      const res = parseTieuDe(tc.input);
      expect(res.ma_tk).toEqual(tc.expected.ma_tk);
      if (tc.expected.thua !== undefined) expect(res.thua).toEqual(tc.expected.thua);
      if (tc.expected.to !== undefined) expect(res.to).toEqual(tc.expected.to);
      if (tc.expected.so_nha !== undefined) expect(res.so_nha).toEqual(tc.expected.so_nha);
      if (tc.expected.dien_tich_so !== undefined) expect(res.dien_tich_so).toEqual(tc.expected.dien_tich_so);
      if (tc.expected.dien_tich_thuc_te !== undefined) expect(res.dien_tich_thuc_te).toEqual(tc.expected.dien_tich_thuc_te);
      if (tc.expected.so_tang !== undefined) expect(res.so_tang).toEqual(tc.expected.so_tang);
      if (tc.expected.rong !== undefined) expect(res.rong).toEqual(tc.expected.rong);
      if (tc.expected.dai !== undefined) expect(res.dai).toEqual(tc.expected.dai);
      if (tc.expected.gia !== undefined) expect(res.gia).toEqual(tc.expected.gia);
      if (tc.expected.loai_hinh !== undefined) expect(res.loai_hinh).toEqual(tc.expected.loai_hinh);
      if (tc.expected.khu !== undefined) expect(res.khu).toEqual(tc.expected.khu);

      if (tc.checkFlag) {
        const flags = kiemTraChéo(res);
        expect((flags as any)[tc.checkFlag]).toBe(true);
      }
    });
  });
});
