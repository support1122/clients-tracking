import { OnboardingJobModel, ONBOARDING_STATUSES_LIST } from '../OnboardingJobModel.js';
import { OnboardingJobCounterModel } from '../OnboardingJobCounterModel.js';
import { ClientCounterModel } from '../ClientCounterModel.js';
import { OnboardingNotificationModel } from '../OnboardingNotificationModel.js';
import { UserModel } from '../UserModel.js';
import { ClientModel } from '../ClientModel.js';
import { ManagerModel } from '../ManagerModel.js';
import { sendTagNotificationEmail } from '../utils/sendTagNotificationEmail.js';

const VALID_TRANSITIONS = {
  resume_in_progress: ['resume_draft_done'],
  resume_draft_done: ['resume_in_review'],
  resume_in_review: ['resume_approved'],
  resume_approved: ['linkedin_in_progress'],
  linkedin_in_progress: ['linkedin_done'],
  linkedin_done: ['cover_letter_in_progress', 'applications_ready'],
  cover_letter_in_progress: ['cover_letter_done'],
  cover_letter_done: ['applications_ready'],
  applications_ready: ['applications_in_progress'],
  applications_in_progress: ['completed'],
  completed: []
};

export async function getNextJobNumber() {
  const counter = await OnboardingJobCounterModel.findOneAndUpdate(
    { _id: 'onboarding_job_number' },
    { $inc: { lastNumber: 1 } },
    { new: true, upsert: true }
  );
  return counter.lastNumber;
}

const CLIENT_NUMBER_FLOOR = 5809;

export async function getNextClientNumber() {
  const counter = await ClientCounterModel.findOneAndUpdate(
    { _id: 'client_number' },
    { $max: { lastNumber: CLIENT_NUMBER_FLOOR - 1 }, $inc: { lastNumber: 1 } },
    { new: true, upsert: true }
  );
  return counter.lastNumber;
}

export async function previewNextClientNumber() {
  const counter = await ClientCounterModel.findOne({ _id: 'client_number' }).lean();
  const current = counter?.lastNumber || (CLIENT_NUMBER_FLOOR - 1);
  return Math.max(current + 1, CLIENT_NUMBER_FLOOR);
}

export async function getCurrentClientNumber() {
  const counter = await ClientCounterModel.findOne({ _id: 'client_number' }).lean();
  const current = counter?.lastNumber || (CLIENT_NUMBER_FLOOR - 1);
  return Math.max(current, CLIENT_NUMBER_FLOOR - 1);
}

export async function getNextResumeMaker() {
  const users = await UserModel.find({
    role: 'onboarding_team',
    onboardingSubRole: 'resume_maker',
    isActive: true
  })
    .sort({ lastResumeAssignedAt: 1 })
    .limit(1)
    .lean();
  if (!users.length) return null;
  const u = users[0];
  await UserModel.updateOne(
    { _id: u._id },
    { $set: { lastResumeAssignedAt: new Date() } }
  ).catch(() => {});
  return { email: u.email, name: u.name || u.email };
}

export async function getNextLinkedInMember() {
  const users = await UserModel.find({
    role: 'onboarding_team',
    onboardingSubRole: 'linkedin_and_cover_letter_optimization',
    isActive: true
  })
    .sort({ lastLinkedInAssignedAt: 1 })
    .limit(1)
    .lean();
  if (!users.length) return null;
  const u = users[0];
  await UserModel.updateOne(
    { _id: u._id },
    { $set: { lastLinkedInAssignedAt: new Date() } }
  ).catch(() => {});
  return { email: u.email, name: u.name || u.email };
}

