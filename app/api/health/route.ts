import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {
    whatsappToken: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
    phoneNumberId: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    wabaId: Boolean(process.env.WHATSAPP_WABA_ID),
    graphApiVersion: /^v\d+\.\d+$/.test(process.env.GRAPH_API_VERSION || ""),
    supabaseUrl: Boolean(process.env.SUPABASE_URL),
    supabaseServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    verifyToken: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
    metaAppSecret: Boolean(process.env.META_APP_SECRET),
    adminAuth: Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD),
  };
  return NextResponse.json({ ok: Object.values(checks).every(Boolean), checks });
}
