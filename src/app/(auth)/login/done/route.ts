import { safeRedirectPath } from "@/lib/app-url";
import { NextResponse } from "next/server";

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Post-login HTML bridge for Safari/iOS Password AutoFill.
 *
 * After a successful HTML form POST, Safari looks for navigation to a normal
 * document. Returning 200 text/html here (then forwarding to the app) is what
 * restores the system "Save Password" sheet. Do not replace this with a
 * client-only soft navigation.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const nextPath = safeRedirectPath(requestUrl.searchParams.get("next"));
  const safeNext = escapeHtmlAttr(nextPath);
  const jsNext = JSON.stringify(nextPath);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta http-equiv="refresh" content="0;url=${safeNext}"/>
  <title>Signed in</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;color:#334155;background:#f8fafc}
  </style>
</head>
<body>
  <p>Signed in…</p>
  <script>location.replace(${jsNext});</script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
