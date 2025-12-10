// // models/CampaignTracker.js
// import mongoose from "mongoose";
// import {encode} from '../utils/CodeExaminer.js';
//  // reversible encode
// /* ------------------ Click Schema (detailed log) ------------------ */
// const ClickSchema = new mongoose.Schema({
//   link_code: { type: String, required: true },
//   utm_source: { type: String, required: true },
//   utm_campaign: { type: String, required: true },
//   ip: { type: String, required: true },
//   timestamp: { type: Date, default: Date.now },
// });

// /* ------------------ SourceUTM Schema (per campaigner summary) ------------------ */
// const SourceUTMSchema = new mongoose.Schema({
//   createdAt: { type: Date, default: Date.now },
//   utm_source: { type: String, required: true },   // campaigner
//   utm_campaign: { type: String, required: true }, // campaign
//   link_code: { type: String, required: true, unique: true }, // 👈 unique per campaigner
//   total_clicks: { type: Number, default: 0 },
//   unique_clicks: { type: Number, default: 0 },
//   unique_ips: { type: [String], default: [] }, // store unique IPs
// });

// /* ------------------ LinkCampaign Schema (campaign + campaigners) ------------------ */
// campaign = new LinkCampaignUtm({
//   campaign_name: campaignName,
//   link_code: encode(campaignName), // ✅ generate always
//   utm_source: [firstSource],
// });


// /* ------------------ Exports ------------------ */
// export const Click = mongoose.models.Click || mongoose.model("Click", ClickSchema);
// export const SourceUTM = mongoose.models.SourceUTM || mongoose.model("SourceUTM", SourceUTMSchema);
// export const LinkCampaignUtm = mongoose.models.LinkCampaignUtm || mongoose.model("LinkCampaignUtm", LinkCampaignUtmSchema);

import mongoose from "mongoose";

/* ------------------ SourceUTM Schema ------------------ */
const ConversionSchema = new mongoose.Schema({
  clientName: { type: String, required: true },
  clientEmail: { type: String, required: true },
  clientPhone: { type: String, default: "Not Provided" },
  bookingDate: { type: Date, default: Date.now }
});

const SourceUTMSchema = new mongoose.Schema({
  utm_source: { type: String, required: true },   // campaigner
  utm_campaign: { type: String, required: true }, // campaign
  link_code: { type: String, required: true },    // ✅ unique code per campaigner
  total_clicks: { type: Number, default: 0 },
  unique_clicks: { type: Number, default: 0 },
  unique_ips: { type: [String], default: [] },
   conversions: { type: [ConversionSchema], default: [] },
  // conversions:[ConversionSc]hema
});

/* ------------------ Campaign Schema ------------------ */
const LinkCampaignUtmSchema = new mongoose.Schema({
  campaign_name: { type: String, required: true },
  utm_source: { type: [SourceUTMSchema], required: true }, // array of campaigners
  createdAt: { type: Date, default: Date.now },
  link_code: { type: String, required: true, default: Date.now },
  code: { type: String, unique: true }, // for the /r/:code route
  totalClicks: { type: Number, default: 0 },
  uniqueIPs: { type: [String], default: [] },
  uniqueCount: { type: Number, default: 0 }
});

/* ------------------ Click Schema ------------------ */
const ClickSchema = new mongoose.Schema({
  link_code: { type: String, required: true },    // match SourceUTM.link_code
  utm_source: { type: String, required: true },
  utm_campaign: { type: String, required: true },
  ip: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

/* ------------------ Export Models ------------------ */
export const SourceUTM =
  mongoose.models.SourceUTM || mongoose.model("SourceUTM", SourceUTMSchema);

export const LinkCampaignUtm =
  mongoose.models.LinkCampaignUtm ||
  mongoose.model("LinkCampaignUtm", LinkCampaignUtmSchema);

export const Click =
  mongoose.models.Click || mongoose.model("Click", ClickSchema);
