import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: 512, height: 512, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#3056d3 0%,#c15cf0 100%)", borderRadius: 112 }}>
        <svg width="266" height="266" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="4" />
          <path d="M8 3v4M16 3v4M3 10h18" />
          <path d="m9 15.5 2.2 2.2L15.5 13" />
        </svg>
      </div>
    ),
    size,
  );
}
