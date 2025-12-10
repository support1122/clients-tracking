// // // controllers/createCampaign.js
// // import { LinkCampaignUtm, SourceUTM } from "../schema_models/UtmSchema.js";
// // import { encode } from "../utils/CodeExaminer.js"; // reversible encoder

// // export default async function createCampaign(req, res) {
// //   try {
// //     const { campaignName, campaigner } = req.body;
// //     console.log(req.body);

// //     if (!campaignName) {
// //       return res.status(400).json({ message: "campaignName is required" });
// //     }
// //     if (!campaigner || typeof campaigner !== "string") {
// //       return res
// //         .status(400)
// //         .json({ message: "campaigner must be a non-empty string" });
// //     }

// //     const cleanCampaigner = campaigner.trim();

// //     // Look for campaign
// //     let campaign = await LinkCampaignUtm.findOne({ campaign_name: campaignName });

// //     if (campaign) {
// //       // ✅ Case 2: campaign exists
// //       const alreadyExists = campaign.utm_source.some(
// //         (s) => s.utm_source.toLowerCase() === cleanCampaigner.toLowerCase()
// //       );

// //       if (alreadyExists) {
// //         return res.json({
// //           ok: false,
// //           message: `Campaigner "${cleanCampaigner}" already exists in campaign "${campaignName}"`,
// //         });
// //       }

// //       // Create a new SourceUTM subdocument
// //       const newSource = new SourceUTM({
// //         utm_source: cleanCampaigner,
// //         utm_campaign: campaignName,
// //       });

// //       // Push into existing campaign
// //       campaign.utm_source.push(newSource);
// //       await campaign.save();

// //       const link = `${
// //         process.env.FRONTEND_URL || "https://flashfire-frontend-hoisted.vercel.app/book-free-demo"
// //       }?ref=${encode(campaignName, cleanCampaigner)}`;

// //       return res.json({
// //         ok: true,
// //         message: `Campaign "${campaignName}" updated with new campaigner "${cleanCampaigner}"`,
// //         campaign,
// //         links: [{ campaigner: cleanCampaigner, link }],
// //       });
// //     }

// //     // ✅ Case 1: no campaign → create new
// //     const firstSource = new SourceUTM({
// //       utm_source: cleanCampaigner,
// //       utm_campaign: campaignName,
// //     });

// //     campaign = new LinkCampaignUtm({
// //       campaign_name: campaignName,
// //       link_code: encode(campaignName),
// //       utm_source: [firstSource], // array of SourceUTM
// //     });

// //     await campaign.save();

// //     const link = `${
// //       "https://flashfire-frontend-hoisted.vercel.app/book-free-demo"
// //     }?ref=${encode(campaignName, cleanCampaigner)}`;

// //     return res.json({
// //       ok: true,
// //       message: `New campaign "${campaignName}" created with campaigner "${cleanCampaigner}"`,
// //       campaign,
// //       links: [{ campaigner: cleanCampaigner, link }],
// //     });
// //   } catch (err) {
// //     console.error("Error creating campaign:", err);
// //     return res.status(500).json({ ok: false, error: "server_error" });
// //   }
// // }

// import { LinkCampaignUtm, SourceUTM } from "../schema_models/UtmSchema.js";
// import { encode } from "../utils/CodeExaminer.js"; // reversible encoder

// export default async function createCampaign(req, res) {
//   try {
//     const { campaignName, campaigner } = req.body;

//     if (!campaignName) {
//       return res.status(400).json({ message: "campaignName is required" });
//     }
//     if (!campaigner || typeof campaigner !== "string") {
//       return res
//         .status(400)
//         .json({ message: "campaigner must be a non-empty string" });
//     }

//     const cleanCampaigner = campaigner.trim();
//     const code = encode(campaignName, cleanCampaigner); // 👈 generate unique code per campaigner

//     // Look for campaign
//     let campaign = await LinkCampaignUtm.findOne({ campaign_name: campaignName });

//     if (campaign) {
//       // ✅ Campaign exists
//       const alreadyExists = campaign.utm_source.some(
//         (s) => s.utm_source.toLowerCase() === cleanCampaigner.toLowerCase()
//       );

