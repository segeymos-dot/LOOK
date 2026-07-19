import { createClient } from "@/lib/supabase/server";
import { getLatestWorkSubmission } from "@/lib/data/work-actions";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;
  const supabase = await createClient();
  const submission = await getLatestWorkSubmission(supabase, requestId);

  return NextResponse.json({ submission });
}
