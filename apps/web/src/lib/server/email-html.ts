const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function linkify(text: string): string {
  return escape(text).replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${url}" style="color:inherit;text-decoration:underline">${url}</a>`);
}

export function renderEmailHtml(input: { salonName: string; accent?: string; title: string; body: string; cta?: { label: string; url: string } | null; unsubscribeUrl?: string | null; productName: string }): string {
  const accent = input.accent || "#3056d3";
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2a2b3d">${linkify(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  const button = input.cta ? `<table role="presentation" style="margin:24px 0 8px"><tr><td style="border-radius:10px;background:${accent}"><a href="${input.cta.url}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none">${escape(input.cta.label)}</a></td></tr></table>` : "";
  const unsubscribe = input.unsubscribeUrl ? `<p style="margin:12px 0 0;font-size:12px;color:#8b8ea8"><a href="${input.unsubscribeUrl}" style="color:#8b8ea8">Odhlásit se z obchodních sdělení</a></p>` : "";
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escape(input.title)}</title></head>
<body style="margin:0;padding:0;background:#f6f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" style="background:#f6f6fb;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(20,20,43,.08)">
<tr><td style="background:${accent};padding:22px 32px"><span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-.01em">${escape(input.salonName)}</span></td></tr>
<tr><td style="padding:32px 32px 24px"><h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:#14142b">${escape(input.title)}</h1>${paragraphs}${button}</td></tr>
<tr><td style="padding:20px 32px 28px;border-top:1px solid #ececf4"><p style="margin:0;font-size:12px;color:#8b8ea8">Tuto zprávu vám poslal salon ${escape(input.salonName)} přes systém ${escape(input.productName)}.</p>${unsubscribe}</td></tr>
</table></td></tr></table></body></html>`;
}
