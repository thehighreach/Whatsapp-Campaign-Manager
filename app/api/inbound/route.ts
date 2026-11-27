import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = supabaseAdmin();
  if (!db) {
    return NextResponse.json({ replies: [], unconfigured: true });
  }

  const { data, error } = await db
    .from("inbound_messages")
    .select("id,phone,profile_name,type,text,received_at")
    .order("received_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ replies: [], error: error.message }, { status: 200 });
  return NextResponse.json({ replies: data || [] });
}
