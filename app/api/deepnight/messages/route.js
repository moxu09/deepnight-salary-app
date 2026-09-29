import { createEipMessageHandlers } from "@/lib/eipMessages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = createEipMessageHandlers("deepnight", "players");
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
