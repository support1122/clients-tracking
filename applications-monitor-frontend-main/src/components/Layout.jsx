// import React from 'react';
// import { Link } from 'react-router-dom';

// export default function Layout({ children }) {
//   return (
//     <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
//       <div className="flex min-h-[calc(100vh-2rem)] rounded-xl border border-slate-200 bg-white shadow-lg">
//         {/* Fixed Left Sidebar */}
//         <div className="w-64 border-r border-slate-200 bg-blue-50 flex-shrink-0">
//           <div className="p-3 flex flex-col gap-3">
//             <Link to="/monitor-clients">
//               <button className="w-full p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
//                 Clients
//               </button>
//             </Link>
//             <Link to="/operations">
//               <button className="w-full p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium">
//                 Operations Team
//               </button>
//             </Link>
//             <Link to="/clients/new">
//               <button className="w-full p-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium">
//                 Register Client
//               </button>
//             </Link>
//             <Link to="/manager-dashboard">
//               <button className="w-full p-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium">
//                 Manager Dashboard
//               </button>
//             </Link>
//           </div>
//         </div>

//         {/* Main Content Area */}
//         <div className="flex-1 overflow-auto bg-slate-50">
//           {children}
//         </div>
//       </div>
//     </div>
//   );
// }

import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const location = useLocation();

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setUserRole(user?.role || null);
  }, [location])

  const isActive = (path) => {
    if (path === '/monitor-clients' || path === '/monitor') {
      return location.pathname === '/monitor-clients' || location.pathname === '/monitor' || location.pathname === '/';
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const getButtonClasses = (baseColor, hoverColor, path, hiddenCondition = false) => {
    const hidden = hiddenCondition ? 'hidden' : '';
    const active = isActive(path);
    return `px-4 py-2.5 text-sm rounded-lg transition-all duration-300 font-semibold relative ${
      active 
        ? `${baseColor} text-white shadow-xl scale-105 ring-2 ring-offset-2 ring-offset-blue-50 ring-white/40 border-2 border-white/50` 
        : `${baseColor} text-white hover:${hoverColor} hover:shadow-md hover:scale-[1.02]`
    } ${hidden}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="min-h-[calc(100vh-2rem)] rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden flex flex-col">
        <div className="w-full border-b border-slate-200 bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50">
          <div className="p-3 flex flex-wrap gap-2.5 justify-center">
            <Link to="/monitor-clients">
              <button className={getButtonClasses(
                'bg-blue-600',
                'bg-blue-700',
                '/monitor-clients',
                userRole === 'operations_intern'
              )}>
                {isActive('/monitor-clients') && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full border-2 border-blue-600"></span>
                )}
                Clients
              </button>
            </Link>

            <Link to="/operations">
              <button className={getButtonClasses('bg-green-600', 'bg-green-700', '/operations')}>
                {isActive('/operations') && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full border-2 border-green-600"></span>
                )}
                Operations Team
              </button>
            </Link>

            <Link to="/client-dashboard">
              <button className={getButtonClasses(
                'bg-purple-600',
                'bg-purple-700',
                '/client-dashboard',
                ['team_lead', 'operations_intern'].includes(userRole)
              )}>
                {isActive('/client-dashboard') && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full border-2 border-purple-600"></span>
                )}
                Plan
              </button>
            </Link>

            <Link to="/clients/new">
              <button className={getButtonClasses(
                'bg-orange-600',
                'bg-orange-700',
                '/clients/new',
                ['team_lead', 'operations_intern'].includes(userRole)
              )}>
                {isActive('/clients/new') && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full border-2 border-orange-600"></span>
                )}
                Register Client
              </button>
            </Link>

            <Link to="/manager-dashboard">
              <button className={getButtonClasses(
                'bg-purple-600',
                'bg-purple-700',
                '/manager-dashboard',
                ['team_lead', 'operations_intern'].includes(userRole)
              )}>
                {isActive('/manager-dashboard') && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full border-2 border-purple-600"></span>
                )}
                Manager Dashboard
              </button>
            </Link>

            <Link to="/job-analytics">
              <button className={getButtonClasses(
                'bg-indigo-600',
                'bg-indigo-700',
                '/job-analytics',
                userRole === 'operations_intern'
              )}>
                {isActive('/job-analytics') && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full border-2 border-indigo-600"></span>
                )}
                Job Analytics
              </button>
            </Link>

            <Link to="/client-job-analysis">
              <button className={getButtonClasses(
                'bg-teal-600',
                'bg-teal-700',
                '/client-job-analysis',
                userRole === 'operations_intern'
              )}>
                {isActive('/client-job-analysis') && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full border-2 border-teal-600"></span>
                )}
                Client Job Analysis
              </button>
            </Link>

            <Link to="/call-scheduler">
              <button className={getButtonClasses(
                'bg-emerald-600',
                'bg-emerald-700',
                '/call-scheduler',
                ['team_lead', 'operations_intern'].includes(userRole)
              )}>
                {isActive('/call-scheduler') && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full border-2 border-emerald-600"></span>
                )}
                Call Scheduler
              </button>
            </Link>

            <Link to="/client-preferences">
              <button className={getButtonClasses(
                'bg-purple-600',
                'bg-purple-700',
                '/client-preferences',
                userRole === 'operations_intern'
              )}>
                {isActive('/client-preferences') && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full border-2 border-purple-600"></span>
                )}
                Client Preferences
              </button>
            </Link>

            <Link to="/operators-performance-report">
              <button className={getButtonClasses(
                'bg-indigo-600',
                'bg-indigo-700',
                '/operators-performance-report',
                false
              )}>
                {isActive('/operators-performance-report') && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full border-2 border-indigo-600"></span>
                )}
                Operators Performance
              </button>
            </Link>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-auto bg-slate-50">
          <div className="p-2 md:p-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
