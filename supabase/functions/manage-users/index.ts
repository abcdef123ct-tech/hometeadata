// Supabase Edge Function: manage-users
// Written in TypeScript for the Deno runtime.
// Securely executes Supabase Admin API operations (createUser, deleteUser, updateUser)
// using the SUPABASE_SERVICE_ROLE_KEY stored in Supabase Secrets.
// Frontend / Client calls this via supabase.functions.invoke('manage-users') or through backend proxy.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({
          error: "Thiếu biến môi trường SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong Supabase Secrets.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Initialize Supabase client with admin privileges (Service Role Key)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const url = new URL(req.url);
    let body: any = {};

    if (req.method === "POST" || req.method === "PUT" || req.method === "DELETE") {
      try {
        body = await req.json();
      } catch (_) {
        body = {};
      }
    }

    const action = body.action || url.searchParams.get("action");

    // 1. LIST USERS: Query profiles table and sync with auth.admin.listUsers
    if (req.method === "GET" || action === "list") {
      let profilesList: any[] = [];
      const { data: profiles, error: profileErr } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (!profileErr && Array.isArray(profiles)) {
        profilesList = profiles;
      }

      try {
        const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
        if (authData?.users) {
          const profileMap = new Map(profilesList.map((p) => [p.id, p]));
          const missingProfiles: any[] = [];

          for (const authUser of authData.users) {
            if (!profileMap.has(authUser.id)) {
              const metaName = authUser.user_metadata?.full_name || (authUser.email ? authUser.email.split("@")[0] : "Người dùng");
              const metaRole = authUser.user_metadata?.role || "staff";
              const isBanned = !!(authUser.banned_until && new Date(authUser.banned_until) > new Date());
              const newProf = {
                id: authUser.id,
                email: authUser.email || "",
                full_name: metaName,
                role: metaRole,
                status: isBanned ? "disabled" : "active",
                created_at: authUser.created_at || new Date().toISOString(),
              };
              profilesList.push(newProf);
              missingProfiles.push(newProf);
            }
          }

          if (missingProfiles.length > 0) {
            await supabaseAdmin.from("profiles").upsert(missingProfiles);
          }
        }
      } catch (err) {
        console.warn("Lỗi đồng bộ từ auth.admin.listUsers:", err);
      }

      profilesList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return new Response(
        JSON.stringify({ success: true, users: profilesList }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. CREATE USER: Auth Admin API + insert into profiles
    if (req.method === "POST" && (!action || action === "create")) {
      const { email, username, password, full_name, role = "staff" } = body;

      let rawIdentifier = (email || username || "").trim().toLowerCase();
      if (rawIdentifier && !rawIdentifier.includes("@")) {
        rawIdentifier = `${rawIdentifier}@nguonnhapk.local`;
      }

      if (!rawIdentifier || !password) {
        return new Response(
          JSON.stringify({ error: "Tên đăng nhập (hoặc email) và mật khẩu tạm là bắt buộc." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (password.length < 6) {
        return new Response(
          JSON.stringify({ error: "Mật khẩu phải có tối thiểu 6 ký tự." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Step A: Create user in Supabase Auth via Admin API
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: rawIdentifier,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: full_name?.trim() || rawIdentifier.split("@")[0],
          role: role || "staff",
        },
      });

      if (authErr) {
        return new Response(
          JSON.stringify({ error: `Lỗi tạo tài khoản Auth: ${authErr.message}` }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const createdUser = authData.user;

      // Step B: Save user profile into 'profiles' table
      const profileRecord = {
        id: createdUser.id,
        email: createdUser.email,
        full_name: full_name?.trim() || rawIdentifier.split("@")[0],
        role: role || "staff",
        status: "active",
        created_at: createdUser.created_at || new Date().toISOString(),
      };

      const { data: profileData, error: profileInsertErr } = await supabaseAdmin
        .from("profiles")
        .upsert([profileRecord])
        .select()
        .single();

      if (profileInsertErr) {
        console.error("Lỗi khi thêm vào bảng profiles:", profileInsertErr);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Tạo tài khoản người dùng thành công",
          user: profileData || profileRecord,
        }),
        {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. UPDATE USER: Update full_name, role, status in profiles + auth metadata/ban
    if (req.method === "PUT" || action === "update") {
      const { id, full_name, role, status } = body;

      if (!id) {
        return new Response(
          JSON.stringify({ error: "Thiếu mã định danh (id) tài khoản." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const updates: any = {};
      if (full_name !== undefined) updates.full_name = full_name.trim();
      if (role !== undefined) updates.role = role;
      if (status !== undefined) updates.status = status;

      const { data: updatedProfile, error: updateProfileErr } = await supabaseAdmin
        .from("profiles")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (updateProfileErr) {
        throw updateProfileErr;
      }

      // Sync metadata with Supabase Auth
      const userMetaUpdates: any = {};
      if (full_name !== undefined) userMetaUpdates.full_name = full_name.trim();
      if (role !== undefined) userMetaUpdates.role = role;

      if (Object.keys(userMetaUpdates).length > 0) {
        await supabaseAdmin.auth.admin.updateUserById(id, {
          user_metadata: userMetaUpdates,
        });
      }

      // If status changed, ban/unban user in Supabase Auth
      if (status === "disabled") {
        await supabaseAdmin.auth.admin.updateUserById(id, {
          ban_duration: "876000h", // 100 years
        });
      } else if (status === "active") {
        await supabaseAdmin.auth.admin.updateUserById(id, {
          ban_duration: "none",
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Cập nhật tài khoản thành công",
          user: updatedProfile,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. DELETE USER: Remove from Supabase Auth + profiles
    if (req.method === "DELETE" || action === "delete") {
      const id = body.id || url.searchParams.get("id");

      if (!id) {
        return new Response(
          JSON.stringify({ error: "Thiếu mã định danh (id) tài khoản cần xóa." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Delete from Supabase Auth (cascades to profiles if foreign key is configured)
      const { error: deleteAuthErr } = await supabaseAdmin.auth.admin.deleteUser(id);
      if (deleteAuthErr) {
        console.warn("Lưu ý khi xóa Supabase Auth User:", deleteAuthErr.message);
      }

      // Ensure profile record is removed
      await supabaseAdmin.from("profiles").delete().eq("id", id);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Đã xóa tài khoản khỏi hệ thống thành công",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: `Phương thức ${req.method} không được hỗ trợ.` }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Lỗi xử lý trong Supabase Edge Function:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Lỗi xử lý phía máy chủ." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
