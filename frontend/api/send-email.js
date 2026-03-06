// Vercel serverless function — email relay for HuggingFace Spaces backend
const https = require("https");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Relay-Secret");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (req.headers["x-relay-secret"] !== process.env.RELAY_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { to, subject, html } = req.body || {};
  if (!to || !subject || !html) {
    return res.status(400).json({ error: "Missing to, subject, or html" });
  }

  const apiKey    = process.env.MAILJET_API_KEY;
  const secretKey = process.env.MAILJET_SECRET_KEY;
  const fromAddr  = process.env.EMAIL_FROM_ADDR || "776438@gmail.com";

  if (!apiKey || !secretKey) {
    return res.status(500).json({ error: "Email not configured" });
  }

  const credentials = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");
  const body = JSON.stringify({
    Messages: [{
      From:     { Email: fromAddr, Name: "Document AI" },
      To:       [{ Email: to }],
      Subject:  subject,
      HTMLPart: html,
    }],
  });

  await new Promise((resolve, reject) => {
    const options = {
      hostname: "api.mailjet.com",
      path:     "/v3.1/send",
      method:   "POST",
      headers:  {
        Authorization:  `Basic ${credentials}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const request = https.request(options, (r) => {
      let data = "";
      r.on("data", (chunk) => { data += chunk; });
      r.on("end", () => {
        if (r.statusCode >= 200 && r.statusCode < 300) {
          res.status(200).json({ success: true });
          resolve();
        } else {
          res.status(500).json({ error: data });
          resolve();
        }
      });
    });
    request.on("error", (err) => {
      res.status(500).json({ error: err.message });
      resolve();
    });
    request.write(body);
    request.end();
  });
};
