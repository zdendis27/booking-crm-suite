import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  const size = Math.min(1024, Math.max(32, Number(request.nextUrl.searchParams.get("size")) || 512));
  const glyph = Math.round(size * 0.52);
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#3056d3 0%,#c15cf0 100%)", borderRadius: size * 0.22 }}>
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="4" />
          <path d="M8 3v4M16 3v4M3 10h18" />
          <path d="m9 15.5 2.2 2.2L15.5 13" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
