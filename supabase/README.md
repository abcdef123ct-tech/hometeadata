# Hướng dẫn Supabase Edge Function & SQL Schema

## 1. Cách chạy mã SQL tạo bảng `profiles`
Truy cập **Supabase Dashboard > SQL Editor**, dán và chạy đoạn mã sau:

```sql
-- 1. Bảng lưu trữ hồ sơ tài khoản người dùng
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'admin',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tắt Row-Level Security (RLS) hoặc phân quyền cho Anon/Service role
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- 2. Trigger tự động thêm dòng vào bảng profiles khi tạo User trong Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'admin',
    'active'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## 2. Cách triển khai Supabase Edge Function (`manage-users`)
File mã nguồn đã được tạo sẵn tại:
`supabase/functions/manage-users/index.ts`

Để deploy lên Supabase bằng Supabase CLI:
```bash
supabase functions deploy manage-users --no-verify-jwt
```

**Bảo mật:**
Edge Function tự động sử dụng biến môi trường hệ thống của Supabase:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (Lấy từ Supabase Project Settings > API > service_role secret key).
Key này nằm an toàn trên máy chủ Supabase, **hoàn toàn không lộ ra phía trình duyệt/frontend**.