export async function createOnboardingJobPayload(payload) {
  const jobNumber = await getNextJobNumber();
  const clientNumber = payload.clientNumber != null ? payload.clientNumber : await getNextClientNumber();
  const nextResume = await getNextResumeMaker();
  const doc = {
    jobNumber,
    clientNumber,
    clientEmail: (payload.clientEmail || '').toLowerCase().trim(),
    clientName: payload.clientName || '',
    planType: payload.planType || 'Professional',
    status: 'resume_in_progress',
    dashboardManagerName: payload.dashboardManagerName || '',
    bachelorsStartDate: payload.bachelorsStartDate || '',
    mastersEndDate: payload.mastersEndDate || '',
    dashboardCredentials: payload.dashboardCredentials || { username: '', password: '', loginUrl: '' },
    csmEmail: payload.csmEmail || '',
    csmName: payload.csmName || '',
    resumeMakerEmail: (nextResume?.email || '').toLowerCase(),
    resumeMakerName: nextResume?.name || '',
    attachments: [],
    comments: [],
    moveHistory: [{ fromStatus: 'created', toStatus: 'resume_in_progress', movedBy: 'system', movedAt: new Date() }]
  };
  const job = await OnboardingJobModel.create(doc);
  return job;
}

// Fields needed for Kanban card display (excludes heavy arrays loaded on card open)
const LIST_PROJECTION = 'jobNumber clientNumber clientEmail clientName planType status ' +
  'resumeMakerEmail resumeMakerName linkedInMemberEmail linkedInMemberName ' +
  'csmEmail csmName dashboardManagerName linkedInPhaseStarted createdAt updatedAt';

export async function listOnboardingJobs(req, res) {
  try {
    const { status } = req.query || {};
    const filter = {};
    if (status && ONBOARDING_STATUSES_LIST.includes(status)) filter.status = status;

    // Fetch jobs with lightweight projection — heavy arrays loaded lazily on card open
    const jobs = await OnboardingJobModel.find(filter)
      .select(LIST_PROJECTION)
      .sort({ jobNumber: 1 })
      .lean();

    // Parallel: fetch client statuses AND manager emails at the same time
    const clientEmails = [...new Set(jobs.map(job => (job.clientEmail || '').toLowerCase()).filter(Boolean))];
    const managerNames = [...new Set(jobs.map(j => (j.dashboardManagerName || '').trim()).filter(Boolean))];

    const [clients, managers] = await Promise.all([
      clientEmails.length
        ? ClientModel.find({ email: { $in: clientEmails } }).select('email status isPaused').lean()
        : Promise.resolve([]),
      managerNames.length
        ? ManagerModel.find({ fullName: { $in: managerNames }, isActive: true }).select('fullName email').lean()
        : Promise.resolve([])
    ]);

    const clientStatusMap = new Map(
      clients.map(c => [c.email.toLowerCase(), { status: c.status || 'active', isPaused: c.isPaused || false }])
    );
    const managerEmailByName = new Map(managers.map(m => [m.fullName, m.email]));

    const enrichedJobs = jobs.map(job => {
      const clientEmail = (job.clientEmail || '').toLowerCase();
      const clientInfo = clientStatusMap.get(clientEmail) || { status: 'active', isPaused: false };
      const dashboardManagerEmail = (job.dashboardManagerName && managerEmailByName.get(job.dashboardManagerName)) || '';
      return {
        ...job,
        clientStatus: clientInfo.status,
        clientIsPaused: clientInfo.isPaused,
        dashboardManagerEmail
      };
    });

    res.status(200).json({ jobs: enrichedJobs });
  } catch (e) {
    console.error('listOnboardingJobs:', e);
    res.status(500).json({ error: e.message || 'Failed to list onboarding jobs' });
  }
}

