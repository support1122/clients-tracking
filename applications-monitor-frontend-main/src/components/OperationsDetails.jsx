import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_BASE || "http://localhost:8001";

const OperationsDetails = ({ operationEmail, onClose, userRole = 'admin' }) => {
  const [operation, setOperation] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState('personal');
  const [formData, setFormData] = useState({
    name: '',
    email: operationEmail,
    role: 'operations',
    managedUsers: []
  });
  const [managedUsers, setManagedUsers] = useState([]);
  const [availableClients, setAvailableClients] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedClientToAssign, setSelectedClientToAssign] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);

  useEffect(() => {
    if (operationEmail) {
      fetchOperationDetails();
      fetchManagedUsers();
    }
  }, [operationEmail]);

  useEffect(() => {
    if (activeSection === 'managed') {
      fetchManagedUsers();
    }
  }, [activeSection]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const fetchOperationDetails = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`${API_BASE}/api/operations/${encodeURIComponent(operationEmail)}`);
      if (response.ok) {
        const data = await response.json();
        setOperation(data.operation);
        setFormData({
          name: data.operation.name || '',
          email: data.operation.email || operationEmail,
          role: data.operation.role || 'operations',
          managedUsers: data.operation.managedUsers || []
        });
      } else {
        // Operation doesn't exist, show empty form for creation
        setOperation(null);
        setFormData(prev => ({ ...prev, email: operationEmail }));
      }
    } catch (error) {
      console.error('Error fetching operation details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? e.target.checked : value
    }));
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`${API_BASE}/api/operations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const data = await response.json();
        setOperation(data.operation);
        setIsEditing(false);
        alert('Operation details saved successfully!');
      } else {
        alert('Failed to save operation details. Please try again.');
      }
    } catch (error) {
      alert('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchManagedUsers = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/operations/${encodeURIComponent(operationEmail)}/managed-users`);
      if (response.ok) {
        const data = await response.json();
        setManagedUsers(data.managedUsers || []);
      }
    } catch (error) {
      console.error('Error fetching managed users:', error);
    }
  };

  const fetchAvailableClients = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/operations/${encodeURIComponent(operationEmail)}/available-clients`);
      if (response.ok) {
        const data = await response.json();
        setAvailableClients(data.availableClients || []);
      }
    } catch (error) {
      console.error('Error fetching available clients:', error);
    }
  };

  const handleAssignUser = async () => {
    if (!selectedClientToAssign) {
      alert('Please select a client to assign.');
      return;
    }

    try {
      setAssignLoading(true);
      
      // Find the selected client's email from availableClients
      // Now using _id instead of userID since we're using NewUserModel
      const selectedClient = availableClients.find(client => client._id === selectedClientToAssign);
      if (!selectedClient) {
        alert('Selected client not found.');
        return;
      }

      const response = await fetch(`${API_BASE}/api/operations/assign-client`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          clientEmail: selectedClient.email,
          operatorEmail: operationEmail 
        }),
      });

      if (response.ok) {
        await fetchManagedUsers();
        setShowAssignModal(false);
        setSelectedClientToAssign('');
        alert('Client assigned successfully!');
      } else {
        const errorData = await response.json();
        alert(`Failed to assign client: ${errorData.error || 'Please try again.'}`);
      }
    } catch (error) {
      alert('Network error. Please try again.');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleRemoveUser = async (userID) => {
    if (!confirm('Are you sure you want to remove this client from managed users?')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/operations/${encodeURIComponent(operationEmail)}/managed-users/${encodeURIComponent(userID)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchManagedUsers();
        alert('Client removed successfully!');
      } else {
        alert('Failed to remove client. Please try again.');
      }
    } catch (error) {
      alert('Network error. Please try again.');
    }
  };

  const openAssignModal = async () => {
    await fetchAvailableClients();
    setShowAssignModal(true);
  };

  const handleDeleteOperation = async () => {
    if (!confirm('Are you sure you want to delete this operation user? This action cannot be undone and will perform cascade deletion.')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/operations/${encodeURIComponent(operationEmail)}/delete-operation`, {
        method: 'DELETE',
      });

      if (response.ok) {
        alert('Operation user deleted successfully!');
        onClose(); // Close the modal after successful deletion
      } else {
        alert('Failed to delete operation user. Please try again.');
      }
    } catch (error) {
      alert('Network error. Please try again.');
    }
  };

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
      id: 'managed',
      label: 'Managed Users',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
        </svg>
      )
    }
  ];

  if (loading && !operation) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading operation details...</div>
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
        <div className="bg-gradient-to-r from-green-600 via-green-700 to-emerald-700 px-8 py-6 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-green-600/20 to-emerald-700/20"></div>
          <div className="relative flex justify-between items-center">
            <div>
              <h2 className="text-3xl font-bold mb-2 flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                </div>
                Operations Team Details
              </h2>
              <p className="text-green-100 text-lg font-medium">{operationEmail}</p>
            </div>
            <div className="flex gap-3">
              {!isEditing ? (
                userRole === 'admin' ? (
                  <div className="flex gap-3">
                    {/* <button
                      onClick={() => setIsEditing(true)}
                      className="flex items-center gap-3 px-6 py-3 bg-white text-green-600 rounded-xl hover:bg-green-50 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      {operation ? 'Edit Details' : 'Add Details'}
                    </button> */}
                    <button
                      onClick={handleDeleteOperation}
                      className="flex items-center gap-3 px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete Operation User
                    </button>
                  </div>
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
        <div className="flex h-[calc(95vh-120px)] bg-gradient-to-br from-slate-50 to-green-50">
          {/* Sidebar Navigation */}
          <div className="w-80 bg-white border-r border-slate-200 p-6 overflow-y-auto">
            <div className="space-y-2">
              {navigationItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${
                    activeSection === item.id
                      ? 'bg-green-50 text-green-700 border border-green-200 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${
                    activeSection === item.id ? 'bg-green-100' : 'bg-slate-100'
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
                  <div className="p-2 bg-green-100 rounded-lg">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <div className="px-4 py-3 bg-gradient-to-r from-green-50 to-green-100 border border-green-200 rounded-xl text-green-700 font-medium shadow-sm">
                      {operationEmail}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Name
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white shadow-sm hover:shadow-md"
                        placeholder="Enter full name"
                      />
                    ) : (
                      <div className="px-4 py-3 bg-gradient-to-r from-white to-slate-50 border border-slate-200 rounded-xl text-slate-700 shadow-sm">
                        {operation?.name || <span className="text-slate-400 italic">Not set</span>}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Role
                    </label>
                    {isEditing ? (
                      <select
                        name="role"
                        value={formData.role}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white shadow-sm hover:shadow-md"
                      >
                        <option value="operations">Operations</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <div className="px-4 py-3 bg-gradient-to-r from-white to-slate-50 border border-slate-200 rounded-xl text-slate-700 shadow-sm capitalize">
                        {operation?.role || 'operations'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'managed' && (
              <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow duration-300">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                      </svg>
                    </div>
                    Managed Users
                  </h3>
                  <button
                    onClick={openAssignModal}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Assign User
                  </button>
                </div>
                
                <div className="space-y-4">
                  <p className="text-slate-600">
                    Manage the clients assigned to this operations team member. 
                    These clients will appear in their job applications and reports.
                  </p>
                  
                  <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm font-medium text-slate-700">
                        Managed users: {managedUsers.length} user(s)
                      </p>
                    </div>
                    
                    {managedUsers.length > 0 ? (
                      <div className="space-y-3">
                        {managedUsers.map((user, index) => (
                          <div key={index} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                    <span className="text-blue-600 font-semibold text-sm">
                                      {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                  <div>
                                    <div className="font-medium text-slate-900">
                                      {user.name || user.email.split('@')[0]}
                                    </div>
                                    <div className="text-sm text-slate-500">
                                      {user.email}
                                    </div>
                                    {user.company && (
                                      <div className="text-xs text-slate-400">
                                        {user.company}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => handleRemoveUser(user.userID)}
                                className="flex items-center gap-1 px-3 py-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors text-sm font-medium"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                          </svg>
                        </div>
                        <p className="text-slate-500 mb-2">No managed users yet</p>
                        <p className="text-sm text-slate-400">Click "Assign User" to add clients to this operations team member</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Record Information - Always visible */}
            {operation && (
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
                      <span className="font-medium text-slate-700">{operation.createdAt}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span className="text-slate-600">Last Updated:</span>
                      <span className="font-medium text-slate-700">{operation.updatedAt}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Assign User Modal */}
      {showAssignModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div 
            className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-slate-900">Assign Client</h3>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAssignModal(false);
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <p className="text-slate-600 text-sm">
                Select a client to assign to this operations team member.
              </p>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Available Clients
                </label>
                <select
                  value={selectedClientToAssign}
                  onChange={(e) => {
                    e.stopPropagation();
                    setSelectedClientToAssign(e.target.value);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="">Select a client...</option>
                  {availableClients.map((client, index) => (
                    <option key={index} value={client._id}>
                      {client.name || client.email.split('@')[0]} ({client.email})
                    </option>
                  ))}
                </select>
              </div>
              
              {availableClients.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-slate-500 text-sm">No available clients to assign</p>
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAssignModal(false);
                }}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAssignUser();
                }}
                disabled={!selectedClientToAssign || assignLoading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {assignLoading ? 'Assigning...' : 'Assign Client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperationsDetails;
