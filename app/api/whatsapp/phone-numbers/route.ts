import { NextResponse } from "next/server";
import { requireEnv, optionalEnv } from "@/lib/env";

// This endpoint runs on the server. The Meta access token is never returned
// to the browser. Dashboard access is protected by the existing middleware.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const wabaId = requireEnv("WHATSAPP_WABA_ID");
    const token = requireEnv("WHATSAPP_ACCESS_TOKEN");
    const version = optionalEnv("GRAPH_API_VERSION");

    if (!/^v\d+\.\d+$/.test(version)) {
      return NextResponse.json(
        { error: "Set GRAPH_API_VERSION to a supported version from your Meta app." },
        { status: 500 }
      );
    }

    if (!/^\d+$/.test(wabaId)) {
      return NextResponse.json(
        { error: "WHATSAPP_WABA_ID must contain the numeric WhatsApp Business Account ID." },
        { status: 500 }
      );
    }

    const url = `https://graph.facebook.com/${version}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      // Return Meta's diagnostic message, never the request headers/token.
      return NextResponse.json(
        {
          error: result?.error?.message || `Meta API request failed (${response.status}).`,
          metaErrorCode: result?.error?.code,
          metaErrorSubcode: result?.error?.error_subcode,
          hint: "Check the WABA ID, token validity, WhatsApp permissions, and business asset access.",
        },
        { status: response.status }
      );
    }

    const phoneNumbers = Array.isArray(result?.data)
      ? result.data.map((item: any) => ({
          id: item.id,
          display_phone_number: item.display_phone_number,
          verified_name: item.verified_name,
          quality_rating: item.quality_rating,
        }))
      : [];

    return NextResponse.json(
      { wabaId, phoneNumbers, count: phoneNumbers.length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to retrieve WhatsApp phone numbers." },
      { status: 500 }
    );
  }
}