export async function getOnboardingJobById(req, res) {
  try {
    const { id } = req.params;
    const job = await OnboardingJobModel.findById(id).lean();
    if (!job) return res.status(404).json({ error: 'Onboarding job not found' });
    const canSeeCredentials = req.user && (req.user.role === 'admin' || req.user.roles?.includes?.('csm'));
    if (!canSeeCredentials && job.dashboardCredentials?.password) {
      job.dashboardCredentials = { ...job.dashboardCredentials, password: '********' };
    }

    // Parallel: fetch client status + manager email at the same time
    const clientEmail = (job.clientEmail || '').toLowerCase();
    const [client, manager] = await Promise.all([
      clientEmail
        ? ClientModel.findOne({ email: clientEmail }).select('status isPaused').lean()
        : Promise.resolve(null),
      job.dashboardManagerName
        ? ManagerModel.findOne({ fullName: job.dashboardManagerName, isActive: true }).select('email').lean()
        : Promise.resolve(null)
    ]);

    job.clientStatus = client?.status || 'active';
    job.clientIsPaused = client?.isPaused || false;
    job.dashboardManagerEmail = manager?.email || '';

    res.status(200).json({ job });
  } catch (e) {
    console.error('getOnboardingJobById:', e);
    res.status(500).json({ error: e.message || 'Failed to get onboarding job' });
  }
}

function validateTransition(fromStatus, toStatus) {
  const allowed = VALID_TRANSITIONS[fromStatus];
  if (!allowed || !allowed.includes(toStatus)) return false;
  return true;
}

