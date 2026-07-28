import { NextResponse } from "next/server";

/** PWA-manifest, slik at kunden kan legge lenken pa hjemskjermen. */
export function GET() {
  return NextResponse.json({
    name: "Golfbestilling",
    short_name: "Golfmat",
    description: "Bestill mat og drikke til der du er pa golfbanen.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f3",
    theme_color: "#23713e",
    icons: [],
  });
}
