import express from 'express';
import mongoose from 'mongoose';
import { JobModel } from './JobModel.js';
import { ClientModel } from './ClientModel.js';
import { UserModel } from './UserModel.js';
import { SessionKeyModel } from './SessionKeyModel.js';
import { ManagerModel } from './ManagerModel.js';
import OperationsModel from './OperationsModel.js';
import cors from 'cors'
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import CreateCampaign from './controllers/NewCampaign.js';
import { decode, encode } from './utils/CodeExaminer.js';
import { LinkCampaignUtm, Click } from './schema_models/UtmSchema.js';
import { CallLogModel } from './CallLogModel.js';
import Twilio from 'twilio';
import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import {
  getAllManagers,
  getManagerById,
  createManager,
  updateManager,
  deleteManager,
  uploadProfilePhoto
} from './controllers/ManagerController.js';
import { upload } from './utils/cloudinary.js';
import { encrypt } from './utils/CryptoHelper.js';
import { NewUserModel } from './schema_models/UserModel.js';
import { ClientTodosModel } from './ClientTodosModel.js';
import { ClientOperationsModel } from './ClientOperationsModel.js';




// Environment Variables
const PORT = process.env.PORT || 10000;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

// Validate required environment variables
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is required');
  process.exit(1);
}

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET environment variable is required');
  process.exit(1);
}

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error('❌ Cloudinary environment variables are required');
  process.exit(1);
}

const app = express();
// app.use(cors({
//   origin: process.env.CORS_ORIGIN || 'https://dashboardtracking.vercel.app',
//   credentials: true
// }));
// app.use(express.json());
const allowedOrigins = [
  // Development origins
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",

  // Production origins
  "https://flashfire-frontend-hoisted.vercel.app",
  "https://flashfirejobs.com",
  "https://www.flashfirejobs.com",
  "https://flashfire-frontend-hoisted.vercel.app/",
  "https://utm-track-frontend.vercel.app",
  "https://dashboardtracking.vercel.app",
  "https://clients-tracking.vercel.app",
  "https://dashboardtracking.vercel.app/",
  "https://portal.flashfirejobs.com",
  "https://www.portal.flashfirejobs.com",
  "https://flashfire-dashboard-frontend.vercel.app",
  "https://flashfire-dashboard.vercel.app",
  "https://hq.flashfirejobs.com/",
  "https://hq.flashfirejobs.com",

  // Additional origins from environment variable
  ...(process.env.ALLOWED_ORIGINS?.split(",") || [])
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow non-browser requests
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"), false);
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.options(/.*/, cors());

app.use(express.json());
// Twilio webhooks send application/x-www-form-urlencoded by default
app.use(express.urlencoded({ extended: false }));
//Helpers
// function getClientIP(req) {
//   const xff = req.headers["x-forwarded-for"];
//   if (typeof xff === "string" && xff.length > 0) {
//     // may contain multiple IPs: "client, proxy1, proxy2"
//     return xff.split(",")[0].trim();
//   }
//   const ip = req.socket?.remoteAddress || req.ip || "";
//   // strip IPv6 prefix like '::ffff:'
//   return ip.replace(/^::ffff:/, "");
// }

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};

// Middleware to check admin role
const verifyAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  next();
};

const ConnectDB = () => mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 10,
  minPoolSize: 1,
  // Keep idle pooled connections up to 24h before pool closes them
  maxIdleTimeMS: 86_400_000,
  // Allow long-running operations / idle socket without killing it
  socketTimeoutMS: 86_400_000,     // (0 means "no timeout" but can mask hangs; 24h is safer)
  // How long to try to find a server if cluster momentarily unavailable
  serverSelectionTimeoutMS: 10_000,
  // (optional) heartbeatFrequencyMS: 10000,
})
  .then(() => { })
  .catch((error) => {
    console.error("❌ Database connection failed:", error);
    process.exit(1);
  });
ConnectDB();

// Admin users are managed manually in the database
// No automatic admin user creation

// Clean up invalid session keys
const cleanupSessionKeys = async () => {
  try {
    // Try to drop and recreate the collection to fix index issues
    try {
      await SessionKeyModel.collection.drop();
    } catch (dropError) {
      // Collection might not exist, that's okay
    }

    // Recreate the collection
    await SessionKeyModel.createCollection();
  } catch (error) {
    console.error('❌ Error cleaning up session keys:', error);
  }
};

// Clean up session keys after database connection
setTimeout(async () => {
  await cleanupSessionKeys();
}, 2000);
//get all the jobdatabase data..
const getAllJobs = async (req, res) => {
  const jobDB = await JobModel.find().select('-jobDescription').lean();
  res.status(200).json({ jobDB });
}

// Client management endpoints
const getAllClients = async (req, res) => {
  try {
    const clients = await ClientModel.find().lean();
    // console.log(clients);
    res.status(200).json({ clients });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

const getClientByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const client = await ClientModel.findOne({ email: email.toLowerCase() }).lean();
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Get manager name from users collection and add it to client data
    const user = await NewUserModel.findOne({ email: email.toLowerCase() }).lean();
    const managerName = user?.dashboardManager || '';

    // Add manager name to client data while keeping everything else from dashboardtrackings
    const clientWithManager = {
      ...client,
      dashboardManager: managerName // Only this field comes from users collection
    };

    res.status(200).json({ client: clientWithManager });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get client onboarding statistics grouped by month
const getClientStats = async (req, res) => {
  try {
    // Get all clients from ClientModel to ensure consistency with revenue stats
    const allClients = await ClientModel.find({}).lean();

    // Count clients by month from August 2025 onwards
    const monthlyStatsMap = {};
    let totalClients = 0;

    allClients.forEach(client => {
      // Parse createdAt string to Date
      let clientDate;
      try {
        clientDate = new Date(client.createdAt);
        if (isNaN(clientDate.getTime())) {
          return; // Skip invalid dates
        }
      } catch (error) {
        return; // Skip parsing errors
      }

      // Filter for August 2025 onwards
      const startDate = new Date('2025-08-01');
      if (clientDate < startDate) {
        return;
      }

      totalClients++;

      // Group by month
      const year = clientDate.getFullYear();
      const month = clientDate.getMonth() + 1;
      const monthKey = `${year}-${month.toString().padStart(2, '0')}`;

      if (!monthlyStatsMap[monthKey]) {
        monthlyStatsMap[monthKey] = {
          year,
          month,
          count: 0
        };
      }
      monthlyStatsMap[monthKey].count++;
    });

    // Convert to array format matching the old structure
    const monthlyStats = Object.values(monthlyStatsMap).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    }).map(stat => ({
      _id: { year: stat.year, month: stat.month },
      count: stat.count
    }));

    // Get current month stats
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const currentMonthCount = monthlyStats.find(
      stat => stat._id.month === currentMonth && stat._id.year === currentYear
    )?.count || 0;

    // Get last month stats
    const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const lastMonthCount = monthlyStats.find(
      stat => stat._id.month === lastMonth && stat._id.year === lastMonthYear
    )?.count || 0;

    // Calculate growth percentage
    const growthPercentage = lastMonthCount > 0
      ? ((currentMonthCount - lastMonthCount) / lastMonthCount * 100).toFixed(1)
      : currentMonthCount > 0 ? 100 : 0;

    // Format monthly data for charts from August 2025 onwards
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    const formattedMonthlyData = [];
    const currentDate = new Date();
    const startDateForLoop = new Date('2025-08-01');

    // Generate months from August 2025 to current month
    for (let date = new Date(startDateForLoop); date <= currentDate; date.setMonth(date.getMonth() + 1)) {
      const year = date.getFullYear();
      const month = date.getMonth() + 1;

      const statsForMonth = monthlyStats.find(
        stat => stat._id.month === month && stat._id.year === year
      );

      formattedMonthlyData.push({
        month: `${monthNames[month - 1]} ${year}`,
        count: statsForMonth?.count || 0,
        year,
        monthNumber: month
      });
    }

    res.status(200).json({
      success: true,
      data: {
        totalClients,
        currentMonthCount,
        lastMonthCount,
        growthPercentage: parseFloat(growthPercentage),
        monthlyData: formattedMonthlyData,
        rawMonthlyStats: monthlyStats
      }
    });
  } catch (error) {
    console.error('Error fetching client statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch client statistics',
      error: error.message
    });
  }
};

// (Auth routes removed)