export async function patchOnboardingJob(req, res) {
  try {
    const { id } = req.params;
    const { status, csmEmail, csmName, resumeMakerEmail, resumeMakerName, linkedInMemberEmail, linkedInMemberName, comment, clientName } = req.body || {};
    
    // Validate ID format
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid job ID format' });
    }
    
    // Find existing job by ID - this ensures we're updating, not creating
    const job = await OnboardingJobModel.findById(id);
    if (!job) {
      return res.status(404).json({ error: 'Onboarding job not found' });
    }

    const isAdmin = req.user?.role === 'admin';
    const isCsm = req.user?.role === 'csm' || req.user?.roles?.includes?.('csm');
    const isTeamLead = req.user?.role === 'team_lead';
    const canMoveAny = isAdmin || isCsm || isTeamLead;

    if (status && typeof status === 'string') {
      const fromStatus = job.status;
      
      // Plan-based validation
      const planType = (job.planType || 'default').toLowerCase();
      const executiveStatuses = ['resume_in_progress', 'resume_draft_done', 'resume_in_review', 'resume_approved', 'linkedin_in_progress', 'linkedin_done', 'cover_letter_in_progress', 'cover_letter_done', 'applications_ready', 'applications_in_progress', 'completed'];
      const professionalStatuses = ['resume_in_progress', 'resume_draft_done', 'resume_in_review', 'resume_approved', 'linkedin_in_progress', 'linkedin_done', 'applications_ready', 'applications_in_progress', 'completed'];
      const defaultStatuses = ['resume_in_progress', 'resume_draft_done', 'resume_in_review', 'resume_approved', 'applications_ready', 'applications_in_progress', 'completed'];
      
      const allowedStatusesForPlan = planType === 'executive' ? executiveStatuses : (planType === 'professional' ? professionalStatuses : defaultStatuses);
      
      if (!allowedStatusesForPlan.includes(status)) {
        const planName = job.planType || 'this plan';
        return res.status(400).json({ error: `This plan doesn't support moving to "${status}". ${planName === 'executive' ? 'Executive plan' : planName === 'professional' ? 'Professional plan' : 'This plan'} only supports certain statuses.` });
      }
      
      // Allow transition to LinkedIn phases if linkedInPhaseStarted is true (even if status is resume_approved)
      const canMoveToLinkedIn = (fromStatus === 'resume_approved' && job.linkedInPhaseStarted && (status === 'linkedin_in_progress' || status === 'linkedin_done'));
      const allowed = canMoveAny || canMoveToLinkedIn || validateTransition(fromStatus, status);
      if (!allowed) {
        return res.status(400).json({ error: `Invalid status transition from ${fromStatus} to ${status}` });
      }
      job.status = status;
      if (!job.moveHistory) job.moveHistory = [];
      job.moveHistory.push({
        fromStatus,
        toStatus: status,
        movedBy: req.user?.email || 'unknown',
        movedAt: new Date()
      });
      
      // Mark LinkedIn phase as started when Resume Approved (same job appears in both columns)
      if (status === 'resume_approved' && fromStatus !== 'resume_approved' && !job.linkedInPhaseStarted) {
        job.linkedInPhaseStarted = true;
        
        // Auto-assign LinkedIn member using round-robin
        if (!job.linkedInMemberEmail) {
          const nextLinkedIn = await getNextLinkedInMember();
          if (nextLinkedIn) {
            job.linkedInMemberEmail = (nextLinkedIn.email || '').toLowerCase();
            job.linkedInMemberName = nextLinkedIn.name || '';
          }
        }
        
        // Notify LinkedIn team
        try {
          const linkedInTeam = await UserModel.find({
            role: 'onboarding_team',
            onboardingSubRole: 'linkedin_and_cover_letter_optimization',
            isActive: true
          }).select('email name').lean();
          
          if (linkedInTeam.length > 0) {
            const displayName = job.clientNumber != null ? `${job.clientNumber} - ${job.clientName || ''}` : (job.clientName || '');
            const notifications = linkedInTeam.map(user => ({
              userEmail: (user.email || '').toLowerCase().trim(),
              jobId: job._id,
              jobNumber: job.jobNumber,
              clientNumber: job.clientNumber ?? null,
              clientName: job.clientName || '',
              commentSnippet: `LinkedIn phase started: ${displayName}`,
              authorEmail: req.user?.email || 'system',
              authorName: req.user?.name || 'System',
              read: false
            })).filter(n => n.userEmail);
            
            if (notifications.length) {
              await OnboardingNotificationModel.insertMany(notifications).catch(err => console.error('LinkedIn phase notification insert:', err));
            }
          }
        } catch (err) {
          console.error('Failed to create LinkedIn phase notifications:', err);
        }
      }
      
      // Also set linkedInPhaseStarted if manually moved to LinkedIn statuses (for admin flexibility)
      if ((status === 'linkedin_in_progress' || status === 'linkedin_done') && !job.linkedInPhaseStarted) {
        job.linkedInPhaseStarted = true;
        // Auto-assign LinkedIn member if not already assigned
        if (!job.linkedInMemberEmail) {
          const nextLinkedIn = await getNextLinkedInMember();
          if (nextLinkedIn) {
            job.linkedInMemberEmail = (nextLinkedIn.email || '').toLowerCase();
            job.linkedInMemberName = nextLinkedIn.name || '';
          }
        }
      }
    }

    if (csmEmail !== undefined) {
      job.csmEmail = (csmEmail || '').toLowerCase().trim();
      job.csmName = csmName || '';
    }
    if (isAdmin && resumeMakerEmail !== undefined) {
      job.resumeMakerEmail = (resumeMakerEmail || '').toLowerCase().trim();
      job.resumeMakerName = resumeMakerName || '';
    }
    if (isAdmin && linkedInMemberEmail !== undefined) {
      job.linkedInMemberEmail = (linkedInMemberEmail || '').toLowerCase().trim();
      job.linkedInMemberName = linkedInMemberName || '';
    }
    if (isAdmin && clientName !== undefined && typeof clientName === 'string') {
      job.clientName = clientName.trim() || job.clientName;
    }

    if (comment && typeof comment.body === 'string' && comment.body.trim()) {
      if (!job.comments) job.comments = [];
      const taggedUserIds = Array.isArray(comment.taggedUserIds) ? comment.taggedUserIds : [];
      const taggedNames = Array.isArray(comment.taggedNames) ? comment.taggedNames : [];
      job.comments.push({
        body: comment.body.trim(),
        authorEmail: req.user?.email || '',
        authorName: req.user?.name || req.user?.email || '',
        taggedUserIds,
        taggedNames,
        createdAt: new Date()
      });
      job.updatedAt = new Date();
      await job.save();

      if (taggedUserIds.length > 0) {
        const commentSnippet = comment.body.trim().slice(0, 120);
        const authorName = req.user?.name || req.user?.email || '';
        const authorEmail = req.user?.email || '';
        const cleanTaggedEmails = taggedUserIds.map(e => (e || '').toLowerCase().trim()).filter(Boolean);

        const notifications = cleanTaggedEmails.map((email) => ({
          userEmail: email,
          jobId: job._id,
          jobNumber: job.jobNumber,
          clientNumber: job.clientNumber ?? null,
          clientName: job.clientName || '',
          commentSnippet,
          authorEmail,
          authorName,
          read: false
        }));
        if (notifications.length) {
          await OnboardingNotificationModel.insertMany(notifications).catch(err => console.error('OnboardingNotification insert:', err));
        }

        // Batch lookup all tagged users' otpEmails in a single query
        const taggedUsersData = await UserModel.find({ email: { $in: cleanTaggedEmails } })
          .select('email otpEmail name')
          .lean();
        const taggedUserMap = new Map(taggedUsersData.map(u => [u.email.toLowerCase(), u]));

        // Send email notifications to tagged users (fire-and-forget)
        cleanTaggedEmails.forEach((userEmail, i) => {
          const taggedUser = taggedUserMap.get(userEmail);
          const toEmail = (taggedUser?.otpEmail || '').trim() || userEmail;
          const recipientName = (Array.isArray(comment.taggedNames) && comment.taggedNames[i]) ? comment.taggedNames[i] : null;
          const emailType = taggedUser?.otpEmail ? 'otpEmail' : 'primary';
          console.log(`[Tagged] ${authorName} tagged ${userEmail} in job #${job.jobNumber} -> sending email to ${toEmail} (${emailType})`);
          sendTagNotificationEmail({
            toEmail,
            recipientName: recipientName || taggedUser?.name,
            authorName,
            commentSnippet,
            jobNumber: job.jobNumber,
            clientName: job.clientName || '',
            clientNumber: job.clientNumber ?? null,
            jobId: String(job._id)
          }).then(() => {
            console.log(`[Tag Email] Sent successfully to ${toEmail} for tagged user ${userEmail}`);
          }).catch(err => {
            console.error(`[Tag Email] Failed to send to ${toEmail} for tagged user ${userEmail}:`, err?.message || err);
          });
        });
      }
    } else {
      job.updatedAt = new Date();
      await job.save();
    }

    // Use the already-mutated job object — avoids an extra findById round-trip
    const updated = job.toObject();

    // Parallel: fetch client status + manager email at the same time
    const enrichClientEmail = (updated.clientEmail || '').toLowerCase();
    const [clientDoc, managerDoc] = await Promise.all([
      enrichClientEmail
        ? ClientModel.findOne({ email: enrichClientEmail }).select('status isPaused').lean()
        : Promise.resolve(null),
      updated.dashboardManagerName
        ? ManagerModel.findOne({ fullName: updated.dashboardManagerName, isActive: true }).select('email').lean()
        : Promise.resolve(null)
    ]);

    updated.clientStatus = clientDoc?.status || 'active';
    updated.clientIsPaused = clientDoc?.isPaused || false;
    updated.dashboardManagerEmail = managerDoc?.email || '';

    res.status(200).json({ job: updated });
  } catch (e) {
    console.error('patchOnboardingJob:', e);
    res.status(500).json({ error: e.message || 'Failed to update onboarding job' });
  }
}

