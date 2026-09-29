import { NextResponse, type NextRequest } from "next/server";
import { runWorker } from "@/lib/server/notification-worker";

export const maxDuration = 60;

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.nextUrl.searchParams.get("secret");
  if (!secret || provided !== secret) return NextResponse.json({ error: "Neoprávněný přístup" }, { status: 401 });
  try {
    return NextResponse.json(await runWorker(100));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
