import React, { useState, useEffect, useRef } from 'react';
import Layout from './Layout';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Calendar,
  Lock,
  Save,
  Edit2,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  X,
  FileText,
  Upload,
  Paperclip,
  ExternalLink,
  Linkedin,
  FileCheck
} from 'lucide-react';
import { hasLinkedInOptimization, hasCoverLetter, planFeatureLabel, totalOptimizationsInPlan, completedOptimizationsInPlan } from '../utils/planFeatures';

const API_BASE = import.meta.env.VITE_BASE || 'https://clients-tracking-backend.onrender.com';
const FLASHFIRE_API = import.meta.env.VITE_FLASHFIRE_API_BASE_URL || 'https://dashboard-api.flashfirejobs.com';

function parseFlexibleDate(input) {
  if (!input) return null;

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

  const native = new Date(input);
  return isNaN(native.getTime()) ? null : native;
}

function formatRelativeTime(dateInput) {
  if (!dateInput) return "—";
  
  const date = parseFlexibleDate(dateInput);
  if (!date || isNaN(date.getTime())) return "—";
  
  const now = new Date();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);
  
  if (diffSeconds < 60) {
    return diffSeconds <= 0 ? "just now" : `${diffSeconds} second${diffSeconds === 1 ? '' : 's'} ago`;
  }
  
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }
  
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }
  
  if (diffDays < 30) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }
  
  if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
  }
  
  return `${diffYears} year${diffYears === 1 ? '' : 's'} ago`;
}

const getDefaultOptimizations = () => ({
  resumeOptimization: { completed: false, attachmentUrl: "", attachmentName: "" },
  linkedinOptimization: { completed: false, attachmentUrl: "", attachmentName: "" },
  coverLetterOptimization: { completed: false, attachmentUrl: "", attachmentName: "" }
});