export async function postOnboardingJob(req, res) {
  try {
    const { clientEmail, clientName, planType, dashboardManagerName, dashboardCredentials, bachelorsStartDate, mastersEndDate } = req.body || {};
    if (!clientEmail || !clientName) {
      return res.status(400).json({ error: 'clientEmail and clientName are required' });
    }
    const existing = await OnboardingJobModel.findOne({ clientEmail: clientEmail.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ error: 'Onboarding job already exists for this client' });
    }
    const job = await createOnboardingJobPayload({
      clientEmail,
      clientName,
      planType: planType || 'Professional',
      dashboardManagerName: dashboardManagerName || '',
      bachelorsStartDate: bachelorsStartDate || '',
      mastersEndDate: mastersEndDate || '',
      dashboardCredentials: dashboardCredentials || {}
    });
    
    // Create notification for ticket creation
    try {
      const csms = await UserModel.find({
        $or: [{ role: 'csm' }, { roles: { $in: ['csm'] } }],
        isActive: true
      }).select('email name').lean();
      
      if (csms.length > 0) {
        const displayName = job.clientNumber != null ? `${job.clientNumber} - ${job.clientName || ''}` : (job.clientName || '');
        const notifications = csms.map(csm => ({
          userEmail: (csm.email || '').toLowerCase().trim(),
          jobId: job._id,
          jobNumber: job.jobNumber,
          clientNumber: job.clientNumber ?? null,
          clientName: job.clientName || '',
          commentSnippet: `New client ticket created: ${displayName}`,
          authorEmail: req.user?.email || 'system',
          authorName: req.user?.name || 'System',
          read: false
        })).filter(n => n.userEmail);
        
        if (notifications.length) {
          await OnboardingNotificationModel.insertMany(notifications).catch(err => console.error('OnboardingNotification insert (ticket created):', err));
        }
      }
    } catch (err) {
      console.error('Failed to create ticket creation notifications:', err);
    }
    
    res.status(201).json({ job: job.toObject() });
  } catch (e) {
    console.error('postOnboardingJob:', e);
    res.status(500).json({ error: e.message || 'Failed to create onboarding job' });
  }
}

