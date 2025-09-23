import React, { useMemo, useState, useEffect, useRef } from "react";
import ClientDetails from "./ClientDetails";

const API_BASE = import.meta.env.VITE_API_URL;

// Validate required environment variables
if (!API_BASE) {
  console.error('❌ VITE_API_URL environment variable is required');
}

// ---------------- API ----------------
async function fetchAllJobs() {
  const res = await fetch(`${API_BASE}/`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json"
    },
    body: JSON.stringify({"name": "John Doe"}),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data.jobDB) ? data.jobDB : [];
}

// ---------------- Helpers ----------------
function parseFlexibleDate(input) {
  if (!input) return null;

  // Try dd/mm/yyyy format first
  const m = String(input).trim().match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i
  );

  if (m) {
    let [, d, mo, y, h = "0", mi = "0", s = "0", ap] = m;
    d = +d; mo = +mo - 1; y = +y; h = +h; mi = +mi; s = +s;
    if (ap) {
      const isPM = ap.toLowerCase() === "pm";
      if (h === 12) h = isPM ? 12 : 0;
      else if (isPM) h += 12;
    }
    return new Date(y, mo, d, h, mi, s);
  }

  // If input is already a Date or ISO string
  const native = new Date(input);
  return isNaN(native.getTime()) ? null : native;
}

function formatDate(dt) {
  if (!dt) return "—";
  return dt.toLocaleDateString("en-GB"); // forces dd/mm/yyyy
}

function formatDateTime(dt) {
  if (!dt) return "—";
  return dt.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}



function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getLastTimelineStatus(timeline = []) {
  if (!timeline.length) return null;
  const last = timeline[timeline.length - 1];
  if (typeof last === "string") return last.toLowerCase();
  if (last && typeof last === "object" && last.status)
    return String(last.status).toLowerCase();
  return null;
}

function isAppliedNow(job) {
  const current = String(job.currentStatus || "").toLowerCase();
  const last = getLastTimelineStatus(job.timeline);
  return current.includes("applied") && last && last.includes("applied");
}

function sortByUpdatedDesc(a, b) {
  const da = parseFlexibleDate(a.updatedAt || a.dateAdded);
  const db = parseFlexibleDate(b.updatedAt || b.dateAdded);
  const ta = da ? da.getTime() : 0;
  const tb = db ? db.getTime() : 0;
  return tb - ta;
}

function safeDate(job) {
  return parseFlexibleDate(job.updatedAt || job.dateAdded);
}

// Status mapping to standardize status names
function mapStatusToStandard(status) {
  const normalizedStatus = String(status || "").toLowerCase();
  
  // Handle statuses with "by user" or "by intern" suffixes
  if (normalizedStatus.includes('applied')) return 'applied';
  if (normalizedStatus.includes('saved')) return 'saved';
  if (normalizedStatus.includes('interviewing')) return 'interviewing';
  if (normalizedStatus.includes('rejected')) return 'rejected';
  if (normalizedStatus.includes('deleted')) return 'removed';
  if (normalizedStatus.includes('offer') || normalizedStatus.includes('hired')) return 'offers';
  if (normalizedStatus.includes('on-hold')) return 'interviewing';
  
  // Fallback to exact mapping for other statuses
  const statusMap = {
    'offer': 'offers',
    'hired': 'offers', // Treat hired as offers
    'on-hold': 'interviewing', // Treat on-hold as interviewing
    'deleted': 'removed', // Map deleted to removed
    'saved': 'saved',
    'applied': 'applied',
    'interviewing': 'interviewing',
    'rejected': 'rejected'
  };
  
  return statusMap[normalizedStatus] || normalizedStatus;
}

// Status counters: { saved: 5, applied: 10, interviewing: 4, offers: 2, rejected: 3, removed: 1 }
function getStatusCounts(jobs = []) {
  const counts = {};
  for (const j of jobs) {
    const s = mapStatusToStandard(j.currentStatus);
    counts[s] = (counts[s] || 0) + 1;
  }
  return counts;
}

