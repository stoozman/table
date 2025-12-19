import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type RoomRecord = {
  id: string;
  title?: string | null;
  created_by: string;
};

type TriggerPayload = {
  record: RoomRecord;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");
const SEND_CHAT_CREATED_HOOK_SECRET = Deno.env.get(
  "SEND_CHAT_CREATED_HOOK_SECRET",
);

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8" },
    ...init,
  });
}

function requireEnv(name: string, value?: string) {
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

async function sendPush(params: {
  includeSubscriptionIds: string[];
  heading: string;
  content: string;
  data: Record<string, unknown>;
}) {
  const res = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Basic ${requireEnv(
        "ONESIGNAL_REST_API_KEY",
        ONESIGNAL_REST_API_KEY,
      )}`,
    },
    body: JSON.stringify({
      app_id: requireEnv("ONESIGNAL_APP_ID", ONESIGNAL_APP_ID),
      include_subscription_ids: params.includeSubscriptionIds,
      headings: { en: params.heading },
      contents: { en: params.content },
      data: params.data,
    }),
  });

  if (!res.ok) {
    throw new Error(`OneSignal error ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, { status: 405 });
    }

    const secret = req.headers.get("x-hook-secret");
    if (secret !== requireEnv("SEND_CHAT_CREATED_HOOK_SECRET", SEND_CHAT_CREATED_HOOK_SECRET)) {
      return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = (await req.json()) as TriggerPayload;
    const room = payload.record;

    if (!room?.id || !room.created_by) {
      return jsonResponse({ error: "Invalid payload" }, { status: 400 });
    }

    const supabase = createClient(
      requireEnv("SUPABASE_URL", SUPABASE_URL),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY),
      { auth: { persistSession: false } },
    );

    // 1️⃣ Получаем участников чата
    const { data: members } = await supabase
      .from("room_members")
      .select("user_id")
      .eq("room_id", room.id);

    const recipientIds = (members ?? [])
      .map((m) => m.user_id)
      .filter((id) => id !== room.created_by);

    if (recipientIds.length === 0) {
      return jsonResponse({ ok: true, skipped: "no recipients" });
    }

    // 2️⃣ Получаем push-токены
    const { data: tokens } = await supabase
      .from("chat_device_tokens")
      .select("token")
      .in("user_id", recipientIds)
      .eq("is_active", true);

    const subscriptionIds = (tokens ?? [])
      .map((t) => t.token)
      .filter(Boolean);

    if (subscriptionIds.length === 0) {
      return jsonResponse({ ok: true, skipped: "no tokens" });
    }

    // 3️⃣ Отправляем push
    const title = "Новый чат";
    const text =
      room.title?.trim()
        ? `Вас добавили в чат «${room.title}»`
        : "Вас добавили в новый чат";

    await sendPush({
      includeSubscriptionIds: subscriptionIds,
      heading: title,
      content: text,
      data: {
        type: "chat_created",
        room_id: room.id,
      },
    });

    return jsonResponse({ ok: true, sent: true });
  } catch (e) {
    return jsonResponse(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
});