export const createOrUpdateClient = async (req, res) => {
  try {
    const {
      currentPath,
      email,
      password,
      name,
      jobDeadline,
      applicationStartDate,
      dashboardInternName,
      dashboardTeamLeadName,
      planType,
      onboardingDate,
      whatsappGroupMade,
      whatsappGroupMadeDate,
      dashboardCredentialsShared,
      dashboardCredentialsSharedDate,
      resumeSent,
      resumeSentDate,
      coverLetterSent,
      coverLetterSentDate,
      portfolioMade,
      portfolioMadeDate,
      linkedinOptimization,
      linkedinOptimizationDate,
      gmailCredentials,
      dashboardCredentials,
      linkedinCredentials,
      amountPaid,
      amountPaidDate,
      modeOfPayment,
      status,
    } = req.body;

    const emailLower = email.toLowerCase();
    const planPrices = { ignite: 199, professional: 349, executive: 599, prime: 119 };
    const dashboardManager = dashboardTeamLeadName;

    const capitalizedPlan =
      planType?.trim()?.toLowerCase() === "ignite"
        ? "Ignite"
        : planType?.trim()?.toLowerCase() === "professional"
          ? "Professional"
          : planType?.trim()?.toLowerCase() === "executive"
            ? "Executive"
            : planType?.trim()?.toLowerCase() === "prime"
              ? "Prime"
              : "Free Trial";

    const userData = {
      name,
      email: emailLower,
      passwordHashed: password ? encrypt(password) : encrypt("flashfire@123"),
      planType: capitalizedPlan,
      userType: "User",
      dashboardManager,
    };

    // ✅ if it's a "new client" path
    if (currentPath?.includes("/clients/new")) {
      const existingUser = await NewUserModel.findOne({ email: emailLower });

      // CREATE new user + client tracking if not exists
      if (!existingUser) {
        const newUser = await NewUserModel.create(userData);

        const fullClientData = {
          email: emailLower,
          name,
          jobDeadline: jobDeadline || " ",
          applicationStartDate: applicationStartDate || " ",
          dashboardInternName: dashboardInternName || " ",
          dashboardTeamLeadName,
          planType: planType?.toLowerCase() || "ignite",
          planPrice: planPrices[planType?.toLowerCase()] || 199,
          onboardingDate: onboardingDate || new Date().toISOString(),
          whatsappGroupMade: whatsappGroupMade ?? false,
          whatsappGroupMadeDate: whatsappGroupMadeDate || " ",
          dashboardCredentialsShared: dashboardCredentialsShared ?? false,
          dashboardCredentialsSharedDate: dashboardCredentialsSharedDate || " ",
          resumeSent: resumeSent ?? false,
          resumeSentDate: resumeSentDate || " ",
          coverLetterSent: coverLetterSent ?? false,
          coverLetterSentDate: coverLetterSentDate || " ",
          portfolioMade: portfolioMade ?? false,
          portfolioMadeDate: portfolioMadeDate || " ",
          linkedinOptimization: linkedinOptimization ?? false,
          linkedinOptimizationDate: linkedinOptimizationDate || " ",
          gmailCredentials: gmailCredentials || { email: "", password: "" },
          dashboardCredentials: dashboardCredentials || {
            username: "",
            password: "",
          },
          linkedinCredentials: linkedinCredentials || {
            username: "",
            password: "",
          },
          amountPaid: amountPaid || 0,
          amountPaidDate: amountPaidDate || " ",
          modeOfPayment: modeOfPayment || "paypal",
          status: status !== undefined && status !== null && status !== '' ? status : "active",
          updatedAt: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
        };

        const newTracking = await ClientModel.create(fullClientData);
        return res.status(200).json({
          message: "✅ New client created successfully",
          newUser,
          newTracking,
        });
      }

      // 🔄 if exists → partial update only
      await NewUserModel.updateOne({ email: emailLower }, { $set: userData });
      await ClientModel.updateOne(
        { email: emailLower },
        { $set: { dashboardTeamLeadName: dashboardManager } },
        { runValidators: false }
      );
      return res.status(200).json({
        message: "🟢 Existing client updated (partial update)",
      });
    }

    // ✅ if not /clients/new → partial update always
    await ClientModel.updateOne(
      { email: emailLower },
      { $set: req.body },
      { runValidators: false }
    );
    await NewUserModel.updateOne(
      { email: emailLower },
      { $set: { name, planType: capitalizedPlan, dashboardManager: dashboardTeamLeadName } },
      { runValidators: false }
    );
    const updatedClientsTracking = await ClientModel.findOne({ email: emailLower }).lean();


    return res
      .status(200)
      .json({ message: "🔄 Client fields updated successfully", updatedClientsTracking });
  } catch (error) {
    console.error("❌ Error in createOrUpdateClient:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get operations names for dropdown
const getOperationsNames = async (req, res) => {
  try {
    const operations = await OperationsModel.find().select('name').lean();
    const names = operations.map(op => op.name).filter(name => name).sort();
    res.status(200).json({ success: true, names });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get dashboard manager names for dropdown
const getDashboardManagerNames = async (req, res) => {
  try {
    const managers = await ManagerModel.find({ isActive: true }).select('fullName').lean();
    const names = managers.map(m => m.fullName).filter(name => name).sort();
    res.status(200).json({ success: true, names });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update client operations name
const updateClientOperationsName = async (req, res) => {
  try {
    const { email, operationsName } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const client = await ClientModel.findOneAndUpdate(
      { email: email.toLowerCase() },
      {
        operationsName: operationsName || '',
        updatedAt: new Date().toLocaleString('en-US', 'Asia/Kolkata')
      },
      { new: true }
    ).select('email operationsName').lean();

    if (!client) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    res.status(200).json({ success: true, client });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update client dashboard team lead name
const updateClientDashboardTeamLead = async (req, res) => {
  try {
    const { email, dashboardTeamLeadName } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const client = await ClientModel.findOneAndUpdate(
      { email: email.toLowerCase() },
      {
        dashboardTeamLeadName: dashboardTeamLeadName || '',
        updatedAt: new Date().toLocaleString('en-US', 'Asia/Kolkata')
      },
      { new: true }
    ).select('email dashboardTeamLeadName').lean();

    if (!client) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    res.status(200).json({ success: true, client });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const upgradeClientPlan = async (req, res) => {
  try {
    const { email } = req.params;
    const { planType } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    if (!planType) {
      return res.status(400).json({ success: false, error: 'Plan type is required' });
    }

    const emailLower = email.toLowerCase();
    const planPrices = { ignite: 199, professional: 349, executive: 599, prime: 119 };
    const planTypeLower = planType.toLowerCase();

    if (!planPrices[planTypeLower]) {
      return res.status(400).json({ success: false, error: 'Invalid plan type' });
    }

    const capitalizedPlan = planTypeLower === 'ignite' 
      ? 'Ignite' 
      : planTypeLower === 'professional' 
        ? 'Professional' 
        : planTypeLower === 'executive' 
          ? 'Executive'
          : planTypeLower === 'prime'
            ? 'Prime'
            : 'Free Trial';

    const planPrice = planPrices[planTypeLower];
    const currentDate = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });

    const existingClient = await ClientModel.findOne({ email: emailLower }).lean();
    if (!existingClient) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    const currentAmountPaid = parseFloat(existingClient.amountPaid?.toString().replace(/[$₹,\s]/g, '') || '0');
    const currentPlanPrice = existingClient.planPrice || 0;
    const upgradeDifference = planPrice - currentPlanPrice;
    const newAmountPaid = currentAmountPaid + upgradeDifference;

    await ClientModel.updateOne(
      { email: emailLower },
      {
        $set: {
          planType: planTypeLower,
          planPrice: planPrice,
          amountPaid: newAmountPaid.toString(),
          amountPaidDate: currentDate,
          updatedAt: currentDate
        }
      },
      { runValidators: false }
    );

    await NewUserModel.updateOne(
      { email: emailLower },
      {
        $set: {
          planType: capitalizedPlan,
          updatedAt: currentDate
        }
      },
      { runValidators: false }
    );

    const updatedClient = await ClientModel.findOne({ email: emailLower }).lean();

    res.status(200).json({
      success: true,
      message: `Plan upgraded to ${capitalizedPlan} successfully`,
      client: updatedClient
    });
  } catch (error) {
    console.error('Error upgrading client plan:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const addClientAddon = async (req, res) => {
  try {
    const { email } = req.params;
    const { addonType, addonPrice } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    if (!addonType || !addonPrice) {
      return res.status(400).json({ success: false, error: 'Addon type and price are required' });
    }

    const emailLower = email.toLowerCase();
    const currentDate = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });

    const existingClient = await ClientModel.findOne({ email: emailLower }).lean();
    if (!existingClient) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    const currentAmountPaid = parseFloat(existingClient.amountPaid?.toString().replace(/[$₹,\s]/g, '') || '0');
    const newAmountPaid = currentAmountPaid + parseFloat(addonPrice);

    const newAddon = {
      type: addonType,
      price: parseFloat(addonPrice),
      addedAt: currentDate
    };

    const existingAddons = existingClient.addons || [];
    const updatedAddons = [...existingAddons, newAddon];

    await ClientModel.updateOne(
      { email: emailLower },
      {
        $set: {
          addons: updatedAddons,
          amountPaid: newAmountPaid.toString(),
          amountPaidDate: currentDate,
          updatedAt: currentDate
        }
      },
      { runValidators: false }
    );

    const updatedClient = await ClientModel.findOne({ email: emailLower }).lean();

    res.status(200).json({
      success: true,
      message: `Addon ${addonType} added successfully`,
      client: updatedClient
    });
  } catch (error) {
    console.error('Error adding client addon:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// const createOrUpdateClient = async (req, res) => {
//     try {
//       // const referer = req.headers.referer || "";
//         let {currentPath, email,password, name, jobDeadline, applicationStartDate, dashboardInternName, dashboardTeamLeadName, planType, onboardingDate, whatsappGroupMade, whatsappGroupMadeDate, dashboardCredentialsShared, dashboardCredentialsSharedDate, resumeSent, resumeSentDate,dashboardManager, coverLetterSent, coverLetterSentDate, portfolioMade, portfolioMadeDate, linkedinOptimization, linkedinOptimizationDate, gmailCredentials, dashboardCredentials, linkedinCredentials, amountPaid, amountPaidDate, modeOfPayment, status } = req.body;
//         dashboardManager = dashboardTeamLeadName;
//         // Set plan price based on plan type
//         const planPrices = {
//             ignite: 199,
//             professional: 349,
//             executive: 599,
//         };
//       const capitalizedPlan = (() => {
//       if (!planType) return "Free Trial";
//       const formatted = planType.trim().toLowerCase();
//       switch (formatted) {
//         case "ignite": return "Ignite";
//         case "professional": return "Professional";
//         case "executive": return "Executive";
//         default: return "Free Trial";
//       }
//     })();
//       const clientData = {
//             email: email.toLowerCase(),
//             name,
//             jobDeadline,
//             applicationStartDate,
//             dashboardInternName,
//             dashboardTeamLeadName,
//             planType,
//             planPrice: planPrices[planType] || 199,
//             onboardingDate,
//             whatsappGroupMade,
//             whatsappGroupMadeDate,
//             dashboardCredentialsShared,
//             dashboardCredentialsSharedDate,
//             resumeSent,
//             resumeSentDate,
//             coverLetterSent,
//             coverLetterSentDate,
//             portfolioMade,
//             portfolioMadeDate,
//             linkedinOptimization,
//             linkedinOptimizationDate,
//             gmailCredentials,
//             dashboardCredentials,
//             linkedinCredentials,
//             amountPaid,
//             amountPaidDate,
//             modeOfPayment,
//             status,
//             updatedAt: new Date().toLocaleString('en-US', 'Asia/Kolkata')
//         };
// const userData = {
//       name,
//       email,
//       passwordHashed: password? encrypt(password): encrypt('flashfire@123'),
//       planType: capitalizedPlan, // ✅ matches UserModel enum
//       userType: "User",
//       dashboardManager,

//     };


// if (currentPath.includes("/clients/new")) {
//   // const capitalizedPlan = (() => {
//   //
//    //   if (!planType) return "Free Trial";
//      // const formatted = planType.trim().toLowerCase();
//    //   switch (formatted) {
//    //     case "ignite": return "Ignite";
//        // case "professional": return "Professional";
//         //case "executive": return "Executive";
//        // default: return "Free Trial";
//      // }
//    // })();
//   //       const userData = {
// //      name,
//     //  email,
//   //    passwordHashed: password? encrypt(password): encrypt('flashfire@123'),
// //      planType: capitalizedPlan, // ✅ matches UserModel enum

//   //    planLimit: null,
// //      userType: "User",
//     //  dashboardManager,

//   //  };
//   const checkExistanceinNewUser = await NewUserModel.findOne({email});
//   if(!checkExistanceinNewUser){
//    const client = await NewUserModel.findOneAndUpdate(
//       {email },
//       userData,
//       { upsert: true, new: true, runValidators: true }
//    );
//  // const client = await NewUserModel.findOne({email});
//     const clientTracking = await ClientModel.findOneAndUpdate(
//       {email},
//       {clientData},
//       {upsert: true, new : true, runValidators : true}
//     );
//     return res.status(200).json({message : 'new client created',client, clientTracking});
// }
// else{
//   if(req?.body?.dashboardManager){
//     const client = await NewUserModel.findOneAndUpdate(
//       {email},
//       userData,
//       {upsert : true, new : true, runValidators : true}

//     );
//     const clientTracking = await UserModel.findOneAndUpdate(
//       {email},
//       {dashboardTeamLeadName : dashboardManager},
//       {upsert : true, runValidators : true , new : true}
//     );
//     return res.status(200).json({message : `client details updated in [UserModel] && [DashBoardTracking]`});
//   }

// }
// }


//         else {//if (currentPath.includes("/monitor-clients")) {
//            const clientData = {
//             email: email.toLowerCase(),
//             name,
//             jobDeadline,
//             applicationStartDate,
//             dashboardInternName,
//             dashboardTeamLeadName,
//             planType,
//             planPrice: planPrices[planType] || 199,
//             onboardingDate,
//             whatsappGroupMade,
//             whatsappGroupMadeDate,
//             dashboardCredentialsShared,
//             dashboardCredentialsSharedDate,
//             resumeSent,
//             resumeSentDate,
//             coverLetterSent,
//             coverLetterSentDate,
//             portfolioMade,
//             portfolioMadeDate,
//             linkedinOptimization,
//             linkedinOptimizationDate,
//             gmailCredentials,
//             dashboardCredentials,
//             linkedinCredentials,
//             amountPaid,
//             amountPaidDate,
//             modeOfPayment,
//             status,
//             updatedAt: new Date().toLocaleString('en-US', 'Asia/Kolkata')
//         };

//   const clientTracking = await ClientModel.findOneAndUpdate(
//             { email: email.toLowerCase() },
//             clientData,
//             { upsert: true, new: true, runValidators: true }
//         );
//        // return res.status(200).json({client});
//   const client = await NewUserModel.findOneAndUpdate(
//             {email},
//             {name, email, dashBoardManager : dashboardTeamLeadName, planType},
//             {upsert : true, new : true , runValidators : true}
//       );
//           res.status(200).json({message : `user details updated for client : ${ email} in [UserModel] && [DashboardTracking] `});
// }

// //         else {
// // //  console.log("⚠️ Unknown referer:", referer);
// // console.log(error)
// //   return res.status(400).json({
// //     success: false,
// //     message: "Invalid referer or unsupported frontend route",
// //   });
// // }


//     } catch (error) {
//       console.log(error)
//         res.status(500).json({error: error.message});
//     }
// }
// const createOrUpdateClient = async (req, res) => {
//   try {
//     const {
//       email,
//       password,
//       name,
//       jobDeadline,
//       applicationStartDate,
//       dashboardInternName,
//       dashboardTeamLeadName,
//       planType,
//       onboardingDate,
//       dashboardManager,
//       whatsappGroupMade,
//       whatsappGroupMadeDate,
//       dashboardCredentialsShared,
//       dashboardCredentialsSharedDate,
//       resumeSent,
//       resumeSentDate,
//       coverLetterSent,
//       coverLetterSentDate,
//       portfolioMade,
//       portfolioMadeDate,
//       linkedinOptimization,
//       linkedinOptimizationDate,
//       gmailCredentials,
//       dashboardCredentials,
//       linkedinCredentials,
//       amountPaid,
//       amountPaidDate,
//       modeOfPayment,
//       status,
//     } = req.body;

//     // -------------------- 🧩 Normalize planType for both schemas --------------------
//     // Capitalized for UserModel, lowercase for ClientModel
//     const capitalizedPlan = (() => {
//       if (!planType) return "Free Trial";
//       const formatted = planType.trim().toLowerCase();
//       switch (formatted) {
//         case "ignite": return "Ignite";
//         case "professional": return "Professional";
//         case "executive": return "Executive";
//         default: return "Free Trial";
//       }
//     })();

//     const lowercasePlan = (() => {
//       if (!planType) return "ignite";
//       const formatted = planType.trim().toLowerCase();
//       switch (formatted) {
//         case "ignite": return "ignite";
//         case "professional": return "professional";
//         case "executive": return "executive";
//         default: return "ignite";
//       }
//     })();

//     // -------------------- 💵 Set plan price --------------------
//     const planPrices = {
//       ignite: 199,
//       professional: 349,
//       executive: 599,
//     };

//     // -------------------- 👤 Create or Update NewUserModel --------------------
//     const userData = {
//       name,
//       email,
//       passwordHashed: await encrypt(password),
//       resumeLink: [],
//       coverLetters: [],
//       optimizedResumes: [],
//       planType: capitalizedPlan, // ✅ matches UserModel enum

//       planLimit: null,
//       userType: "User",
//       dashboardManager,

//     };

//     await NewUserModel.findOneAndUpdate(
//       { email },
//       userData,
//       { upsert: true, new: true, runValidators: true }
//     );

//     // -------------------- 📋 Create or Update ClientModel --------------------
//     const clientData = {
//       email: email.toLowerCase(),
//       name,
//       password,
//       jobDeadline,
//       applicationStartDate,
//       dashboardInternName,
//       dashboardTeamLeadName,
//       planType: lowercasePlan, // ✅ matches ClientModel enum
//       planPrice: planPrices[lowercasePlan] || 199,
//       onboardingDate,
//       whatsappGroupMade,
//       whatsappGroupMadeDate,
//       dashboardCredentialsShared,
//       dashboardCredentialsSharedDate,
//       resumeSent,
//       resumeSentDate,
//       coverLetterSent,
//       coverLetterSentDate,
//       portfolioMade,
//       portfolioMadeDate,
//       linkedinOptimization,
//       linkedinOptimizationDate,
//       gmailCredentials,
//       dashboardCredentials,
//       linkedinCredentials,
//       amountPaid,
//       amountPaidDate,
//       modeOfPayment,

//       status,
//       updatedAt: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
//     };

//     const client = await ClientModel.findOneAndUpdate(
//       { email: email.toLowerCase() },
//       clientData,
//       { upsert: true, new: true, runValidators: true }
//     );

//     res.status(200).json({ client });

//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: error.message });
//   }
// };


// Authentication endpoints
const login = async (req, res) => {
  try {
    const { email, password, sessionKey } = req.body;

    // Find user
    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // If user is team_lead or operations_intern, verify session key
    if (user.role === 'team_lead' || user.role === 'operations_intern') {
      if (!sessionKey) {
        return res.status(400).json({ error: 'Session key required' });
      }

      const sessionKeyDoc = await SessionKeyModel.findOne({
        key: sessionKey,
        userEmail: email.toLowerCase(),
        isUsed: false,
        expiresAt: { $gt: new Date() }
      });

      if (!sessionKeyDoc) {
        return res.status(401).json({ error: 'Invalid or expired session key' });
      }

      // Mark session key as used
      sessionKeyDoc.isUsed = true;
      sessionKeyDoc.usedAt = new Date().toLocaleString('en-US', 'Asia/Kolkata');
      await sessionKeyDoc.save();
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      token,
      user: {
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create a new user (admin only)
const createUser = async (req, res) => {
  try {
    const { email, password, role = 'team_lead' } = req.body;

    // Check if user already exists
    const existingUser = await UserModel.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new UserModel({
      email: email.toLowerCase(),
      password: hashedPassword,
      role,
      updatedAt: new Date().toLocaleString('en-US', 'Asia/Kolkata')
    });

    await user.save();
    res.status(201).json({
      message: 'User created successfully',
      user: {
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Generate session key (admin only)
const generateSessionKey = async (req, res) => {
  try {
    const { userEmail } = req.body;

    // Check if user exists and is team_lead or operations_intern
    const user = await UserModel.findOne({
      email: userEmail.toLowerCase(),
      role: { $in: ['team_lead', 'operations_intern'] },
      isActive: true
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found or invalid role' });
    }

    // Generate unique session key with retry logic
    let sessionKey;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      // Generate a more robust session key with timestamp and random
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2, 10).toUpperCase();
      sessionKey = `FF${timestamp}${random}`;
      attempts++;

      // Check if this key already exists
      const existingKey = await SessionKeyModel.findOne({ key: sessionKey });
      if (!existingKey) break;

      if (attempts >= maxAttempts) {
        return res.status(500).json({ error: 'Failed to generate unique session key after multiple attempts' });
      }
    } while (true);

    const sessionKeyDoc = new SessionKeyModel({
      key: sessionKey,
      userEmail: userEmail.toLowerCase()
    });

    await sessionKeyDoc.save();

    res.status(201).json({
      message: 'Session key generated successfully',
      sessionKey,
      userEmail: userEmail.toLowerCase(),
      expiresAt: sessionKeyDoc.expiresAt
    });
  } catch (error) {
    console.error('Session key generation error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get all users (admin only)
const getAllUsers = async (req, res) => {
  try {
    const users = await UserModel.find({}, { password: 0 });
    res.status(200).json({ users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get session keys for a user (admin only)
const getUserSessionKeys = async (req, res) => {
  try {
    const { userEmail } = req.params;
    const sessionKeys = await SessionKeyModel.find({
      userEmail: userEmail.toLowerCase()
    }).sort({ createdAt: -1 });

    res.status(200).json({ sessionKeys });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create a new job
const createJob = async (req, res) => {
  try {
    const jobData = {
      ...req.body,
      createdAt: new Date().toLocaleString('en-US', 'Asia/Kolkata'),
      updatedAt: new Date().toLocaleString('en-US', 'Asia/Kolkata')
    };

    const job = new JobModel(jobData);
    await job.save();
    res.status(201).json({ job });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Clean up session keys endpoint (admin only)
const cleanupSessionKeysEndpoint = async (req, res) => {
  try {
    // Drop the entire collection to remove corrupted indexes
    await SessionKeyModel.collection.drop().catch(() => {
      // Collection might not exist, that's okay
    });

    // Recreate the collection with proper schema
    await SessionKeyModel.createCollection();

    res.status(200).json({
      message: 'Session keys collection reset successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Verify credentials (for two-step login)
const verifyCredentials = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await UserModel.findOne({
      email: email.toLowerCase(),
      isActive: true
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.status(200).json({
      message: 'Credentials verified',
      role: user.role,
      email: user.email
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete user (admin only)
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Don't allow deleting admin users
    if (user.role === 'admin') {
      return res.status(403).json({ error: 'Cannot delete admin users' });
    }

    // Delete user
    await UserModel.findByIdAndDelete(userId);

    // Also delete any session keys for this user
    await SessionKeyModel.deleteMany({ userEmail: user.email });

    res.status(200).json({
      message: 'User deleted successfully',
      deletedUser: { email: user.email, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Change password for user (admin only)
const changePassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    // Validate new password
    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'New password is required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    // Check if user exists
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only allow changing password for admin users
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Can only change password for admin users' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    user.password = hashedPassword;
    user.updatedAt = new Date().toLocaleString('en-US', 'Asia/Kolkata');
    await user.save();

    res.status(200).json({
      message: 'Password changed successfully',
      email: user.email
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Change password for client (admin only) - updates users collection
const changeClientPassword = async (req, res) => {
  try {
    const { email } = req.params;
    const { newPassword } = req.body;

    // Validate new password
    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'New password is required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    // Check if client exists in users collection
    const client = await NewUserModel.findOne({ email: email.toLowerCase() });
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Encrypt new password using the same encrypt function used during creation
    const encryptedPassword = encrypt(newPassword);

    // Update password
    await NewUserModel.updateOne(
      { email: email.toLowerCase() },
      {
        $set: {
          passwordHashed: encryptedPassword,
          updatedAt: new Date().toLocaleString('en-US', 'Asia/Kolkata')
        }
      }
    );

    res.status(200).json({
      message: 'Client password changed successfully',
      email: email.toLowerCase()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete client with cascade deletion
const deleteClient = async (req, res) => {
  try {
    const { email } = req.params;
    const emailLower = email.toLowerCase();

    // Check if client exists
    const client = await ClientModel.findOne({ email: emailLower });
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Perform cascade deletion
    const deletionResults = {
      clientDeleted: false,
      userDeleted: false,
      jobsDeleted: 0,
      operationsUpdated: 0
    };

    const clientResult = await ClientModel.deleteOne({ email: emailLower });
    deletionResults.clientDeleted = clientResult.deletedCount > 0;

    const userResult = await NewUserModel.deleteOne({ email: emailLower });
    deletionResults.userDeleted = userResult.deletedCount > 0;

    const jobsResult = await JobModel.deleteMany({ userID: emailLower });
    deletionResults.jobsDeleted = jobsResult.deletedCount;
    const operationsResult = await OperationsModel.updateMany(
      { managedUsers: { $in: [emailLower] } },
      { $pull: { managedUsers: emailLower } }
    );
    deletionResults.operationsUpdated = operationsResult.modifiedCount;
    await SessionKeyModel.deleteMany({ userEmail: emailLower });

    res.status(200).json({
      message: 'Client deleted successfully with cascade deletion',
      deletedClient: { email: emailLower, name: client.name },
      deletionResults
    });
  } catch (error) {
    console.error('Error in deleteClient:', error);
    res.status(500).json({ error: error.message });
  }
};

//campaign routes

// app.post("/api/track/utm-campaign-lead", async (req, res) => {
//   try {
//     const { clientName, clientEmail, clientPhone, utmSource } = req.body;

//     if (!utmSource || !clientEmail) {
//       return res.status(400).json({ error: "utmSource and clientEmail are required" });
//     }

//     // 🔍 Find campaign that has a matching utm_source
//     const campaign = await LinkCampaignUtm.findOne({
//       "utm_source.utm_source": utmSource
//     });

//     if (!campaign) {
//       return res.status(404).json({ message: "No campaign found for this utmSource" });
//     }

//     // Get the specific UTM object inside the campaign
//     const utmEntry = campaign.utm_source.find(
//       (s) => s.utm_source === utmSource
//     );

//     if (!utmEntry) {
//       return res.status(404).json({ message: "UTM not found inside campaign" });
//     }

//     // Check if clientEmail already exists
//     const alreadyExists = utmEntry.conversions.some(
//       (c) => c.clientEmail.toLowerCase() === clientEmail.toLowerCase()
//     );

//     if (alreadyExists) {
//       return res.status(200).json({ message: "Client already exists, not added again" });
//     }

//     // Add new conversion
//     utmEntry.conversions.push({
//       clientName,
//       clientEmail,
//       clientPhone: clientPhone || "Not Provided",
//       bookingDate: new Date()
//     });

//     await campaign.save();

//     return res.status(201).json({
//       message: "✅ Conversion added successfully",
//       conversion: { clientName, clientEmail, clientPhone }
//     });
//   } catch (error) {
//     console.error("❌ Error in /api/track/utm-campaign-lead:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });
// app.post("/api/campaign/create", CreateCampaign);

// app.post("/api/track", async (req, res) => {
//   try {
//     const {
//       ref,
//       userAgent,
//       screenWidth,
//       screenHeight,
//       language,
//       timezone,
//     } = req.body;

//     if (!ref) {
//       return res.status(400).json({ ok: false, message: "Missing ref code" });
//     }

//     // Extract visitor IP
//     const ip =
//       req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
//       req.socket.remoteAddress;

//     // Decode ref back into campaign + campaigner
//     const { campaignName, campaignerName } = decode(ref);

//     // Find campaign
//     const campaign = await LinkCampaignUtm.findOne({
//       campaign_name: campaignName,
//     });
//     if (!campaign) {
//       return res.status(404).json({ ok: false, message: "Campaign not found" });
//     }

//     // Find campaigner in campaign
//     const source = campaign.utm_source.find(
//       (s) => s.utm_source.toLowerCase() === campaignerName.toLowerCase()
//     );
//     if (!source) {
//       return res
//         .status(404)
//         .json({ ok: false, message: "Campaigner not found" });
//     }

//     /* ------------------- Log Click (detailed) ------------------- */
//     await Click.create({
//       link_code: source.link_code,  // ✅ FIXED
//       utm_source: source.utm_source,
//       utm_campaign: campaignName,
//       ip,
//       timestamp: new Date(),
//       userAgent,
//       screenWidth,
//       screenHeight,
//       language,
//       timezone,
//     });

//     /* ------------------- Update Aggregates ------------------- */
//     source.total_clicks += 1;

//     if (!source.unique_ips.includes(ip)) {
//       source.unique_ips.push(ip);
//       source.unique_clicks = source.unique_ips.length;
//     }

//     await campaign.save();

//     return res.json({
//       ok: true,
//       message: "Click tracked successfully",
//       campaignName,
//       campaignerName,
//       utm_source: source.utm_source,
//       link_code: source.link_code,   // ✅ send back too
//       ip,
//       total: source.total_clicks,
//       unique: source.unique_clicks,
//     });
//   } catch (err) {
//     console.error("Error in tracking:", err);
//     return res.status(500).json({ ok: false, error: "server_error" });
//   }
// });

// // Track and (optionally) redirect
// app.get("/r/:code", async (req, res) => {
//   try {
//     const { code } = req.params;
//     const doc = await LinkCampaignUtm.findOne({ code });
//     if (!doc) return res.status(404).send("Invalid link");

//     const ip = getClientIP(req);
//     // total clicks increments always
//     doc.totalClicks += 1;

//     // unique IP logic
//     if (!doc.uniqueIPs.includes(ip)) {
//       doc.uniqueIPs.push(ip);
//       doc.uniqueCount = doc.uniqueIPs.length;
//     }
//     await doc.save();

//     // Simple landing message (you can change to a redirect if you want)
//     res.type("html").send(`
//       <html>
//         <head><title>Thanks for visiting</title></head>
//         <body style="font-family: sans-serif; padding: 24px;">
//           <h1>Thanks for visiting via ${doc.campaignerName}'s link</h1>
//           <p>Campaign: <b>${doc.campaignName}</b></p>
//           <p>This IP is counted once. Total unique visitors so far: <b>${doc.uniqueCount}</b></p>
//         </body>
//       </html>
//     `);
//   } catch (err) {
//     console.error(err);
//     res.status(500).send("Server error");
//   }
// });

// // Admin report: list all links with counts
// app.get("/api/report", async (_req, res) => {
//   try {
//     const baseUrl = "https://flashfirejobs.com";

//     const campaigns = await LinkCampaignUtm.find({}, { __v: 0 })
//       .sort({ createdAt: -1 })
//       .lean();

//     const rows = campaigns.map((campaign) => {
//       // calculate campaign-level totals
//       const totalClicks = campaign.utm_source.reduce(
//         (sum, s) => sum + (s.total_clicks || 0),
//         0
//       );
//       const totalUniques = campaign.utm_source.reduce(
//         (sum, s) => sum + (s.unique_clicks || 0),
//         0
//       );

//       return {
//         _id: campaign._id,
//         campaign_name: campaign.campaign_name,
//         link_code: campaign.link_code,
//         createdAt: campaign.createdAt,
//         totalClicks,
//         totalUniques,
//         campaigners: campaign.utm_source.map((s) => ({
//           utm_source: s.utm_source,
//           total_clicks: s.total_clicks,
//           unique_clicks: s.unique_clicks,
//           link: `${baseUrl}?ref=${encode(
//             campaign.campaign_name,
//             s.utm_source
//           )}`,
//           conversions: s.conversions || []   // ✅ include conversions here
//         })),
//       };
//     });

//     res.json({ ok: true, rows });
//   } catch (err) {
//     console.error("Error generating report:", err);
//     res.status(500).json({ ok: false, error: "server_error" });
//   }
// });



// // Optional: get report by campaign
// app.get("/api/report/:campaignName", async (req, res) => {
//   const { campaignName } = req.params;
//   const rows = await LinkCampaignUtm.find({ campaignName }, { __v: 0 }).sort({ createdAt: -1 }).lean();
//   res.json({ ok: true, rows });
// });

// Authentication routes
app.post('/api/auth/verify-credentials', verifyCredentials);
app.post('/api/auth/login', login);
app.post('/api/auth/users', verifyToken, verifyAdmin, createUser);
app.get('/api/auth/users', verifyToken, verifyAdmin, getAllUsers);
app.delete('/api/auth/users/:userId', verifyToken, verifyAdmin, deleteUser);
app.put('/api/auth/users/:userId/change-password', verifyToken, verifyAdmin, changePassword);
app.post('/api/auth/session-key', verifyToken, verifyAdmin, generateSessionKey);
app.get('/api/auth/session-keys/:userEmail', verifyToken, verifyAdmin, getUserSessionKeys);
app.post('/api/auth/cleanup-session-keys', verifyToken, verifyAdmin, cleanupSessionKeysEndpoint);

// Job routes
app.post('/', getAllJobs);
app.post('/api/jobs', createJob);

// Get one job (with full description) by id
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Job id is required' });
    const job = await JobModel.findById(id).lean();
    if (!job) return res.status(404).json({ error: 'Job not found' });
    // Return only fields needed by frontend, including jobDescription
    const {
      _id,
      jobID,
      jobDescription,
      updatedAt,
      dateAdded
    } = job;
    return res.status(200).json({ job: { _id, jobID, jobDescription, updatedAt, dateAdded } });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Auto-sync clients from jobdbs to dashboardtrackings
const syncClientsFromJobs = async (req, res) => {
  try {
    // Get all unique userIDs from jobs
    const jobs = await JobModel.find({}, 'userID').lean();
    const uniqueUserIDs = [...new Set(jobs.map(job => job.userID).filter(id =>
      id && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(id)
    ))];

    // Check which clients already exist in dashboardtrackings
    const existingClients = await ClientModel.find({}, 'email').lean();
    const existingEmails = existingClients.map(client => client.email);

    // Find missing clients
    const missingClients = uniqueUserIDs.filter(userID => !existingEmails.includes(userID));

    // Create missing clients with default values
    const createdClients = [];
    for (const email of missingClients) {
      const clientData = {
        email: email.toLowerCase(),
        name: email.split('@')[0], // Use email prefix as default name
        jobDeadline: " ",
        applicationStartDate: " ",
        dashboardInternName: " ",
        dashboardTeamLeadName: " ",
        planType: "ignite",
        planPrice: 199,
        onboardingDate: new Date().toLocaleString('en-US', 'Asia/Kolkata'),
        whatsappGroupMade: false,
        whatsappGroupMadeDate: " ",
        dashboardCredentialsShared: false,
        dashboardCredentialsSharedDate: " ",
        resumeSent: false,
        resumeSentDate: " ",
        coverLetterSent: false,
        coverLetterSentDate: " ",
        portfolioMade: false,
        portfolioMadeDate: " ",
        linkedinOptimization: false,
        linkedinOptimizationDate: " ",
        gmailCredentials: {
          email: "",
          password: ""
        },
        dashboardCredentials: {
          username: "",
          password: ""
        },
        linkedinCredentials: {
          username: "",
          password: ""
        },
        amountPaid: 0,
        amountPaidDate: " ",
        modeOfPayment: "paypal",
        status: "active",
        companyName: " ",
        lastApplicationDate: " ",
        jobStatus: "still_searching",
        createdAt: new Date().toLocaleString('en-US', 'Asia/Kolkata'),
        updatedAt: new Date().toLocaleString('en-US', 'Asia/Kolkata')
      };

      const client = new ClientModel(clientData);
      await client.save();
      createdClients.push(client);
    }

    res.status(200).json({
      message: `Successfully synced clients from jobs`,
      totalJobsUsers: uniqueUserIDs.length,
      existingClients: existingEmails.length,
      createdClients: createdClients.length,
      createdClientsList: createdClients.map(c => c.email)
    });

  } catch (error) {
    console.error('Error syncing clients from jobs:', error);
    res.status(500).json({ error: error.message });
  }
};

// Operations endpoints
const getAllOperations = async (req, res) => {
  try {
    const operations = await OperationsModel.find().lean();
    res.status(200).json({ operations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

const getOperationsByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const operation = await OperationsModel.findOne({ email: email.toLowerCase() }).lean();
    if (!operation) {
      return res.status(404).json({ error: 'Operation user not found' });
    }
    res.status(200).json({ operation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

const createOrUpdateOperation = async (req, res) => {
  try {
    const { email, name, password, role, managedUsers } = req.body;

    const operationData = {
      email: email.toLowerCase(),
      name,
      password: password ? await bcrypt.hash(password, 10) : undefined,
      role,
      managedUsers,
      updatedAt: new Date().toLocaleString('en-US', 'Asia/Kolkata')
    };

    // Remove undefined values
    Object.keys(operationData).forEach(key => {
      if (operationData[key] === undefined) {
        delete operationData[key];
      }
    });

    const operation = await OperationsModel.findOneAndUpdate(
      { email: email.toLowerCase() },
      operationData,
      { upsert: true, new: true, runValidators: true }
    );

    res.status(200).json({ operation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

const getJobsByOperatorEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const { date, startDate, endDate } = req.query;

    let query = { operatorEmail: email.toLowerCase() };

    if (date) {
      // Single date filter (backward compatibility)
      const targetDate = new Date(date);
      const month = targetDate.getMonth() + 1;
      const day = targetDate.getDate();
      const year = targetDate.getFullYear();
      const dateString = `${day}/${month}/${year}`;

      query.appliedDate = {
        $regex: dateString,
        $options: 'i'
      };
    } else if (startDate && endDate) {
      // Date range filter
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Create date strings for the range
      const startMonth = start.getMonth() + 1;
      const startDay = start.getDate();
      const startYear = start.getFullYear();
      const startDateString = `${startDay}/${startMonth}/${startYear}`;

      const endMonth = end.getMonth() + 1;
      const endDay = end.getDate();
      const endYear = end.getFullYear();
      const endDateString = `${endDay}/${endMonth}/${endYear}`;

      // If start and end are the same, use exact match
      if (startDateString === endDateString) {
        query.appliedDate = {
          $regex: startDateString,
          $options: 'i'
        };
      } else {
        // For date range, we'll need to get all jobs and filter by date
        // This is a simplified approach - in production you might want to optimize this
        const allJobs = await JobModel.find({ operatorEmail: email.toLowerCase() }).select('-jobDescription').lean();
        const filteredJobs = allJobs.filter(job => {
          if (!job.appliedDate) return false;

          // Parse the applied date from the job
          const jobDateParts = job.appliedDate.split('/');
          if (jobDateParts.length !== 3) return false;

          const jobDay = parseInt(jobDateParts[0]);
          const jobMonth = parseInt(jobDateParts[1]);
          const jobYear = parseInt(jobDateParts[2]);

          const jobDate = new Date(jobYear, jobMonth - 1, jobDay);

          return jobDate >= start && jobDate <= end;
        });

        return res.status(200).json({ jobs: filteredJobs });
      }
    }

    const jobs = await JobModel.find(query).select('-jobDescription').lean();
    res.status(200).json({ jobs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

const getUniqueClientsFromJobs = async (req, res) => {
  try {
    const { operatorEmail } = req.query;

    let query = {};
    if (operatorEmail) {
      query.operatorEmail = operatorEmail.toLowerCase();
    }

    const jobs = await JobModel.find(query, 'userID').lean();
    const uniqueUserIDs = [...new Set(jobs.map(job => job.userID).filter(id =>
      id && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(id)
    ))];

    res.status(200).json({ clients: uniqueUserIDs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get client statistics for an operator (applied and saved counts)
const getClientStatistics = async (req, res) => {
  try {
    const { email } = req.params;
    const { startDate, endDate } = req.query;

    // Get managed users for this operator
    const operation = await OperationsModel.findOne({ email: email.toLowerCase() });
    if (!operation) {
      return res.status(404).json({ error: 'Operation not found' });
    }

    const clientStats = [];

    // Get user details for managed users
    for (const userId of operation.managedUsers || []) {
      const userIdStr = userId.toString();

      // Find user details
      let user = await NewUserModel.findById(userIdStr);
      if (!user) {
        // Try ClientModel as fallback
        const client = await ClientModel.findOne({ userID: userIdStr });
        if (client) {
          user = {
            name: client.name,
            email: client.email || userIdStr,
            _id: userIdStr
          };
        }
      }

      if (user) {
        const userEmail = user.email || userIdStr;
        const userName = user.name || userEmail.split('@')[0];

        // Count applied jobs in date range
        let appliedQuery = {
          operatorEmail: email.toLowerCase(),
          userID: userEmail
        };

        if (startDate && endDate) {
          const start = new Date(startDate);
          const end = new Date(endDate);

          // Get all jobs for this user and filter by date
          const allJobs = await JobModel.find({
            operatorEmail: email.toLowerCase(),
            userID: userEmail
          }).lean();

          const appliedCount = allJobs.filter(job => {
            if (!job.appliedDate) return false;

            const jobDateParts = job.appliedDate.split('/');
            if (jobDateParts.length !== 3) return false;

            const jobDay = parseInt(jobDateParts[0]);
            const jobMonth = parseInt(jobDateParts[1]);
            const jobYear = parseInt(jobDateParts[2]);

            const jobDate = new Date(jobYear, jobMonth - 1, jobDay);
            return jobDate >= start && jobDate <= end;
          }).length;

          // Count total saved jobs (no date filter)
          const savedCount = await JobModel.countDocuments({
            operatorEmail: email.toLowerCase(),
            userID: userEmail,
            currentStatus: 'saved'
          });

          clientStats.push({
            name: userName,
            email: userEmail,
            appliedCount,
            savedCount
          });
        } else {
          // No date range - just get total counts
          const appliedCount = await JobModel.countDocuments({
            operatorEmail: email.toLowerCase(),
            userID: userEmail
          });

          const savedCount = await JobModel.countDocuments({
            operatorEmail: email.toLowerCase(),
            userID: userEmail,
            currentStatus: 'saved'
          });

          clientStats.push({
            name: userName,
            email: userEmail,
            appliedCount,
            savedCount
          });
        }
      }
    }

    res.status(200).json({ clientStats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get saved job counts for specific clients
const getSavedJobCounts = async (req, res) => {
  try {
    const { userEmails } = req.body;

    if (!userEmails || !Array.isArray(userEmails)) {
      return res.status(400).json({ error: 'userEmails array is required in request body' });
    }

    const savedCounts = {};

    // Get saved job counts for each user email
    for (const userEmail of userEmails) {
      const savedCount = await JobModel.countDocuments({
        userID: userEmail,
        currentStatus: 'saved'
      });

      savedCounts[userEmail] = savedCount;
    }

    res.status(200).json({ savedCounts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Optimized helper function to parse date strings
const parseDateString = (dateStr) => {
  if (!dateStr) return null;

  try {
    // Handle different date formats
    if (dateStr.includes(',')) {
      const datePart = dateStr.split(',')[0].trim();
      const [month, day, year] = datePart.split('/');
      return new Date(year, month - 1, day);
    }

    // Try standard Date parsing
    return new Date(dateStr);
  } catch (error) {
    return null;
  }
};

// Cache for job analytics data
const analyticsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Performance monitoring
const performanceStats = {
  totalRequests: 0,
  cacheHits: 0,
  averageResponseTime: 0,
  lastReset: Date.now()
};

// Get jobs by date - OPTIMIZED VERSION with pagination
const getJobsByDate = async (req, res) => {
  const startTime = Date.now();
  performanceStats.totalRequests++;

  try {
    const { date, page = 1, limit = 1000, includeClients = true } = req.body;

    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(10000, Math.max(1, parseInt(limit))); // Max 10k records per page
    const skip = (pageNum - 1) * limitNum;

    // Check cache first (only for first page to avoid cache complexity)
    const cacheKey = `jobs_by_date_${date}_${pageNum}_${limitNum}`;
    const cached = analyticsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL && pageNum === 1) {
      performanceStats.cacheHits++;
      const responseTime = Date.now() - startTime;
      performanceStats.averageResponseTime =
        (performanceStats.averageResponseTime * (performanceStats.totalRequests - 1) + responseTime) / performanceStats.totalRequests;

      return res.status(200).json({
        ...cached.data,
        _performance: {
          fromCache: true,
          responseTime: responseTime,
          cacheHitRate: (performanceStats.cacheHits / performanceStats.totalRequests * 100).toFixed(2) + '%'
        }
      });
    }

    // Parse input date flexibly: supports 'DD/MM/YYYY', 'MM/DD/YYYY', and 'YYYY-MM-DD'
    let year, month, day;
    if (typeof date === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        // YYYY-MM-DD
        const [y, m, d] = date.split('-').map(n => parseInt(n, 10));
        year = y; month = m; day = d;
      } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
        // D/M/YYYY or M/D/YYYY (ambiguous). We'll use the numbers as provided and
        // generate multi-format regex below that covers both interpretations.
        const [a, b, y] = date.split('/').map(n => parseInt(n, 10));
        // Prefer interpreting as D/M/YYYY because the DB example is '29/10/YYYY'
        day = a; month = b; year = y;
      } else {
        // Try JS Date as a last resort
        const tmp = new Date(date);
        if (!isNaN(tmp.getTime())) {
          year = tmp.getFullYear();
          month = tmp.getMonth() + 1;
          day = tmp.getDate();
        }
      }
    }
    if (!year || !month || !day) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Build robust regex that matches both D/M/YYYY and M/D/YYYY (with or without leading zeros)
    const dd = String(day).padStart(2, '0');
    const mm = String(month).padStart(2, '0');
    const dmY = `${day}/${month}/${year}`;      // D/M/YYYY
    const dmY0 = `${dd}/${mm}/${year}`;         // DD/MM/YYYY
    const mdY = `${month}/${day}/${year}`;      // M/D/YYYY
    const mdY0 = `${mm}/${dd}/${year}`;         // MM/DD/YYYY
    // Regex anchors to start of string; allow both zero-padded and non-padded variants
    const multiFormatDateRegex = new RegExp(`^(?:${dmY}|${dmY0}|${mdY}|${mdY0})`);

    // First, get total count for pagination using updatedAt
    const countPipeline = [
      {
        $match: {
          updatedAt: { $regex: multiFormatDateRegex }
        }
      },
      { $count: "total" }
    ];

    const totalCountResult = await JobModel.aggregate(countPipeline);
    const totalCount = totalCountResult.length > 0 ? totalCountResult[0].total : 0;
    const totalPages = Math.ceil(totalCount / limitNum);

    const pipeline = [
      {
        $match: {
          updatedAt: { $regex: multiFormatDateRegex }
        }
      },
      { $skip: skip },
      { $limit: limitNum },
      {
        $group: {
          _id: {
            status: {
              $switch: {
                branches: [
                  { case: { $regexMatch: { input: { $toLower: { $ifNull: ["$currentStatus", ""] } }, regex: /offer/ } }, then: "offer" },
                  { case: { $regexMatch: { input: { $toLower: { $ifNull: ["$currentStatus", ""] } }, regex: /appl/ } }, then: "applied" },
                  { case: { $regexMatch: { input: { $toLower: { $ifNull: ["$currentStatus", ""] } }, regex: /interview/ } }, then: "interviewing" },
                  { case: { $regexMatch: { input: { $toLower: { $ifNull: ["$currentStatus", ""] } }, regex: /reject/ } }, then: "rejected" },
                  { case: { $regexMatch: { input: { $toLower: { $ifNull: ["$currentStatus", ""] } }, regex: /delete|removed/ } }, then: "deleted" },
                  { case: { $regexMatch: { input: { $toLower: { $ifNull: ["$currentStatus", ""] } }, regex: /save/ } }, then: "saved" }
                ],
                default: "saved"
              }
            },
            userID: "$userID",
            userName: "$operatorName"
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.status",
          totalCount: { $sum: "$count" },
          clients: {
            $push: {
              email: "$_id.userID",
              name: "$_id.userName",
              count: "$count"
            }
          }
        }
      }
    ];

    let results;
    try {
      results = await JobModel.aggregate(pipeline);
    } catch (aggregationError) {
      console.warn('Aggregation failed, falling back to optimized find method:', aggregationError.message);

      // Fallback: Use optimized find with projection and pagination using updatedAt
      const jobs = await JobModel.find({
        updatedAt: { $regex: multiFormatDateRegex }
      })
        .select('currentStatus userID operatorName updatedAt')
        .lean()
        .skip(skip)
        .limit(limitNum);

      const statusData = {
        saved: { count: 0, clients: [] },
        applied: { count: 0, clients: [] },
        interviewing: { count: 0, clients: [] },
        offer: { count: 0, clients: [] },
        rejected: { count: 0, clients: [] },
        deleted: { count: 0, clients: [] }
      };

      const clientCounts = {};

      jobs.forEach(job => {
        if (job.updatedAt && job.updatedAt.startsWith(exactDatePattern)) {
          const status = (job.currentStatus || '').toLowerCase();
          const clientEmail = job.userID;
          const clientName = job.operatorName || 'Unknown';

          // Map status names
          let mappedStatus = 'saved';
          if (status.includes('offer')) mappedStatus = 'offer';
          else if (status.includes('appl')) mappedStatus = 'applied';
          else if (status.includes('interview')) mappedStatus = 'interviewing';
          else if (status.includes('reject')) mappedStatus = 'rejected';
          else if (status.includes('delete') || status.includes('removed')) mappedStatus = 'deleted';
          else if (status.includes('save')) mappedStatus = 'saved';

          if (statusData[mappedStatus]) {
            statusData[mappedStatus].count++;

            // Count per client with name
            if (!clientCounts[mappedStatus]) {
              clientCounts[mappedStatus] = {};
            }
            if (!clientCounts[mappedStatus][clientEmail]) {
              clientCounts[mappedStatus][clientEmail] = { count: 0, name: clientName };
            }
            clientCounts[mappedStatus][clientEmail].count++;
          }
        }
      });

      // Convert client counts to array format with names
      Object.keys(statusData).forEach(status => {
        if (clientCounts[status]) {
          statusData[status].clients = Object.keys(clientCounts[status]).map(email => ({
            email,
            name: clientCounts[status][email].name,
            count: clientCounts[status][email].count
          }));
        }
      });

      const totalJobs = Object.values(statusData).reduce((sum, status) => sum + status.count, 0);

      const responseTime = Date.now() - startTime;
      performanceStats.averageResponseTime =
        (performanceStats.averageResponseTime * (performanceStats.totalRequests - 1) + responseTime) / performanceStats.totalRequests;

      const responseData = {
        success: true,
        date: date,
        totalJobs,
        ...statusData,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalCount / limitNum),
          totalCount: totalCount,
          limit: limitNum,
          hasNextPage: pageNum < Math.ceil(totalCount / limitNum),
          hasPrevPage: pageNum > 1
        },
        _performance: {
          fromCache: false,
          responseTime: responseTime,
          cacheHitRate: (performanceStats.cacheHits / performanceStats.totalRequests * 100).toFixed(2) + '%',
          method: 'fallback'
        }
      };

      // Cache the result
      analyticsCache.set(cacheKey, {
        data: responseData,
        timestamp: Date.now()
      });

      return res.status(200).json(responseData);
    }

    // Initialize status data
    const statusData = {
      saved: { count: 0, clients: [] },
      applied: { count: 0, clients: [] },
      interviewing: { count: 0, clients: [] },
      offer: { count: 0, clients: [] },
      rejected: { count: 0, clients: [] },
      deleted: { count: 0, clients: [] }
    };

    // Process aggregation results
    let totalJobs = 0;
    results.forEach(result => {
      const status = result._id;
      if (statusData[status]) {
        statusData[status].count = result.totalCount;
        statusData[status].clients = result.clients;
        totalJobs += result.totalCount;
      }
    });

    const responseTime = Date.now() - startTime;
    performanceStats.averageResponseTime =
      (performanceStats.averageResponseTime * (performanceStats.totalRequests - 1) + responseTime) / performanceStats.totalRequests;

    const responseData = {
      success: true,
      date: date,
      totalJobs,
      ...statusData,
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalCount: totalCount,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      },
      _performance: {
        fromCache: false,
        responseTime: responseTime,
        cacheHitRate: (performanceStats.cacheHits / performanceStats.totalRequests * 100).toFixed(2) + '%',
        method: 'aggregation'
      }
    };

    analyticsCache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now()
    });


    if (analyticsCache.size > 100) {
      const entries = Array.from(analyticsCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      // Remove oldest 20 entries
      for (let i = 0; i < 20 && i < entries.length; i++) {
        analyticsCache.delete(entries[i][0]);
      }
    }

    res.status(200).json(responseData);

  } catch (error) {
    console.error('Error fetching jobs by date:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Simple job analytics - removed complex version

// Add the job analytics route after function definition
app.post('/api/jobs/by-date', getJobsByDate);

// Client Job Analysis (Recent Activity) - per active client status counts and applied-on-date
app.post('/api/analytics/client-job-analysis', async (req, res) => {
  try {
    const { date } = req.body || {};

    // Build multi-format date regex if provided (for appliedDate)
    let multiFormatDateRegex = null;
    if (date && typeof date === 'string' && /^(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})$/.test(date)) {
      let y, m, d;
      if (date.includes('-')) {
        const [yy, mm, dd] = date.split('-').map(n => parseInt(n, 10));
        y = yy; m = mm; d = dd;
      } else {
        const [a, b, yy] = date.split('/').map(n => parseInt(n, 10));
        d = a; m = b; y = yy; // Prefer D/M/YYYY
      }
      const dayPattern = d < 10 ? `[0]?${d}` : `${d}`;
      const monthPattern = m < 10 ? `[0]?${m}` : `${m}`;
      multiFormatDateRegex = new RegExp(`^${dayPattern}/${monthPattern}/${y}(?=$|\\D)`);
    }

    // Helper to map statuses fuzzily
    const statusCase = {
      $switch: {
        branches: [
          { case: { $regexMatch: { input: { $toLower: { $ifNull: ["$currentStatus", ""] } }, regex: /offer/ } }, then: "offer" },
          { case: { $regexMatch: { input: { $toLower: { $ifNull: ["$currentStatus", ""] } }, regex: /appl/ } }, then: "applied" },
          { case: { $regexMatch: { input: { $toLower: { $ifNull: ["$currentStatus", ""] } }, regex: /interview/ } }, then: "interviewing" },
          { case: { $regexMatch: { input: { $toLower: { $ifNull: ["$currentStatus", ""] } }, regex: /reject/ } }, then: "rejected" },
          { case: { $regexMatch: { input: { $toLower: { $ifNull: ["$currentStatus", ""] } }, regex: /delete|removed/ } }, then: "deleted" },
          { case: { $regexMatch: { input: { $toLower: { $ifNull: ["$currentStatus", ""] } }, regex: /save/ } }, then: "saved" }
        ],
        default: "saved"
      }
    };

    // Aggregate overall counts per client across ALL jobs (no active filter)
    const overall = await JobModel.aggregate([
      { $group: { _id: { userID: "$userID", status: statusCase }, count: { $sum: 1 } } },
      { $group: { _id: "$_id.userID", statuses: { $push: { k: "$_id.status", v: "$count" } } } },
      { $project: { _id: 0, userID: "$_id", counts: { $arrayToObject: "$statuses" } } }
    ]);

    // Aggregate applied-on-date per client if date provided using appliedDate
    let appliedOnDate = [];
    if (multiFormatDateRegex) {
      appliedOnDate = await JobModel.aggregate([
        { $match: { appliedDate: { $regex: multiFormatDateRegex } } },
        { $group: { _id: "$userID", count: { $sum: 1 } } },
        { $project: { _id: 0, userID: "$_id", count: 1 } }
      ]);
    }

    // Aggregate removed jobs on selected date (ONLY for removed column)
    let removedOnDate = [];
    if (multiFormatDateRegex) {
      removedOnDate = await JobModel.aggregate([
        {
          $match: {
            $and: [
              {
                $or: [
                  { currentStatus: { $regex: /delete/i } },
                  { currentStatus: { $regex: /removed/i } }
                ]
              },
              { updatedAt: { $regex: multiFormatDateRegex } }
            ]
          }
        },
        { $group: { _id: "$userID", count: { $sum: 1 } } },
        { $project: { _id: 0, userID: "$_id", count: 1 } }
      ]);
    }

    // Merge results across all userIDs seen
    const appliedMap = new Map(appliedOnDate.map(r => [r.userID, r.count]));
    const removedMap = new Map(removedOnDate.map(r => [r.userID, r.count]));
    const overallMap = new Map(overall.map(r => [r.userID, r.counts]));
    const allUserIDs = Array.from(new Set([...overallMap.keys(), ...appliedMap.keys(), ...removedMap.keys()]));

    // Fetch client info (name, planType, status, operationsName, and dashboardTeamLeadName) from ClientModel for all userIDs
    const clientInfo = await ClientModel.find({
      email: { $in: allUserIDs }
    }).select('email name planType planPrice status jobStatus operationsName dashboardTeamLeadName isPaused').lean();
    const clientMap = new Map(clientInfo.map(c => [c.email, { name: c.name, planType: c.planType, planPrice: c.planPrice, status: c.status, jobStatus: c.jobStatus, operationsName: c.operationsName || '', dashboardTeamLeadName: c.dashboardTeamLeadName || '', isPaused: !!c.isPaused }]));

    // Prepare base rows from JobModel aggregates
    let rows = allUserIDs.map(email => {
      const counts = overallMap.get(email) || {};
      const client = clientMap.get(email) || {};
      // Use date-filtered removed count if date is selected, otherwise use total count
      const removedCount = multiFormatDateRegex
        ? (removedMap.get(email) || 0)  // If date selected, show 0 if no jobs moved on that date
        : (counts.deleted || 0);         // If no date selected, show total count
      return {
        email,
        name: client.name || email,
        planType: client.planType || null,
        planPrice: client.planPrice || null,
        status: client.status || null,
        jobStatus: client.jobStatus || null,
        operationsName: client.operationsName || '',
        isPaused: client.isPaused ?? false,
        dashboardTeamLeadName: client.dashboardTeamLeadName || '',
        saved: counts.saved || 0,
        applied: counts.applied || 0,
        interviewing: counts.interviewing || 0,
        offer: counts.offer || 0,
        rejected: counts.rejected || 0,
        removed: removedCount,
        appliedOnDate: appliedMap.get(email) || 0
      };
    });

    // Sort: active first, then inactive, then alphabetically by email
    rows.sort((a, b) => {
      // First, sort by status: active comes before inactive
      const statusOrder = { 'active': 0, 'inactive': 1 };
      const statusA = statusOrder[a.status] ?? 2;
      const statusB = statusOrder[b.status] ?? 2;
      if (statusA !== statusB) {
        return statusA - statusB;
      }
      // If same status, sort by email alphabetically
      return a.email.localeCompare(b.email);
    });


    res.status(200).json({ success: true, date: date || null, rows });
  } catch (e) {
    console.error('client-job-analysis error', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Applied-by-date: count jobs whose appliedDate falls on the given day, grouped by userID
app.post('/api/analytics/applied-by-date', async (req, res) => {
  try {
    const { date } = req.body || {};
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ success: false, error: 'date is required' });
    }

    // Build multi-format date regex for appliedDate matching
    let y, m, d;
    if (date.includes('-')) { // YYYY-MM-DD
      const [yy, mm, dd] = date.split('-').map(n => parseInt(n, 10));
      y = yy; m = mm; d = dd;
    } else { // D/M/YYYY or M/D/YYYY
      const [a, b, yy] = date.split('/').map(n => parseInt(n, 10));
      d = a; m = b; y = yy;
    }
    if (!y || !m || !d) return res.status(400).json({ success: false, error: 'Invalid date' });
    const dayPattern = d < 10 ? `[0]?${d}` : `${d}`;
    const monthPattern = m < 10 ? `[0]?${m}` : `${m}`;
    const dateRegex = new RegExp(`^${dayPattern}/${monthPattern}/${y}(?=$|\\D)`);

    const results = await JobModel.aggregate([
      { $match: { appliedDate: { $regex: dateRegex } } },
      { $group: { _id: '$userID', count: { $sum: 1 } } },
      { $project: { _id: 0, userID: '$_id', count: 1 } }
    ]);

    // Return both array and map for convenience
    const counts = {};
    for (const r of results) counts[r.userID] = r.count;
    res.status(200).json({ success: true, date, results, counts });
  } catch (e) {
    console.error('applied-by-date error', e);
    res.status(500).json({ success: false, error: e.message });
  }
});


app.get('/api/analytics/performance', (req, res) => {
  res.json({
    success: true,
    stats: {
      ...performanceStats,
      cacheSize: analyticsCache.size,
      uptime: Date.now() - performanceStats.lastReset
    }
  });
});

app.post('/api/analytics/clear-cache', (req, res) => {
  analyticsCache.clear();
  performanceStats.totalRequests = 0;
  performanceStats.cacheHits = 0;
  performanceStats.averageResponseTime = 0;
  performanceStats.lastReset = Date.now();
  res.json({ success: true, message: 'Cache cleared' });
});

// ==========================
// Call Scheduler (BullMQ)
// ==========================
const REDIS_URL = process.env.REDIS_CLOUD_URL || process.env.UPSTASH_REDIS_URL;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM;
const CALL_STATUS_WEBHOOK_URL = process.env.CALL_STATUS_WEBHOOK_URL || process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL}/api/calls/status` : undefined;

let redisConnection;
let callQueue;
let callWorker;
let callQueueEvents;
let twilioClient;

try {
  if (!REDIS_URL) {
    console.warn('⚠️  REDIS URL not set; call scheduler disabled');
  } else {
    redisConnection = new IORedis(REDIS_URL, {
      // Required by BullMQ to avoid throwing on blocking ops in serverless/managed redis
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true, // Don't connect immediately
      retryStrategy: () => null, // Disable automatic retries completely
      reconnectOnError: () => false, // Disable auto-reconnect
      showFriendlyErrorStack: false,
    });

    // Suppress ALL connection-related errors to prevent console spam
    const originalEmit = redisConnection.emit.bind(redisConnection);
    redisConnection.emit = function (event, ...args) {
      if (event === 'error') {
        const err = args[0];
        // Suppress connection errors completely
        if (err && err.message && (
          err.message.includes('EAI_AGAIN') ||
          err.message.includes('ECONNREFUSED') ||
          err.message.includes('getaddrinfo') ||
          err.code === 'EAI_AGAIN'
        )) {
          return false; // Suppress the error event
        }
      }
      return originalEmit(event, ...args);
    };

    // Try to connect asynchronously, but don't block
    redisConnection.connect().catch(() => {
      // Connection failed silently - call scheduler will be disabled
    });

    // Create queue and events with error suppression
    callQueue = new Queue('callQueue', {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
      }
    });

    callQueueEvents = new QueueEvents('callQueue', {
      connection: redisConnection
    });

    // Suppress all errors from Queue and QueueEvents
    const suppressConnectionError = (err) => {
      if (err && err.message && (
        err.message.includes('EAI_AGAIN') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('getaddrinfo') ||
        err.code === 'EAI_AGAIN'
      )) {
        return; // Suppress
      }
    };

    callQueue.on('error', suppressConnectionError);
    callQueueEvents.on('error', suppressConnectionError);
  }
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    twilioClient = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
} catch (e) {
  console.error('❌ Error initializing Call Scheduler:', e.message);
  redisConnection = null;
  callQueue = null;
  callQueueEvents = null;
}

if (callQueue && twilioClient && TWILIO_FROM) {
  callWorker = new Worker(
    'callQueue',
    async (job) => {
      const { phoneNumber } = job.data || {};
      if (!phoneNumber) throw new Error('phoneNumber missing');

      // Mark processing in logs
      await CallLogModel.findOneAndUpdate(
        { jobId: job.id },
        { status: 'in_progress', attemptAt: new Date(), $push: { statusHistory: { event: 'in_progress', status: 'in_progress', timestamp: new Date() } } }
      );

      // Build dynamic TwiML with meeting time = scheduled time + 10 minutes
      let meetingTimeText = 'the scheduled time';
      try {
        const log = await CallLogModel.findOne({ jobId: String(job.id) }).lean();
        // Priority: explicit announceTimeText from job -> from log -> fallback +10 minutes
        const explicitText = job?.data?.announceTimeText || log?.announceTimeText;
        if (explicitText && explicitText.trim().length > 0) {
          meetingTimeText = explicitText.trim();
        } else {
          const baseTime = log?.scheduledFor ? new Date(log.scheduledFor) : new Date();
          const meetingDate = new Date(baseTime.getTime() + 10 * 60 * 1000);
          meetingTimeText = meetingDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
      } catch { }

      const { VoiceResponse } = Twilio.twiml;
      const twiml = new VoiceResponse();
      twiml.pause({ length: 1 });
      twiml.say(
        { voice: 'alice', language: 'en-US' },
        `Hi, this is FlashFire. This is a quick reminder for your meeting scheduled at ${meetingTimeText}.`
      );
      twiml.say(
        { voice: 'alice', language: 'en-US' },
        'See you in the meeting. Thank you and good luck.'
      );

      const call = await twilioClient.calls.create({
        to: phoneNumber,
        from: TWILIO_FROM,
        twiml: twiml.toString(),
        ...(CALL_STATUS_WEBHOOK_URL
          ? {
            statusCallback: CALL_STATUS_WEBHOOK_URL,
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
            statusCallbackMethod: 'POST',
          }
          : {}),
      });

      await CallLogModel.findOneAndUpdate(
        { jobId: job.id },
        { twilioCallSid: call.sid, callStatus: 'initiated', status: 'calling', $push: { statusHistory: { event: 'initiated', status: 'calling', raw: { sid: call.sid }, timestamp: new Date() } } }
      );

      return { ok: true, sid: call.sid };
    },
    { connection: redisConnection }
  );

  // Suppress connection errors from Worker
  callWorker.on('error', (err) => {
    if (err && err.message && (
      err.message.includes('EAI_AGAIN') ||
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('getaddrinfo') ||
      err.code === 'EAI_AGAIN'
    )) {
      return; // Suppress connection errors
    }
  });

  callWorker.on('failed', async (job, err) => {
    try {
      await CallLogModel.findOneAndUpdate(
        { jobId: job?.id },
        { status: 'failed', error: err?.message || 'Unknown error', attemptAt: new Date() }
      );
    } catch { }
  });
}


// Schedule a call
app.post('/api/calls/schedule', verifyToken, async (req, res) => {
  try {
    const { phoneNumber, scheduleTime, announceTimeText } = req.body || {};
    if (!callQueue || !twilioClient || !TWILIO_FROM) {
      return res.status(503).json({ success: false, error: 'Call scheduler not configured' });
    }
    if (!phoneNumber || !scheduleTime) {
      return res.status(400).json({ success: false, error: 'phoneNumber and scheduleTime are required' });
    }
    // Validate E.164-like number quickly
    if (!/^\+?[1-9]\d{7,14}$/.test(phoneNumber)) {
      return res.status(400).json({ success: false, error: 'Invalid phone number. Use country code, e.g. +14155551234' });
    }
    const scheduledAt = new Date(scheduleTime);
    if (isNaN(scheduledAt.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid scheduleTime' });
    }
    const delayMs = Math.max(0, scheduledAt.getTime() - Date.now());

    const job = await callQueue.add(
      'makeCall',
      { phoneNumber, announceTimeText: (announceTimeText || '').trim() || undefined },
      {
        delay: delayMs,
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
      }
    );

    await CallLogModel.create({
      phoneNumber,
      scheduledFor: scheduledAt,
      announceTimeText: (announceTimeText || '').trim() || undefined,
      status: 'queued',
      jobId: String(job.id),
      statusHistory: [{ event: 'queued', status: 'queued', raw: { jobId: String(job.id) }, timestamp: new Date() }]
    });

    res.status(201).json({ success: true, jobId: job.id, scheduledFor: scheduledAt });
  } catch (e) {
    console.error('schedule call error', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// List recent call logs
async function sweepOverdueCalls(graceMs = 120000) {
  const now = Date.now();
  let updatedCount = 0;

  try {
    const overdueCandidates = await CallLogModel.find({
      scheduledFor: { $lte: new Date(now - graceMs) },
      status: { $in: ['queued', 'in_progress', 'calling'] }
    }).limit(200).lean();

    for (const c of overdueCandidates) {
      await CallLogModel.updateOne(
        { _id: c._id },
        {
          status: 'completed',
          callStatus: c.callStatus || 'completed',
          callEndAt: new Date(),
          $push: { statusHistory: { event: 'auto-completed', status: 'completed', timestamp: new Date(), raw: { reason: 'overdue_sweep' } } }
        }
      );
      updatedCount++;
    }

    // Auto-complete calls stuck in "calling" status for more than 30 seconds - NO MATTER WHAT
    const callingTimeoutMs = 30 * 1000; // 30 seconds - aggressive timeout to ensure calls never stay stuck
    const callingCandidates = await CallLogModel.find({
      status: 'calling',
      updatedAt: { $lte: new Date(now - callingTimeoutMs) }
    }).limit(200).lean();

    for (const c of callingCandidates) {
      const stuckForSeconds = Math.round((now - new Date(c.updatedAt).getTime()) / 1000);
      await CallLogModel.updateOne(
        { _id: c._id },
        {
          status: 'completed',
          callStatus: 'completed',
          callEndAt: new Date(),
          $push: { statusHistory: { event: 'auto-completed', status: 'completed', timestamp: new Date(), raw: { reason: 'calling_timeout_30sec', originalStatus: c.status, originalCallStatus: c.callStatus, stuckForSeconds } } }
        }
      );
      updatedCount++;
      console.log(`✅ [Call Sweep] Auto-completed call ${c._id} (phone: ${c.phoneNumber}) - was stuck in "calling" for ${stuckForSeconds}s (30s timeout enforced)`);
    }

    if (updatedCount > 0) {
      console.log(`[Call Sweep] Auto-completed ${updatedCount} stuck calls`);
    }

    return updatedCount;
  } catch (error) {
    console.error('❌ [Call Sweep] Error sweeping overdue calls:', error);
    return 0;
  }
}

app.get('/api/calls/logs', verifyToken, async (req, res) => {
  try {
    await sweepOverdueCalls(2 * 60 * 1000);
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const raw = await CallLogModel.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    const mapDerived = (l) => {
      const hist = Array.isArray(l.statusHistory) ? l.statusHistory : [];
      const last = hist.length ? hist[hist.length - 1] : null;
      // Derive a friendly status priority
      let derived = l.status;
      if (l.callStatus) {
        const cs = String(l.callStatus).toLowerCase();
        if (cs.includes('complete')) derived = 'completed';
        else if (cs.includes('answer') || cs.includes('progress')) derived = 'in_progress';
        else if (cs.includes('ring')) derived = 'calling';
        else if (cs.includes('init')) derived = 'calling';
        else if (cs.includes('busy') || cs.includes('no-answer') || cs.includes('cancel')) derived = 'failed';
      } else if (last) {
        derived = last.status || last.event || derived;
      }
      const lastUpdated = last?.timestamp || l.updatedAt || l.createdAt;
      return { ...l, derivedStatus: derived, lastUpdated };
    };
    const logs = raw.map(mapDerived);
    res.json({ success: true, logs });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Optional: list queued jobs
app.get('/api/calls/jobs', verifyToken, async (req, res) => {
  try {
    if (!callQueue) return res.json({ success: true, jobs: [] });
    const jobs = await callQueue.getJobs(['delayed', 'waiting', 'active']);
    res.json({
      success: true,
      jobs: jobs.map((j) => ({ id: j.id, name: j.name, delay: j.delay, timestamp: j.timestamp, data: j.data })),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Twilio status webhook (no auth; configure CALL_STATUS_WEBHOOK_URL)
app.post('/api/calls/status', async (req, res) => {
  try {
    const {
      CallSid,
      CallStatus,
      CallDuration,
      From,
      To,
      Timestamp,
      SequenceNumber,
    } = req.body || {};

    // Find by Sid if available, otherwise by To number (latest)
    let log = null;
    if (CallSid) {
      log = await CallLogModel.findOne({ twilioCallSid: CallSid });
    }
    if (!log && To) {
      log = await CallLogModel.findOne({ phoneNumber: To }).sort({ createdAt: -1 });
    }

    if (log) {
      const historyEntry = {
        event: CallStatus,
        status: CallStatus,
        timestamp: Timestamp ? new Date(Timestamp) : new Date(),
        raw: req.body,
      };

      const update = {
        callStatus: CallStatus,
        $push: { statusHistory: historyEntry },
      };

      if (CallDuration) {
        update.callDurationSec = Number(CallDuration);
      }
      if (CallStatus === 'in-progress' || CallStatus === 'answered') {
        update.callStartAt = new Date();
      }
      if (CallStatus === 'completed' || CallStatus === 'busy' || CallStatus === 'failed' || CallStatus === 'no-answer' || CallStatus === 'canceled') {
        update.callEndAt = new Date();
        if (CallStatus === 'completed') {
          update.status = 'completed';
        } else if (CallStatus === 'failed') {
          update.status = 'failed';
        }
      }

      await CallLogModel.updateOne({ _id: log._id }, update);
    }

    // Always 200 OK to Twilio
    res.type('text/plain').send('OK');
  } catch (e) {
    // Still return 200 to prevent Twilio retries storm, but log server-side
    console.error('Twilio status webhook error', e);
    res.type('text/plain').send('OK');
  }
});

// Get plan type statistics
const getPlanTypeStats = async (req, res) => {
  try {
    // Aggregate clients by plan type
    const planTypeStats = await NewUserModel.aggregate([
      {
        $group: {
          _id: "$planType",
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Get total clients
    const totalClients = await NewUserModel.countDocuments();

    // Format data for charts
    const formattedData = planTypeStats.map(stat => ({
      planType: stat._id,
      count: stat.count,
      percentage: ((stat.count / totalClients) * 100).toFixed(1)
    }));

    res.status(200).json({
      success: true,
      data: {
        totalClients,
        planTypeStats: formattedData,
        rawStats: planTypeStats
      }
    });
  } catch (error) {
    console.error('Error fetching plan type statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch plan type statistics',
      error: error.message
    });
  }
};

// Get revenue statistics
const getRevenueStats = async (req, res) => {
  try {
    // Get all clients from ClientModel to calculate real revenue from amountPaid
    const allClients = await ClientModel.find({}).lean();

        // Sum up all amountPaid values (parsing strings to numbers)
        let totalRevenue = 0;

        allClients.forEach(client => {
            let amountPaid = client.amountPaid || 0;
            
            // If amountPaid is a string, parse it to a number
            if (typeof amountPaid === 'string') {
                // Remove currency symbols ($, ₹) and any whitespace
                amountPaid = amountPaid.replace(/[$₹,\s]/g, '').trim();
                // Convert to number, default to 0 if invalid
                amountPaid = parseFloat(amountPaid) || 0;
            }
            
            // Ensure it's a number before adding
            totalRevenue += Number(amountPaid) || 0;
        });

    res.status(200).json({
      success: true,
      data: {
        totalRevenue
      }
    });
  } catch (error) {
    console.error('Error fetching revenue statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch revenue statistics',
      error: error.message
    });
  }
};

// Client routes
app.get('/api/clients', getAllClients);
app.get('/api/clients/stats', getClientStats);
app.get('/api/clients/plan-stats', getPlanTypeStats);
app.get('/api/clients/revenue-stats', getRevenueStats);
app.get('/api/clients/:email', getClientByEmail);
app.get('/api/clients/all', async (req, res) => {
  try {
    // Exclude large fields using .select()
    // Example: '-jobDescription' excludes the JD field
    // You can also exclude multiple: .select('-jobDescription -timeline -notes')
    const clients = await ClientModel.find({}).lean(); // returns plain JS objects (faster)
    // console.log(`Fetched ${clients.length} clients`);
    res.status(200).json({
      success: true,
      count: clients.length,
      data: clients,
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching clients',
    });
  }
});

app.post('/api/clients', createOrUpdateClient);
app.post('/api/clients/sync-from-jobs', syncClientsFromJobs);
app.delete('/api/clients/delete/:email', deleteClient);
app.put('/api/clients/:email/change-password', verifyToken, verifyAdmin, changeClientPassword);
app.post('/api/clients/update-operations-name', updateClientOperationsName);
app.post('/api/clients/update-dashboard-team-lead', updateClientDashboardTeamLead);
app.put('/api/clients/:email/upgrade-plan', verifyToken, upgradeClientPlan);
app.post('/api/clients/:email/add-addon', verifyToken, addClientAddon);
app.get('/api/managers/names', getDashboardManagerNames);

//get all the jobdatabase data..
const getJobsByClient = async (req, res) => {
  try {
    const { email } = req.params;
    const jobs = await JobModel.find({ userID: email }).select('-jobDescription').lean();
    res.status(200).json({ jobs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

app.get('/api/clients/:email/jobs', getJobsByClient);

// Manager routes
app.get('/api/managers', verifyToken, getAllManagers);
app.get('/api/managers/public', getAllManagers); // Public endpoint for dropdown
app.get('/api/managers/:id', verifyToken, getManagerById);
app.post('/api/managers', verifyToken, verifyAdmin, upload.single('profilePhoto'), createManager);
app.put('/api/managers/:id', verifyToken, verifyAdmin, upload.single('profilePhoto'), updateManager);
app.delete('/api/managers/:id', verifyToken, verifyAdmin, deleteManager);
app.post('/api/managers/:id/upload-photo', verifyToken, verifyAdmin, upload.single('profilePhoto'), uploadProfilePhoto);
// Get managed users for an operation
const getManagedUsers = async (req, res) => {
  try {
    const { email } = req.params;
    const operation = await OperationsModel.findOne({ email: email.toLowerCase() });

    if (!operation) {
      return res.status(404).json({ error: 'Operation not found' });
    }

    // Get user details for managed users
    const managedUsers = [];
    for (const userId of operation.managedUsers || []) {
      // Convert ObjectId to string if needed
      const userIdStr = userId.toString();

      // First try to find in UserModel (NewUserModel)
      const user = await NewUserModel.findById(userIdStr);
      if (user) {
        managedUsers.push({
          userID: userIdStr,
          name: user.name || 'Unknown',
          email: user.email || userIdStr,
          company: user.company || 'Unknown'
        });
      } else {
        // If not found in UserModel, try ClientModel
        const client = await ClientModel.findOne({ userID: userIdStr });
        if (client) {
          managedUsers.push({
            userID: userIdStr,
            name: client.name,
            email: client.email || userIdStr,
            company: client.companyName || 'Unknown'
          });
        } else {
          // If neither found, show the userID
          const displayName = userIdStr.includes('@') ? userIdStr.split('@')[0] : `User ${userIdStr.substring(0, 8)}`;
          managedUsers.push({
            userID: userIdStr,
            name: displayName,
            email: userIdStr.includes('@') ? userIdStr : 'Unknown',
            company: 'Unknown'
          });
        }
      }
    }

    res.status(200).json({ managedUsers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Add user to managed users
const addManagedUser = async (req, res) => {
  try {
    const { email } = req.params;
    const { userID } = req.body;

    if (!userID) {
      return res.status(400).json({ error: 'userID is required' });
    }

    const operation = await OperationsModel.findOne({ email: email.toLowerCase() });
    if (!operation) {
      return res.status(404).json({ error: 'Operation not found' });
    }

    // Add userID to managedUsers array if not already present (handle ObjectId comparison)
    const isAlreadyManaged = operation.managedUsers.some(managedId => managedId.toString() === userID);
    if (!isAlreadyManaged) {
      operation.managedUsers.push(userID);
      await operation.save();
    }

    res.status(200).json({ message: 'User added to managed users', managedUsers: operation.managedUsers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Remove user from managed users
const removeManagedUser = async (req, res) => {
  try {
    const { email, userID } = req.params;

    const operation = await OperationsModel.findOne({ email: email.toLowerCase() });
    if (!operation) {
      return res.status(404).json({ error: 'Operation not found' });
    }

    // Remove userID from managedUsers array (handle ObjectId comparison)
    operation.managedUsers = operation.managedUsers.filter(id => id.toString() !== userID);
    await operation.save();

    res.status(200).json({ message: 'User removed from managed users', managedUsers: operation.managedUsers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Assign client to operator using email addresses
const assignClientToOperator = async (req, res) => {
  try {
    const { clientEmail, operatorEmail } = req.body;

    if (!clientEmail || !operatorEmail) {
      return res.status(400).json({ error: 'Both clientEmail and operatorEmail are required' });
    }

    // Find the client by email to get their userID
    const client = await NewUserModel.findOne({ email: clientEmail.toLowerCase() });
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Find the operator by email
    const operator = await OperationsModel.findOne({ email: operatorEmail.toLowerCase() });
    if (!operator) {
      return res.status(404).json({ error: 'Operator not found' });
    }

    // Check if client is already managed by this operator
    const isAlreadyManaged = operator.managedUsers.some(managedId => managedId.toString() === client._id.toString());
    if (isAlreadyManaged) {
      return res.status(400).json({ error: 'Client is already managed by this operator' });
    }

    // Add client's ObjectId to operator's managedUsers array
    operator.managedUsers.push(client._id);
    await operator.save();

    res.status(200).json({
      message: 'Client assigned to operator successfully',
      managedUsers: operator.managedUsers,
      client: {
        userID: client.userID,
        name: client.name,
        email: client.email
      }
    });
  } catch (error) {
    console.error('Error assigning client to operator:', error);
    res.status(500).json({ error: error.message });
  }
}

// Get available clients (not managed by this operation)
const getAvailableClients = async (req, res) => {
  try {
    const { email } = req.params;

    const operation = await OperationsModel.findOne({ email: email.toLowerCase() });
    if (!operation) {
      return res.status(404).json({ error: 'Operation not found' });
    }

    // Get all clients from NewUserModel (users collection)
    const allClients = await NewUserModel.find({}, 'userID name email').lean();

    // Filter out clients that are already managed by this operation (handle ObjectId comparison)
    const availableClients = allClients.filter(client =>
      !operation.managedUsers.some(managedId => managedId.toString() === client._id.toString())
    );

    res.status(200).json({ availableClients });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get client details from dashboardtrackings collection
const getClientDetails = async (req, res) => {
  try {
    const { email } = req.params;

    // Find client in dashboardtrackings collection
    const client = await ClientModel.findOne({ email: email.toLowerCase() });

    if (!client) {
      return res.status(404).json({ error: 'Client not found in dashboardtrackings' });
    }

    res.status(200).json({
      success: true,
      client: client
    });
  } catch (error) {
    console.error('Error fetching client details:', error);
    res.status(500).json({ error: error.message });
  }
};

// Sync manager assignments from users collection to dashboardtrackings
const syncManagerAssignments = async (req, res) => {
  try {
    // Get all users with dashboardManager assignments
    const usersWithManagers = await NewUserModel.find({
      dashboardManager: { $exists: true, $ne: null, $ne: "" }
    }).lean();

    let syncedCount = 0;
    let errors = [];

    for (const user of usersWithManagers) {
      try {
        // Update the corresponding client in dashboardtrackings
        const updateResult = await ClientModel.updateOne(
          { email: user.email.toLowerCase() },
          {
            $set: {
              dashboardTeamLeadName: user.dashboardManager,
              updatedAt: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
            }
          }
        );

        if (updateResult.matchedCount > 0) {
          syncedCount++;
          // Manager synced successfully
        } else {
          // No matching client found
        }
      } catch (error) {
        console.error(`❌ Error syncing ${user.email}:`, error.message);
        errors.push({ email: user.email, error: error.message });
      }
    }

    res.status(200).json({
      success: true,
      message: `Manager assignment sync completed`,
      syncedCount,
      totalUsers: usersWithManagers.length,
      errors: errors.length > 0 ? errors : null
    });

  } catch (error) {
    console.error('❌ Error in syncManagerAssignments:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const getOperationsPerformanceReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const datePatterns = [];
    const currentDate = new Date(start);
    while (currentDate <= end) {
      const day = currentDate.getDate();
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();
      const dayPattern = day < 10 ? `[0]?${day}` : `${day}`;
      const monthPattern = month < 10 ? `[0]?${month}` : `${month}`;
      datePatterns.push(new RegExp(`^${dayPattern}/${monthPattern}/${year}(?=$|\\D)`));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const allOperations = await OperationsModel.find().select('email name').lean();
    const operatorEmails = allOperations.map(op => op.email.toLowerCase());

    if (operatorEmails.length === 0) {
      return res.status(200).json({
        success: true,
        startDate,
        endDate,
        totalApplied: 0,
        operators: [],
        performanceMap: {}
      });
    }

    const pipeline = [
      {
        $match: {
          operatorEmail: { $in: operatorEmails },
          appliedDate: { $exists: true, $ne: null, $ne: '' },
          $or: datePatterns.map(pattern => ({ appliedDate: { $regex: pattern } }))
        }
      },
      {
        $group: {
          _id: '$operatorEmail',
          appliedCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          operatorEmail: '$_id',
          appliedCount: 1
        }
      }
    ];

    const results = await JobModel.aggregate(pipeline).allowDiskUse(true);
    const performanceMap = {};
    results.forEach(r => {
      performanceMap[r.operatorEmail] = r.appliedCount;
    });

    const performanceData = allOperations.map(op => ({
      email: op.email,
      name: op.name || op.email.split('@')[0],
      appliedCount: performanceMap[op.email.toLowerCase()] || 0
    })).sort((a, b) => b.appliedCount - a.appliedCount);

    const totalApplied = performanceData.reduce((sum, op) => sum + op.appliedCount, 0);

    res.status(200).json({
      success: true,
      startDate,
      endDate,
      totalApplied,
      operators: performanceData,
      performanceMap
    });
  } catch (error) {
    console.error('Error in getOperationsPerformanceReport:', error);
    res.status(500).json({ error: error.message });
  }
};

app.get('/api/operations/performance-report', getOperationsPerformanceReport);

app.get('/api/operations', getAllOperations);
app.get('/api/operations/names', getOperationsNames);
app.get('/api/operations/:email', getOperationsByEmail);
app.post('/api/operations', createOrUpdateOperation);
app.get('/api/operations/:email/jobs', getJobsByOperatorEmail);
app.get('/api/operations/:email/client-stats', getClientStatistics);
app.post('/api/operations/saved-counts', getSavedJobCounts);
app.get('/api/operations/clients', getUniqueClientsFromJobs);
app.get('/api/operations/:email/managed-users', getManagedUsers);
app.post('/api/operations/:email/managed-users', addManagedUser);
app.post('/api/operations/assign-client', assignClientToOperator);
app.delete('/api/operations/:email/managed-users/:userID', removeManagedUser);

// Delete operation user with cascade deletion
const deleteOperationUser = async (req, res) => {
  try {
    const { email } = req.params;

    // Find the operation
    const operation = await OperationsModel.findOne({ email: email.toLowerCase() });
    if (!operation) {
      return res.status(404).json({ error: 'Operation not found' });
    }

    // Delete the operation
    await OperationsModel.findByIdAndDelete(operation._id);

    // Remove all managed users from other operations that might reference this operation
    // This is a cascade delete - remove this operation from any other operations' managedUsers
    await OperationsModel.updateMany(
      { managedUsers: operation._id },
      { $pull: { managedUsers: operation._id } }
    );

    res.status(200).json({ message: 'Operation user deleted successfully with cascade deletion' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

app.delete('/api/operations/:email/delete-operation', deleteOperationUser);
app.get('/api/operations/:email/available-clients', getAvailableClients);

// Manager sync route
app.post('/api/clients/sync-managers', syncManagerAssignments);


const getCurrentISTTime = () => new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

// Helper function to merge TODOs from both models, keeping the most recent version
const mergeTodos = (todos1, todos2) => {
  const todoMap = new Map();
  
  // Add all TODOs from first array
  todos1.forEach(todo => {
    todoMap.set(todo.id, todo);
  });
  
  // Merge TODOs from second array, keeping the one with the latest updatedAt
  todos2.forEach(todo => {
    const existing = todoMap.get(todo.id);
    if (!existing) {
      todoMap.set(todo.id, todo);
    } else {
      // Compare updatedAt timestamps and keep the most recent
      // Handle both string dates and Date objects
      const existingTime = existing.updatedAt 
        ? (typeof existing.updatedAt === 'string' ? new Date(existing.updatedAt) : existing.updatedAt)
        : (existing.createdAt ? (typeof existing.createdAt === 'string' ? new Date(existing.createdAt) : existing.createdAt) : new Date(0));
      const newTime = todo.updatedAt 
        ? (typeof todo.updatedAt === 'string' ? new Date(todo.updatedAt) : todo.updatedAt)
        : (todo.createdAt ? (typeof todo.createdAt === 'string' ? new Date(todo.createdAt) : todo.createdAt) : new Date(0));
      
      if (newTime > existingTime || isNaN(existingTime.getTime())) {
        todoMap.set(todo.id, todo);
      }
    }
  });
  
  return Array.from(todoMap.values());
};

// Helper function to merge lock periods from both models
const mergeLockPeriods = (periods1, periods2) => {
  const periodMap = new Map();
  
  periods1.forEach(period => {
    periodMap.set(period.id, period);
  });
  
  periods2.forEach(period => {
    const existing = periodMap.get(period.id);
    if (!existing) {
      periodMap.set(period.id, period);
    } else {
      // Keep the most recent one
      const existingTime = existing.createdAt 
        ? (typeof existing.createdAt === 'string' ? new Date(existing.createdAt) : existing.createdAt)
        : new Date(0);
      const newTime = period.createdAt 
        ? (typeof period.createdAt === 'string' ? new Date(period.createdAt) : period.createdAt)
        : new Date(0);
      
      if (newTime > existingTime || isNaN(existingTime.getTime())) {
        periodMap.set(period.id, period);
      }
    }
  });
  
  return Array.from(periodMap.values());
};

// Helper function to get default TODOs

const getDefaultTodos = () => {
  const timestamp = Date.now();
  return [
    {
      id: `todo-${timestamp}-1`,
      title: 'Create optimized resume',
      notes: '',
      completed: false,
      createdBy: '',
      createdAt: getCurrentISTTime(),
      updatedAt: getCurrentISTTime()
    },
    {
      id: `todo-${timestamp}-2`,
      title: 'LinkedIn Optimization',
      notes: '',
      completed: false,
      createdBy: '',
      createdAt: getCurrentISTTime(),
      updatedAt: getCurrentISTTime()
    },
    {
      id: `todo-${timestamp}-3`,
      title: 'Cover letter Optimization',
      notes: '',
      completed: false,
      createdBy: '',
      createdAt: getCurrentISTTime(),
      updatedAt: getCurrentISTTime()
    }
  ];
};

app.get('/api/client-todos/all', async (req, res) => {
  try {

    const [allClientTodos, allClientOps, allClients] = await Promise.all([
      ClientTodosModel.find().lean(),
      ClientOperationsModel.find().lean(),
      ClientModel.find().select('email name status').lean()
    ]);

    const clientMap = {};
    const clientStatusMap = {};
    const clientEmails = new Set();
    allClients.forEach(client => {
      const emailLower = client.email.toLowerCase();
      clientMap[emailLower] = client.name;
      clientStatusMap[emailLower] = client.status;
      clientEmails.add(emailLower);
    });

    const mergedDataMap = new Map();

    allClientTodos.forEach(todoData => {
      const email = todoData.clientEmail.toLowerCase();
      mergedDataMap.set(email, {
        email: todoData.clientEmail,
        name: clientMap[email] || todoData.clientEmail,
        todos: todoData.todos || [],
        lockPeriods: todoData.lockPeriods || [],
        createdAt: todoData.createdAt,
        updatedAt: todoData.updatedAt
      });
    });

    allClientOps.forEach(opsData => {
      const email = opsData.clientEmail.toLowerCase();
      const existing = mergedDataMap.get(email);
      
      if (existing) {
        existing.todos = mergeTodos(existing.todos, opsData.todos || []);
        existing.lockPeriods = mergeLockPeriods(existing.lockPeriods, opsData.lockPeriods || []);
        const existingTime = new Date(existing.updatedAt || 0);
        const opsTime = new Date(opsData.updatedAt || 0);
        if (opsTime > existingTime) {
          existing.updatedAt = opsData.updatedAt;
        }
      } else {
        mergedDataMap.set(email, {
          email: opsData.clientEmail,
          name: clientMap[email] || opsData.clientEmail,
          todos: opsData.todos || [],
          lockPeriods: opsData.lockPeriods || [],
          createdAt: opsData.createdAt,
          updatedAt: opsData.updatedAt
        });
      }
    });

    const clientsWithTodos = Array.from(mergedDataMap.values());

    allClients.forEach(client => {
      const exists = clientsWithTodos.find(c => c.email.toLowerCase() === client.email.toLowerCase());
      if (!exists) {
        clientsWithTodos.push({
          email: client.email,
          name: client.name,
          todos: [],
          lockPeriods: [],
          createdAt: null,
          updatedAt: null
        });
      }
    });

    const clientEmailList = Array.from(clientEmails);
    
    const jobAnalysisPipeline = [
      {
        $match: {
          userID: { $in: clientEmailList },
          $or: [
            { currentStatus: { $regex: /appl/i } },
            { appliedDate: { $exists: true, $ne: null } }
          ]
        }
      },
      {
        $group: {
          _id: '$userID',
          hasAppliedJobs: { $sum: 1 }
        }
      }
    ];

    const lastAppliedJobsQuery = {
      userID: { $in: clientEmailList },
      operatorName: { $ne: 'user', $exists: true },
      appliedDate: { $exists: true, $ne: null }
    };

    const [jobAnalysis, allAppliedJobs] = await Promise.all([
      JobModel.aggregate(jobAnalysisPipeline),
      JobModel.find(lastAppliedJobsQuery).select('userID companyName appliedDate operatorName').lean()
    ]);

    const parseDateString = (dateStr) => {
      if (!dateStr) return null;
      try {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const [day, month, year] = parts.map(n => parseInt(n, 10));
          return new Date(year, month - 1, day);
        }
        return new Date(dateStr);
      } catch {
        return null;
      }
    };

    const jobsByUser = new Map();
    allAppliedJobs.forEach(job => {
      const emailLower = job.userID.toLowerCase();
      const existing = jobsByUser.get(emailLower);
      const jobDate = parseDateString(job.appliedDate);
      
      if (!existing || !existing.date || (jobDate && jobDate > existing.date)) {
        jobsByUser.set(emailLower, {
          companyName: job.companyName,
          appliedDate: job.appliedDate,
          operatorName: job.operatorName,
          date: jobDate
        });
      }
    });

    const activeClientsSet = new Set(jobAnalysis.map(j => j._id.toLowerCase()));
    const lastAppliedMap = new Map();
    jobsByUser.forEach((jobData, email) => {
      lastAppliedMap.set(email, {
        companyName: jobData.companyName,
        appliedDate: jobData.appliedDate,
        operatorName: jobData.operatorName
      });
    });

    clientsWithTodos.forEach(client => {
      const emailLower = client.email.toLowerCase();
      const dbStatus = clientStatusMap[emailLower];
      if (dbStatus === 'active' || dbStatus === 'inactive') {
        client.isJobActive = dbStatus === 'active';
        client.status = dbStatus;
      } else {
        client.isJobActive = true;
        client.status = 'active';
      }
      const lastJob = lastAppliedMap.get(emailLower);
      if (lastJob) {
        client.lastAppliedJob = lastJob;
      } else {
        client.lastAppliedJob = null;
      }
    });

    clientsWithTodos.sort((a, b) => {
      if (a.isJobActive === b.isJobActive) return 0;
      return a.isJobActive ? -1 : 1;
    });

    res.status(200).json({ success: true, clients: clientsWithTodos });
  } catch (error) {
    console.error('Error fetching all client todos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get client TODOs and lock periods by email - SYNCED with ClientOperationsModel
app.get('/api/client-todos/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const emailLower = email.toLowerCase();
    
    // Fetch from both models
    let clientTodos = await ClientTodosModel.findOne({ clientEmail: emailLower });
    let clientOps = await ClientOperationsModel.findOne({ clientEmail: emailLower });

    // If neither exists, create default structure in both
    if (!clientTodos && !clientOps) {
      const defaultTodos = getDefaultTodos();
      const defaultData = {
        clientEmail: emailLower,
        todos: defaultTodos,
        lockPeriods: [],
        createdAt: getCurrentISTTime(),
        updatedAt: getCurrentISTTime()
      };

      clientTodos = new ClientTodosModel(defaultData);
      clientOps = new ClientOperationsModel(defaultData);
      
      await Promise.all([
        clientTodos.save(),
        clientOps.save()
      ]);
    } else {
      // Merge data from both models
      const mergedTodos = mergeTodos(
        clientTodos?.todos || [],
        clientOps?.todos || []
      );
      const mergedLockPeriods = mergeLockPeriods(
        clientTodos?.lockPeriods || [],
        clientOps?.lockPeriods || []
      );

      // Ensure default TODOs are present
      const defaultTodoTitles = ['Create optimized resume', 'LinkedIn Optimization', 'Cover letter Optimization'];
      const existingTitles = mergedTodos.map(t => t.title);
      const missingDefaults = defaultTodoTitles.filter(title => !existingTitles.includes(title));
      
      if (missingDefaults.length > 0 || mergedTodos.length === 0) {
        // Add missing default TODOs
        const defaultTodos = getDefaultTodos();
        defaultTodos.forEach(defaultTodo => {
          if (!mergedTodos.find(t => t.title === defaultTodo.title)) {
            mergedTodos.push(defaultTodo);
          }
        });
      }

      // Update both models with merged data
      const updateData = {
        todos: mergedTodos,
        lockPeriods: mergedLockPeriods,
        updatedAt: getCurrentISTTime()
      };

      if (!clientTodos) {
        clientTodos = new ClientTodosModel({
          clientEmail: emailLower,
          ...updateData,
          createdAt: getCurrentISTTime()
        });
      } else {
        clientTodos.todos = mergedTodos;
        clientTodos.lockPeriods = mergedLockPeriods;
        clientTodos.updatedAt = getCurrentISTTime();
      }

      if (!clientOps) {
        clientOps = new ClientOperationsModel({
          clientEmail: emailLower,
          ...updateData,
          createdAt: getCurrentISTTime()
        });
      } else {
        clientOps.todos = mergedTodos;
        clientOps.lockPeriods = mergedLockPeriods;
        clientOps.updatedAt = getCurrentISTTime();
      }

      // Save both models
      await Promise.all([
        clientTodos.save(),
        clientOps.save()
      ]);
    }

    res.status(200).json({ success: true, data: clientTodos });
  } catch (error) {
    console.error('Error fetching client todos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update client TODOs and lock periods - SYNCED with ClientOperationsModel
app.put('/api/client-todos/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { todos, lockPeriods } = req.body;
    const emailLower = email.toLowerCase();

    const updateData = {
      updatedAt: getCurrentISTTime()
    };

    if (todos !== undefined) {
      updateData.todos = todos.map(todo => ({
        ...todo,
        // Preserve createdBy if it exists, otherwise set as "admin" (created from clients-tracking)
        createdBy: todo.createdBy || "admin",
        updatedAt: todo.updatedAt || getCurrentISTTime()
      }));
    }

    if (lockPeriods !== undefined) {
      updateData.lockPeriods = lockPeriods;
    }

    // Update both models simultaneously to keep them in sync
    const [clientTodos, clientOps] = await Promise.all([
      ClientTodosModel.findOneAndUpdate(
        { clientEmail: emailLower },
        { $set: updateData },
        { new: true, upsert: true }
      ),
      ClientOperationsModel.findOneAndUpdate(
        { clientEmail: emailLower },
        { $set: updateData },
        { new: true, upsert: true }
      )
    ]);

    // If upsert created new documents, ensure they have clientEmail
    if (clientTodos && !clientTodos.clientEmail) {
      clientTodos.clientEmail = emailLower;
      await clientTodos.save();
    }
    if (clientOps && !clientOps.clientEmail) {
      clientOps.clientEmail = emailLower;
      await clientOps.save();
    }

    res.status(200).json({ success: true, message: 'Client todos updated successfully', data: clientTodos });
  } catch (error) {
    console.error('Error updating client todos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check if current date is within any lock period
app.post('/api/client-todos/check-lock-period', async (req, res) => {
  try {
    const { clientEmail } = req.body;

    if (!clientEmail) {
      return res.status(400).json({ success: false, message: 'Client email is required' });
    }

    const clientTodos = await ClientTodosModel.findOne({ clientEmail: clientEmail.toLowerCase() });

    if (!clientTodos || !clientTodos.lockPeriods || clientTodos.lockPeriods.length === 0) {
      return res.status(200).json({ success: true, isLocked: false, message: null });
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    for (const period of clientTodos.lockPeriods) {
      const startDate = new Date(period.startDate);
      const endDate = new Date(period.endDate);

      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);

      if (now >= startDate && now <= endDate) {
        return res.status(200).json({
          success: true,
          isLocked: true,
          message: period.reason || 'Job card movement is locked during this period. Please try again after the lock period ends.',
          lockPeriod: {
            startDate: period.startDate,
            endDate: period.endDate,
            reason: period.reason
          }
        });
      }
    }

    return res.status(200).json({ success: true, isLocked: false, message: null });
  } catch (error) {
    console.error('Error checking lock period:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/client-todos/migrate-defaults', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const allClients = await ClientModel.find().select('email').lean();
    const defaultTodos = [
      {
        id: `todo-${Date.now()}-1`,
        title: 'Create optimized resume',
        notes: '',
        completed: false,
        createdAt: getCurrentISTTime(),
        updatedAt: getCurrentISTTime()
      },
      {
        id: `todo-${Date.now()}-2`,
        title: 'LinkedIn Optimization',
        notes: '',
        completed: false,
        createdAt: getCurrentISTTime(),
        updatedAt: getCurrentISTTime()
      },
      {
        id: `todo-${Date.now()}-3`,
        title: 'Cover letter Optimization',
        notes: '',
        completed: false,
        createdAt: getCurrentISTTime(),
        updatedAt: getCurrentISTTime()
      }
    ];

    let created = 0;
    let skipped = 0;

    for (const client of allClients) {
      const existing = await ClientTodosModel.findOne({ clientEmail: client.email.toLowerCase() });

      if (!existing) {
        await ClientTodosModel.create({
          clientEmail: client.email.toLowerCase(),
          todos: defaultTodos.map((todo, idx) => ({
            ...todo,
            id: `todo-${Date.now()}-${idx + 1}-${client.email}`
          })),
          lockPeriods: []
        });
        created++;
      } else {
        skipped++;
      }
    }

    res.status(200).json({
      success: true,
      message: `Migration completed: ${created} clients initialized with default todos, ${skipped} clients already had todos`,
      stats: { created, skipped, total: allClients.length }
    });
  } catch (error) {
    console.error('Error migrating default todos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// Client details route (removed duplicate - using getClientByEmail instead)

// Start automated call status cleanup job
// Runs every 30 seconds to update stuck "calling" calls to "completed" (after 30 seconds timeout - NO MATTER WHAT)
let callSweepInterval = null;

function startCallSweepJob() {
  // Run immediately on startup
  sweepOverdueCalls().catch(err => {
    console.error('❌ [Call Sweep] Initial sweep error:', err);
  });

  // Then run every 30 seconds for faster detection of stuck calls
  callSweepInterval = setInterval(async () => {
    try {
      const updated = await sweepOverdueCalls();
      if (updated > 0) {
        console.log(`🔄 [Call Sweep] Auto-updated ${updated} calls from "calling" to "completed"`);
      }
    } catch (error) {
      console.error('❌ [Call Sweep] Scheduled sweep error:', error);
    }
  }, 30 * 1000); // Every 30 seconds (changed from 2 minutes for faster detection)

  // console.log('✅ [Call Sweep] Automated call status cleanup job started (runs every 30 seconds, auto-completes calls stuck in "calling" for >30 seconds - NO MATTER WHAT)');
}

// Start the server
app.listen(process.env.PORT, () => {
  console.log(`✅ Server is live at port: ${process.env.PORT}`);

  // Start the automated call sweep job
  startCallSweepJob();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  if (callSweepInterval) {
    clearInterval(callSweepInterval);
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  if (callSweepInterval) {
    clearInterval(callSweepInterval);
  }
  process.exit(0);
});
