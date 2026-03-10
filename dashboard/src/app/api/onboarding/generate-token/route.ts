import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"

export async function POST(request: NextRequest) {
  const { artist_id } = await request.json()

  if (!artist_id) {
    return NextResponse.json({ error: "artist_id required" }, { status: 400 })
  }

  // Generate UUID token with 30-day expiry
  const token = crypto.randomUUID()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  const { error } = await supabaseAdmin
    .from("artists")
    .update({
      onboarding_token: token,
      onboarding_token_expires_at: expiresAt.toISOString(),
      onboarding_status: "invited",
    })
    .eq("id", artist_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    token,
    link: `/onboarding/${token}`,
    expires_at: expiresAt.toISOString(),
  })
}
