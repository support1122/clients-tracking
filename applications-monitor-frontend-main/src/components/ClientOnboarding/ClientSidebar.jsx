import React, { useState, useMemo, useCallback } from 'react';
import { Search, X, Pencil, Loader2, CheckCircle } from 'lucide-react';
import { clientDisplayName, getSortingNumber } from './helpers';
import { API_BASE, AUTH_HEADERS } from './constants';
import { toastUtils } from '../../utils/toastUtils';

const ClientSidebar = React.memo(({
  jobs,
  clientsList,
  filteredClientEmail,
  onFilterClient,
  onSaveClientNumber,
  savingClientNumber
}) => {
  const [clientSidebarSearch, setClientSidebarSearch] = useState('');
  const [editingClientNumberEmail, setEditingClientNumberEmail] = useState(null);
  const [editingClientNumberValue, setEditingClientNumberValue] = useState('');

  const clientsListForSidebar = useMemo(() => {
    const jobsList = Array.isArray(jobs) ? jobs : [];
    const clientsListArr = Array.isArray(clientsList) ? clientsList : [];
    const clientMap = new Map();
    jobsList.forEach((job) => {
      if (job.status === 'completed') return;
      const email = (job.clientEmail || '').toLowerCase();
      if (!email) return;
      if (!clientMap.has(email)) {
        clientMap.set(email, job);
      } else {
        const existing = clientMap.get(email);
        const existingDate = existing.updatedAt ? new Date(existing.updatedAt) : new Date(0);
        const newDate = job.updatedAt ? new Date(job.updatedAt) : new Date(0);
        if (newDate > existingDate) clientMap.set(email, job);
      }
    });
    return Array.from(clientMap.values())
      .map((job) => {
        const email = (job.clientEmail || '').toLowerCase();
        const clientNum = clientsListArr.find((c) => (c.email || '').toLowerCase() === email)?.clientNumber ?? job.clientNumber;
        return clientNum != null ? { ...job, clientNumber: clientNum } : job;
      })
      .sort((a, b) => getSortingNumber(a) - getSortingNumber(b));
  }, [jobs, clientsList]);

  const filteredClientsForSidebar = useMemo(() => {
    const q = (clientSidebarSearch || '').trim().toLowerCase();
    if (!q) return clientsListForSidebar;
    return clientsListForSidebar.filter((job) => {
      const name = (job.clientName || '').toLowerCase();
      const num = String(job.clientNumber ?? '').toLowerCase();
      const display = `${job.clientNumber ?? ''} ${name}`.toLowerCase();
      return name.includes(q) || num.includes(q) || display.includes(q);
    });
  }, [clientsListForSidebar, clientSidebarSearch]);

  const handleSave = useCallback((email) => {
    onSaveClientNumber(email, editingClientNumberValue);
    setEditingClientNumberEmail(null);
    setEditingClientNumberValue('');
  }, [onSaveClientNumber, editingClientNumberValue]);

  return (
    <div className="w-80 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-900">Clients</h2>
        <div className="mt-2 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or number..."
            value={clientSidebarSearch}
            onChange={(e) => setClientSidebarSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        {filteredClientEmail && (
          <button
            onClick={() => onFilterClient(null)}
            className="mt-2 text-xs text-primary hover:text-primary-hover font-medium flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Clear filter
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {filteredClientsForSidebar.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            {clientsListForSidebar.length === 0 ? 'No clients found' : 'No matches for your search'}
          </div>
        ) : (
          <ul className="py-2">
            {filteredClientsForSidebar.map((job) => {
              const email = (job.clientEmail || '').toLowerCase();
              const isSelected = filteredClientEmail && filteredClientEmail.toLowerCase() === email;
              const displayName = clientDisplayName(job);
              const planType = (job.planType || 'Professional').toLowerCase();
              const fullDisplayName = `${displayName} - ${planType}`;
              const isEditing = editingClientNumberEmail?.toLowerCase() === email;
              return (
                <li key={email}>
                  {isEditing ? (
                    <div className="px-4 py-2.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        min={1}
                        value={editingClientNumberValue}
                        onChange={(e) => setEditingClientNumberValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSave(job.clientEmail);
                          if (e.key === 'Escape') { setEditingClientNumberEmail(null); setEditingClientNumberValue(''); }
                        }}
                        placeholder="Number"
                        className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        autoFocus
                      />
                      <button type="button" onClick={() => handleSave(job.clientEmail)} disabled={savingClientNumber} className="p-1.5 text-primary hover:bg-primary/10 rounded disabled:opacity-50" title="Save">
                        {savingClientNumber ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      </button>
                      <button type="button" onClick={() => { setEditingClientNumberEmail(null); setEditingClientNumberValue(''); }} disabled={savingClientNumber} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-50" title="Cancel">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50 flex items-center justify-between gap-2 group ${
                        isSelected
                          ? 'bg-primary/10 text-primary border-l-4 border-primary'
                          : 'text-gray-700 hover:text-gray-900'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onFilterClient(isSelected ? null : job.clientEmail)}
                        className="flex-1 min-w-0 truncate text-left"
                      >
                        <span className="block truncate">{fullDisplayName}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingClientNumberEmail(job.clientEmail);
                          setEditingClientNumberValue(String(job.clientNumber ?? ''));
                        }}
                        className="p-1 text-gray-400 hover:text-primary hover:bg-primary/5 rounded flex-shrink-0"
                        title="Edit client number"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
});

ClientSidebar.displayName = 'ClientSidebar';
export default ClientSidebar;
