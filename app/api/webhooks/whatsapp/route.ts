import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone";
import { describeMetaError } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STOP_WORDS = new Set(["stop", "unsubscribe", "cancel", "opt out", "optout", "remove", "stop promotions"]);

// Status can only move forward. A late "delivered" must never overwrite "read".
const STATUS_RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

function validMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signatureHeader?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isoFromMetaTimestamp(ts: unknown): string {
  const seconds = Number(ts);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
}

/** Extracts the user-visible text from text, quick-reply button and interactive replies. */
function inboundText(message: any): string {
  return String(
    message?.text?.body ??
      message?.button?.text ??
      message?.button?.payload ??
      message?.interactive?.button_reply?.title ??
      message?.interactive?.list_reply?.title ??
      ""
  ).trim();
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge || "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("Verification failed", { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!validMetaSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const db = supabaseAdmin();
  if (!db) return new NextResponse("Server unconfigured", { status: 500 });

  try {
    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) {
        if (change?.field && change.field !== "messages") continue;
        const value = change?.value || {};

        for (const status of value.statuses || []) {
          const id = status?.id;
          const state = String(status?.status || "");
          if (!id || !(state in STATUS_RANK)) continue;

          const { data: existing } = await (db.from("message_logs") as any)
            .select("status")
            .eq("meta_message_id", id)
            .maybeSingle();
          const currentRank = STATUS_RANK[existing?.status as string] ?? -1;
          if (existing && STATUS_RANK[state] <= currentRank) continue;

          const at = isoFromMetaTimestamp(status.timestamp);
          const update: Record<string, any> = { status: state };
          if (state === "sent") update.sent_at = at;
          if (state === "delivered") update.delivered_at = at;
          if (state === "read") update.read_at = at;
          if (state === "failed") {
            update.failed_at = at;
            update.error = describeMetaError(status?.errors?.[0]);
          }
          await (db.from("message_logs") as any).update(update).eq("meta_message_id", id);
        }

        for (const message of value.messages || []) {
          const phone = normalizePhone(message?.from || "");
          if (!phone) continue;
          const text = inboundText(message);

          // Keep every inbound reply (e.g. INTERESTED) so the team can follow up.
          await (db.from("inbound_messages") as any).upsert(
            {
              meta_message_id: message?.id,
              phone,
              profile_name: value?.contacts?.[0]?.profile?.name || null,
              type: message?.type || null,
              text: text || null,
              context_message_id: message?.context?.id || null,
              received_at: isoFromMetaTimestamp(message?.timestamp),
            },
            { onConflict: "meta_message_id" }
          );

          if (STOP_WORDS.has(text.toLowerCase())) {
            await (db.from("contacts") as any)
              .update({
                opt_in: false,
                opted_out_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("phone", phone);
          }
        }
      }
    }
  } catch (error) {
    // Always acknowledge with 200 so Meta does not keep retrying; log for investigation.
    console.error("Webhook processing error", error);
  }

  return NextResponse.json({ received: true });
}
