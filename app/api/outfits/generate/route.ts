import { NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api/errors";
import { outfitGenerateRequestSchema } from "@/lib/ai/schemas";
import { requireCurrentUserContext } from "@/lib/auth/session";
import { generateOutfitForUser } from "@/lib/outfits/generate";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUserContext();
    const payload = outfitGenerateRequestSchema.parse(await request.json());
    const result = await generateOutfitForUser({
      userId: user.userId,
      vibePrompt: payload.vibePrompt,
      date: payload.date,
      excludeSlotKeys: payload.excludeSlotKeys,
    });

    return NextResponse.json(result);
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
