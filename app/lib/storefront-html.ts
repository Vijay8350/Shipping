import type { StorefrontConfig } from "../services/storefront-settings.server";

/** Minimal server-rendered, branded HTML for App Proxy pages (CLAUDE.md §10). No Polaris
 *  here — these render on the merchant's storefront, not our admin. */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderStorefrontPage(
  config: StorefrontConfig,
  title: string,
  bodyHtml: string,
): string {
  const color = config.themeColor || "#1a73e8";
  const logo = config.logoUrl
    ? `<img src="${escapeHtml(config.logoUrl)}" alt="" style="max-height:48px" />`
    : `<strong style="font-size:20px">${escapeHtml(title)}</strong>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root { --brand: ${escapeHtml(color)}; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin:0; color:#1f2329; background:#f6f6f7; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 24px 16px; }
  .header { display:flex; align-items:center; gap:12px; padding-bottom:16px; border-bottom:3px solid var(--brand); margin-bottom:24px; }
  .card { background:#fff; border:1px solid #e3e3e3; border-radius:12px; padding:20px; margin-bottom:16px; }
  .badge { display:inline-block; padding:2px 10px; border-radius:999px; background:var(--brand); color:#fff; font-size:13px; }
  .timeline { list-style:none; padding:0; margin:0; }
  .timeline li { padding:10px 0; border-bottom:1px solid #f0f0f0; }
  .muted { color:#6b7177; font-size:13px; }
  label { display:block; font-size:14px; margin:12px 0 4px; }
  input, textarea, select { width:100%; padding:10px; border:1px solid #c9cccf; border-radius:8px; font-size:14px; }
  button { background:var(--brand); color:#fff; border:0; padding:11px 18px; border-radius:8px; font-size:15px; cursor:pointer; margin-top:16px; }
  a { color: var(--brand); }
  ${config.customCss ?? ""}
</style>
</head>
<body>
  <div class="wrap">
    <div class="header">${logo}</div>
    ${bodyHtml}
  </div>
</body>
</html>`;
}

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