function AttachmentModal({ isOpen, onClose, client, onSave, onUpload }) {
  const [optimizations, setOptimizations] = useState(getDefaultOptimizations());
  const [uploading, setUploading] = useState({ resume: false, linkedin: false, coverLetter: false });
  const [saving, setSaving] = useState(false);
  const [dashboardDocs, setDashboardDocs] = useState(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const fileInputRefs = {
    resume: useRef(null),
    linkedin: useRef(null),
    coverLetter: useRef(null)
  };

  useEffect(() => {
    if (client && client.optimizations) {
      setOptimizations({
        resumeOptimization: client.optimizations.resumeOptimization || getDefaultOptimizations().resumeOptimization,
        linkedinOptimization: client.optimizations.linkedinOptimization || getDefaultOptimizations().linkedinOptimization,
        coverLetterOptimization: client.optimizations.coverLetterOptimization || getDefaultOptimizations().coverLetterOptimization
      });
    } else {
      setOptimizations(getDefaultOptimizations());
    }
  }, [client]);

  useEffect(() => {
    if (isOpen && client?.email) {
      fetchDashboardDocuments();
    }
  }, [isOpen, client?.email]);

  const fetchDashboardDocuments = async () => {
    if (!client?.email) return;
    setLoadingDocs(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/api/client-optimizations/documents/${encodeURIComponent(client.email)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setDashboardDocs(data);
      }
    } catch (error) {
      console.error('Error fetching dashboard documents:', error);
    } finally {
      setLoadingDocs(false);
    }
  };

  if (!isOpen || !client) return null;

  const handleToggle = (type) => {
    const current = optimizations[type];
    const hasAttachment = current?.attachmentUrl && current.attachmentUrl.trim() !== '';
    
    setOptimizations(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        completed: !hasAttachment,
        attachmentUrl: hasAttachment ? '' : 'linkedin-optimized',
        attachmentName: hasAttachment ? '' : ''
      }
    }));
  };

  const handleFileUpload = async (type, file) => {
    if (!file) return;

    const uploadKey = type === 'resumeOptimization' ? 'resume' : 
                      type === 'linkedinOptimization' ? 'linkedin' : 'coverLetter';
    
    const documentType = type === 'resumeOptimization' ? 'resume' : 
                         type === 'coverLetterOptimization' ? 'coverLetter' : 'resume';
    
    setUploading(prev => ({ ...prev, [uploadKey]: true }));

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('email', client.email);
      formData.append('documentType', documentType);

      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/api/client-optimizations/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        setOptimizations(prev => ({
          ...prev,
          [type]: {
            ...prev[type],
            attachmentUrl: data.url,
            attachmentName: data.fileName || file.name,
            completed: true
          }
        }));
        toast.success(`${file.name} uploaded and synced to dashboard`);
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload file');
    } finally {
      setUploading(prev => ({ ...prev, [uploadKey]: false }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(client.email, optimizations);
      onClose();
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setSaving(false);
    }
  };

  const optimizationItems = [
    {
      key: 'resumeOptimization',
      label: 'Resume Optimization',
      icon: FileText,
      uploadKey: 'resume',
      color: 'blue'
    },
    {
      key: 'linkedinOptimization',
      label: 'LinkedIn Optimization',
      icon: Linkedin,
      uploadKey: 'linkedin',
      color: 'sky'
    },
    {
      key: 'coverLetterOptimization',
      label: 'Cover Letter Optimization',
      icon: FileCheck,
      uploadKey: 'coverLetter',
      color: 'purple'
    }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Client Optimizations</h2>
              <p className="text-indigo-100 text-sm">{client.name} ({client.email})</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {loadingDocs && (
            <div className="flex items-center justify-center py-4">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
              <span className="text-sm text-gray-500">Loading dashboard documents...</span>
            </div>
          )}

          {dashboardDocs && (dashboardDocs.resumeUrl || dashboardDocs.coverLetterUrl || dashboardDocs.linkedinUrl) && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
              <h4 className="text-sm font-semibold text-blue-800 mb-2">Documents on Dashboard</h4>
              <div className="space-y-2 text-sm">
                {dashboardDocs.resumeUrl && (
                  <a href={dashboardDocs.resumeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline">
                    <FileText className="w-4 h-4" /> Base Resume <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {dashboardDocs.coverLetterUrl && (
                  <a href={dashboardDocs.coverLetterUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline">
                    <FileCheck className="w-4 h-4" /> Cover Letter <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {dashboardDocs.linkedinUrl && (
                  <a href={dashboardDocs.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline">
                    <Linkedin className="w-4 h-4" /> LinkedIn Profile <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          )}

          {optimizationItems.map(({ key, label, icon: Icon, uploadKey, color }) => {
            const hasAttachment = optimizations[key]?.attachmentUrl && optimizations[key].attachmentUrl.trim() !== '';
            const linkedinDisabled = key === 'linkedinOptimization' && !hasLinkedInOptimization(client?.planType);
            const coverLetterDisabled = key === 'coverLetterOptimization' && !hasCoverLetter(client?.planType);
            const notInPlan = linkedinDisabled || coverLetterDisabled;
            const planTooltip = linkedinDisabled ? planFeatureLabel('linkedin') : coverLetterDisabled ? planFeatureLabel('coverLetter') : '';
            return (
              <div 
                key={key}
                className={`border rounded-xl p-4 transition-all ${
                  notInPlan
                    ? 'border-gray-200 bg-gray-100 opacity-75'
                    : hasAttachment 
                      ? 'border-green-300 bg-green-50' 
                      : 'border-red-300 bg-red-50'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      notInPlan ? 'bg-gray-200 text-gray-500' :
                      hasAttachment 
                        ? 'bg-green-100 text-green-600' 
                        : 'bg-red-100 text-red-600'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <span className={`font-medium ${notInPlan ? 'text-gray-500' : 'text-gray-800'}`}>{label}</span>
                      {notInPlan && (
                        <p className="text-xs text-gray-500 mt-0.5" title={planTooltip}>Not in plan</p>
                      )}
                      {!notInPlan && !hasAttachment && (
                        <p className="text-xs text-red-500">No attachment - upload required</p>
                      )}
                    </div>
                  </div>
                  {notInPlan ? (
                    <Lock className="w-5 h-5 text-gray-400" title={planTooltip} />
                  ) : hasAttachment ? (
                    <CheckCircle2 className="w-6 h-6 text-green-500" />
                  ) : (
                    <Circle className="w-6 h-6 text-red-400" />
                  )}
                </div>

                {!notInPlan && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="file"
                      ref={fileInputRefs[uploadKey]}
                      onChange={(e) => handleFileUpload(key, e.target.files[0])}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.txt"
                    />
                    {key !== 'linkedinOptimization' ? (
                      <button
                        onClick={() => fileInputRefs[uploadKey].current?.click()}
                        disabled={uploading[uploadKey]}
                        className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 ${
                          hasAttachment 
                            ? 'bg-white border border-gray-300 hover:bg-gray-50' 
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                      >
                        {uploading[uploadKey] ? (
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        {uploading[uploadKey] ? 'Uploading...' : hasAttachment ? 'Replace File' : 'Upload & Sync to Dashboard'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleToggle(key)}
                        className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                          hasAttachment 
                            ? 'bg-white border border-gray-300 hover:bg-gray-50' 
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                      >
                        {hasAttachment ? 'Mark Incomplete' : 'Mark as Done'}
                      </button>
                    )}

                    {hasAttachment && optimizations[key]?.attachmentUrl && (
                      <a
                        href={optimizations[key].attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                      >
                        <Paperclip className="w-4 h-4" />
                        {optimizations[key].attachmentName || 'View File'}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OptimizationBadge({ optimization, label, icon: Icon, disabledByPlan, planTooltip }) {
  const hasAttachment = optimization?.attachmentUrl && optimization.attachmentUrl.trim() !== '';
  const isCompleted = hasAttachment;
  
  if (disabledByPlan) {
    return (
      <div 
        className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200 opacity-80"
        title={planTooltip || `${label} not in plan`}
      >
        <Lock className="w-3 h-3" />
        <span className="hidden xl:inline">{label}</span>
      </div>
    );
  }
  
  return (
    <div 
      className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-all ${
        isCompleted 
          ? 'bg-green-100 text-green-700 border border-green-200' 
          : 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
      }`}
      title={`${label}: ${isCompleted ? 'Completed' : 'Pending - Click to upload'}`}
    >
      {isCompleted ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : (
        <Circle className="w-3 h-3" />
      )}
      <span className="hidden xl:inline">{label}</span>
    </div>
  );
}

export default function ClientPreferences() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [editingClient, setEditingClient] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [pendingUpdates, setPendingUpdates] = useState(new Map());
  const [attachmentModalClient, setAttachmentModalClient] = useState(null);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/api/client-todos/all`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to load clients');
      const data = await response.json();

      if (data.success) {
        const clientsWithOptimizations = (data.clients || []).map(client => ({
          ...client,
          optimizations: client.optimizations || getDefaultOptimizations()
        }));
        setClients(clientsWithOptimizations);
      } else {
        throw new Error(data.error || 'Failed to load clients');
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast.error(error.message || 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  const toggleRowExpansion = (email) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(email)) {
      newExpanded.delete(email);
    } else {
      newExpanded.add(email);
    }
    setExpandedRows(newExpanded);
  };

  const startEditing = (client) => {
    setEditingClient({
      email: client.email,
      todos: JSON.parse(JSON.stringify(client.todos || [])),
      lockPeriods: JSON.parse(JSON.stringify(client.lockPeriods || []))
    });
    if (!expandedRows.has(client.email)) {
      const newExpanded = new Set(expandedRows);
      newExpanded.add(client.email);
      setExpandedRows(newExpanded);
    }
  };

  const cancelEditing = () => {
    setEditingClient(null);
  };

  const handleEditClick = (client) => {
    startEditing(client);
  };

  const saveClientData = async () => {
    if (!editingClient) return;

    setSaving(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/api/client-todos/${editingClient.email}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          todos: editingClient.todos,
          lockPeriods: editingClient.lockPeriods
        })
      });

      const data = await response.json();
      if (data.success) {
        toast.success('Client preferences saved successfully!');
        setEditingClient(null);
        fetchClients();
      } else {
        throw new Error(data.error || 'Failed to save');
      }
    } catch (error) {
      console.error('Error saving client data:', error);
      toast.error(error.message || 'Failed to save client preferences');
    } finally {
      setSaving(false);
    }
  };

  const saveOptimizations = async (email, optimizations) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/api/client-optimizations/${email}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ optimizations })
      });

      const data = await response.json();
      if (data.success) {
        toast.success('Optimizations saved successfully!');
        setClients(prev => prev.map(c => 
          c.email.toLowerCase() === email.toLowerCase() 
            ? { ...c, optimizations } 
            : c
        ));
      } else {
        throw new Error(data.error || 'Failed to save');
      }
    } catch (error) {
      console.error('Error saving optimizations:', error);
      toast.error(error.message || 'Failed to save optimizations');
      throw error;
    }
  };

  const toggleOptimization = async (client, optimizationType) => {
    const updateKey = `${client.email}-${optimizationType}`;
    if (pendingUpdates.has(updateKey)) return;

    const currentOptimization = client.optimizations?.[optimizationType] || { completed: false };
    const newCompletedState = !currentOptimization.completed;

    const updatedOptimizations = {
      ...client.optimizations,
      [optimizationType]: {
        ...currentOptimization,
        completed: newCompletedState,
        updatedAt: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
      }
    };

    setPendingUpdates(prev => new Map(prev).set(updateKey, true));
    setClients(prevClients => 
      prevClients.map(c => 
        c.email === client.email 
          ? { ...c, optimizations: updatedOptimizations }
          : c
      )
    );

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/api/client-optimizations/${client.email}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ optimizations: updatedOptimizations })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to update');
      }
    } catch (error) {
      console.error('Error toggling optimization:', error);
      setClients(prevClients => 
        prevClients.map(c => 
          c.email === client.email 
            ? { ...c, optimizations: client.optimizations }
            : c
        )
      );
      toast.error('Failed to update optimization status');
    } finally {
      setPendingUpdates(prev => {
        const next = new Map(prev);
        next.delete(updateKey);
        return next;
      });
    }
  };

  const addTodo = (clientEmail) => {
    if (!editingClient || editingClient.email !== clientEmail) return;

    const newTodo = {
      id: `todo-${Date.now()}`,
      title: '',
      notes: '',
      completed: false,
      createdBy: 'admin',
      createdAt: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
      updatedAt: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
    };

    setEditingClient({
      ...editingClient,
      todos: [...editingClient.todos, newTodo]
    });
  };

  const updateTodo = (clientEmail, todoId, updates) => {
    if (!editingClient || editingClient.email !== clientEmail) return;

    setEditingClient({
      ...editingClient,
      todos: editingClient.todos.map(todo =>
        todo.id === todoId
          ? { ...todo, ...updates, updatedAt: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }) }
          : todo
      )
    });
  };

  const deleteTodo = (clientEmail, todoId) => {
    if (!editingClient || editingClient.email !== clientEmail) return;

    setEditingClient({
      ...editingClient,
      todos: editingClient.todos.filter(todo => todo.id !== todoId)
    });
  };

  const isDateInLockPeriod = (date, lockPeriods) => {
    if (!lockPeriods || lockPeriods.length === 0) return false;
    const now = new Date(date);
    now.setHours(0, 0, 0, 0);

    return lockPeriods.some(period => {
      const start = new Date(period.startDate);
      const end = new Date(period.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return now >= start && now <= end;
    });
  };

  const getActiveLockPeriod = (lockPeriods) => {
    if (!lockPeriods || lockPeriods.length === 0) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    return lockPeriods.find(period => {
      const start = new Date(period.startDate);
      const end = new Date(period.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return now >= start && now <= end;
    });
  };

  const getCompletedOptimizationsCount = (optimizations, planType) => {
    return completedOptimizationsInPlan(optimizations, planType);
  };

  const getTotalInPlanCount = (planType) => totalOptimizationsInPlan(planType);

  const isAllOptimizationsDoneForPlan = (optimizations, planType) => {
    const total = getTotalInPlanCount(planType);
    const completed = getCompletedOptimizationsCount(optimizations, planType);
    return total > 0 && completed === total;
  };

  const filteredClients = clients.filter(client => {
    const matchesSearch = !searchQuery ||
      client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.email.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterStatus === 'hasTodos') {
      return client.todos && client.todos.length > 0;
    }
    if (filterStatus === 'hasLockPeriods') {
      return client.lockPeriods && client.lockPeriods.length > 0;
    }
    if (filterStatus === 'activeLock') {
      return getActiveLockPeriod(client.lockPeriods) !== null;
    }
    if (filterStatus === 'pendingOptimizations') {
      const total = getTotalInPlanCount(client.planType);
      return getCompletedOptimizationsCount(client.optimizations, client.planType) < total;
    }
    if (filterStatus === 'completedOptimizations') {
      return isAllOptimizationsDoneForPlan(client.optimizations, client.planType);
    }

    return true;
  }).sort((a, b) => {
    const aActive = a.isJobActive !== false;
    const bActive = b.isJobActive !== false;
    if (aActive === bActive) return 0;
    return aActive ? -1 : 1;
  });

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading client preferences...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 w-full">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Client Preferences</h1>
          <p className="text-gray-600">Manage optimizations and lock periods for all clients</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by client name or email..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">All Clients</option>
                <option value="pendingOptimizations">Pending Optimizations</option>
                <option value="completedOptimizations">All Optimizations Done</option>
                <option value="hasLockPeriods">Has Lock Periods</option>
                <option value="activeLock">Active Lock Period</option>
              </select>
            </div>
            <button
              onClick={fetchClients}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200 table-fixed">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider w-[10%]">
                    Client
                  </th>
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider w-8">
                  </th>
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider w-[14%]">
                    Email
                  </th>
                  <th className="px-2 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider w-[22%]">
                    Optimizations
                  </th>
                  <th className="px-2 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider w-[8%]">
                    Lock Periods
                  </th>
                  <th className="px-2 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider w-[8%]">
                    Status
                  </th>
                  <th className="px-2 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider w-[14%]">
                    Last Applied Job
                  </th>
                  <th className="px-2 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider w-[10%]">
                    Operator
                  </th>
                  <th className="px-2 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider w-[10%]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                      {searchQuery ? 'No clients found matching your search' : 'No clients found'}
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((client, idx) => {
                    const isExpanded = expandedRows.has(client.email);
                    const isEditing = editingClient?.email === client.email;
                    const displayData = isEditing ? editingClient : client;
                    const displayTodos = displayData?.todos || [];
                    const activeLock = getActiveLockPeriod(client.lockPeriods);
                    const isJobActive = client.isJobActive !== false;
                    const rowBgClass = isJobActive ? (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50') : 'bg-red-50';
                    const optimizations = client.optimizations || getDefaultOptimizations();
                    const totalInPlan = getTotalInPlanCount(client.planType);
                    const completedCount = getCompletedOptimizationsCount(optimizations, client.planType);

                    return (
                      <React.Fragment key={client.email}>
                        <tr className={`hover:bg-gray-100 transition-colors ${rowBgClass}`}>
                          <td className="px-2 py-2">
                            <div className={`text-[11px] font-medium truncate ${isJobActive ? 'text-gray-900' : 'text-red-900'}`} title={client.name}>{client.name}</div>
                          </td>
                          <td className="px-1 py-2">
                            <button
                              onClick={() => toggleRowExpansion(client.email)}
                              className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-3 h-3 text-gray-600" />
                              ) : (
                                <ChevronDown className="w-3 h-3 text-gray-600" />
                              )}
                            </button>
                          </td>
                          <td className="px-2 py-2">
                            <div className={`text-[11px] truncate ${isJobActive ? 'text-gray-600' : 'text-red-700'}`} title={client.email}>{client.email}</div>
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              <button
                                onClick={() => {
                                  const hasAttachment = optimizations.resumeOptimization?.attachmentUrl;
                                  if (!hasAttachment) {
                                    setAttachmentModalClient(client);
                                  }
                                }}
                                className="cursor-pointer"
                                title={optimizations.resumeOptimization?.attachmentUrl ? "Resume uploaded" : "Click to upload resume"}
                              >
                                <OptimizationBadge 
                                  optimization={optimizations.resumeOptimization} 
                                  label="Resume" 
                                  icon={FileText}
                                />
                              </button>
                              {(() => {
                                const linkedInInPlan = hasLinkedInOptimization(client.planType);
                                return (
                                  <button
                                    onClick={() => linkedInInPlan && !optimizations.linkedinOptimization?.attachmentUrl && setAttachmentModalClient(client)}
                                    className={linkedInInPlan ? 'cursor-pointer' : 'cursor-not-allowed'}
                                    title={!linkedInInPlan ? planFeatureLabel('linkedin') : (optimizations.linkedinOptimization?.attachmentUrl ? "LinkedIn completed" : "Click to mark LinkedIn")}
                                  >
                                    <OptimizationBadge 
                                      optimization={optimizations.linkedinOptimization} 
                                      label="LinkedIn" 
                                      icon={Linkedin}
                                      disabledByPlan={!linkedInInPlan}
                                      planTooltip={planFeatureLabel('linkedin')}
                                    />
                                  </button>
                                );
                              })()}
                              {(() => {
                                const coverLetterInPlan = hasCoverLetter(client.planType);
                                return (
                                  <button
                                    onClick={() => coverLetterInPlan && !optimizations.coverLetterOptimization?.attachmentUrl && setAttachmentModalClient(client)}
                                    className={coverLetterInPlan ? 'cursor-pointer' : 'cursor-not-allowed'}
                                    title={!coverLetterInPlan ? planFeatureLabel('coverLetter') : (optimizations.coverLetterOptimization?.attachmentUrl ? "Cover Letter uploaded" : "Click to upload cover letter")}
                                  >
                                    <OptimizationBadge 
                                      optimization={optimizations.coverLetterOptimization} 
                                      label="Cover Letter" 
                                      icon={FileCheck}
                                      disabledByPlan={!coverLetterInPlan}
                                      planTooltip={planFeatureLabel('coverLetter')}
                                    />
                                  </button>
                                );
                              })()}
                              {totalInPlan > 0 && completedCount === totalInPlan && (
                                <span className="ml-1 text-[9px] text-green-600 font-semibold">All Done</span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-[11px] font-medium text-gray-900">
                                {client.lockPeriods?.length || 0}
                              </span>
                              {activeLock && (
                                <span className="px-1 py-0.5 bg-red-100 text-red-700 text-[9px] rounded-full flex items-center gap-0.5">
                                  <Lock className="w-2.5 h-2.5" />
                                  Active
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-center">
                            {activeLock ? (
                              <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-medium rounded">
                                Locked
                              </span>
                            ) : isJobActive ? (
                              <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-medium rounded">
                                Active
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-medium rounded">
                                Inactive
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {client.lastAppliedJob ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className={`text-[11px] font-medium truncate w-full ${isJobActive ? 'text-gray-900' : 'text-red-900'}`} title={client.lastAppliedJob.companyName || 'N/A'}>
                                  {client.lastAppliedJob.companyName || 'N/A'}
                                </span>
                                <span className={`text-[9px] ${isJobActive ? 'text-gray-500' : 'text-red-600'}`} title={client.lastAppliedJob.appliedDate || 'N/A'}>
                                  {formatRelativeTime(client.lastAppliedJob.appliedDate) || 'N/A'}
                                </span>
                              </div>
                            ) : (
                              <span className={`text-[11px] ${isJobActive ? 'text-gray-400' : 'text-red-400'}`}>-</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {client.lastAppliedJob?.operatorName ? (
                              <span className={`text-[11px] font-medium truncate ${isJobActive ? 'text-gray-700' : 'text-red-800'}`} title={client.lastAppliedJob.operatorName}>
                                {client.lastAppliedJob.operatorName}
                              </span>
                            ) : (
                              <span className={`text-[11px] ${isJobActive ? 'text-gray-400' : 'text-red-400'}`}>-</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => setAttachmentModalClient(client)}
                                className="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                title="Manage Attachments"
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                              </button>
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={saveClientData}
                                    disabled={saving}
                                    className="p-1 text-white hover:bg-green-900 bg-green-600 rounded transition-colors text-[10px] px-2"
                                    title="Save"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={cancelEditing}
                                    className="p-1 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                    title="Cancel"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => handleEditClick(client)}
                                  className="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                  title="Edit"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan={9} className="px-2 py-2 bg-gray-50">
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="bg-white rounded-lg border border-gray-200 p-4">
                                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Optimization Details</h3>
                                  <div className="space-y-3">
                                    {[
                                      { key: 'resumeOptimization', label: 'Resume Optimization', icon: FileText },
                                      { key: 'linkedinOptimization', label: 'LinkedIn Optimization', icon: Linkedin },
                                      { key: 'coverLetterOptimization', label: 'Cover Letter Optimization', icon: FileCheck }
                                    ].map(({ key, label, icon: Icon }) => {
                                      const opt = optimizations[key] || {};
                                      const hasAttachment = opt.attachmentUrl && opt.attachmentUrl.trim() !== '';
                                      const linkedinNotInPlan = key === 'linkedinOptimization' && !hasLinkedInOptimization(client.planType);
                                      const coverLetterNotInPlan = key === 'coverLetterOptimization' && !hasCoverLetter(client.planType);
                                      const notInPlan = linkedinNotInPlan || coverLetterNotInPlan;
                                      return (
                                        <div 
                                          key={key}
                                          className={`flex items-center justify-between p-3 rounded-lg border ${
                                            notInPlan
                                              ? 'bg-gray-100 border-gray-200 opacity-80'
                                              : hasAttachment 
                                                ? 'bg-green-50 border-green-200' 
                                                : 'bg-red-50 border-red-200'
                                          }`}
                                        >
                                          <div className="flex items-center gap-3">
                                            <Icon className={`w-5 h-5 ${notInPlan ? 'text-gray-400' : hasAttachment ? 'text-green-600' : 'text-red-400'}`} />
                                            <div>
                                              <span className={`text-sm font-medium ${notInPlan ? 'text-gray-500' : 'text-gray-800'}`}>{label}</span>
                                              {notInPlan && (
                                                <span className="text-xs text-gray-500 mt-1 block">Not in plan</span>
                                              )}
                                              {!notInPlan && hasAttachment && (
                                                <a 
                                                  href={opt.attachmentUrl} 
                                                  target="_blank" 
                                                  rel="noopener noreferrer"
                                                  className="flex items-center gap-1 text-xs text-indigo-600 hover:underline mt-1"
                                                >
                                                  <Paperclip className="w-3 h-3" />
                                                  {opt.attachmentName || 'View Attachment'}
                                                </a>
                                              )}
                                              {!notInPlan && !hasAttachment && (
                                                <span className="text-xs text-red-500 mt-1">No attachment uploaded</span>
                                              )}
                                            </div>
                                          </div>
                                          {notInPlan ? (
                                            <Lock className="w-5 h-5 text-gray-400" />
                                          ) : hasAttachment ? (
                                            <CheckCircle2 className="w-6 h-6 text-green-500" />
                                          ) : (
                                            <button
                                              onClick={() => setAttachmentModalClient(client)}
                                              className="px-3 py-1 text-xs bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                                            >
                                              Upload
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <button
                                    onClick={() => setAttachmentModalClient(client)}
                                    className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                                  >
                                    <Upload className="w-4 h-4" />
                                    Upload Attachments
                                  </button>
                                </div>

                                {displayTodos.length > 0 && (
                                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                                    <div className="flex items-center justify-between mb-4">
                                      <h3 className="text-lg font-semibold text-gray-900">Additional TODOs</h3>
                                      {isEditing && (
                                        <button
                                          onClick={() => addTodo(client.email)}
                                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors"
                                        >
                                          <Plus className="w-3 h-3" />
                                          Add TODO
                                        </button>
                                      )}
                                    </div>
                                    <div className="space-y-2 max-h-60 overflow-y-auto">
                                      {displayTodos.filter(t => 
                                        !['Create optimized resume', 'LinkedIn Optimization', 'Cover letter Optimization'].includes(t.title)
                                      ).map(todo => (
                                        <div 
                                          key={todo.id}
                                          className={`p-3 rounded-lg border ${
                                            todo.completed ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                                          }`}
                                        >
                                          <div className="flex items-center gap-3">
                                            {todo.completed ? (
                                              <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                                            ) : (
                                              <Circle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                                            )}
                                            <span className={`text-sm ${todo.completed ? 'line-through text-gray-500' : 'text-gray-800'}`}>
                                              {todo.title}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-600 mb-1">Total Clients</div>
            <div className="text-2xl font-bold text-gray-900">{clients.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-600 mb-1">All Optimizations Done</div>
            <div className="text-2xl font-bold text-green-600">
              {clients.filter(c => isAllOptimizationsDoneForPlan(c.optimizations, c.planType)).length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-600 mb-1">Pending Optimizations</div>
            <div className="text-2xl font-bold text-amber-600">
              {clients.filter(c => getCompletedOptimizationsCount(c.optimizations, c.planType) < getTotalInPlanCount(c.planType)).length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-600 mb-1">Active Lock Periods</div>
            <div className="text-2xl font-bold text-red-600">
              {clients.filter(c => getActiveLockPeriod(c.lockPeriods)).length}
            </div>
          </div>
        </div>
      </div>

      <AttachmentModal
        isOpen={!!attachmentModalClient}
        onClose={() => setAttachmentModalClient(null)}
        client={attachmentModalClient}
        onSave={saveOptimizations}
      />
    </Layout>
  );
}
