import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import Layout from './Layout';
import { Search, User, CreditCard, Zap, X, CheckCircle2, ArrowUp, Sparkles, Crown, Rocket, Star } from 'lucide-react';
import { parseAmount, extractCurrency, formatAmount } from '../utils/currencyUtils';

const API_BASE = import.meta.env.VITE_BASE || 'http://localhost:8001';

if (!API_BASE) {
  console.error('❌ VITE_BASE environment variable is required');
}

export default function ClientDashboard() {
  const [activeTab, setActiveTab] = useState('analytics');
  const [monthlyStats, setMonthlyStats] = useState([]);
  const [planTypeStats, setPlanTypeStats] = useState([]);
  const [totalClients, setTotalClients] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientDetails, setClientDetails] = useState(null);
  const [loadingClient, setLoadingClient] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedAddon, setSelectedAddon] = useState(null);
  // Referral Management state
  const [referralUsers, setReferralUsers] = useState([]);
  const [loadingReferralUsers, setLoadingReferralUsers] = useState(false);
  const [updatingReferralUser, setUpdatingReferralUser] = useState({});
  const [editingNotes, setEditingNotes] = useState({});
  const [notesValues, setNotesValues] = useState({});
  const [activeReferralUser, setActiveReferralUser] = useState(null);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [newReferralName, setNewReferralName] = useState('');
  const [newReferralPlan, setNewReferralPlan] = useState('Professional');
  const [newReferralNotes, setNewReferralNotes] = useState('');
  const [savingReferral, setSavingReferral] = useState(false);

  const planOptions = [
    { value: 'Ignite', label: 'Ignite', price: 199, applications: 250, icon: Rocket, color: 'orange' },
    { value: 'Professional', label: 'Professional', price: 349, applications: 500, icon: Sparkles, color: 'blue' },
    { value: 'Executive', label: 'Executive', price: 599, applications: 1000, icon: Crown, color: 'purple' },
    { value: 'Prime', label: 'Prime', price: 119, applications: 160, icon: Star, color: 'gold' }

  ];

  const getCurrentPlan = () => {
    if (!clientDetails?.planType) return null;
    const planType = clientDetails.planType.charAt(0).toUpperCase() + clientDetails.planType.slice(1).toLowerCase();
    return planOptions.find(p => p.value === planType) || null;
  };

  const canUpgradeToPlan = (planValue) => {
    const currentPlan = getCurrentPlan();
    if (!currentPlan) return true;
    
    const planOrder = ['Prime', 'Ignite', 'Professional', 'Executive'];
    const currentIndex = planOrder.indexOf(currentPlan.value);
    const targetIndex = planOrder.indexOf(planValue);
    
    return targetIndex > currentIndex;
  };

  const getUpgradePrice = (planValue) => {
    const currentPlan = getCurrentPlan();
    if (!currentPlan) {
      const targetPlan = planOptions.find(p => p.value === planValue);
      return targetPlan?.price || 0;
    }
    
    const targetPlan = planOptions.find(p => p.value === planValue);
    if (!targetPlan) return 0;
    
    if (planValue === currentPlan.value) return 0;
    
    const planOrder = ['Prime', 'Ignite', 'Professional', 'Executive'];
    const currentIndex = planOrder.indexOf(currentPlan.value);
    const targetIndex = planOrder.indexOf(planValue);
    
    if (targetIndex <= currentIndex) return 0;
    
    return targetPlan.price - currentPlan.price;
  };

  const addonOptions = [
    { value: '250', label: '+250 Add-On', price: 120 },
    { value: '500', label: '+500 Add-On', price: 200 },
    { value: '1000', label: '+1000 Add-On', price: 350 }
  ];

  useEffect(() => {
    if (activeTab === 'analytics') {
      loadAnalyticsData();
    } else if (activeTab === 'addon') {
      loadClients();
    } else if (activeTab === 'referral') {
      loadReferralUsers();
    }
  }, [activeTab]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const filtered = clients.filter(client =>
        client.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredClients(filtered);
    } else {
      setFilteredClients([]);
    }
  }, [searchQuery, clients]);

  const loadAnalyticsData = async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([fetchMonthlyStats(), fetchPlanTypeStats(), fetchRevenueStats()]);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const loadClients = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/clients`);
      if (response.ok) {
        const data = await response.json();
        setClients(data.clients || data.data || []);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const loadReferralUsers = async () => {
    setLoadingReferralUsers(true);
    try {
      const response = await fetch(`${API_BASE}/api/referral-management/users`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setReferralUsers((data.users || []).map(user => ({
            ...user,
            referrals: Array.isArray(user.referrals) ? user.referrals : [],
            referralCount: typeof user.referralCount === 'number'
              ? user.referralCount
              : (Array.isArray(user.referrals) ? user.referrals.length : 0),
            referralApplicationsAdded: typeof user.referralApplicationsAdded === 'number'
              ? user.referralApplicationsAdded
              : 0,
          })));
        } else {
          throw new Error(data.error || 'Failed to fetch users');
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error fetching referral users:', error);
      toast.error('Failed to load users for referral management');
    } finally {
      setLoadingReferralUsers(false);
    }
  };

  const handleNotesEdit = (email, currentNotes) => {
    setEditingNotes(prev => ({ ...prev, [email]: true }));
    setNotesValues(prev => ({ ...prev, [email]: currentNotes || "" }));
  };

  const handleNotesSave = async (email) => {
    const notes = notesValues[email] || "";
    setUpdatingReferralUser(prev => ({ ...prev, [email]: true }));
    
    try {
      const response = await fetch(`${API_BASE}/api/referral-management/users/${email}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ notes })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        // Update local state
        setReferralUsers(prevUsers =>
          prevUsers.map(user =>
            user.email === email
              ? { ...user, notes: data.user.notes || "" }
              : user
          )
        );
        setEditingNotes(prev => {
          const newState = { ...prev };
          delete newState[email];
          return newState;
        });
        toast.success(`Notes saved for ${email}`);
      } else {
        throw new Error(data.error || 'Failed to update notes');
      }
    } catch (error) {
      console.error('Error updating notes:', error);
      toast.error(error.message || 'Failed to update notes');
    } finally {
      setUpdatingReferralUser(prev => ({ ...prev, [email]: false }));
    }
  };

  const handleNotesCancel = (email, originalNotes) => {
    setEditingNotes(prev => {
      const newState = { ...prev };
      delete newState[email];
      return newState;
    });
    setNotesValues(prev => {
      const newState = { ...prev };
      delete newState[email];
      return newState;
    });
  };

  const openReferralModal = (user) => {
    setActiveReferralUser(user);
    setNewReferralName('');
    setNewReferralPlan('Professional');
    setNewReferralNotes('');
    setShowReferralModal(true);
  };

  const closeReferralModal = () => {
    setShowReferralModal(false);
    setActiveReferralUser(null);
    setNewReferralName('');
    setNewReferralPlan('Professional');
    setNewReferralNotes('');
  };

  const handleAddReferral = async () => {
    if (!activeReferralUser) return;

    const email = activeReferralUser.email;

    if (!newReferralName.trim()) {
      toast.error('Please enter the referred client name');
      return;
    }

    if (!newReferralPlan) {
      toast.error('Please select a plan for this referral');
      return;
    }

    setSavingReferral(true);
    try {
      const response = await fetch(`${API_BASE}/api/referral-management/users/${email}/referrals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          referredName: newReferralName.trim(),
          plan: newReferralPlan,
          notes: newReferralNotes.trim(),
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setReferralUsers(prevUsers =>
          prevUsers.map(user =>
            user.email === email
              ? {
                  ...user,
                  referrals: Array.isArray(data.user.referrals) ? data.user.referrals : [],
                  referralCount: Array.isArray(data.user.referrals) ? data.user.referrals.length : 0,
                  referralApplicationsAdded: data.user.referralApplicationsAdded || 0,
                  notes: data.user.notes || user.notes || "",
                }
              : user
          )
        );

        // Keep local modal state in sync so existing referrals list matches immediately
        setActiveReferralUser((prev) =>
          prev && prev.email === email
            ? {
                ...prev,
                referrals: Array.isArray(data.user.referrals) ? data.user.referrals : [],
              }
            : prev
        );

        toast.success('Referral added successfully');

        // Reset form and close modal for smoother UX
        setNewReferralName('');
        setNewReferralPlan('Professional');
        setNewReferralNotes('');
        closeReferralModal();
      } else {
        throw new Error(data.error || 'Failed to add referral');
      }
    } catch (error) {
      console.error('Error adding referral:', error);
      toast.error(error.message || 'Failed to add referral');
    } finally {
      setSavingReferral(false);
    }
  };

  const fetchMonthlyStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/clients/stats`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setMonthlyStats(data.data.monthlyData);
          setTotalClients(data.data.totalClients);
        } else {
          throw new Error(data.message || 'Failed to fetch monthly stats');
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error fetching monthly stats:', error);
      setError('Failed to fetch monthly statistics');
      toast.error('Failed to fetch monthly statistics');
    }
  };

  const fetchPlanTypeStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/clients/plan-stats`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setPlanTypeStats(data.data.planTypeStats);
        } else {
          throw new Error(data.message || 'Failed to fetch plan type stats');
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error fetching plan type stats:', error);
      setError('Failed to fetch plan type statistics');
      toast.error('Failed to fetch plan type statistics');
    }
  };

  const fetchRevenueStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/clients/revenue-stats`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setTotalRevenue(data.data.totalRevenue);
        } else {
          throw new Error(data.message || 'Failed to fetch revenue stats');
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error fetching revenue stats:', error);
      setError('Failed to fetch revenue statistics');
      toast.error('Failed to fetch revenue statistics');
    }
  };

  const handleClientSearch = async (client) => {
    setSelectedClient(client);
    setLoadingClient(true);
    try {
      const response = await fetch(`${API_BASE}/api/clients/${client.email}`);
      if (response.ok) {
        const data = await response.json();
        setClientDetails(data.client || data);
      } else {
        throw new Error('Failed to fetch client details');
      }
    } catch (error) {
      console.error('Error fetching client details:', error);
      toast.error('Failed to fetch client details');
    } finally {
      setLoadingClient(false);
    }
  };

  const handleUpgradePlan = async () => {
    if (!selectedPlan || !clientDetails) return;

    const currentPlan = getCurrentPlan();
    if (currentPlan && selectedPlan === currentPlan.value) {
      toast.error('You are already on this plan');
      return;
    }

    if (!canUpgradeToPlan(selectedPlan)) {
      toast.error('You can only upgrade to a higher tier plan');
      return;
    }

    setUpgrading(true);
    try {
      const response = await fetch(`${API_BASE}/api/clients/${clientDetails.email}/upgrade-plan`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          planType: selectedPlan
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(`Plan upgraded to ${selectedPlan} successfully!`);
        setSelectedPlan(null);
        await handleClientSearch(selectedClient);
        await loadAnalyticsData();
      } else {
        throw new Error(data.error || 'Failed to upgrade plan');
      }
    } catch (error) {
      console.error('Error upgrading plan:', error);
      toast.error(error.message || 'Failed to upgrade plan');
    } finally {
      setUpgrading(false);
    }
  };

  const handleAddAddon = async () => {
    if (!selectedAddon || !clientDetails) return;

    setUpgrading(true);
    try {
      const addonPrices = { '250': 120, '500': 200, '1000': 350 };
      const addonPrice = addonPrices[selectedAddon] || 0;

      const response = await fetch(`${API_BASE}/api/clients/${clientDetails.email}/add-addon`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          addonType: selectedAddon,
          addonPrice: addonPrice
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(`Addon ${selectedAddon} added successfully!`);
        setSelectedAddon(null);
        await handleClientSearch(selectedClient);
        await loadAnalyticsData();
      } else {
        throw new Error(data.error || 'Failed to add addon');
      }
    } catch (error) {
      console.error('Error adding addon:', error);
      toast.error(error.message || 'Failed to add addon');
    } finally {
      setUpgrading(false);
    }
  };

  const calculateGrowth = () => {
    if (monthlyStats.length < 2) return 0;
    const currentMonth = monthlyStats[monthlyStats.length - 1];
    const previousMonth = monthlyStats[monthlyStats.length - 2];
    if (previousMonth.count === 0) return currentMonth.count > 0 ? 100 : 0;
    return ((currentMonth.count - previousMonth.count) / previousMonth.count * 100).toFixed(1);
  };

  const getPlanTypeColor = (planType) => {
    const colors = {
      'Prime': '#FFD700',
      'Executive': '#8B5CF6',
      'Professional': '#3B82F6',
      'Ignite': '#F59E0B',
      'Free Trial': '#6B7280'
    };
    return colors[planType] || '#6B7280';
  };

  if (loading && activeTab === 'analytics') {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading dashboard...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error && activeTab === 'analytics') {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="text-red-500 text-xl mb-4">⚠️</div>
            <p className="text-red-600">{error}</p>
            <button 
              onClick={() => window.location.reload()} 
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-5">Plan</h1>
          <div className="inline-flex">
            <div className="relative bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 rounded-xl p-1.5 shadow-inner border border-gray-200">
              <div className="flex relative">
                <div 
                  className={`absolute top-1.5 bottom-1.5 bg-white rounded-lg shadow-lg transition-all duration-300 ease-in-out border border-gray-100 ${
                    activeTab === 'analytics' ? 'left-1.5' : 
                    activeTab === 'addon' ? 'left-[calc(33.333%-4px)]' : 
                    'left-[calc(66.666%-9px)]'
                  }`}
                  style={{ 
                    width: 'calc(33.333% - 6px)'
                  }}
                />
                <button
                  onClick={() => setActiveTab('analytics')}
                  className={`relative z-10 flex items-center justify-center gap-2 px-8 py-3 font-semibold text-sm rounded-lg transition-all duration-300 min-w-[180px] ${
                    activeTab === 'analytics'
                      ? 'text-gray-900 font-bold'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  {activeTab === 'analytics' && (
                    <div className="absolute left-5 w-2 h-2 bg-blue-600 rounded-full shadow-sm ring-2 ring-blue-200"></div>
                  )}
                  <span className={activeTab === 'analytics' ? 'ml-4' : ''}>Plan's Analytics</span>
                </button>
                <button
                  onClick={() => setActiveTab('addon')}
                  className={`relative z-10 flex items-center justify-center gap-2 px-8 py-3 font-semibold text-sm rounded-lg transition-all duration-300 min-w-[180px] ${
                    activeTab === 'addon'
                      ? 'text-gray-900 font-bold'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  {activeTab === 'addon' && (
                    <div className="absolute left-5 w-2 h-2 bg-blue-600 rounded-full shadow-sm ring-2 ring-blue-200"></div>
                  )}
                  <span className={activeTab === 'addon' ? 'ml-4' : ''}>Add On</span>
                </button>
                <button
                  onClick={() => setActiveTab('referral')}
                  className={`relative z-10 flex items-center justify-center gap-2 px-8 py-3 font-semibold text-sm rounded-lg transition-all duration-300 min-w-[180px] ${
                    activeTab === 'referral'
                      ? 'text-gray-900 font-bold'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  {activeTab === 'referral' && (
                    <div className="absolute left-5 w-2 h-2 bg-blue-600 rounded-full shadow-sm ring-2 ring-blue-200"></div>
                  )}
                  <span className={activeTab === 'referral' ? 'ml-4' : ''}>Referral Management</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {activeTab === 'analytics' && (
          <>
            <div className="mb-6">
              <p className="text-gray-600">Analytics and insights for client growth and plan distribution</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-white p-4 rounded-lg shadow-md border">
                <div className="flex items-center">
                  <div className="p-3 rounded-full bg-blue-100 text-blue-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Total Clients</p>
                    <p className="text-2xl font-semibold text-gray-900">{totalClients}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg shadow-md border">
                <div className="flex items-center">
                  <div className="p-3 rounded-full bg-green-100 text-green-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Growth Rate</p>
                    <p className="text-2xl font-semibold text-gray-900">{calculateGrowth()}%</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg shadow-md border">
                <div className="flex items-center">
                  <div className="p-3 rounded-full bg-purple-100 text-purple-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">This Month</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {monthlyStats.length > 0 ? monthlyStats[monthlyStats.length - 1].count : 0}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg shadow-md border">
                <div className="flex items-center">
                  <div className="p-3 rounded-full bg-green-100 text-green-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Total Revenue</p>
                    <p className="text-2xl font-semibold text-gray-900">${totalRevenue.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white p-4 rounded-lg shadow-md border">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Monthly Client Growth</h2>
                <div className="h-72">
                  <svg width="100%" height="100%" viewBox="0 0 500 300">
                    <rect width="100%" height="100%" fill="#f8fafc" />
                    <line x1="50" y1="20" x2="50" y2="250" stroke="#e2e8f0" strokeWidth="2" />
                    <line x1="50" y1="250" x2="450" y2="250" stroke="#e2e8f0" strokeWidth="2" />
                    {[0, 5, 10, 15, 20, 25].map((value) => (
                      <g key={value}>
                        <line x1="45" y1={250 - (value * 9)} x2="55" y2={250 - (value * 9)} stroke="#64748b" />
                        <text x="40" y={255 - (value * 9)} textAnchor="end" className="text-xs fill-gray-600">
                          {value}
                        </text>
                      </g>
                    ))}
                    {monthlyStats.length > 0 && (() => {
                      const maxValue = Math.max(...monthlyStats.map(d => d.count), 1);
                      const scale = 220 / maxValue;
                      const stepX = 400 / (monthlyStats.length - 1);
                      return (
                        <>
                          <path
                            d={`M ${monthlyStats.map((d, i) => 
                              `${60 + i * stepX},${250 - d.count * scale}`
                            ).join(' L ')}`}
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth="3"
                          />
                          {monthlyStats.map((d, i) => (
                            <g key={i}>
                              <circle
                                cx={60 + i * stepX}
                                cy={250 - d.count * scale}
                                r="4"
                                fill="#3b82f6"
                                stroke="white"
                                strokeWidth="2"
                              />
                              <text
                                x={60 + i * stepX}
                                y={250 - d.count * scale - 10}
                                textAnchor="middle"
                                className="text-xs fill-gray-700 font-medium"
                              >
                                {d.count}
                              </text>
                            </g>
                          ))}
                        </>
                      );
                    })()}
                    {monthlyStats.map((d, i) => (
                      <text
                        key={i}
                        x={60 + i * (400 / (monthlyStats.length - 1))}
                        y="285"
                        textAnchor="middle"
                        className="text-xs fill-gray-600"
                        transform={`rotate(-30 ${60 + i * (400 / (monthlyStats.length - 1))} 285)`}
                      >
                        {d.month}
                      </text>
                    ))}
                  </svg>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg shadow-md border">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Plan Type Distribution</h2>
                <div className="h-64">
                  <svg width="100%" height="100%" viewBox="0 0 400 250">
                    <rect width="100%" height="100%" fill="#f8fafc" />
                    {planTypeStats.length > 0 && (() => {
                      const total = planTypeStats.reduce((sum, d) => sum + d.count, 0);
                      let currentAngle = 0;
                      const centerX = 150;
                      const centerY = 125;
                      const radius = 60;
                      return (
                        <>
                          {planTypeStats.map((d, i) => {
                            const angle = (d.count / total) * 360;
                            const endAngle = currentAngle + angle;
                            const x1 = centerX + radius * Math.cos((currentAngle - 90) * Math.PI / 180);
                            const y1 = centerY + radius * Math.sin((currentAngle - 90) * Math.PI / 180);
                            const x2 = centerX + radius * Math.cos((endAngle - 90) * Math.PI / 180);
                            const y2 = centerY + radius * Math.sin((endAngle - 90) * Math.PI / 180);
                            const largeArcFlag = angle > 180 ? 1 : 0;
                            const pathData = [
                              `M ${centerX} ${centerY}`,
                              `L ${x1} ${y1}`,
                              `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                              'Z'
                            ].join(' ');
                            currentAngle = endAngle;
                            return (
                              <path
                                key={i}
                                d={pathData}
                                fill={getPlanTypeColor(d.planType)}
                                stroke="white"
                                strokeWidth="2"
                              />
                            );
                          })}
                          {planTypeStats.map((d, i) => (
                            <g key={i}>
                              <rect
                                x={250}
                                y={40 + i * 25}
                                width="12"
                                height="12"
                                fill={getPlanTypeColor(d.planType)}
                              />
                              <text
                                x={270}
                                y={50 + i * 25}
                                className="text-xs fill-gray-700"
                              >
                                {d.planType} ({d.count} - {d.percentage}%)
                              </text>
                            </g>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                </div>
              </div>
            </div>

            <div className="mt-6 bg-white p-4 rounded-lg shadow-md border">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Plan Type Breakdown</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {planTypeStats.map((plan, index) => (
                  <div key={index} className="p-3 rounded-lg border" style={{ backgroundColor: `${getPlanTypeColor(plan.planType)}20` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">{plan.planType}</p>
                        <p className="text-2xl font-bold" style={{ color: getPlanTypeColor(plan.planType) }}>
                          {plan.count}
                        </p>
                        <p className="text-sm text-gray-500">{plan.percentage}% of total</p>
                      </div>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: getPlanTypeColor(plan.planType) }}>
                        <span className="text-white text-sm font-bold">{plan.count}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === 'addon' && (
          <div className="space-y-6">
            {!clientDetails ? (
              <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg border border-gray-200 p-6">
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg">
                      <Search className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <label className="block text-lg font-bold text-gray-900">Search Client</label>
                      <p className="text-sm text-gray-600">Find a client to upgrade their plan or add addons</p>
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Type client name or email to search..."
                      className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400 transition-all"
                    />
                  </div>
                </div>
                {filteredClients.length > 0 && (
                  <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
                    {filteredClients.map((client) => (
                      <div
                        key={client._id || client.email}
                        onClick={() => handleClientSearch(client)}
                        className="p-4 border-2 border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-all bg-white"
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <User className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-gray-900 text-lg truncate">{client.name || 'N/A'}</p>
                            <p className="text-sm text-gray-600 truncate">{client.email}</p>
                            {client.planType && (
                              <span className="inline-flex items-center gap-1 mt-2 px-3 py-1 bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-700 rounded-full text-xs font-semibold border border-blue-200">
                                <CreditCard className="w-3 h-3" />
                                {client.planType.charAt(0).toUpperCase() + client.planType.slice(1).toLowerCase()}
                              </span>
                            )}
                          </div>
                          <div className="text-blue-600">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {searchQuery && filteredClients.length === 0 && (
                  <div className="text-center py-8">
                    <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-600 font-medium">No clients found</p>
                    <p className="text-sm text-gray-500 mt-1">Try a different search term</p>
                  </div>
                )}
                {!searchQuery && (
                  <div className="text-center py-12">
                    <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600 font-semibold text-lg">Start by searching for a client</p>
                    <p className="text-sm text-gray-500 mt-2">Enter a client name or email above to get started</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[calc(100vh-12rem)]">
                <div className="bg-gradient-to-br from-white to-blue-50 rounded-xl shadow-lg border border-gray-200 p-4 overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg">
                        <User className="w-4 h-4 text-white" />
                      </div>
                      <h2 className="text-lg font-bold text-gray-900">Client Details</h2>
                    </div>
                    <button
                      onClick={() => {
                        setClientDetails(null);
                        setSelectedClient(null);
                        setSearchQuery('');
                        setSelectedPlan(null);
                        setSelectedAddon(null);
                      }}
                      className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                  {loadingClient ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                        <p className="text-xs text-gray-600">Loading...</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 bg-white rounded-lg border border-gray-200">
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Name</label>
                          <p className="text-gray-900 font-semibold mt-0.5 text-sm">{clientDetails.name || 'N/A'}</p>
                        </div>
                        <div className="p-2 bg-white rounded-lg border border-gray-200">
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Email</label>
                          <p className="text-gray-900 font-medium mt-0.5 text-xs break-all">{clientDetails.email || 'N/A'}</p>
                        </div>
                      </div>
                      
                      <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">Current Plan</label>
                            <p className="text-blue-900 font-bold text-base mt-0.5">
                              {clientDetails.planType 
                                ? clientDetails.planType.charAt(0).toUpperCase() + clientDetails.planType.slice(1).toLowerCase()
                                : 'N/A'}
                            </p>
                          </div>
                          <div className="text-right">
                            <label className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">Plan Price</label>
                            <p className="text-blue-900 font-bold text-base mt-0.5">
                              {clientDetails.planPrice ? `$${clientDetails.planPrice}` : 'N/A'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 bg-white rounded-lg border border-gray-200">
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Amount Paid</label>
                          <p className="text-gray-900 font-semibold mt-0.5 text-sm text-green-600">
                            {formatAmount(clientDetails.amountPaid || 0)}
                          </p>
                        </div>
                        <div className="p-2 bg-white rounded-lg border border-gray-200">
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Manager</label>
                          <p className="text-gray-900 font-medium mt-0.5 text-xs">{clientDetails.dashboardTeamLeadName || 'N/A'}</p>
                        </div>
                      </div>

                      <div className="p-3 bg-white rounded-lg border border-gray-200">
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Active Addons</label>
                        {clientDetails.addons && clientDetails.addons.length > 0 ? (
                          <div className="space-y-1.5">
                            {clientDetails.addons.map((addon, idx) => (
                              <div key={idx} className="flex items-center justify-between p-1.5 bg-orange-50 rounded-lg border border-orange-200">
                                <div className="flex items-center gap-1.5">
                                  <Zap className="w-3 h-3 text-orange-600" />
                                  <span className="text-xs font-semibold text-gray-900">{addon.type} Add-On</span>
                                </div>
                                <span className="text-xs font-bold text-orange-600">${addon.price}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-3">
                            <Zap className="w-6 h-6 text-gray-300 mx-auto mb-1" />
                            <p className="text-xs text-gray-500 font-medium">No previous addons</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3 overflow-y-auto">
                  <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg">
                        <ArrowUp className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-gray-900">Upgrade Plan</h3>
                        <p className="text-xs text-gray-600">Upgrade to a higher tier</p>
                      </div>
                    </div>
                    
                    {getCurrentPlan() && (
                      <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center gap-1.5">
                          <CreditCard className="w-3 h-3 text-blue-600" />
                          <span className="text-xs font-medium text-blue-900">
                            Current: <span className="font-bold">{getCurrentPlan().label}</span>
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      {planOptions.map((plan) => {
                        const Icon = plan.icon;
                        const isCurrentPlan = getCurrentPlan()?.value === plan.value;
                        const isUpgradeable = canUpgradeToPlan(plan.value);
                        const upgradePrice = getUpgradePrice(plan.value);
                        const isSelected = selectedPlan === plan.value;

                        return (
                          <div
                            key={plan.value}
                            className={`relative p-3 border-2 rounded-lg cursor-pointer transition-all ${
                              isCurrentPlan
                                ? 'border-blue-500 bg-blue-50 cursor-not-allowed'
                                : !isUpgradeable
                                  ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                                  : isSelected
                                    ? 'border-orange-500 bg-orange-50 shadow-md'
                                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm bg-white'
                            }`}
                            onClick={() => {
                              if (!isCurrentPlan && isUpgradeable) {
                                setSelectedPlan(plan.value);
                              }
                            }}
                          >
                            {isCurrentPlan && (
                              <div className="absolute top-1.5 right-1.5">
                                <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded-full">
                                  Current
                                </span>
                              </div>
                            )}
                            
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-2 flex-1">
                                <div className={`p-1.5 rounded-lg ${
                                  plan.color === 'orange' ? 'bg-orange-100' :
                                  plan.color === 'blue' ? 'bg-blue-100' :
                                  plan.color === 'gold' ? 'bg-yellow-100' :
                                  'bg-purple-100'
                                }`}>
                                  <Icon className={`w-4 h-4 ${
                                    plan.color === 'orange' ? 'text-orange-600' :
                                    plan.color === 'blue' ? 'text-blue-600' :
                                    plan.color === 'gold' ? 'text-yellow-600' :
                                    'text-purple-600'
                                  }`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <p className="font-bold text-gray-900 text-sm">{plan.label}</p>
                                    {isSelected && !isCurrentPlan && (
                                      <CheckCircle2 className="w-4 h-4 text-orange-500 flex-shrink-0" />
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-600 mb-1">
                                    {plan.applications.toLocaleString()} Apps
                                  </p>
                                  {!isCurrentPlan && isUpgradeable && upgradePrice > 0 && (
                                    <div className="flex items-center gap-1 mt-1">
                                      <span className="text-[10px] text-gray-500">Upgrade:</span>
                                      <span className="text-xs font-semibold text-green-600">
                                        +${upgradePrice}
                                      </span>
                                    </div>
                                  )}
                                  {!isUpgradeable && !isCurrentPlan && (
                                    <p className="text-[10px] text-red-600 font-medium mt-0.5">
                                      Cannot downgrade
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="text-right ml-2 flex-shrink-0">
                                <p className="text-base font-bold text-gray-900">${plan.price.toLocaleString()}</p>
                                <p className="text-[10px] text-gray-500">month</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      
                      <button
                        onClick={handleUpgradePlan}
                        disabled={!selectedPlan || upgrading || getCurrentPlan()?.value === selectedPlan}
                        className="w-full bg-gradient-to-r from-black to-gray-800 text-white py-2 px-3 rounded-lg hover:from-gray-800 hover:to-gray-900 transition-all font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
                      >
                        {upgrading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>Upgrading...</span>
                          </>
                        ) : selectedPlan ? (
                          <>
                            <ArrowUp className="w-4 h-4" />
                            <span>Upgrade to {selectedPlan}</span>
                          </>
                        ) : (
                          'Select a plan'
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-white to-orange-50 rounded-xl shadow-lg border border-orange-200 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg">
                        <Zap className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-gray-900">Booster Add-On</h3>
                        <p className="text-xs text-gray-600">Add more applications</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      {addonOptions.map((addon) => {
                        const isSelected = selectedAddon === addon.value;
                        return (
                          <div
                            key={addon.value}
                            className={`relative p-3 border-2 rounded-lg cursor-pointer transition-all ${
                              isSelected
                                ? 'border-orange-500 bg-orange-50 shadow-md'
                                : 'border-gray-200 hover:border-orange-200 hover:shadow-sm bg-white'
                            }`}
                            onClick={() => setSelectedAddon(addon.value)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-orange-100 rounded-lg">
                                  <Zap className="w-4 h-4 text-orange-600" />
                                </div>
                                <div>
                                  <p className="font-bold text-gray-900 text-sm">{addon.label}</p>
                                  <p className="text-[10px] text-gray-500 mt-0.5">Additional apps</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-right">
                                  <p className="text-base font-bold text-gray-900">${addon.price}</p>
                                  <p className="text-[10px] text-gray-500">one-time</p>
                                </div>
                                {isSelected && (
                                  <CheckCircle2 className="w-5 h-5 text-orange-500 flex-shrink-0" />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      
                      <button
                        onClick={handleAddAddon}
                        disabled={!selectedAddon || upgrading}
                        className="w-full bg-gradient-to-r from-orange-600 to-orange-500 text-white py-2 px-3 rounded-lg hover:from-orange-700 hover:to-orange-600 transition-all font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
                      >
                        {upgrading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>Adding...</span>
                          </>
                        ) : selectedAddon ? (
                          <>
                            <Zap className="w-4 h-4" />
                            <span>Add {addonOptions.find(a => a.value === selectedAddon)?.label}</span>
                          </>
                        ) : (
                          'Select an addon'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'referral' && (
          <div className="space-y-6">
            <div className="mb-6">
              <p className="text-gray-600">Manage referral benefits for clients. Select Professional (+200 applications) or Executive (+300 applications).</p>
            </div>

            {loadingReferralUsers ? (
              <div className="bg-white rounded-xl shadow-md border p-8 text-center">
                <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 text-gray-600">Loading users...</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-md border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          Client Name
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          Referrals
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          Applications Benefit
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          Notes
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {referralUsers.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                            No users found
                          </td>
                        </tr>
                      ) : (
                        referralUsers.map((user) => {
                          const isUpdating = updatingReferralUser[user.email];
                          const referrals = Array.isArray(user.referrals) ? user.referrals : [];
                          const referralCount = typeof user.referralCount === 'number'
                            ? user.referralCount
                            : referrals.length;
                          const benefitAmount = typeof user.referralApplicationsAdded === 'number'
                            ? user.referralApplicationsAdded
                            : 0;
                          const isEditingNotes = editingNotes[user.email];
                          const currentNotes = notesValues[user.email] !== undefined ? notesValues[user.email] : (user.notes || "");
                          
                          return (
                            <tr key={user._id || user.email} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">
                                  {user.name || 'Unknown'}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-600">
                                  {user.email}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap align-top">
                                <div className="flex flex-col gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openReferralModal(user)}
                                    className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-800 bg-white hover:bg-gray-50 shadow-sm transition-colors"
                                  >
                                    Add Referral
                                  </button>
                                  <div className="text-xs text-gray-500">
                                    {referralCount > 0 ? (
                                      <span>{referralCount} referral{referralCount === 1 ? '' : 's'}</span>
                                    ) : (
                                      <span className="italic text-gray-400">No referrals yet</span>
                                    )}
                                  </div>
                                  {referralCount > 0 && (
                                    <div className="mt-1 w-64 h-20 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 px-2 py-1">
                                      {referrals.map((referral, index) => (
                                        <div
                                          key={`${referral.name}-${index}`}
                                          className="flex items-center justify-between gap-2 py-0.5"
                                        >
                                          <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium text-gray-800 truncate">
                                              {referral.name}
                                            </p>
                                          </div>
                                          <span className={`ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                            referral.plan === 'Executive'
                                              ? 'bg-purple-100 text-purple-700'
                                              : 'bg-blue-100 text-blue-700'
                                          }`}>
                                            {referral.plan === 'Executive' ? '+300' : '+200'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  {isUpdating && !isEditingNotes ? (
                                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                  ) : (
                                    <span className={`text-sm font-semibold ${
                                      benefitAmount > 0 ? 'text-green-600' : 'text-gray-400'
                                    }`}>
                                      {benefitAmount > 0 ? `+${benefitAmount}` : '0'} Applications
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                {isEditingNotes ? (
                                  <div className="flex flex-col gap-2 min-w-[300px]">
                                    <textarea
                                      value={currentNotes}
                                      onChange={(e) => setNotesValues(prev => ({ ...prev, [user.email]: e.target.value }))}
                                      disabled={isUpdating}
                                      rows={3}
                                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                                      placeholder="Add notes about this client..."
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => handleNotesSave(user.email)}
                                        disabled={isUpdating}
                                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                      >
                                        {isUpdating ? 'Saving...' : 'Save'}
                                      </button>
                                      <button
                                        onClick={() => handleNotesCancel(user.email, user.notes || "")}
                                        disabled={isUpdating}
                                        className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-start gap-2 min-w-[300px]">
                                    <div className="flex-1">
                                      {user.notes ? (
                                        <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                                          {user.notes}
                                        </p>
                                      ) : (
                                        <p className="text-sm text-gray-400 italic">No notes</p>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => handleNotesEdit(user.email, user.notes || "")}
                                      className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors flex-shrink-0"
                                      title="Edit notes"
                                    >
                                      {user.notes ? 'Edit' : 'Add'}
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {showReferralModal && activeReferralUser && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full mx-4 overflow-hidden">
            <div className="px-6 py-5 border-b flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Referral Management
                </p>
                <h2 className="mt-1 text-lg font-bold text-gray-900">
                  {activeReferralUser.name || 'Unknown'}{" "}
                  <span className="text-gray-500 text-sm">({activeReferralUser.email})</span>
                </h2>
              </div>
              <button
                type="button"
                onClick={closeReferralModal}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 uppercase tracking-[0.18em] mb-1.5">
                    Referred Client Name
                  </label>
                  <input
                    type="text"
                    value={newReferralName}
                    onChange={(e) => setNewReferralName(e.target.value)}
                    placeholder="Who did this client refer?"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/80 focus:border-gray-900/80 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 uppercase tracking-[0.18em] mb-1.5">
                    Plan for Referral
                  </label>
                  <div className="relative">
                    <select
                      value={newReferralPlan}
                      onChange={(e) => setNewReferralPlan(e.target.value)}
                      className="w-full appearance-none px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/80 focus:border-gray-900/80 transition-all"
                    >
                      <option value="Professional">Professional (+200 applications)</option>
                      <option value="Executive">Executive (+300 applications)</option>
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400">
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-700 uppercase tracking-[0.18em] mb-1.5">
                  Notes (optional)
                </label>
                <textarea
                  value={newReferralNotes}
                  onChange={(e) => setNewReferralNotes(e.target.value)}
                  rows={3}
                  placeholder="Add any important context about this referral for the team..."
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/80 focus:border-gray-900/80 transition-all resize-none"
                />
              </div>

              <div className="border rounded-xl bg-gray-50/80 px-3.5 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-[0.18em]">
                    Existing Referrals
                  </span>
                  <span className="text-xs text-gray-500">
                    {Array.isArray(activeReferralUser.referrals) ? activeReferralUser.referrals.length : 0} total
                  </span>
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                  {Array.isArray(activeReferralUser.referrals) && activeReferralUser.referrals.length > 0 ? (
                    activeReferralUser.referrals.map((referral, index) => (
                      <div
                        key={`${referral.name}-${index}`}
                        className="flex items-start justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 border border-gray-200"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 truncate">{referral.name}</p>
                          {referral.notes && (
                            <p className="mt-0.5 text-[11px] text-gray-500 line-clamp-2">
                              {referral.notes}
                            </p>
                          )}
                        </div>
                        <span
                          className={`ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            referral.plan === 'Executive'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {referral.plan === 'Executive' ? 'Executive · +300' : 'Professional · +200'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-gray-400 italic px-1 py-1">No referrals recorded yet.</p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddReferral}
                disabled={savingReferral}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 text-xs font-semibold text-white py-2.75 py-3 shadow-md hover:bg-black transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {savingReferral && (
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                <span>+ Add Referral</span>
              </button>
            </div>
            <div className="px-6 py-4 border-t flex items-center justify-between bg-gray-50">
              <div className="text-xs text-gray-500">
                Each Professional referral adds <span className="font-semibold text-gray-700">+200</span> applications.
                Executive adds <span className="font-semibold text-gray-700">+300</span>.
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeReferralModal}
                  disabled={savingReferral}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 disabled:opacity-60"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
