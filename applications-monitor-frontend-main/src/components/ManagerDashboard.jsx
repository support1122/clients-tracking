import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import ManagerCard from './ManagerCard';
import Layout from './Layout';

const API_BASE = import.meta.env.VITE_BASE || 'http://localhost:8001';

// Validate required environment variables
if (!API_BASE) {
  console.error('❌ VITE_BASE environment variable is required');
}

export default function ManagerDashboard() {
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddManager, setShowAddManager] = useState(false);
  const [editingManager, setEditingManager] = useState(null);
  const [newManager, setNewManager] = useState({
    fullName: '',
    email: '',
    phone: ''
  });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Get auth token
  const getAuthToken = () => localStorage.getItem('authToken');

  // Fetch all managers
  const fetchManagers = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/managers`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setManagers(data.managers);
      } else {
        setError('Failed to fetch managers');
        toast.error('Failed to fetch managers');
      }
    } catch (error) {
      setError('Network error');
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  };

  // Create new manager
  const createManager = async (e) => {
    e.preventDefault();
    setError('');
    setUploadingPhoto(true);

    try {
      const formData = new FormData();
      formData.append('fullName', newManager.fullName);
      formData.append('email', newManager.email);
      formData.append('phone', newManager.phone);
      formData.append('department', newManager.department);
      formData.append('position', newManager.position);
      formData.append('bio', newManager.bio);

      // Add profile photo if selected
      const photoInput = document.getElementById('profilePhoto');
      if (photoInput && photoInput.files[0]) {
        formData.append('profilePhoto', photoInput.files[0]);
      }

      const response = await fetch(`${API_BASE}/api/managers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        setNewManager({
          fullName: '',
          email: '',
          phone: ''
        });
        setShowAddManager(false);
        fetchManagers(); // Refresh managers list
        toast.success('Manager created successfully');
        
        // Reset file input
        if (photoInput) {
          photoInput.value = '';
        }
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to create manager');
        toast.error(data.error || 'Failed to create manager');
      }
    } catch (error) {
      setError('Network error');
      toast.error('Network error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Update manager
  const updateManager = async (managerId, updatedData) => {
    try {
      const formData = new FormData();
      Object.keys(updatedData).forEach(key => {
        if (updatedData[key] !== undefined && updatedData[key] !== null) {
          formData.append(key, updatedData[key]);
        }
      });

      const response = await fetch(`${API_BASE}/api/managers/${managerId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: formData
      });

      if (response.ok) {
        fetchManagers(); // Refresh managers list
        toast.success('Manager updated successfully');
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to update manager');
      }
    } catch (error) {
      toast.error('Network error');
    }
  };

  // Delete manager
  const deleteManager = async (managerId, managerName) => {
    if (!window.confirm(`Are you sure you want to delete manager "${managerName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/managers/${managerId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });

      if (response.ok) {
        fetchManagers(); // Refresh managers list
        toast.success('Manager deleted successfully');
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to delete manager');
      }
    } catch (error) {
      toast.error('Network error');
    }
  };

  // Upload profile photo
  const uploadProfilePhoto = async (managerId, file) => {
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('profilePhoto', file);

      const response = await fetch(`${API_BASE}/api/managers/${managerId}/upload-photo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: formData
      });

      if (response.ok) {
        fetchManagers(); // Refresh managers list
        toast.success('Profile photo uploaded successfully');
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to upload photo');
      }
    } catch (error) {
      toast.error('Network error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  useEffect(() => {
    fetchManagers();
  }, []);

  const handleEditManager = (manager) => {
    setEditingManager(manager);
  };

  const handleCancelEdit = () => {
    setEditingManager(null);
  };

  return (
    <Layout>
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Manager Dashboard</h1>
              <p className="text-gray-600">Manage your team managers and their profiles</p>
            </div>
            <button
              onClick={() => setShowAddManager(!showAddManager)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {showAddManager ? 'Cancel' : 'Add Manager'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Add Manager Section */}
        {showAddManager && (
          <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Add New Manager</h2>
            <form onSubmit={createManager} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={newManager.fullName}
                    onChange={(e) => setNewManager({ ...newManager, fullName: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={newManager.email}
                    onChange={(e) => setNewManager({ ...newManager, email: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={newManager.phone}
                    onChange={(e) => setNewManager({ ...newManager, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Profile Photo
                  </label>
                  <input
                    id="profilePhoto"
                    type="file"
                    accept="image/*"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={uploadingPhoto}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {uploadingPhoto ? 'Creating...' : 'Create Manager'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddManager(false)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Managers Grid */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              All Managers ({managers.length})
            </h2>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading managers...</p>
            </div>
          ) : managers.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No managers found</h3>
              <p className="text-gray-600 mb-4">Get started by adding your first manager.</p>
              <button
                onClick={() => setShowAddManager(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Add Manager
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {managers.map((manager) => (
                <ManagerCard
                  key={manager._id}
                  manager={manager}
                  onEdit={handleEditManager}
                  onUpdate={updateManager}
                  onDelete={deleteManager}
                  onUploadPhoto={uploadProfilePhoto}
                  isEditing={editingManager && editingManager._id === manager._id}
                  onCancelEdit={handleCancelEdit}
                  uploadingPhoto={uploadingPhoto}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
