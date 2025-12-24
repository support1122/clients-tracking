import React, { useState, useEffect } from 'react';
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
  X
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_BASE || 'https://clients-tracking-backend.onrender.com';

export default function ClientPreferences() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [editingClient, setEditingClient] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all'); // all, hasTodos, hasLockPeriods, activeLock

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
        setClients(data.clients || []);
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
  };

  const cancelEditing = () => {
    setEditingClient(null);
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

  const toggleTodoStatus = async (client, todoId) => {
    try {
      const updatedTodos = (client.todos || []).map(todo =>
        todo.id === todoId ? { ...todo, completed: !todo.completed, updatedAt: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }) } : todo
      );

      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/api/client-todos/${client.email}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          todos: updatedTodos
        })
      });

      const data = await response.json();
      if (data.success) {
        fetchClients();
      } else {
        throw new Error(data.error || 'Failed to update');
      }
    } catch (error) {
      console.error('Error toggling todo:', error);
      toast.error('Failed to update todo status');
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

  const addLockPeriod = (clientEmail) => {
    if (!editingClient || editingClient.email !== clientEmail) return;

    const newPeriod = {
      id: `lock-${Date.now()}`,
      startDate: '',
      endDate: '',
      reason: '',
      createdAt: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
    };

    setEditingClient({
      ...editingClient,
      lockPeriods: [...editingClient.lockPeriods, newPeriod]
    });
  };

  const updateLockPeriod = (clientEmail, periodId, updates) => {
    if (!editingClient || editingClient.email !== clientEmail) return;

    setEditingClient({
      ...editingClient,
      lockPeriods: editingClient.lockPeriods.map(period =>
        period.id === periodId ? { ...period, ...updates } : period
      )
    });
  };

  const deleteLockPeriod = (clientEmail, periodId) => {
    if (!editingClient || editingClient.email !== clientEmail) return;

    setEditingClient({
      ...editingClient,
      lockPeriods: editingClient.lockPeriods.filter(period => period.id !== periodId)
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

  // Filter clients
  const filteredClients = clients.filter(client => {
    // Search filter
    const matchesSearch = !searchQuery ||
      client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.email.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Status filter
    if (filterStatus === 'hasTodos') {
      return client.todos && client.todos.length > 0;
    }
    if (filterStatus === 'hasLockPeriods') {
      return client.lockPeriods && client.lockPeriods.length > 0;
    }
    if (filterStatus === 'activeLock') {
      return getActiveLockPeriod(client.lockPeriods) !== null;
    }

    return true;
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
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Client Preferences</h1>
          <p className="text-gray-600">Manage TODOs and lock periods for all clients</p>
        </div>

        {/* Search and Filter Bar */}
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
                <option value="hasTodos">Has TODOs</option>
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

        {/* Table */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-12">
                    {/* Expand/Collapse */}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    TODOs
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Lock Periods
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      {searchQuery ? 'No clients found matching your search' : 'No clients found'}
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((client, idx) => {
                    const isExpanded = expandedRows.has(client.email);
                    const isEditing = editingClient?.email === client.email;
                    const activeLock = getActiveLockPeriod(client.lockPeriods);
                    const incompleteTodos = (client.todos || []).filter(t => !t.completed);
                    const completedTodos = (client.todos || []).filter(t => t.completed);
                    const displayData = isEditing ? editingClient : client;

                    return (
                      <React.Fragment key={client.email}>
                        <tr className={`hover:bg-gray-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button
                              onClick={() => toggleRowExpansion(client.email)}
                              className="p-1 hover:bg-gray-200 rounded transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-5 h-5 text-gray-600" />
                              ) : (
                                <ChevronDown className="w-5 h-5 text-gray-600" />
                              )}
                            </button>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{client.name}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-600">{client.email}</div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center">
                              {incompleteTodos.length > 0 ? (
                                <div className="w-64 max-h-24 overflow-y-auto bg-gray-50 rounded-lg border border-gray-200 p-2 text-left">
                                  <div className="space-y-1.5">
                                    {incompleteTodos.map((todo) => (
                                      <div
                                        key={todo.id}
                                        className="flex items-start gap-2 text-sm cursor-pointer hover:bg-gray-100 p-1 rounded transition-colors group/todo"
                                        onClick={() => toggleTodoStatus(client, todo.id)}
                                        title="Click to mark as complete"
                                      >
                                        <Circle className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 group-hover/todo:text-indigo-500" />
                                        <span className="text-gray-700 leading-tight">{todo.title}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                                  <span className="text-sm text-green-600 font-medium">All Complete</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-sm font-medium text-gray-900">
                                {client.lockPeriods?.length || 0}
                              </span>
                              {activeLock && (
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full flex items-center gap-1">
                                  <Lock className="w-3 h-3" />
                                  Active
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            {activeLock ? (
                              <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded">
                                Locked
                              </span>
                            ) : (
                              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={saveClientData}
                                  disabled={saving}
                                  className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                                  title="Save"
                                >
                                  <Save className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={cancelEditing}
                                  className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                  title="Cancel"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEditing(client)}
                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                title="Edit"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Expanded Row Content */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="px-6 py-4 bg-gray-50">
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* TODOs Section */}
                                <div className="bg-white rounded-lg border border-gray-200 p-4">
                                  <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold text-gray-900">TODOs</h3>
                                    {isEditing && (
                                      <button
                                        onClick={() => addTodo(client.email)}
                                        className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                                      >
                                        <Plus className="w-4 h-4" />
                                        Add TODO
                                      </button>
                                    )}
                                  </div>
                                  <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                                    {displayData.todos && displayData.todos.length > 0 ? (
                                      displayData.todos.map((todo) => (
                                        <div
                                          key={todo.id}
                                          className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors group"
                                        >
                                          {isEditing ? (
                                            <>
                                              <button
                                                onClick={() => updateTodo(client.email, todo.id, { completed: !todo.completed })}
                                                className="flex-shrink-0 mt-0.5"
                                              >
                                                {todo.completed ? (
                                                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                                                ) : (
                                                  <Circle className="w-5 h-5 text-gray-400" />
                                                )}
                                              </button>
                                              <div className="flex-1 space-y-2">
                                                <input
                                                  type="text"
                                                  value={todo.title}
                                                  onChange={(e) => updateTodo(client.email, todo.id, { title: e.target.value })}
                                                  placeholder="TODO title..."
                                                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                                />
                                                <textarea
                                                  value={todo.notes || ''}
                                                  onChange={(e) => updateTodo(client.email, todo.id, { notes: e.target.value })}
                                                  placeholder="Add notes..."
                                                  rows={2}
                                                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                                                />
                                                {todo.createdBy && (
                                                  <p className="text-xs text-gray-500">
                                                    Created by {todo.createdBy}
                                                  </p>
                                                )}
                                              </div>
                                              <button
                                                onClick={() => deleteTodo(client.email, todo.id)}
                                                className="flex-shrink-0 p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-all opacity-0 group-hover:opacity-100"
                                              >
                                                <Trash2 className="w-4 h-4" />
                                              </button>
                                            </>
                                          ) : (
                                            <div
                                              className="flex-1 cursor-pointer"
                                              onClick={() => toggleTodoStatus(client, todo.id)}
                                              title={todo.completed ? "Click to mark as incomplete" : "Click to mark as complete"}
                                            >
                                              <div className="flex items-start gap-3">
                                                {todo.completed ? (
                                                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                                                ) : (
                                                  <Circle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5 group-hover:text-indigo-500" />
                                                )}
                                                <div className="flex-1">
                                                  <p className={`text-sm ${todo.completed ? 'text-gray-500 line-through' : 'text-gray-900 font-medium'}`}>
                                                    {todo.title}
                                                  </p>
                                                  <div className="flex items-center gap-2 mt-1">
                                                    {todo.createdBy && (
                                                      <span className="text-xs text-gray-500">
                                                        Created by {todo.createdBy}
                                                      </span>
                                                    )}
                                                    {todo.notes && todo.createdBy && (
                                                      <span className="text-xs text-gray-500">•</span>
                                                    )}
                                                    {todo.notes && (
                                                      <p className="text-xs text-gray-600">{todo.notes}</p>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ))
                                    ) : (
                                      <p className="text-sm text-gray-500 text-center py-4">No TODOs</p>
                                    )}
                                  </div>
                                </div>

                                {/* Lock Periods Section */}
                                <div className="bg-white rounded-lg border border-gray-200 p-4">
                                  <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold text-gray-900">Lock Periods</h3>
                                    {isEditing && (
                                      <button
                                        onClick={() => addLockPeriod(client.email)}
                                        className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                                      >
                                        <Plus className="w-4 h-4" />
                                        Add Period
                                      </button>
                                    )}
                                  </div>
                                  <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                                    {displayData.lockPeriods && displayData.lockPeriods.length > 0 ? (
                                      displayData.lockPeriods.map((period) => {
                                        const isActive = isDateInLockPeriod(new Date(), [period]);

                                        return (
                                          <div
                                            key={period.id}
                                            className={`p-3 rounded-lg border ${isActive
                                              ? 'bg-red-50 border-red-300'
                                              : 'bg-gray-50 border-gray-200'
                                              } group`}
                                          >
                                            {isEditing ? (
                                              <div className="space-y-2">
                                                <div className="grid grid-cols-2 gap-2">
                                                  <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
                                                    <input
                                                      type="date"
                                                      value={period.startDate}
                                                      onChange={(e) => updateLockPeriod(client.email, period.id, { startDate: e.target.value })}
                                                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
                                                    <input
                                                      type="date"
                                                      value={period.endDate}
                                                      onChange={(e) => updateLockPeriod(client.email, period.id, { endDate: e.target.value })}
                                                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                                    />
                                                  </div>
                                                </div>
                                                <div>
                                                  <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
                                                  <input
                                                    type="text"
                                                    value={period.reason || ''}
                                                    onChange={(e) => updateLockPeriod(client.email, period.id, { reason: e.target.value })}
                                                    placeholder="Reason for lock period..."
                                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                                  />
                                                </div>
                                                <button
                                                  onClick={() => deleteLockPeriod(client.email, period.id)}
                                                  className="w-full px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                                                >
                                                  Delete Period
                                                </button>
                                              </div>
                                            ) : (
                                              <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                  <div className="flex items-center gap-2 mb-1">
                                                    <Calendar className="w-4 h-4 text-gray-500" />
                                                    <span className="text-sm font-medium text-gray-900">
                                                      {new Date(period.startDate).toLocaleDateString()} - {new Date(period.endDate).toLocaleDateString()}
                                                    </span>
                                                    {isActive && (
                                                      <span className="px-2 py-0.5 text-xs font-medium bg-red-500 text-white rounded">
                                                        Active
                                                      </span>
                                                    )}
                                                  </div>
                                                  {period.reason && (
                                                    <p className="text-xs text-gray-600 mt-1">{period.reason}</p>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })
                                    ) : (
                                      <p className="text-sm text-gray-500 text-center py-4">No lock periods</p>
                                    )}
                                  </div>
                                </div>
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

        {/* Summary Stats */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-600 mb-1">Total Clients</div>
            <div className="text-2xl font-bold text-gray-900">{clients.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-600 mb-1">Clients with TODOs</div>
            <div className="text-2xl font-bold text-orange-600">
              {clients.filter(c => c.todos && c.todos.length > 0).length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-600 mb-1">Pending TODOs</div>
            <div className="text-2xl font-bold text-amber-600">
              {clients.reduce((sum, c) => sum + (c.todos?.filter(t => !t.completed).length || 0), 0)}
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
    </Layout>
  );
}

