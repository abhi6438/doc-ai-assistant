/**
 * send-email.js — Vercel serverless email relay
 * -----------------------------------------------
 * Why this exists:
 *   HuggingFace Spaces blocks all outbound SMTP connections, so the Python
 *   backend cannot send emails directly. This function runs on Vercel's servers
 *   which CAN reach Gmail SMTP, acting as a relay.
 *
 * Request flow:
 *   HF Backend → POST /api/send-email (with X-Relay-Secret header)
 *              → Gmail SMTP (via nodemailer)
 *              → User's inbox
 *
 * Security:
 *   The X-Relay-Secret header must match the RELAY_SECRET environment variable.
 *   This prevents anyone else from using this function to send spam.
 *
 * Required Vercel environment variables:
 *   GMAIL_USER         — the Gmail address to send from (e.g. you@gmail.com)
 *   GMAIL_APP_PASSWORD — Gmail App Password (not your regular Google password)
 *                        Generate one at: myaccount.google.com/apppasswords
 *   RELAY_SECRET       — shared secret (must also be set on HuggingFace Space)
 */

const nodemailer = require("nodemailer");

module.exports = async function handler(req, res) {
  // Allow cross-origin requests from the HuggingFace backend
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Relay-Secret");

  // Handle CORS preflight
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Reject requests without the correct shared secret
  if (req.headers["x-relay-secret"] !== process.env.RELAY_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { to, subject, html } = req.body || {};
  if (!to || !subject || !html) {
    return res.status(400).json({ error: "Missing required fields: to, subject, html" });
  }

  // Create a Gmail SMTP transporter using the app password
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  try {
    await transporter.sendMail({
      from:    `"Document AI" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    // Return the error message so the backend can surface it to the user
    return res.status(500).json({ error: err.message });
  }
};
