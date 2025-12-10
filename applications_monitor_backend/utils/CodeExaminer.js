export function encode(campaignName, campaignerName) {
  const raw = `${campaignName}:${campaignerName}`;
  return Buffer.from(raw).toString("base64url"); // URL-safe
}

export function decode(code) {
  const raw = Buffer.from(code, "base64url").toString("utf8");
  const [campaignName, campaignerName] = raw.split(":");
  return { campaignName, campaignerName };
}
