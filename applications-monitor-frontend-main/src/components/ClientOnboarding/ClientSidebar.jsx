import React, { useState, useMemo, useCallback } from 'react';
import { Search, X, Pencil, Loader2, CheckCircle } from 'lucide-react';
import { getSortingNumber } from './helpers';

const PLAN_TAGS = {
  executive: 'EXEC',
  professional: 'PRO',
  prime: 'PRIME',
  ignite: 'IGNITE',
  starter: 'START'
};
const planTag = (planType) => {
  const key = (planType || '').toLowerCase().trim();
  return PLAN_TAGS[key] || (key ? key.slice(0, 5).toUpperCase() : 'PRO');
};

const splitName = (job) => {
  const num = job.clientNumber;
  let name = (job.clientName || '').trim();
  if (num != null && name.startsWith(`${num} - `)) name = name.slice(`${num} - `.length).trim();
  return { num, name: name || '—' };
};

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
    <div className="w-64 flex-shrink-0 bg-white border-r border-[#e6e4e1] flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-[#efedeb]">
        <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.1em] mb-2.5">Clients</h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Name or number…"
            value={clientSidebarSearch}
            onChange={(e) => setClientSidebarSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-[12.5px] border border-[#e6e4e1] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-gray-400"
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
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            {clientsListForSidebar.length === 0 ? 'No clients found' : 'No matches for your search'}
          </div>
        ) : (
          <ul className="py-1.5">
            {filteredClientsForSidebar.map((job) => {
              const email = (job.clientEmail || '').toLowerCase();
              const isSelected = filteredClientEmail && filteredClientEmail.toLowerCase() === email;
              const { num, name } = splitName(job);
              const isEditing = editingClientNumberEmail?.toLowerCase() === email;
              return (
                <li key={email}>
                  {isEditing ? (
                    <div className="px-4 py-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
                      className={`group w-full flex items-center gap-2.5 pl-3.5 pr-3 py-2 text-[13px] border-l-[3px] transition-colors ${
                        isSelected
                          ? 'border-primary bg-[#faf3f0] font-semibold text-gray-900'
                          : 'border-transparent text-gray-700 hover:bg-[#f6f5f4]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onFilterClient(isSelected ? null : job.clientEmail)}
                        className="flex-1 min-w-0 flex items-center gap-2.5 text-left"
                      >
                        <span className={`tabular-nums font-semibold flex-shrink-0 ${isSelected ? 'text-primary' : 'text-gray-500'}`}>
                          {num ?? '—'}
                        </span>
                        <span className="truncate">{name}</span>
                      </button>
                      <span className="text-[10px] font-semibold tracking-[0.06em] text-gray-400 flex-shrink-0">{planTag(job.planType)}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingClientNumberEmail(job.clientEmail);
                          setEditingClientNumberValue(String(job.clientNumber ?? ''));
                        }}
                        className="p-1 text-gray-300 hover:text-primary rounded flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
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
