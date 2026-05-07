import { google } from "googleapis";
import { GmailUser } from "../schema_models/GmailUser.js";

const oauth2Client = () =>
  new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

export const startGoogleAuth = (req, res) => {
  const ownerEmail = typeof req.query.email === "string" ? req.query.email : "system";
  const url = oauth2Client().generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly"
    ],
    prompt: "consent",
    state: encodeURIComponent(ownerEmail)
  });
  res.redirect(url);
};

async function getEmailFromAccessToken(accessToken) {
  const tmp = new google.auth.OAuth2();
  tmp.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: tmp });
  const profile = await gmail.users.getProfile({ userId: "me" });
  return profile.data.emailAddress;
}

export const googleAuthCallback = async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send("Missing code");
  try {
    const { tokens } = await oauth2Client().getToken(code);
    if (!tokens.refresh_token) {
      return res
        .status(400)
        .send("No refresh_token returned. Disconnect this account from your Google security settings and retry.");
    }
    const email = await getEmailFromAccessToken(tokens.access_token);
    const ownerEmail = typeof state === "string" ? decodeURIComponent(state) : "system";
    const emailLc = email.toLowerCase();
    // Single global sender — wipe any previous account before storing the new one.
    await GmailUser.deleteMany({ email: { $ne: emailLc } });
    await GmailUser.findOneAndUpdate(
      { email: emailLc },
      {
        email: emailLc,
        refreshToken: tokens.refresh_token,
        ownerEmail: ownerEmail.toLowerCase(),
        updatedAt: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.send(`✅ ${email} connected as system Gmail sender. You can close this tab.`);
  } catch (err) {
    console.error("[GmailOAuth] callback error:", err?.response?.data || err.message);
    return res.status(500).send("Google OAuth error");
  }
};

export const gmailStatus = async (_req, res) => {
  try {
    const sender = await GmailUser.findOne({}).sort({ updatedAt: -1, createdAt: -1 }).lean();
    if (!sender) return res.json({ connected: false });
    res.json({
      connected: true,
      email: sender.email,
      connectedAt: sender.createdAt,
      updatedAt: sender.updatedAt
    });
  } catch (err) {
    res.status(500).json({ error: "failed_to_check" });
  }
};

export const gmailDisconnect = async (_req, res) => {
  try {
    const result = await GmailUser.deleteMany({});
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: "failed_to_disconnect" });
  }
};