// ---------------- UI ----------------
function ClientList({ clients = [], selected, onSelect }) {
  return (
    <div className="w-64 border-r border-slate-200 p-3">
      <h3 className="mb-2 text-base font-semibold text-slate-800">Clients</h3>
      <div className="flex flex-col gap-2">
        {clients.map((c) => (
          <button
            key={c}
            onClick={() => onSelect(c)}
            className={`w-full truncate rounded-lg border px-3 py-2 text-left transition ${
              selected === c
                ? "border-slate-300 bg-slate-100 font-semibold"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
            title={c}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatusBar({ counts = {}, dateAppliedCount = 0, filterDate, onStatusClick }) {
  // Always show common statuses, even if they have 0 counts
  const commonOrder = ["saved", "applied", "interviewing", "offers", "rejected", "removed"];
  
  // Create a complete status object with all common statuses, defaulting to 0
  const allStatuses = {};
  commonOrder.forEach(status => {
    allStatuses[status] = counts[status] || 0;
  });
  
  // Add any extra statuses that exist in counts but aren't in common order
  Object.keys(counts).forEach(status => {
    if (!commonOrder.includes(status)) {
      allStatuses[status] = counts[status];
    }
  });
  
  const keys = [
    ...commonOrder.filter((k) => allStatuses.hasOwnProperty(k)),
    ...Object.keys(allStatuses)
      .filter((k) => !commonOrder.includes(k))
      .sort(),
  ];
  
  return (
    <div className="sticky top-0 z-10 mb-3 w-full border border-slate-200 bg-white px-3 py-2 rounded-lg">
      <div className="flex flex-wrap items-center gap-2">
        {keys.length === 0 ? (
          <span className="text-xs text-slate-500">No jobs for this client.</span>
        ) : (
          keys.map((k) => {
            // Special handling for "applied" status when date is filtered
            const isAppliedWithDate = k === "applied" && filterDate && dateAppliedCount > 0;
            const displayCount = isAppliedWithDate ? dateAppliedCount : allStatuses[k];
            const title = isAppliedWithDate 
              ? `Applied on ${new Date(filterDate).toLocaleDateString('en-GB')}: ${dateAppliedCount} jobs`
              : `Click to view ${k} jobs`;
            
            return (
            <span
              key={k}
                className={`inline-flex items-center gap-1 rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-700 ${
                  onStatusClick ? 'cursor-pointer hover:bg-slate-50 hover:border-slate-400 transition-colors' : ''
                } ${isAppliedWithDate ? 'border-blue-300 bg-blue-50' : ''} ${allStatuses[k] === 0 ? 'opacity-60' : ''}`}
                title={title}
                onClick={onStatusClick ? () => onStatusClick(k) : undefined}
            >
              <span className="capitalize">{k}</span>
                <span className={`rounded px-1.5 ${isAppliedWithDate ? 'bg-blue-200 text-blue-800 font-semibold' : allStatuses[k] === 0 ? 'bg-slate-200 text-slate-500' : 'bg-slate-100'}`}>
                  {displayCount}
                </span>
                {isAppliedWithDate && (
                  <span className="text-xs text-blue-600 font-medium">
                    (on {new Date(filterDate).toLocaleDateString('en-GB')})
                  </span>
                )}
            </span>
            );
          })
        )}

      </div>
    </div>
  );
}

function JobCard({ job, onJobClick }) {
  return (
    <div
      onClick={() => onJobClick(job)}
      className="cursor-pointer rounded-xl border border-slate-200 p-3 hover:bg-slate-50 transition-colors"
    >
      <div className="font-semibold">{job.jobTitle || "Untitled Role"}</div>
      <div className="mt-0.5 text-sm text-slate-600">
        {job.companyName || "Company"}
      </div>
    </div>
  );
}

function JobDetailsModal({ job, isOpen, onClose }) {
  if (!isOpen || !job) return null;

  const dt = safeDate(job);
  const when = formatDateTime(dt);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-2xl font-bold text-slate-900">
            {job.jobTitle || "Untitled Role"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Job Details */}
          <div className="w-1/3 border-r border-slate-200 p-6 overflow-y-auto">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Company</h3>
                <p className="text-slate-900">{job.companyName || "Not specified"}</p>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Updated</h3>
                <p className="text-slate-900">{when}</p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Status</h3>
                <p className="text-slate-900 capitalize">{job.currentStatus || "Unknown"}</p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Job Link</h3>
                <a 
                  href={job.joblink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline break-all"
                >
                  {job.joblink || "Not available"}
                </a>
              </div>
            </div>
          </div>

          {/* Right Panel - Job Description */}
          <div className="flex-1 p-6 overflow-y-auto">
            <h3 className="text-lg font-semibold text-slate-700 mb-4">Job Description</h3>
            <div className="prose prose-sm max-w-none">
              {typeof job.jobDescription === "string" ? (
                <div className="whitespace-pre-wrap text-slate-700 leading-relaxed">
                  {job.jobDescription}
      </div>
              ) : (
                <div className="text-slate-500 italic">
                  No job description available
        </div>
      )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompactRow({ job }) {
  const dt = safeDate(job);
  const when = formatDate(dt);
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className="truncate text-sm font-semibold">
        {job.jobTitle || "Untitled Role"}
      </div>
      <div className="truncate text-xs text-slate-600">
        {(job.companyName || "Company") + " • " + when}
      </div>
    </div>
  );
}

function ClientCard({ client, clientDetails, onSelect }) {
  const details = clientDetails[client];
  const displayName = details?.name || client.split('@')[0];
  const initials = displayName.split(' ').map(n => n.charAt(0)).join('').toUpperCase() || client.charAt(0).toUpperCase();
  
  return (
    <button
      onClick={() => onSelect(client)}
      className="w-full p-4 border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all text-left"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
          <span className="text-blue-600 font-semibold text-sm">
            {initials}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-900 truncate">
            {displayName}
          </div>
          <div className="text-sm text-slate-500 truncate">
            {client}
          </div>
        </div>
      </div>
    </button>
  );
}

function ClientDetailsSection({ clientEmail, clientDetails, onClientUpdate, userRole = 'admin' }) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    dashboardTeamLeadName: '',
    dashboardInternName: '',
    planType: '',
    onboardingDate: '',
    jobDeadline: '',
    applicationStartDate: '',
    whatsappGroupMade: false,
    whatsappGroupMadeDate: '',
    dashboardCredentialsShared: false,
    dashboardCredentialsSharedDate: '',
    resumeSent: false,
    resumeSentDate: '',
    coverLetterSent: false,
    coverLetterSentDate: '',
    portfolioMade: false,
    portfolioMadeDate: '',
    linkedinOptimization: false,
    linkedinOptimizationDate: ''
  });

  // Update form data when clientDetails change
  useEffect(() => {
    if (clientDetails) {
      setFormData({
        name: clientDetails.name || '',
        dashboardTeamLeadName: clientDetails.dashboardTeamLeadName || '',
        dashboardInternName: clientDetails.dashboardInternName || '',
        planType: clientDetails.planType || '',
        onboardingDate: clientDetails.onboardingDate || '',
        jobDeadline: clientDetails.jobDeadline || '',
        applicationStartDate: clientDetails.applicationStartDate || '',
        whatsappGroupMade: clientDetails.whatsappGroupMade || false,
        whatsappGroupMadeDate: clientDetails.whatsappGroupMadeDate || '',
        dashboardCredentialsShared: clientDetails.dashboardCredentialsShared || false,
        dashboardCredentialsSharedDate: clientDetails.dashboardCredentialsSharedDate || '',
        resumeSent: clientDetails.resumeSent || false,
        resumeSentDate: clientDetails.resumeSentDate || '',
        coverLetterSent: clientDetails.coverLetterSent || false,
        coverLetterSentDate: clientDetails.coverLetterSentDate || '',
        portfolioMade: clientDetails.portfolioMade || false,
        portfolioMadeDate: clientDetails.portfolioMadeDate || '',
        linkedinOptimization: clientDetails.linkedinOptimization || false,
        linkedinOptimizationDate: clientDetails.linkedinOptimizationDate || ''
      });
    }
  }, [clientDetails]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: clientEmail,
          ...formData
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        // Update the client details in the parent component
        if (result.client) {
          // Call a callback to update the parent state
          if (typeof onClientUpdate === 'function') {
            onClientUpdate(clientEmail, result.client);
          }
        }
        setIsEditing(false);
      } else {
        console.error('Failed to save client details:', response.statusText);
        alert('Failed to save client details. Please try again.');
      }
    } catch (error) {
      console.error('Error saving client details:', error);
      alert('Error saving client details. Please try again.');
    }
  };

  const handleCancel = () => {
    // Reset form data to original values
    if (clientDetails) {
      setFormData({
        name: clientDetails.name || '',
        dashboardTeamLeadName: clientDetails.dashboardTeamLeadName || '',
        dashboardInternName: clientDetails.dashboardInternName || '',
        planType: clientDetails.planType || '',
        onboardingDate: clientDetails.onboardingDate || '',
        jobDeadline: clientDetails.jobDeadline || '',
        whatsappGroupMade: clientDetails.whatsappGroupMade || false,
        whatsappGroupMadeDate: clientDetails.whatsappGroupMadeDate || '',
        dashboardCredentialsShared: clientDetails.dashboardCredentialsShared || false,
        dashboardCredentialsSharedDate: clientDetails.dashboardCredentialsSharedDate || '',
        resumeSent: clientDetails.resumeSent || false,
        resumeSentDate: clientDetails.resumeSentDate || '',
        coverLetterSent: clientDetails.coverLetterSent || false,
        coverLetterSentDate: clientDetails.coverLetterSentDate || '',
        portfolioMade: clientDetails.portfolioMade || false,
        portfolioMadeDate: clientDetails.portfolioMadeDate || '',
        linkedinOptimization: clientDetails.linkedinOptimization || false,
        linkedinOptimizationDate: clientDetails.linkedinOptimizationDate || ''
      });
    }
    setIsEditing(false);
  };

  if (!clientDetails) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <div className="text-sm text-slate-600">
          <span className="font-medium">Client Details:</span> No profile information available. 
          <span className="text-blue-600 ml-1">Click "Personal Details" to add information.</span>
        </div>
      </div>
    );
  }

  const formatDate = (dateString) => {
    if (!dateString || dateString === "") return "Not set";
    try {
      // Handle different date formats
      let date;
      if (dateString.includes('/')) {
        // Handle format like "9/7/2025, 1:55:57 PM"
        date = new Date(dateString);
      } else if (dateString.includes('-')) {
        // Handle format like "2025-11-01"
        date = new Date(dateString);
      } else {
        // Try parsing as is
        date = new Date(dateString);
      }
      
      if (isNaN(date.getTime())) {
        return "Invalid date";
      }
      
      return date.toLocaleDateString('en-GB');
    } catch {
      return "Invalid date";
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-md">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">Client Information</h3>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 border border-green-600 rounded-lg hover:bg-green-700 transition-colors"
              >
                Save
              </button>
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            userRole === 'admin' ? (
              <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-colors"
              >
                Edit Details
              </button>
            ) : (
              <span className="px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-100 border border-slate-200 rounded-lg">
                View Only
              </span>
            )
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Team Lead</label>
          {isEditing ? (
            <input
              type="text"
              name="dashboardTeamLeadName"
              value={formData.dashboardTeamLeadName}
              onChange={handleInputChange}
              className="w-full mt-1 px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          ) : (
            <p className="text-sm text-slate-900 mt-1">
              {clientDetails.dashboardTeamLeadName || "Not specified"}
            </p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Intern Name</label>
          {isEditing ? (
            <input
              type="text"
              name="dashboardInternName"
              value={formData.dashboardInternName}
              onChange={handleInputChange}
              className="w-full mt-1 px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          ) : (
            <p className="text-sm text-slate-900 mt-1">
              {clientDetails.dashboardInternName || "Not specified"}
            </p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Plan Type</label>
          {isEditing ? (
            <select
              name="planType"
              value={formData.planType}
              onChange={handleInputChange}
              className="w-full mt-1 px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select Plan</option>
              <option value="ignite">Ignite</option>
              <option value="professional">Professional</option>
              <option value="executive">Executive</option>
            </select>
          ) : (
            <p className="text-sm text-slate-900 mt-1">
              {clientDetails.planType || "Not specified"}
            </p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Onboarding Date</label>
          {isEditing ? (
            <input
              type="date"
              name="onboardingDate"
              value={formData.onboardingDate}
              onChange={handleInputChange}
              className="w-full mt-1 px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          ) : (
            <p className="text-sm text-slate-900 mt-1">
              {formatDate(clientDetails.onboardingDate)}
            </p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Job Deadline</label>
          {isEditing ? (
            <input
              type="date"
              name="jobDeadline"
              value={formData.jobDeadline}
              onChange={handleInputChange}
              className="w-full mt-1 px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          ) : (
            <p className="text-sm text-slate-900 mt-1">
              {formatDate(clientDetails.jobDeadline)}
            </p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Application Start Date</label>
          {isEditing ? (
            <input
              type="date"
              name="applicationStartDate"
              value={formData.applicationStartDate}
              onChange={handleInputChange}
              className="w-full mt-1 px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          ) : (
            <p className="text-sm text-slate-900 mt-1">
              {formatDate(clientDetails.applicationStartDate)}
            </p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Client Name</label>
          {isEditing ? (
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className="w-full mt-1 px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          ) : (
            <p className="text-sm text-slate-900 mt-1">
              {clientDetails.name || clientEmail.split('@')[0]}
            </p>
          )}
        </div>
      </div>
      
      {/* Task Checklist Section */}
      <div className="mt-6 pt-4 border-t border-slate-200">
        <h4 className="text-sm font-semibold text-slate-700 mb-3">Task Checklist</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="flex flex-col space-y-1">
            <div className="flex items-center space-x-2">
              {isEditing ? (
                <input
                  type="checkbox"
                  name="whatsappGroupMade"
                  checked={formData.whatsappGroupMade}
                  onChange={handleInputChange}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
              ) : (
                <div className="w-3 h-3 rounded-full flex items-center justify-center">
                  {clientDetails.whatsappGroupMade ? (
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  ) : (
                    <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
                  )}
                </div>
              )}
              <span className="text-xs text-slate-600">WhatsApp Group</span>
            </div>
            {isEditing ? (
              <input
                type="date"
                name="whatsappGroupMadeDate"
                value={formData.whatsappGroupMadeDate}
                onChange={handleInputChange}
                className="text-xs px-2 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            ) : (
              <span className="text-xs text-slate-500 ml-5">
                {clientDetails.whatsappGroupMadeDate ? new Date(clientDetails.whatsappGroupMadeDate).toLocaleDateString('en-GB') : 'Not set'}
              </span>
            )}
          </div>
          
          <div className="flex flex-col space-y-1">
            <div className="flex items-center space-x-2">
              {isEditing ? (
                <input
                  type="checkbox"
                  name="dashboardCredentialsShared"
                  checked={formData.dashboardCredentialsShared}
                  onChange={handleInputChange}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
              ) : (
                <div className="w-3 h-3 rounded-full flex items-center justify-center">
                  {clientDetails.dashboardCredentialsShared ? (
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  ) : (
                    <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
                  )}
                </div>
              )}
              <span className="text-xs text-slate-600">Dashboard Credentials</span>
            </div>
            {isEditing ? (
              <input
                type="date"
                name="dashboardCredentialsSharedDate"
                value={formData.dashboardCredentialsSharedDate}
                onChange={handleInputChange}
                className="text-xs px-2 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            ) : (
              <span className="text-xs text-slate-500 ml-5">
                {clientDetails.dashboardCredentialsSharedDate ? new Date(clientDetails.dashboardCredentialsSharedDate).toLocaleDateString('en-GB') : 'Not set'}
              </span>
            )}
          </div>
          
          <div className="flex flex-col space-y-1">
            <div className="flex items-center space-x-2">
              {isEditing ? (
                <input
                  type="checkbox"
                  name="resumeSent"
                  checked={formData.resumeSent}
                  onChange={handleInputChange}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
              ) : (
                <div className="w-3 h-3 rounded-full flex items-center justify-center">
                  {clientDetails.resumeSent ? (
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  ) : (
                    <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
                  )}
                </div>
              )}
              <span className="text-xs text-slate-600">Resume Sent</span>
            </div>
            {isEditing ? (
              <input
                type="date"
                name="resumeSentDate"
                value={formData.resumeSentDate}
                onChange={handleInputChange}
                className="text-xs px-2 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            ) : (
              <span className="text-xs text-slate-500 ml-5">
                {clientDetails.resumeSentDate ? new Date(clientDetails.resumeSentDate).toLocaleDateString('en-GB') : 'Not set'}
              </span>
            )}
          </div>
          
          <div className="flex flex-col space-y-1">
            <div className="flex items-center space-x-2">
              {isEditing ? (
                <input
                  type="checkbox"
                  name="coverLetterSent"
                  checked={formData.coverLetterSent}
                  onChange={handleInputChange}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
              ) : (
                <div className="w-3 h-3 rounded-full flex items-center justify-center">
                  {clientDetails.coverLetterSent ? (
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  ) : (
                    <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
                  )}
                </div>
              )}
              <span className="text-xs text-slate-600">Cover Letter</span>
            </div>
            {isEditing ? (
              <input
                type="date"
                name="coverLetterSentDate"
                value={formData.coverLetterSentDate}
                onChange={handleInputChange}
                className="text-xs px-2 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            ) : (
              <span className="text-xs text-slate-500 ml-5">
                {clientDetails.coverLetterSentDate ? new Date(clientDetails.coverLetterSentDate).toLocaleDateString('en-GB') : 'Not set'}
              </span>
            )}
          </div>
          
          <div className="flex flex-col space-y-1">
            <div className="flex items-center space-x-2">
              {isEditing ? (
                <input
                  type="checkbox"
                  name="portfolioMade"
                  checked={formData.portfolioMade}
                  onChange={handleInputChange}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
              ) : (
                <div className="w-3 h-3 rounded-full flex items-center justify-center">
                  {clientDetails.portfolioMade ? (
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  ) : (
                    <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
                  )}
                </div>
              )}
              <span className="text-xs text-slate-600">Portfolio Made</span>
            </div>
            {isEditing ? (
              <input
                type="date"
                name="portfolioMadeDate"
                value={formData.portfolioMadeDate}
                onChange={handleInputChange}
                className="text-xs px-2 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            ) : (
              <span className="text-xs text-slate-500 ml-5">
                {clientDetails.portfolioMadeDate ? new Date(clientDetails.portfolioMadeDate).toLocaleDateString('en-GB') : 'Not set'}
              </span>
            )}
          </div>
          
          <div className="flex flex-col space-y-1">
            <div className="flex items-center space-x-2">
              {isEditing ? (
                <input
                  type="checkbox"
                  name="linkedinOptimization"
                  checked={formData.linkedinOptimization}
                  onChange={handleInputChange}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
              ) : (
                <div className="w-3 h-3 rounded-full flex items-center justify-center">
                  {clientDetails.linkedinOptimization ? (
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  ) : (
                    <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
                  )}
                </div>
              )}
              <span className="text-xs text-slate-600">LinkedIn Optimization</span>
            </div>
            {isEditing ? (
              <input
                type="date"
                name="linkedinOptimizationDate"
                value={formData.linkedinOptimizationDate}
                onChange={handleInputChange}
                className="text-xs px-2 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            ) : (
              <span className="text-xs text-slate-500 ml-5">
                {clientDetails.linkedinOptimizationDate ? new Date(clientDetails.linkedinOptimizationDate).toLocaleDateString('en-GB') : 'Not set'}
              </span>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

function RightAppliedColumn({ jobs = [], title = "Applied" }) {
  const sorted = useMemo(() => [...jobs].sort(sortByUpdatedDesc), [jobs]);
  return (
    <div className="w-64 border-l border-slate-200 p-3 bg-white shadow-sm">
      <h3 className="mb-2 text-base font-semibold text-slate-800">
        {title} <span className="text-slate-500">({sorted.length})</span>
      </h3>
      <div className="flex max-h-[calc(100vh-10rem)] flex-col gap-2 overflow-y-auto">
        {sorted.map((j) => (
          <CompactRow key={j._id || j.jobID || `${j.userID}-${j.joblink}`} job={j} />
        ))}
      </div>
    </div>
  );
}

// ---------------- Main Component ----------------
export default function Monitor({ onClose, userRole = 'admin' }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [filterDate, setFilterDate] = useState(""); // yyyy-mm-dd
  const [showClients, setShowClients] = useState(true);
  const [showClientDetails, setShowClientDetails] = useState(false);
  const [clientDetailsEmail, setClientDetailsEmail] = useState('');
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [showJobDetails, setShowJobDetails] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [clientDetails, setClientDetails] = useState({});

  // In-memory caches (TTL-based) for jobs and clients
  const cacheRef = useRef({
    jobs: { data: null, ts: 0 },
    clients: { data: null, ts: 0 },
    jobDescriptions: {} // { [id]: { text, ts } }
  });
  const CACHE_TTL_MS = 60 * 1000; // 1 minute TTL
  const JD_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  const getJobId = (job) => job?._id || job?.jobID;

  const fetchJobDescriptionById = async (id) => {
    const res = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`JD API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data?.job?.jobDescription || '';
  };

  const ensureJobDescription = async (job) => {
    const id = getJobId(job);
    if (!id) return '';
    const now = Date.now();
    const entry = cacheRef.current.jobDescriptions[id];
    if (entry && now - entry.ts < JD_CACHE_TTL_MS) {
      return entry.text;
    }
    try {
      const text = await fetchJobDescriptionById(id);
      cacheRef.current.jobDescriptions[id] = { text, ts: now };
      return text;
    } catch (e) {
      console.warn('Failed to fetch job description:', e);
      return '';
    }
  };

  // (Auth removed)

  // Fetch client details
  const fetchClientDetails = async (email) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8086'}/api/clients/${encodeURIComponent(email)}`);
      if (response.ok) {
        const data = await response.json();
        return data.client;
      } else {
        console.error('Failed to fetch client details:', response.status);
      }
    } catch (error) {
      console.error('Error fetching client details:', error);
    }
    return null;
  };

  // Update client details in state
  const handleClientUpdate = (email, updatedClient) => {
    setClientDetails(prev => ({
      ...prev,
      [email]: updatedClient
    }));
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        
        // First, sync missing clients from jobs to dashboardtrackings
        try {
          const syncResponse = await fetch(`${API_BASE}/api/clients/sync-from-jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          if (syncResponse.ok) {
            const syncData = await syncResponse.json();
            // Sync completed successfully
          }
        } catch (syncError) {
          console.warn('Client sync failed (non-critical):', syncError);
        }

        const now = Date.now();
        // Jobs: serve from cache if fresh
        if (cacheRef.current.jobs.data && now - cacheRef.current.jobs.ts < CACHE_TTL_MS) {
          setJobs(cacheRef.current.jobs.data);
        } else {
          const data = await fetchAllJobs();
          cacheRef.current.jobs = { data, ts: now };
          setJobs(data);
        }

        // Clients: serve from cache if fresh
        if (cacheRef.current.clients.data && now - cacheRef.current.clients.ts < CACHE_TTL_MS) {
          setClientDetails(cacheRef.current.clients.data);
        } else {
          const clientsResponse = await fetch(`${API_BASE}/api/clients`);
          if (clientsResponse.ok) {
            const clientsData = await clientsResponse.json();
            const clientDetailsMap = {};
            clientsData.clients.forEach(client => {
              clientDetailsMap[client.email] = client;
            });
            cacheRef.current.clients = { data: clientDetailsMap, ts: now };
            setClientDetails(clientDetailsMap);
          } else {
            setErr("Failed to fetch client data");
          }
        }
      } catch (e) {
        setErr(e.message || "Failed to fetch");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Left column: clients - get clients that actually have jobs
  const clients = useMemo(() => {
    // Get all clients that have jobs from the jobs data
    const clientsWithJobs = new Set();
    jobs.forEach((j) => {
      // Only add valid email addresses as clients
      if (j.userID && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(j.userID)) {
        clientsWithJobs.add(j.userID);
      }
    });
    const clientsList = [...clientsWithJobs];
    return clientsList;
  }, [jobs]);

  // Removed auto-selection - user will manually select from client cards

  const clientJobs = useMemo(() => {
    if (!selectedClient) return [];
    const filteredJobs = jobs.filter((j) => {
      // Only include jobs with valid userID and matching selected client
      return j.userID === selectedClient && 
             j.userID && 
             /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(j.userID);
    });
    return filteredJobs;
  }, [jobs, selectedClient]);

  const statusCounts = useMemo(() => getStatusCounts(clientJobs), [clientJobs]);

  // Applied jobs for selected client (used in both middle & right)
  const appliedJobs = useMemo(() => {
    return clientJobs.filter(isAppliedNow).sort(sortByUpdatedDesc);
  }, [clientJobs]);

  // Middle column: date-filtered applied jobs (for the selected date)
  const dateFilteredJobs = useMemo(() => {
    if (!filterDate) return [];
    const target = new Date(filterDate);
    return appliedJobs.filter((job) => {
      const dt = safeDate(job);
      return dt && sameDay(dt, target);
    });
  }, [appliedJobs, filterDate]);

  const dateAppliedCount = dateFilteredJobs.length;

  // Helper function to calculate working days (excluding Sundays)
  const calculateWorkingDays = (startDate, endDate) => {
    let workingDays = 0;
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      // Get day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
      const dayOfWeek = currentDate.getDay();
      
      // Count only Monday (1) to Saturday (6), exclude Sunday (0)
      if (dayOfWeek >= 1 && dayOfWeek <= 6) {
        workingDays++;
      }
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return workingDays;
  };

  // Calculate daily target metrics
  const calculateDailyTarget = useMemo(() => {
    if (!selectedClient || !filterDate) return null;
    
    const clientDetail = clientDetails[selectedClient];
    if (!clientDetail || !clientDetail.applicationStartDate) return null;
    
    try {
      // Parse dates
      const startDate = new Date(clientDetail.applicationStartDate);
      const endDate = new Date(filterDate);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
      
      // Calculate working days passed (excluding Sundays)
      const workingDaysPassed = calculateWorkingDays(startDate, endDate);
      
      if (workingDaysPassed < 0) return null; // Future date
      
      // Daily target is 35 applications per day
      const dailyTarget = 35;
      const expectedApplications = workingDaysPassed * dailyTarget;
      
      // Count actual applications in the period
      const actualApplications = jobs.filter(job => {
        if (job.userID !== selectedClient) return false;
        
        // Check if job was applied in the period
        const jobDate = safeDate(job);
        if (!jobDate) return false;
        
        return jobDate >= startDate && jobDate <= endDate && 
               isAppliedNow(job);
      }).length;
      
      return {
        daysPassed: workingDaysPassed,
        expectedApplications,
        actualApplications,
        dailyTarget
      };
    } catch (error) {
      console.error('Error calculating daily target:', error);
      return null;
    }
  }, [selectedClient, filterDate, clientDetails, jobs]);

  // Filter clients based on search term
  const filteredClients = useMemo(() => {
    if (!clientSearchTerm) return clients;
    return clients.filter(client => 
      client.toLowerCase().includes(clientSearchTerm.toLowerCase())
    );
  }, [clients, clientSearchTerm]);

  // Right sidebar: jobs filtered by selected status
  const statusFilteredJobs = useMemo(() => {
    if (!selectedStatus) return [];
    try {
      return clientJobs.filter((job) => {
        const current = String(job.currentStatus || "").toLowerCase();
        const last = getLastTimelineStatus(job.timeline || []);
        const status = current || last || "unknown";
        const mappedStatus = mapStatusToStandard(status);
        return mappedStatus === selectedStatus;
      }).sort(sortByUpdatedDesc);
    } catch (error) {
      console.error('Error filtering jobs by status:', error);
      return [];
    }
  }, [clientJobs, selectedStatus]);

  const handleCloseClientDetails = () => {
    setShowClientDetails(false);
    setClientDetailsEmail('');
  };

  if (showClientDetails) {
  return (
      <ClientDetails 
        clientEmail={clientDetailsEmail} 
        onClose={handleCloseClientDetails}
        userRole={userRole}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      {/* Top Right Buttons */}
      <div className="absolute top-4 right-4 z-30 flex gap-2" />
      
      <div className="flex min-h-[calc(100vh-2rem)] rounded-xl border border-slate-200 bg-white shadow-lg relative">
      {/* Left: Clients Button - Sliding Panel */}
      <div className={`${leftPanelOpen ? 'w-64' : 'w-0'} transition-all duration-300 overflow-hidden border-r border-slate-200 bg-blue-50`}>
        <div className="w-64 p-3">
          <button
            onClick={() => setShowClients(true)}
            className="w-full p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Clients
          </button>
        </div>
      </div>

      {/* Toggle Button */}
      <button
        onClick={() => {
          if (!leftPanelOpen) {
            // Opening panel - show client selection
            setLeftPanelOpen(true);
            setShowClients(true);
          } else {
            // Closing panel
            setLeftPanelOpen(false);
          }
        }}
        className={`absolute top-4 ${leftPanelOpen ? 'left-60' : 'left-4'} z-20 w-8 h-8 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-all duration-300 flex items-center justify-center shadow-lg border-2 border-white`}
      >
        <svg 
          className={`w-4 h-4 transition-transform duration-300 ${leftPanelOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Middle: Content Area */}
      <div className="flex-1 overflow-auto border-r border-slate-200 p-4 bg-slate-50">
        
        {loading && <div className="text-slate-700">Loading…</div>}
        {!loading && err && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <div className="text-red-600 font-semibold mb-2">Error: {err}</div>
          </div>
        )}

        {!loading && !err && showClients && (
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Select a Client</h2>
            
            {/* Search Bar */}
            <div className="mb-6">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search clients..."
                  value={clientSearchTerm}
                  onChange={(e) => setClientSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 pl-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <svg 
                  className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Client Cards Grid */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredClients.map((client) => (
                <ClientCard 
                  key={client} 
                  client={client} 
                  clientDetails={clientDetails}
                  onSelect={(client) => {
                    setSelectedClient(client);
                    setShowClients(false);
                    setLeftPanelOpen(false); // Auto-close left panel when client is selected
                  }} 
                />
              ))}
            </div>
          </div>
        )}

        {!loading && !err && selectedClient && !showClients && (
          <>
            {/* Header Section - Job Applications Title */}
            <div className="mb-6">
              {/* Title and Personal Details Row */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex-1 text-center">
                  <h1 className="text-3xl font-bold text-slate-900">
                    Job Applications for <span className="text-blue-600">{selectedClient}</span>
                  </h1>
                </div>
                <button
                  onClick={() => {
                    setShowClientDetails(true);
                    setClientDetailsEmail(selectedClient);
                  }}
                  className="group flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 font-medium shadow-sm"
                >
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <span>Personal Details</span>
                  <svg className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Status bar */}
            <div className="ml-8 mb-6">
            <StatusBar
              counts={statusCounts}
              dateAppliedCount={dateAppliedCount}
              filterDate={filterDate}
                onStatusClick={(status) => {
                  // Toggle functionality: if same status is clicked, close panel
                  if (selectedStatus === status && rightSidebarOpen) {
                    setRightSidebarOpen(false);
                    setSelectedStatus(null);
                  } else {
                    setSelectedStatus(status);
                    setRightSidebarOpen(true);
                  }
                }}
              />
            </div>

            {/* Client Details Section */}
            <div className="ml-8 mb-6">
              <ClientDetailsSection 
                clientEmail={selectedClient}
                clientDetails={clientDetails[selectedClient]}
                onClientUpdate={handleClientUpdate}
                userRole={userRole}
              />
            </div>

            {/* Date Filter Row */}
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-slate-700">Filter by date:</label>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {filterDate && (
                <>
                <button
                  onClick={() => setFilterDate("")}
                    className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Clear
                </button>
                  <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg">
                    <span className="text-sm font-medium text-blue-800">
                      Applied on {new Date(filterDate).toLocaleDateString('en-GB')}:
                    </span>
                    <span className="text-sm font-bold text-blue-900 bg-blue-200 px-2 py-0.5 rounded">
                      {dateAppliedCount}
                    </span>
                  </div>
                  {calculateDailyTarget && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-green-50 border border-green-200 rounded-lg">
                      <span className="text-sm font-medium text-green-800">
                        Expected: {calculateDailyTarget.expectedApplications} | 
                        Applied: {calculateDailyTarget.actualApplications} | 
                        Working Days: {calculateDailyTarget.daysPassed}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            {!filterDate && (
              <div className="text-slate-600">
                Pick a date to see jobs applied on that day.
              </div>
            )}

            {filterDate && dateFilteredJobs.length === 0 && (
              <div className="text-slate-600">
                No applied jobs for the selected date.
              </div>
            )}

            {filterDate && dateFilteredJobs.length > 0 && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {dateFilteredJobs.map((job) => (
                  <JobCard 
                    key={job._id || job.jobID || `${job.userID}-${job.joblink}`} 
                    job={job} 
                    onJobClick={async (job) => {
                      setSelectedJob(job);
                      setShowJobDetails(true);
                      const desc = await ensureJobDescription(job);
                      setSelectedJob(prev => prev ? { ...prev, jobDescription: desc } : prev);
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Right: Jobs filtered by selected status */}
      {selectedClient && !showClients && rightSidebarOpen && (
        <div className="bg-blue-50">
          <RightAppliedColumn 
            jobs={selectedStatus ? statusFilteredJobs : appliedJobs} 
            title={selectedStatus ? selectedStatus.charAt(0).toUpperCase() + selectedStatus.slice(1) : "Applied"}
          />
        </div>
      )}
      {/* Job Details Modal */}
      <JobDetailsModal 
        job={selectedJob}
        isOpen={showJobDetails}
        onClose={() => {
          setShowJobDetails(false);
          setSelectedJob(null);
        }}
      />
      </div>
    </div>
  );
}