//       if (alreadyExists) {
//         return res.json({
//           ok: false,
//           message: `Campaigner "${cleanCampaigner}" already exists in campaign "${campaignName}"`,
//         });
//       }

//       // Create a new SourceUTM subdocument
//       const newSource = new SourceUTM({
//         utm_source: cleanCampaigner,
//         utm_campaign: campaignName,
//         link_code: code,   // 👈 assign unique code here
//       });

//       // Push into existing campaign
//       campaign.utm_source.push(newSource);
//       await campaign.save();

//       const link = `${
//         process.env.FRONTEND_URL || "https://flashfire-frontend-hoisted.vercel.app"
//       }?ref=${code}`;

//       return res.json({
//         ok: true,
//         message: `Campaign "${campaignName}" updated with new campaigner "${cleanCampaigner}"`,
//         campaign,
//         links: [{ campaigner: cleanCampaigner, link }],
//       });
//     }

//     // ✅ Campaign does not exist → create new
//     const firstSource = new SourceUTM({
//       utm_source: cleanCampaigner,
//       utm_campaign: campaignName,
//       link_code: code, // 👈 store code in subdocument
//     });

//     campaign = new LinkCampaignUtm({
//       campaign_name: campaignName,
//       utm_source: [firstSource],
//     });

//     await campaign.save();

//     const link = `${
//       process.env.FRONTEND_URL || "https://flashfire-frontend-hoisted.vercel.app"
//     }?ref=${code}`;

//     return res.json({
//       ok: true,
//       message: `New campaign "${campaignName}" created with campaigner "${cleanCampaigner}"`,
//       campaign,
//       links: [{ campaigner: cleanCampaigner, link }],
//     });
//   } catch (err) {
//     console.error("Error creating campaign:", err);
//     return res.status(500).json({ ok: false, error: "server_error" });
//   }
// }

import { LinkCampaignUtm, SourceUTM } from "../schema_models/UtmSchema.js";
import { encode } from "../utils/CodeExaminer.js"; // reversible encoder

export default async function createCampaign(req, res) {
  try {
    const { campaignName, campaigner } = req.body;

    if (!campaignName) {
      return res.status(400).json({ message: "campaignName is required" });
    }
    if (!campaigner || typeof campaigner !== "string") {
      return res
        .status(400)
        .json({ message: "campaigner must be a non-empty string" });
    }

    const cleanCampaigner = campaigner.trim();
    const code = encode(campaignName, cleanCampaigner); // unique code per campaigner

    // Look for campaign
    let campaign = await LinkCampaignUtm.findOne({ campaign_name: campaignName });

    if (campaign) {
      // ✅ Campaign exists
      const alreadyExists = campaign.utm_source.some(
        (s) => s.utm_source.toLowerCase() === cleanCampaigner.toLowerCase()
      );

      if (alreadyExists) {
        return res.json({
          ok: false,
          message: `Campaigner "${cleanCampaigner}" already exists in campaign "${campaignName}"`,
        });
      }

      // Add new campaigner
      const newSource = new SourceUTM({
        utm_source: cleanCampaigner,
        utm_campaign: campaignName,
        link_code: code,
      });

      campaign.utm_source.push(newSource);
      await campaign.save();

      const link = `${
        process.env.FRONTEND_URL || "https://flashfirejobs.com"
      }?ref=${code}`;

      return res.json({
        ok: true,
        message: `Campaign "${campaignName}" updated with new campaigner "${cleanCampaigner}"`,
        campaign,
        links: [{ campaigner: cleanCampaigner, link }],
      });
    }

    // ✅ Create new campaign
    const firstSource = new SourceUTM({
      utm_source: cleanCampaigner,
      utm_campaign: campaignName,
      link_code: code,
    });

    campaign = new LinkCampaignUtm({
      campaign_name: campaignName,
      utm_source: [firstSource],
    });

    await campaign.save();

    const link = `${
      process.env.FRONTEND_URL || "https://flashfirejobs.com"
    }?ref=${code}`;

    return res.json({
      ok: true,
      message: `New campaign "${campaignName}" created with campaigner "${cleanCampaigner}"`,
      campaign,
      links: [{ campaigner: cleanCampaigner, link }],
    });
  } catch (err) {
    console.error("Error creating campaign:", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}