export async function getOnboardingRoles(req, res) {
  try {
    const users = await UserModel.find({ isActive: true })
      .select('email role onboardingSubRole roles name')
      .lean();
    const csms = users.filter(u => u.roles?.includes?.('csm') || u.role === 'csm');
    const resumeMakers = users.filter(u => u.role === 'onboarding_team' && u.onboardingSubRole === 'resume_maker');
    const linkedInMembers = users.filter(u => 
      u.role === 'onboarding_team' && 
      u.onboardingSubRole === 'linkedin_and_cover_letter_optimization'
    );
    const teamLeads = users.filter(u => u.role === 'team_lead');
    const operationsInterns = users.filter(u => u.role === 'operations_intern');
    const admins = users.filter(u => u.role === 'admin');
    const mentionableMap = new Map();
    [...csms, ...teamLeads, ...operationsInterns].forEach(u => {
      if (u.email) mentionableMap.set(u.email.toLowerCase(), { email: u.email, name: u.name || u.email });
    });
    const mentionableUsers = Array.from(mentionableMap.values());
    res.status(200).json({
      csms: csms.map(u => ({ email: u.email, name: u.name || u.email })),
      resumeMakers: resumeMakers.map(u => ({ email: u.email, name: u.name || u.email })),
      linkedInMembers: linkedInMembers.map(u => ({ email: u.email, name: u.name || u.email })),
      teamLeads: teamLeads.map(u => ({ email: u.email, name: u.name || u.email })),
      admins: admins.map(u => ({ email: u.email, name: u.name || u.email })),
      mentionableUsers
    });
  } catch (e) {
    console.error('getOnboardingRoles:', e);
    res.status(500).json({ error: e.message || 'Failed to get onboarding roles' });
  }
}

