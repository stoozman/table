import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type MessageRecord = {
  id?: string;
  room_id: string;
  user_id: string;
  text_content?: string | null;
  created_at?: string;
};

type TriggerPayload = {
  type?: string;
  table?: string;
  record: MessageRecord;
  old_record?: Record<string, unknown> | null;
  entity_type?: string;
  entity_id?: string;
};

type RoomMemberRow = {
  user_id: string;
};

type PushTokenRow = {
  token: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");
const SEND_CHAT_PUSH_HOOK_SECRET = Deno.env.get("SEND_CHAT_PUSH_HOOK_SECRET");

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
}

function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

async function sendOneSignalNotification(params: {
  includeSubscriptionIds: string[];
  heading: string;
  content: string;
  data?: Record<string, unknown>;
}) {
  const appId = requireEnv("ONESIGNAL_APP_ID", ONESIGNAL_APP_ID);
  const apiKey = requireEnv("ONESIGNAL_REST_API_KEY", ONESIGNAL_REST_API_KEY);

  if (params.includeSubscriptionIds.length === 0) {
    return { skipped: true, reason: "no_recipients" };
  }

  const res = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Basic ${apiKey}`,
    },
    body: JSON.stringify({
      app_id: appId,
      include_subscription_ids: params.includeSubscriptionIds,
      headings: { en: params.heading },
      contents: { en: params.content },
      data: params.data ?? {},
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OneSignal error ${res.status}: ${text}`);
  }

  return JSON.parse(text);
}

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, { status: 405 });
    }

    console.log("[send-chat-push] incoming request", {
      method: req.method,
      url: req.url,
      hasHookSecret: !!req.headers.get("x-hook-secret"),
    });

    const expectedHookSecret = requireEnv(
      "SEND_CHAT_PUSH_HOOK_SECRET",
      SEND_CHAT_PUSH_HOOK_SECRET,
    );
    const receivedHookSecret = req.headers.get("x-hook-secret") ?? "";
    if (receivedHookSecret !== expectedHookSecret) {
      console.log("[send-chat-push] unauthorized: bad hook secret");
      return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    }

    requireEnv("SUPABASE_URL", SUPABASE_URL);
    requireEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY);

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });

    const payload = (await req.json()) as TriggerPayload;
    const record = payload?.record;

    // === НОВЫЙ БЛОК: Обработка entity_type и entity_id ===
    if (payload.entity_type && payload.entity_id) {
      console.log("[send-chat-push] entity detected", {
        entity_type: payload.entity_type,
        entity_id: payload.entity_id,
      });

      // Проверяем, существует ли комната для этой сущности
      const { data: existingRoom, error: roomCheckErr } = await supabase
        .from("rooms")
        .select("room_id")
        .eq("entity_type", payload.entity_type)
        .eq("entity_id", payload.entity_id)
        .maybeSingle();

      if (roomCheckErr) throw roomCheckErr;

      if (!existingRoom) {
        console.log("[send-chat-push] creating new room for entity");

        // Создаём новую комнату
        // Determine color based on entity status (best-effort)
        let colorHex: string | null = null;
        try {
          const map = {
            'raw_material_status': 'raw_materials',
            'finished_product_status': 'finished_products',
            'sample_status': 'samples',
          } as Record<string, string>;
          const tableName = map[payload.entity_type ?? ''];
          if (tableName) {
            const { data: entityRow, error: entityErr } = await supabase
              .from(tableName)
              .select('status')
              .eq('id', payload.entity_id)
              .maybeSingle();
            if (!entityErr && entityRow && entityRow.status) {
              switch (entityRow.status) {
                case 'Годное':
                  colorHex = '#28a745';
                  break;
                case 'На карантине':
                  colorHex = '#ffc107';
                  break;
                case 'На исследовании':
                  colorHex = '#0d6efd';
                  break;
                case 'Брак':
                  colorHex = '#dc3545';
                  break;
              }
            }
          }
        } catch (e) {
          console.log('[send-chat-push] color detection error', e);
        }

        const { data: newRoom, error: createRoomErr } = await supabase
          .from("rooms")
          .insert({
            entity_type: payload.entity_type,
            entity_id: payload.entity_id,
            room_name: `${payload.entity_type}: ${payload.entity_id}`,
            color: colorHex,
          })
          .select("room_id")
          .single();

        if (createRoomErr) throw createRoomErr;

        const newRoomId = newRoom.room_id;
        console.log("[send-chat-push] room created", { room_id: newRoomId });

        // Добавляем всех пользователей в комнату
        const { data: users } = await supabase.from("users").select("id");

        const members = users.map(u => ({
          room_id: newRoomId,
          user_id: u.id,
        }));

        await supabase.from("room_members").insert(members);
        console.log("[send-chat-push] members added", { count: members.length });

        // Создаём системное сообщение
        const systemMessage = `Комната создана для ${payload.entity_type} с ID ${payload.entity_id}`;
        
        const { error: systemMsgErr } = await supabase
          .from("messages") 
          .insert({
            room_id: newRoomId,
            user_id: "system",
            text_content: systemMessage,
            is_system: true,
          });

        if (systemMsgErr) throw systemMsgErr;

        console.log("[send-chat-push] system message created");

        return jsonResponse({
          ok: true,
          room_created: true,
          room_id: newRoomId,
          system_message: systemMessage,
        });
      } else {
        console.log("[send-chat-push] room already exists", {
          room_id: existingRoom.room_id,
        });

        return jsonResponse({
          ok: true,
          room_exists: true,
          room_id: existingRoom.room_id,
        });
      }
    }
    // === КОНЕЦ НОВОГО БЛОКА ===

    if (!record?.room_id || !record?.user_id) {
      console.log("[send-chat-push] invalid payload", payload);
      return jsonResponse(
        { error: "Invalid payload: record.room_id and record.user_id are required" },
        { status: 400 },
      );
    }

    const roomId = record.room_id;
    const senderId = record.user_id;

    console.log("[send-chat-push] message", {
      room_id: roomId,
      sender_user_id: senderId,
      message_id: record.id ?? null,
    });

    const { data: senderUser, error: senderErr } = await supabase
      .from("chat_users")
      .select("user_name")
      .eq("user_id", senderId)
      .maybeSingle();

    if (senderErr) throw senderErr;

    const senderName = senderUser?.user_name ?? "Сообщение";
    const content = (record.text_content ?? "").trim();

    const { data: members, error: membersErr } = await supabase
      .from("room_members")
      .select("user_id")
      .eq("room_id", roomId);

    if (membersErr) throw membersErr;

    const recipientUserIds = ((members ?? []) as RoomMemberRow[])
      .map((m: RoomMemberRow) => m.user_id)
      .filter((uid: string) => uid && uid !== senderId);

    console.log("[send-chat-push] recipients", {
      memberCount: (members ?? []).length,
      recipientCount: recipientUserIds.length,
    });

    if (recipientUserIds.length === 0) {
      return jsonResponse({ ok: true, skipped: true, reason: "no_other_members" });
    }

    const { data: tokens, error: tokensErr } = await supabase
      .from("chat_device_tokens")
      .select("token")
      .in("user_id", recipientUserIds)
      .eq("is_active", true);

    if (tokensErr) throw tokensErr;

    const subscriptionIds = ((tokens ?? []) as PushTokenRow[])
      .map((t: PushTokenRow) => t.token)
      .filter((x: string) => typeof x === "string" && x.length > 0);

    console.log("[send-chat-push] tokens", {
      tokenRows: (tokens ?? []).length,
      subscriptionIds: subscriptionIds.length,
    });

    const heading = senderName;
    const messageText = content.length > 0 ? content : "Новое сообщение";

    let result: unknown;
    try {
      result = await sendOneSignalNotification({
        includeSubscriptionIds: subscriptionIds,
        heading,
        content: messageText,
        data: {
          type: "chat_message",
          room_id: roomId,
          message_id: record.id ?? null,
          sender_user_id: senderId,
        },
      });
      console.log("[send-chat-push] onesignal ok");
    } catch (e) {
      console.log(
        "[send-chat-push] onesignal error",
        e instanceof Error ? e.message : String(e),
      );
      throw e;
    }

    return jsonResponse({ ok: true, sent: true, onesignal: result });
  } catch (e) {
    console.log("[send-chat-push] error", e instanceof Error ? e.message : String(e));
    return jsonResponse(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
});