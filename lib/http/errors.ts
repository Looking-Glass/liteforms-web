import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthenticationRequiredError } from "@/lib/characters/service";
import { LiteformsApiError } from "@/lib/liteforms-api/client";

export function toErrorResponse(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request", issues: error.issues }, { status: 400 });
  }

  if (error instanceof LiteformsApiError) {
    return NextResponse.json({ error: error.message, detail: error.responseBody }, { status: error.status });
  }

  if (error instanceof Error && error.message.includes("LITEFORMS_API_BASE_URL")) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