export async function getNextResumeMakerApi(req, res) {
  try {
    const next = await getNextResumeMaker();
    res.status(200).json(next ? { email: next.email, name: next.name } : { email: null, name: null });
  } catch (e) {
    console.error('getNextResumeMakerApi:', e);
    res.status(500).json({ error: e.message || 'Failed to get next resume maker' });
  }
}

export async function getOnboardingNotifications(req, res) {
  try {
    const email = (req.user?.email || '').toLowerCase().trim();
    if (!email) return res.status(200).json({ notifications: [] });
    const notifications = await OnboardingNotificationModel.find({ userEmail: email })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.status(200).json({ notifications });
  } catch (e) {
    console.error('getOnboardingNotifications:', e);
    res.status(500).json({ error: e.message || 'Failed to get notifications' });
  }
}

export async function markOnboardingNotificationRead(req, res) {
  try {
    const { id } = req.params;
    const email = (req.user?.email || '').toLowerCase().trim();
    if (!email) return res.status(401).json({ error: 'Unauthorized' });
    const notification = await OnboardingNotificationModel.findOne({ _id: id, userEmail: email });
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    notification.read = true;
    await notification.save();
    res.status(200).json({ notification: notification.toObject() });
  } catch (e) {
    console.error('markOnboardingNotificationRead:', e);
    res.status(500).json({ error: e.message || 'Failed to mark read' });
  }
}

export async function resolveOnboardingComment(req, res) {
  try {
    const { id: jobId, commentId } = req.params;
    const userEmail = (req.user?.email || '').toLowerCase().trim();
    if (!userEmail) return res.status(401).json({ error: 'Unauthorized' });
    const job = await OnboardingJobModel.findById(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const comment = (job.comments || []).find(
      c => String(c._id) === commentId || String(c._id) === String(commentId)
    );
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    const taggedEmails = (comment.taggedUserIds || []).map(e => (e || '').toLowerCase().trim()).filter(Boolean);
    if (!taggedEmails.includes(userEmail)) {
      return res.status(403).json({ error: 'Only tagged users can mark this as resolved' });
    }
    const resolvedByTagged = comment.resolvedByTagged || [];
    if (resolvedByTagged.some(r => (r.email || '').toLowerCase() === userEmail)) {
      return res.status(200).json({ job: job.toObject(), alreadyResolved: true });
    }
    const commentIndex = job.comments.findIndex(
      c => String(c._id) === commentId || String(c._id) === String(commentId)
    );
    if (commentIndex < 0) return res.status(404).json({ error: 'Comment not found' });
    if (!job.comments[commentIndex].resolvedByTagged) {
      job.comments[commentIndex].resolvedByTagged = [];
    }
    job.comments[commentIndex].resolvedByTagged.push({
      email: userEmail,
      resolvedAt: new Date()
    });
    job.updatedAt = new Date();
    job.markModified('comments');
    await job.save();
    const updated = await OnboardingJobModel.findById(jobId).lean();
    res.status(200).json({ job: updated });
  } catch (e) {
    console.error('resolveOnboardingComment:', e);
    res.status(500).json({ error: e.message || 'Failed to mark as resolved' });
  }
}

export async function postOnboardingJobAttachment(req, res) {
  try {
    const { id } = req.params;
    const { url, filename, name } = req.body || {};
    if (!url || !filename) return res.status(400).json({ error: 'url and filename are required' });
    const job = await OnboardingJobModel.findById(id);
    if (!job) return res.status(404).json({ error: 'Onboarding job not found' });
    if (!job.attachments) job.attachments = [];
    job.attachments.push({
      url,
      filename,
      name: (name && String(name).trim()) || filename,
      uploadedAt: new Date(),
      uploadedBy: req.user?.email || ''
    });
    job.updatedAt = new Date();
    await job.save();
    res.status(201).json({ attachment: job.attachments[job.attachments.length - 1] });
  } catch (e) {
    console.error('postOnboardingJobAttachment:', e);
    res.status(500).json({ error: e.message || 'Failed to add attachment' });
  }
}
