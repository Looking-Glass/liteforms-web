import { NextResponse, type NextRequest } from "next/server";
import { buildVrmUploadRequest } from "@/lib/avatar/vrm-upload";
import { createServerLiteformsClient, getLiteformsAccessToken } from "@/lib/liteforms-api/server";
import { toErrorResponse } from "@/lib/http/errors";

export async function POST(request: NextRequest) {
  try {
    const accessToken = await getLiteformsAccessToken();

    if (!accessToken) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = (await request.json()) as { name: string; size: number; type?: string };
    const client = createServerLiteformsClient(accessToken);
    return NextResponse.json(await client.requestModelUpload(buildVrmUploadRequest(body)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
