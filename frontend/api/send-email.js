// Vercel serverless function — email relay for HuggingFace Spaces backend
// HF Spaces IPs are blocked by Cloudflare; this runs on Vercel IPs which are not.

export default async function handler(req, res) {
  // CORS — allow HF Space backend to call this
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Relay-Secret");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Verify relay secret to prevent abuse
  if (req.headers["x-relay-secret"] !== process.env.RELAY_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { to, subject, html } = req.body || {};
  if (!to || !subject || !html) {
    return res.status(400).json({ error: "Missing to, subject, or html" });
  }

  const apiKey    = process.env.MAILJET_API_KEY;
  const secretKey = process.env.MAILJET_SECRET_KEY;
  const fromAddr  = process.env.EMAIL_FROM_ADDR;

  if (!apiKey || !secretKey || !fromAddr) {
    return res.status(500).json({ error: "Email not configured on server" });
  }

  const credentials = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");

  const mjRes = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Messages: [{
        From:     { Email: fromAddr, Name: "Document AI" },
        To:       [{ Email: to }],
        Subject:  subject,
        HTMLPart: html,
      }],
    }),
  });

  const data = await mjRes.json();
  if (mjRes.ok) {
    return res.status(200).json({ success: true });
  }
  return res.status(500).json({ error: data });
}
