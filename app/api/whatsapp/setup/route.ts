import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEnv, optionalEnv } from "@/lib/env";
import { graphApiVersion, metaFetch } from "@/lib/whatsapp";

// Production-setup diagnostics + one-click fixes for the Meta WhatsApp use case.
// Protected by the dashboard Basic Auth middleware. Tokens are never returned.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Section = { ok: boolean; data?: any; error?: string };

async function tryFetch(paths: string[]): Promise<Section> {
  let lastError = "";
  for (const path of paths) {
    try {
      return { ok: true, data: await metaFetch(path) };
    } catch (error: any) {
      lastError = error?.message || "Request failed";
    }
  }
  return { ok: false, error: lastError };
}

export async function GET() {
  try {
    graphApiVersion();
    const phoneNumberId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
    const wabaId = requireEnv("WHATSAPP_WABA_ID");
    requireEnv("WHATSAPP_ACCESS_TOKEN");

    const [phone, waba, subscribedApps, templates] = await Promise.all([
      tryFetch([
        `/${phoneNumberId}?fields=id,display_phone_number,verified_name,name_status,code_verification_status,quality_rating,messaging_limit_tier,platform_type,status,throughput,account_mode`,
        `/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating`,
      ]),
      tryFetch([
        `/${wabaId}?fields=id,name,account_review_status,business_verification_status,currency,message_template_namespace`,
        `/${wabaId}?fields=id,name`,
      ]),
      tryFetch([`/${wabaId}/subscribed_apps`]),
      tryFetch([`/${wabaId}/message_templates?fields=name,status,category,language&limit=100`]),
    ]);

    const p = phone.data || {};
    const apps: any[] = subscribedApps.data?.data || [];
    const tpl: any[] = templates.data?.data || [];
    const approvedMarketing = tpl.filter((t) => t.status === "APPROVED" && t.category === "MARKETING");
    const isTestNumber = String(p.account_mode || "").toUpperCase() === "SANDBOX";

    const checks = [
      {
        key: "token",
        label: "Access token works (System User permanent token)",
        ok: phone.ok || waba.ok,
        detail: phone.ok || waba.ok ? "Token accepted by Meta." : phone.error || waba.error,
      },
      {
        key: "phone",
        label: "Production phone number attached",
        ok: phone.ok && !isTestNumber,
        detail: phone.ok
          ? `${p.display_phone_number || "?"} - ${p.verified_name || "no display name"}${isTestNumber ? " (Meta TEST number - add your real number)" : ""}`
          : phone.error,
      },
      {
        key: "registered",
        label: "Number registered on Cloud API",
        ok: phone.ok && (p.platform_type ? p.platform_type === "CLOUD_API" : true) && (p.status ? p.status === "CONNECTED" : true),
        detail: phone.ok ? `platform: ${p.platform_type || "n/a"}, status: ${p.status || "n/a"}` : phone.error,
        action: "register",
      },
      {
        key: "display_name",
        label: "Display name approved",
        ok: phone.ok && (!p.name_status || p.name_status === "APPROVED" || p.name_status === "AVAILABLE_WITHOUT_REVIEW"),
        detail: phone.ok ? `name_status: ${p.name_status || "n/a"}` : phone.error,
      },
      {
        key: "subscribed",
        label: "WABA subscribed to this app (needed for webhooks)",
        ok: subscribedApps.ok && apps.length > 0,
        detail: subscribedApps.ok
          ? apps.length
            ? `Subscribed apps: ${apps.map((a) => a?.whatsapp_business_api_data?.name || a?.whatsapp_business_api_data?.id).join(", ")}`
            : "No app subscribed. Click Subscribe."
          : subscribedApps.error,
        action: "subscribe",
      },
      {
        key: "templates",
        label: "Approved marketing template",
        ok: approvedMarketing.length > 0,
        detail: templates.ok
          ? approvedMarketing.length
            ? approvedMarketing.map((t) => `${t.name} (${t.language})`).join(", ")
            : `No APPROVED marketing template. Found: ${tpl.map((t) => `${t.name}=${t.status}`).join(", ") || "none"}`
          : templates.error,
      },
      {
        key: "webhook_env",
        label: "Webhook secrets configured (verify token + app secret)",
        ok: Boolean(optionalEnv("WHATSAPP_VERIFY_TOKEN") && optionalEnv("META_APP_SECRET")),
        detail: "Callback URL in Meta: https://<your-domain>/api/webhooks/whatsapp, field: messages",
      },
    ];

    return NextResponse.json(
      {
        graphApiVersion: graphApiVersion(),
        marketingMessagesApi: optionalEnv("WHATSAPP_USE_MARKETING_MESSAGES_API").toLowerCase() === "true",
        phone: phone.ok
          ? {
              display_phone_number: p.display_phone_number,
              verified_name: p.verified_name,
              quality_rating: p.quality_rating,
              messaging_limit_tier: p.messaging_limit_tier,
              throughput: p.throughput?.level,
              account_mode: p.account_mode,
            }
          : null,
        waba: waba.ok ? waba.data : null,
        checks,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Setup check failed" }, { status: 500 });
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("subscribe") }),
  z.object({ action: z.literal("register"), pin: z.string().regex(/^\d{6}$/, "PIN must be exactly 6 digits") }),
]);

export async function POST(request: NextRequest) {
  try {
    const input = actionSchema.parse(await request.json());

    if (input.action === "subscribe") {
      const wabaId = requireEnv("WHATSAPP_WABA_ID");
      const result = await metaFetch(`/${wabaId}/subscribed_apps`, { method: "POST" });
      return NextResponse.json({ ok: Boolean(result?.success), result });
    }

    const phoneNumberId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
    const result = await metaFetch(`/${phoneNumberId}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", pin: input.pin }),
    });
    return NextResponse.json({ ok: Boolean(result?.success), result });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return NextResponse.json({ error: error.issues?.[0]?.message || "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: error?.message || "Action failed" }, { status: 500 });
  }
}
