import React from 'react';
import { User, ChevronRight, Loader2 } from 'lucide-react';
import { ProfileField } from './ProfileField';
import { fmtDate } from './utils';

/** Memoized Client Profile section - only re-renders when profile data/loading/expanded changes */
export const ClientProfileSection = React.memo(function ClientProfileSection({
  expanded,
  onToggle,
  profileData,
  loading,
  error,
  hasClientEmail,
  onFetchProfile
}) {
  const handleClick = React.useCallback(() => {
    const willShow = !expanded;
    onToggle(willShow);
    if (willShow && hasClientEmail) onFetchProfile?.();
  }, [expanded, onToggle, hasClientEmail, onFetchProfile]);

  const hasProfile = profileData && (profileData.firstName || profileData.lastName || profileData.email);

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={handleClick}
        className="w-full flex items-center justify-between py-3 px-4 text-left rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-100/80 hover:border-slate-300 transition-colors shadow-sm"
      >
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 flex-1 min-w-0">
          <User className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="flex-1 min-w-0">Client Profile</span>
          {hasProfile && (
            <span className="text-[10px] font-medium text-slate-500 bg-slate-200 px-2 py-0.5 rounded-md flex-shrink-0">
              Available
            </span>
          )}
          {loading && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary flex-shrink-0" />
          )}
        </h3>
        <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform duration-200 flex-shrink-0 ml-2 ${expanded ? 'rotate-90' : ''}`} />
      </button>
      {expanded && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden mt-2">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-slate-500">Loading profile...</p>
            </div>
          ) : !profileData ? (
            <div className="p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <User className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm text-slate-600 font-medium">{error || 'Profile not found'}</p>
              <p className="text-xs text-slate-400 mt-1">{error ? 'Try again in a moment.' : 'Client may not have completed their profile yet.'}</p>
            </div>
          ) : (
            <ClientProfileContent data={profileData} />
          )}
        </div>
      )}
    </div>
  );
});

/** Inner content - memoized to avoid re-renders when parent state changes but data is same */
const ClientProfileContent = React.memo(function ClientProfileContent({ data }) {
  const preferredRoles = Array.isArray(data.preferredRoles) ? data.preferredRoles.join(', ') : data.preferredRoles;
  const preferredLocations = Array.isArray(data.preferredLocations) ? data.preferredLocations.join(', ') : data.preferredLocations;
  const targetCompanies = Array.isArray(data.targetCompanies) ? data.targetCompanies.join(', ') : data.targetCompanies;
  const hasLinks = data.linkedinUrl || data.githubUrl || data.resumeUrl || data.coverLetterUrl || data.portfolioFileUrl;

  return (
    <div className="max-h-[420px] overflow-y-auto">
      <div className="p-5">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Personal</h4>
        <div className="grid grid-cols-2 gap-x-8 gap-y-0">
          <ProfileField label="First Name" value={data.firstName} />
          <ProfileField label="Last Name" value={data.lastName} />
          <ProfileField label="Email" value={data.email} className="col-span-2" />
          <ProfileField label="Contact" value={data.contactNumber} />
          <ProfileField label="DOB" value={fmtDate(data.dob)} />
          <ProfileField label="Visa Status" value={data.visaStatus} className="col-span-2" />
          <ProfileField label="Address" value={data.address} className="col-span-2" />
        </div>
      </div>
      <div className="p-5 border-t border-slate-100">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Education</h4>
        <div className="grid grid-cols-2 gap-x-8 gap-y-0">
          <ProfileField label="Bachelor's" value={data.bachelorsUniDegree} className="col-span-2" />
          <ProfileField label="Bachelor's GPA" value={data.bachelorsGPA} />
          <ProfileField label="Bachelor's End" value={data.bachelorsEndDate || fmtDate(data.bachelorsGradMonthYear)} />
          <ProfileField label="Master's" value={data.mastersUniDegree} className="col-span-2" />
          <ProfileField label="Master's GPA" value={data.mastersGPA} />
          <ProfileField label="Master's End" value={data.mastersEndDate || fmtDate(data.mastersGradMonthYear)} />
        </div>
      </div>
      <div className="p-5 border-t border-slate-100">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Professional</h4>
        <div className="grid grid-cols-2 gap-x-8 gap-y-0">
          <ProfileField label="Preferred Roles" value={preferredRoles} className="col-span-2" />
          <ProfileField label="Experience Level" value={data.experienceLevel} />
          <ProfileField label="Expected Salary" value={data.expectedSalaryRange} />
          <ProfileField label="Preferred Locations" value={preferredLocations} className="col-span-2" />
          <ProfileField label="Target Companies" value={targetCompanies} className="col-span-2" />
          <ProfileField label="Reason for Leaving" value={data.reasonForLeaving} className="col-span-2" />
        </div>
      </div>
      <div className="p-5 border-t border-slate-100">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Links & Documents</h4>
        <div className="flex flex-wrap gap-2">
          {data.linkedinUrl && (
            <a href={data.linkedinUrl.startsWith('http') ? data.linkedinUrl : `https://${data.linkedinUrl}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-primary/5 rounded-lg border border-primary/10 hover:bg-primary/10 hover:border-primary/20 transition-colors">LinkedIn</a>
          )}
          {data.githubUrl && (
            <a href={data.githubUrl.startsWith('http') ? data.githubUrl : `https://${data.githubUrl}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-primary/5 rounded-lg border border-primary/10 hover:bg-primary/10 hover:border-primary/20 transition-colors">GitHub</a>
          )}
          {data.resumeUrl && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg border border-slate-200">{data.resumeUrl}</span>
          )}
          {data.coverLetterUrl && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg border border-slate-200">{data.coverLetterUrl}</span>
          )}
          {data.portfolioFileUrl && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg border border-slate-200">{data.portfolioFileUrl}</span>
          )}
          {!hasLinks && <span className="text-sm text-slate-400">No links</span>}
        </div>
      </div>
      <div className="p-5 border-t border-slate-100">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Profile dates</h4>
        <div className="grid grid-cols-2 gap-x-8 gap-y-0">
          <ProfileField label="Created" value={fmtDate(data.createdAt, true)} />
          <ProfileField label="Updated" value={fmtDate(data.updatedAt, true)} />
        </div>
      </div>
    </div>
  );
});
