import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function toErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request", issues: error.issues }, { status: 400 });
  }

  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
