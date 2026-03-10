import { NextRequest, NextResponse } from "next/server"

const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || "exe2026").trim()

export async function POST(request: NextRequest) {
  const body = await request.json()
  const password = (body.password || "").trim()

  if (password !== ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: "Invalid password", debug: `len=${password.length}` },
      { status: 401 }
    )
  }

  // Set auth cookie directly on the response
  const response = NextResponse.json({ success: true })
  response.cookies.set("exe_auth", "authenticated", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  })

  return response
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete("exe_auth")
  return response
}
