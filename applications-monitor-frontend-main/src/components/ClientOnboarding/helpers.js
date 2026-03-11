import {
  ONBOARDING_STATUSES,
  STATUS_LABELS,
  PLAN_STATUSES
} from '../../store/onboardingStore';

export function getVisibleColumns(user) {
  const role = user?.role || '';
  const roles = user?.roles || [];
  const subRole = user?.onboardingSubRole || '';
  if (role === 'admin' || role === 'csm' || roles.includes('csm')) return ONBOARDING_STATUSES;
  if (role === 'onboarding_team') {
    if (subRole === 'resume_maker') return ['resume_in_progress', 'resume_draft_done', 'resume_in_review', 'resume_approved'];
    if (subRole === 'linkedin_and_cover_letter_optimization') {
      return ['linkedin_in_progress', 'linkedin_done', 'cover_letter_in_progress', 'cover_letter_done'];
    }
  }
  if (['team_lead', 'operations_intern'].includes(role)) return ONBOARDING_STATUSES;
  return [];
}

export function clientDisplayName(jobOrNotif) {
  const n = jobOrNotif?.clientNumber;
  const name = jobOrNotif?.clientName || '';
  return n != null ? `${n} - ${name}` : name;
}

export function getAllowedStatusesForPlan(planType) {
  const normalizedPlan = (planType || 'default').toLowerCase();
  if (normalizedPlan === 'executive') return PLAN_STATUSES.executive;
  if (normalizedPlan === 'professional') return PLAN_STATUSES.professional;
  return PLAN_STATUSES.default;
}

export function getStatusColor(status) {
  if (!status) return 'bg-gray-50 text-gray-700 border-gray-100';
  if (status.includes('resume')) return 'bg-blue-50 text-blue-700 border-blue-100';
  if (status.includes('linkedin')) return 'bg-purple-50 text-purple-700 border-purple-100';
  if (status.includes('cover_letter')) return 'bg-indigo-50 text-indigo-700 border-indigo-100';
  if (status.includes('applications')) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (status === 'completed') return 'bg-green-50 text-green-700 border-green-100';
  return 'bg-gray-50 text-gray-700 border-gray-100';
}

export function getColumnAccent(status) {
  if (!status) return 'border-t-4 border-t-gray-300';
  if (status.includes('resume')) return 'border-t-4 border-t-blue-500';
  if (status.includes('linkedin')) return 'border-t-4 border-t-purple-500';
  if (status.includes('cover_letter')) return 'border-t-4 border-t-indigo-500';
  if (status.includes('applications')) return 'border-t-4 border-t-emerald-500';
  if (status === 'completed') return 'border-t-4 border-t-green-500';
  return 'border-t-4 border-t-gray-300';
}

export function getSortingNumber(job) {
  if (job.clientNumber != null) return job.clientNumber;
  const clientName = job.clientName || '';
  const match = clientName.match(/^(\d{4,})/);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    if (num >= 5000 && num < 6000) return num;
  }
  const fallbackMatch = clientName.match(/^(\d+)/);
  if (fallbackMatch && fallbackMatch[1]) return parseInt(fallbackMatch[1], 10);
  return 0;
}

export function convertToDMY(iso) {
  if (!iso) return '';
  const dt = new Date(iso);
  return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`;
}

// Parse @mentions from text
export function parseMentions(text, mentionableUsers) {
  const list = mentionableUsers || [];
  if (!list.length) return { taggedUserIds: [], taggedNames: [] };
  const seen = new Set();
  const taggedUserIds = [];
  const taggedNames = [];
  const match = text.match(/@([\w.-]+)/g);
  if (!match) return { taggedUserIds: [], taggedNames: [] };
  match.forEach((atTag) => {
    const handle = (atTag || '').slice(1).trim().toLowerCase();
    if (!handle) return;
    const user =
      list.find((u) => u.email && String(u.email).toLowerCase().split('@')[0] === handle) ||
      list.find(
        (u) =>
          (u.name && String(u.name).toLowerCase() === handle) ||
          (u.email && String(u.email).toLowerCase().startsWith(handle))
      );
    if (user && user.email && !seen.has(user.email.toLowerCase())) {
      seen.add(user.email.toLowerCase());
      taggedUserIds.push(user.email);
      taggedNames.push(user.name || user.email);
    }
  });
  return { taggedUserIds, taggedNames };
}

export function extractTextFromContentEditable(element) {
  if (!element) return '';
  const clone = element.cloneNode(true);
  const chips = clone.querySelectorAll('[data-mention-chip]');
  chips.forEach((chip) => {
    const email = chip.getAttribute('data-mention-email');
    const replacement = email ? `@${email.split('@')[0]} ` : (chip.textContent || '');
    chip.replaceWith(document.createTextNode(replacement));
  });
  return clone.textContent || clone.innerText || '';
}

export function findMentionUser(mentionText, mentionableUsers) {
  const handle = mentionText.replace('@', '').trim().toLowerCase();
  if (!handle) return null;
  return (
    mentionableUsers.find((u) => u.email && String(u.email).toLowerCase().split('@')[0] === handle) ||
    mentionableUsers.find(
      (u) =>
        (u.name && String(u.name).toLowerCase() === handle) ||
        (u.email && String(u.email).toLowerCase().startsWith(handle))
    )
  );
}

export function renderTextWithMentions(text, mentionableUsers, excludeStart = -1, excludeEnd = -1) {
  if (!text) return '';
  const parts = [];
  const mentionRegex = new RegExp('@([\\w.-]+)', 'g');
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    const mentionStart = match.index;
    const mentionEnd = match.index + match[0].length;

    if (excludeStart !== -1 && excludeEnd !== -1 && mentionStart < excludeEnd && mentionEnd > excludeStart) {
      if (mentionStart > lastIndex) {
        parts.push(text.slice(lastIndex, mentionStart).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
      }
      parts.push(match[0].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
      lastIndex = mentionEnd;
      continue;
    }

    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    }

    const user = findMentionUser(match[0], mentionableUsers);
    if (user) {
      const displayName = user.name || user.email || match[1];
      const initial = (displayName[0] || 'U').toUpperCase();
      parts.push(
        `<span data-mention-chip data-mention-email="${(user.email || '').replace(/"/g, '&quot;')}" contenteditable="false" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 text-sm font-medium">` +
        `<span class="w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">${initial}</span>` +
        `<span>@${displayName.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>` +
        `</span>`
      );
    } else {
      parts.push(match[0].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  }

  return parts.join('');
}
