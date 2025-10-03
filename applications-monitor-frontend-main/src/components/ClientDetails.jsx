import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8086";

const ClientDetails = ({ clientEmail, onClose, userRole = 'admin' }) => {
  const [client, setClient] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState('personal');
  const [formData, setFormData] = useState({
    name: '',
    email: clientEmail,
    jobDeadline: '',
    applicationStartDate: '',
    dashboardInternName: '',
    dashboardTeamLeadName: '',
    planType: 'ignite',
    onboardingDate: '',
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
    linkedinOptimizationDate: '',
    gmailCredentials: {
      email: '',
      password: ''
    },
    dashboardCredentials: {
      username: '',
      password: ''
    },
    linkedinCredentials: {
      username: '',
      password: ''
    },
    amountPaid: 0,
    amountPaidDate: '',
    modeOfPayment: 'paypal'
  });

  useEffect(() => {
    if (clientEmail) {
      fetchClientDetails();
    }
  }, [clientEmail]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const fetchClientDetails = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`${API_BASE}/api/clients/${encodeURIComponent(clientEmail)}`);
      if (response.ok) {
        const data = await response.json();
        setClient(data.client);
        setFormData({
          name: data.client.name || '',
          email: data.client.email || clientEmail,
          jobDeadline: data.client.jobDeadline || '',
          applicationStartDate: data.client.applicationStartDate || '',
          dashboardInternName: data.client.dashboardInternName || '',
          dashboardTeamLeadName: data.client.dashboardTeamLeadName || '',
          planType: data.client.planType || 'ignite',
          onboardingDate: data.client.onboardingDate || '',
          whatsappGroupMade: data.client.whatsappGroupMade || false,
          whatsappGroupMadeDate: data.client.whatsappGroupMadeDate || '',
          dashboardCredentialsShared: data.client.dashboardCredentialsShared || false,
          dashboardCredentialsSharedDate: data.client.dashboardCredentialsSharedDate || '',
          resumeSent: data.client.resumeSent || false,
          resumeSentDate: data.client.resumeSentDate || '',
          coverLetterSent: data.client.coverLetterSent || false,
          coverLetterSentDate: data.client.coverLetterSentDate || '',
          portfolioMade: data.client.portfolioMade || false,
          portfolioMadeDate: data.client.portfolioMadeDate || '',
          linkedinOptimization: data.client.linkedinOptimization || false,
          linkedinOptimizationDate: data.client.linkedinOptimizationDate || '',
          gmailCredentials: {
            email: data.client.gmailCredentials?.email || '',
            password: data.client.gmailCredentials?.password || ''
          },
          dashboardCredentials: {
            username: data.client.dashboardCredentials?.username || '',
            password: data.client.dashboardCredentials?.password || ''
          },
          linkedinCredentials: {
            username: data.client.linkedinCredentials?.username || '',
            password: data.client.linkedinCredentials?.password || ''
          },
          amountPaid: data.client.amountPaid || 0,
          amountPaidDate: data.client.amountPaidDate || '',
          modeOfPayment: data.client.modeOfPayment || 'paypal'
        });
      } else {
        // Client doesn't exist, show empty form for creation
        setClient(null);
        setFormData(prev => ({ ...prev, email: clientEmail }));
      }
    } catch (error) {
      console.error('Error fetching client details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name.startsWith('gmailCredentials.')) {
      const field = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        gmailCredentials: {
          ...prev.gmailCredentials,
          [field]: value
        }
      }));
    } else if (name.startsWith('dashboardCredentials.')) {
      const field = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        dashboardCredentials: {
          ...prev.dashboardCredentials,
          [field]: value
        }
      }));
    } else if (name.startsWith('linkedinCredentials.')) {
      const field = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        linkedinCredentials: {
          ...prev.linkedinCredentials,
          [field]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`${API_BASE}/api/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const data = await response.json();
        setClient(data.client);
        setIsEditing(false);
        alert('Client details saved successfully!');
      } else {
        alert('Failed to save client details. Please try again.');
      }
    } catch (error) {
      alert('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const planOptions = [
    { value: 'ignite', label: 'Ignite $199' },
    { value: 'professional', label: 'Professional $349' },
    { value: 'executive', label: 'Executive $599' }
  ];

  const navigationItems = [
    {
      id: 'personal',
      label: 'Personal Information',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      )
    },
    {
      id: 'gmail',
      label: 'Gmail Credentials',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      )
    },
    {
      id: 'dashboard',
      label: 'Dashboard Credentials',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    {
      id: 'linkedin',
      label: 'LinkedIn Credentials',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      )
    }
  ];

  if (loading && !client) {
    return (
      <div 
        className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div 
          className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full max-h-[95vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Skeleton */}
          <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 px-8 py-6 text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-indigo-700/20 animate-pulse"></div>
            <div className="relative flex justify-between items-center">
              <div className="space-y-3">
                <div className="h-8 w-64 bg-white/30 rounded-lg animate-pulse"></div>
                <div className="h-5 w-48 bg-white/20 rounded-lg animate-pulse"></div>
              </div>
              <button
                onClick={onClose}
                className="p-3 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-all duration-200 backdrop-blur-sm"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content Skeleton */}
          <div className="flex h-[calc(95vh-120px)] bg-gradient-to-br from-slate-50 to-blue-50">
            {/* Sidebar Skeleton */}
            <div className="w-80 bg-white border-r border-slate-200 p-6 overflow-y-auto">
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-100 animate-pulse">
                    <div className="w-9 h-9 bg-slate-200 rounded-lg"></div>
                    <div className="h-4 flex-1 bg-slate-200 rounded"></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Main Content Skeleton */}
            <div className="flex-1 p-8 overflow-y-auto">
              <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
                {/* Loading Animation */}
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="relative">
                    {/* Spinning Ring */}
                    <div className="w-20 h-20 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                    
                    {/* Pulsing Inner Circle */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 bg-blue-100 rounded-full animate-pulse"></div>
                    </div>
                  </div>
                  
                  {/* Loading Text */}
                  <div className="mt-6 space-y-2 text-center">
                    <h3 className="text-lg font-semibold text-slate-800 animate-pulse">
                      Loading Client Details
                    </h3>
                    <p className="text-sm text-slate-500 animate-pulse">
                      Please wait while we fetch the information...
                    </p>
                  </div>
                  
                  {/* Loading Bars */}
                  <div className="mt-8 w-full max-w-md space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="space-y-2">
                        <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full animate-[shimmer_2s_ease-in-out_infinite]"
                            style={{
                              width: '40%',
                              animation: `shimmer ${1 + i * 0.3}s ease-in-out infinite`
                            }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Form Fields Skeleton */}
                <div className="mt-8 space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="space-y-2">
                      <div className="h-4 w-32 bg-slate-200 rounded animate-pulse"></div>
                      <div className="h-12 w-full bg-slate-100 rounded-xl animate-pulse"></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full max-h-[95vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 px-8 py-6 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-indigo-700/20"></div>
          <div className="relative flex justify-between items-center">
            <div>
              <h2 className="text-3xl font-bold mb-2 flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                Personal Details
              </h2>
              <p className="text-blue-100 text-lg font-medium">{clientEmail}</p>
            </div>
            <div className="flex gap-3">
              {!isEditing ? (
                userRole === 'admin' ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-3 px-6 py-3 bg-white text-blue-600 rounded-xl hover:bg-blue-50 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    {client ? 'Edit Details' : 'Add Details'}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-6 py-3 bg-white/20 text-white rounded-xl font-semibold shadow-lg backdrop-blur-sm">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    View Only
                  </div>
                )
              ) : (
                <>
                  <button
                    onClick={handleSave}
                    disabled={loading}
                    className="flex items-center gap-3 px-6 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="flex items-center gap-3 px-6 py-3 bg-gray-500 text-white rounded-xl hover:bg-gray-600 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancel
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="p-3 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-all duration-200 backdrop-blur-sm"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex h-[calc(95vh-120px)] bg-gradient-to-br from-slate-50 to-blue-50">
          {/* Sidebar Navigation */}
          <div className="w-80 bg-white border-r border-slate-200 p-6 overflow-y-auto">
            <div className="space-y-2">
              {navigationItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${
                    activeSection === item.id
                      ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${
                    activeSection === item.id ? 'bg-blue-100' : 'bg-slate-100'
                  }`}>
                    {item.icon}
                  </div>
                  <span className="font-medium">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 p-8 overflow-y-auto">
            {activeSection === 'personal' && (
              <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow duration-300">
                <h3 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  Personal Information
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Email Address
                    </label>
                    <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-xl text-blue-700 font-medium shadow-sm">
                      {clientEmail}
                    </div>
                  </div>
                  
                  {userRole === 'admin' && (
                    <>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          Amount Paid
                        </label>
                        {isEditing ? (
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <span className="text-slate-500 sm:text-sm">$</span>
                            </div>
                            <input
                              type="number"
                              name="amountPaid"
                              value={formData.amountPaid}
                              onChange={handleInputChange}
                              className="w-full pl-8 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm hover:shadow-md"
                              placeholder="0.00"
                              min="0"
                              step="0.01"
                            />
                          </div>
                        ) : (
                          <div className="px-4 py-3 bg-gradient-to-r from-white to-slate-50 border border-slate-200 rounded-xl text-slate-700 shadow-sm">
                            ${client?.amountPaid || 0}
                          </div>
                        )}
                      </div>
                      
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          Payment Date
                        </label>
                        {isEditing ? (
                          <input
                            type="date"
                            name="amountPaidDate"
                            value={formData.amountPaidDate}
                            onChange={handleInputChange}
                            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm hover:shadow-md"
                          />
                        ) : (
                          <div className="px-4 py-3 bg-gradient-to-r from-white to-slate-50 border border-slate-200 rounded-xl text-slate-700 shadow-sm">
                            {client?.amountPaidDate ? new Date(client.amountPaidDate).toLocaleDateString('en-GB') : 'Not set'}
                          </div>
                        )}
                      </div>
                      
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          Mode of Payment
                        </label>
                        {isEditing ? (
                          <select
                            name="modeOfPayment"
                            value={formData.modeOfPayment}
                            onChange={handleInputChange}
                            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm hover:shadow-md"
                          >
                            <option value="paypal">PayPal</option>
                            <option value="wire_transfer">Wire Transfer</option>
                            <option value="inr">INR</option>
                          </select>
                        ) : (
                          <div className="px-4 py-3 bg-gradient-to-r from-white to-slate-50 border border-slate-200 rounded-xl text-slate-700 shadow-sm capitalize">
                            {client?.modeOfPayment?.replace('_', ' ') || 'Not set'}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {activeSection === 'gmail' && (
              <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow duration-300">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  Gmail Credentials
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Email</label>
                    {isEditing ? (
                      <input
                        type="email"
                        name="gmailCredentials.email"
                        value={formData.gmailCredentials.email}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm hover:shadow-md"
                        placeholder="Gmail address"
                      />
                    ) : (
                      <div className="px-4 py-3 bg-gradient-to-r from-white to-slate-50 border border-slate-200 rounded-xl text-slate-700 shadow-sm">
                        {client?.gmailCredentials?.email || <span className="text-slate-400 italic">Not set</span>}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
                    {isEditing ? (
                      <input
                        type="password"
                        name="gmailCredentials.password"
                        value={formData.gmailCredentials.password}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm hover:shadow-md"
                        placeholder="Gmail password"
                      />
                    ) : (
                      <div className="px-4 py-3 bg-gradient-to-r from-white to-slate-50 border border-slate-200 rounded-xl text-slate-700 shadow-sm">
                        {client?.gmailCredentials?.password || <span className="text-slate-400 italic">Not set</span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'dashboard' && (
              <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow duration-300">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  Dashboard Credentials
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Username</label>
                    {isEditing ? (
                      <input
                        type="text"
                        name="dashboardCredentials.username"
                        value={formData.dashboardCredentials.username}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm hover:shadow-md"
                        placeholder="Dashboard username"
                      />
                    ) : (
                      <div className="px-4 py-3 bg-gradient-to-r from-white to-slate-50 border border-slate-200 rounded-xl text-slate-700 shadow-sm">
                        {client?.dashboardCredentials?.username || <span className="text-slate-400 italic">Not set</span>}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
                    {isEditing ? (
                      <input
                        type="text"
                        name="dashboardCredentials.password"
                        value={formData.dashboardCredentials.password}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm hover:shadow-md"
                        placeholder="Dashboard password"
                      />
                    ) : (
                      <div className="px-4 py-3 bg-gradient-to-r from-white to-slate-50 border border-slate-200 rounded-xl text-slate-700 shadow-sm">
                        {client?.dashboardCredentials?.password || <span className="text-slate-400 italic">Not set</span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'linkedin' && (
              <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow duration-300">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  LinkedIn Credentials
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Username/Email</label>
                    {isEditing ? (
                      <input
                        type="text"
                        name="linkedinCredentials.username"
                        value={formData.linkedinCredentials.username}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm hover:shadow-md"
                        placeholder="LinkedIn username or email"
                      />
                    ) : (
                      <div className="px-4 py-3 bg-gradient-to-r from-white to-slate-50 border border-slate-200 rounded-xl text-slate-700 shadow-sm">
                        {client?.linkedinCredentials?.username || <span className="text-slate-400 italic">Not set</span>}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
                    {isEditing ? (
                      <input
                        type="text"
                        name="linkedinCredentials.password"
                        value={formData.linkedinCredentials.password}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm hover:shadow-md"
                        placeholder="LinkedIn password"
                      />
                    ) : (
                      <div className="px-4 py-3 bg-gradient-to-r from-white to-slate-50 border border-slate-200 rounded-xl text-slate-700 shadow-sm">
                        {client?.linkedinCredentials?.password || <span className="text-slate-400 italic">Not set</span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Record Information - Always visible */}
            {client && (
              <div className="mt-8 pt-6 border-t border-slate-200">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Record Information
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-slate-600">Created:</span>
                      <span className="font-medium text-slate-700">{client.createdAt}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span className="text-slate-600">Last Updated:</span>
                      <span className="font-medium text-slate-700">{client.updatedAt}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default ClientDetails;
