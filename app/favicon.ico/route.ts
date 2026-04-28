export function GET() {
  return new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="12" fill="#11110f"/>
      <circle cx="32" cy="32" r="22" fill="#70d6c5"/>
      <path d="M22 38c5 6 15 6 20 0" fill="none" stroke="#11110f" stroke-width="5" stroke-linecap="round"/>
      <circle cx="24" cy="26" r="4" fill="#11110f"/>
      <circle cx="40" cy="26" r="4" fill="#11110f"/>
    </svg>`,
    {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    }
  );
}
