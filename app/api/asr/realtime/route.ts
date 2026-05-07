export async function GET() {
  return Response.json(
    {
      error: "Realtime ASR relay requires a WebSocket upgrade endpoint.",
      message:
        "Use the relay contract in lib/speech/asrRealtimeRelay.ts from a Node WebSocket server so provider auth headers stay server-side."
    },
    { status: 426 }
  );
}
