import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTemplateMessage } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Sequential sends of up to MAX_CAMPAIGN_BATCH messages need more than the default serverless timeout.
export const maxDuration = 60;

const schema = z.object({
  campaignName: z.string().trim().min(2).max(120),
  templateName: z.string().trim().min(1).regex(/^[a-z0-9_]+$/, "Template name must be lowercase letters, numbers, or underscores"),
  languageCode: z.string().trim().min(2).max(15).default("en"),
  contactIds: z.array(z.string().uuid()).min(1),
  bodyVariableFields: z.array(z.string().trim()).max(10).default([]),
  headerMediaId: z.string().trim().optional(),
  headerType: z.enum(["image", "video", "document"]).optional(),
});

function fieldValue(contact: any, field: string): string {
  if (["name", "company", "city", "phone"].includes(field)) return String(contact[field] || "");
  return String(contact.custom_fields?.[field] || "");
}

export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    const maxBatch = Number(process.env.MAX_CAMPAIGN_BATCH || 50);
    if (input.contactIds.length > maxBatch) {
      return NextResponse.json({ error: `This starter limits one send action to ${maxBatch} recipients. Split the audience into smaller batches or add a queue worker before scaling.` }, { status: 400 });
    }

    if (Boolean(input.headerMediaId) !== Boolean(input.headerType)) {
      return NextResponse.json({ error: "headerMediaId and headerType must be supplied together." }, { status: 400 });
    }

    const db = supabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "Supabase database connection is not configured. Please fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local." }, { status: 400 });
    }
    const { data: contacts, error: contactsError } = await db
      .from("contacts")
      .select("id,phone,name,company,city,custom_fields,opt_in,opted_out_at")
      .in("id", input.contactIds);


    if (contactsError) throw new Error(contactsError.message);

    // Hard compliance gate: never send a campaign to non-opted-in or opted-out contacts.
    const eligible: any[] = ((contacts as any[]) || []).filter((c) => c.opt_in === true && !c.opted_out_at);
    if (!eligible.length) {
      return NextResponse.json({ error: "No eligible opted-in contacts in this selection." }, { status: 400 });
    }

    const { data: campaignData, error: campaignError } = await db.from("campaigns").insert({
      name: input.campaignName,
      template_name: input.templateName,
      language_code: input.languageCode,
      header_media_id: input.headerMediaId || null,
      header_type: input.headerType || null,
      body_variable_fields: input.bodyVariableFields,
      total_count: eligible.length,
      status: "processing",
    } as any).select("id").single();
    if (campaignError) throw new Error(campaignError.message);
    const campaign = campaignData as any;

    let sent = 0;
    let failed = 0;
    const failures: any[] = [];

    for (const contact of eligible) {
      try {
        const bodyValues = input.bodyVariableFields.map((field) => fieldValue(contact, field).trim());
        const missing = input.bodyVariableFields.filter((_, i) => !bodyValues[i]);
        if (missing.length) {
          throw new Error(`Contact has no value for template variable field(s): ${missing.join(", ")}. Meta rejects empty variables.`);
        }
        const response = await sendTemplateMessage({
          to: contact.phone,
          templateName: input.templateName,
          languageCode: input.languageCode,
          bodyValues,
          headerMediaId: input.headerMediaId,
          headerType: input.headerType,
        });
        const metaMessageId = response?.messages?.[0]?.id || null;
        await db.from("message_logs").insert({
          campaign_id: campaign.id,
          contact_id: contact.id,
          phone: contact.phone,
          meta_message_id: metaMessageId,
          template_name: input.templateName,
          status: "sent",
          sent_at: new Date().toISOString(),
        } as any);
        sent++;
      } catch (error: any) {
        failed++;
        failures.push({ phone: contact.phone, error: error.message });
        await db.from("message_logs").insert({
          campaign_id: campaign.id,
          contact_id: contact.id,
          phone: contact.phone,
          template_name: input.templateName,
          status: "failed",
          error: error.message,
          failed_at: new Date().toISOString(),
        } as any);
      }
    }

    await (db.from("campaigns") as any).update({
      status: failed === eligible.length ? "failed" : "completed",
      sent_count: sent,
      failed_count: failed,
      completed_at: new Date().toISOString(),
    }).eq("id", campaign.id);


    return NextResponse.json({ campaignId: campaign.id, eligible: eligible.length, sent, failed, failures: failures.slice(0, 20) });

  } catch (error: any) {
    if (error?.name === "ZodError") {
      return NextResponse.json({ error: "Invalid campaign data", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || "Campaign failed" }, { status: 500 });
  }
}
