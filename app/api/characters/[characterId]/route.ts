import { NextResponse, type NextRequest } from "next/server";
import { serverCharacterService } from "@/lib/characters/server";
import { toErrorResponse } from "@/lib/http/errors";

type RouteContext = {
  params: Promise<{ characterId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { characterId } = await context.params;
    return NextResponse.json(
      await serverCharacterService.updateCharacter(Number.parseInt(characterId, 10), await request.json())
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { characterId } = await context.params;
    return NextResponse.json(await serverCharacterService.deleteCharacter(Number.parseInt(characterId, 10)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
