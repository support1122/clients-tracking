import { OnboardingJobModel, ONBOARDING_STATUSES_LIST } from '../OnboardingJobModel.js';
import { OnboardingJobCounterModel } from '../OnboardingJobCounterModel.js';
import { OnboardingNotificationModel } from '../OnboardingNotificationModel.js';
import { UserModel } from '../UserModel.js';

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
  const nextResume = await getNextResumeMaker();
  const doc = {
    jobNumber,
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

export async function listOnboardingJobs(req, res) {
  try {
    const { status } = req.query || {};
    const filter = {};
    if (status && ONBOARDING_STATUSES_LIST.includes(status)) filter.status = status;
    const jobs = await OnboardingJobModel.find(filter)
      .sort({ jobNumber: 1 })
      .lean();
    const maskCredentials = (job) => {
      if (!job.dashboardCredentials) return job;
      const creds = { ...job.dashboardCredentials };
      if (creds.password) creds.password = '********';
      return { ...job, dashboardCredentials: creds };
    };
    res.status(200).json({ jobs: jobs.map(maskCredentials) });
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
      const professionalStatuses = ['resume_in_progress', 'resume_draft_done', 'resume_in_review', 'resume_approved', 'linkedin_in_progress', 'linkedin_done'];
      const defaultStatuses = ['resume_in_progress', 'resume_draft_done', 'resume_in_review', 'resume_approved'];
      
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
            const notifications = linkedInTeam.map(user => ({
              userEmail: (user.email || '').toLowerCase().trim(),
              jobId: job._id,
              jobNumber: job.jobNumber,
              clientName: job.clientName || '',
              commentSnippet: `LinkedIn phase started: ${job.clientName}`,
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
        const notifications = taggedUserIds.map(email => ({
          userEmail: (email || '').toLowerCase().trim(),
          jobId: job._id,
          jobNumber: job.jobNumber,
          clientName: job.clientName || '',
          commentSnippet,
          authorEmail,
          authorName,
          read: false
        })).filter(n => n.userEmail);
        if (notifications.length) {
          await OnboardingNotificationModel.insertMany(notifications).catch(err => console.error('OnboardingNotification insert:', err));
        }
      }
    } else {
      job.updatedAt = new Date();
      await job.save();
    }

    const updated = await OnboardingJobModel.findById(id).lean();
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
        const notifications = csms.map(csm => ({
          userEmail: (csm.email || '').toLowerCase().trim(),
          jobId: job._id,
          jobNumber: job.jobNumber,
          clientName: job.clientName || '',
          commentSnippet: `New client ticket created: ${job.clientName}`,
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
    const admins = users.filter(u => u.role === 'admin');
    const onboardingTeam = users.filter(u => u.role === 'onboarding_team');
    const mentionableMap = new Map();
    // Include Admins, CSMs, onboarding team, and team leads in mentionable users
    [...admins, ...csms, ...onboardingTeam, ...teamLeads].forEach(u => {
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

export async function postOnboardingJobAttachment(req, res) {
  try {
    const { id } = req.params;
    const { url, filename } = req.body || {};
    if (!url || !filename) return res.status(400).json({ error: 'url and filename are required' });
    const job = await OnboardingJobModel.findById(id);
    if (!job) return res.status(404).json({ error: 'Onboarding job not found' });
    if (!job.attachments) job.attachments = [];
    job.attachments.push({
      url,
      filename,
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
