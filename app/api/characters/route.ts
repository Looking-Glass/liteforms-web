import { NextResponse, type NextRequest } from "next/server";
import { serverCharacterService } from "@/lib/characters/server";
import { toErrorResponse } from "@/lib/http/errors";

export async function GET() {
  try {
    return NextResponse.json(await serverCharacterService.listCharacters());
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await serverCharacterService.createCharacter(await request.json()), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
