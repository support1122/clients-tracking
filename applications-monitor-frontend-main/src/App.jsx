import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import Monitor from './components/Monitor';
import { Link, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';

function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('portal'); // 'portal' or 'admin'
  const location = useLocation();
  const navigate = useNavigate();
// console.log(user)
  // ✅ Check for logged-in user on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    const savedToken = localStorage.getItem('authToken');

    if (savedUser && savedToken) {
      try {
        const userData = JSON.parse(savedUser);
        setUser(userData);

        setCurrentView(userData.role === 'admin' ? 'admin' : 'portal');
        
        // Only redirect from root path - run once on mount
        if (location.pathname === '/') {
          if (userData.role === 'admin') {
            navigate('/admin-dashboard');
          } else if (userData.role === 'operations_intern') {
            navigate('/operations');
          } else {
            navigate('/monitor-clients');
          }
        }
      
        // Clear invalid data

      } catch {

        localStorage.removeItem('user');
        localStorage.removeItem('authToken');
      }
    }
    setLoading(false);
  }, []);

  // ✅ Redirect admin automatically once (prevents infinite loop)
  // useEffect(() => {
  //   if (user && user.role === 'admin') {
  //     // When admin logs in or page refreshes, ensure correct landing page
  //     if (location.pathname === '/' || location.pathname === '/admin-dashboard') {
  //       navigate('/monitor-clients', { replace: true });
  //     }
  //   } else if (user && user.role !== 'admin') {
  //     // Team lead default redirect
  //     if (location.pathname === '/' || location.pathname === '/admin-dashboard') {
  //       navigate('/monitor', { replace: true });
  //     }
  //   }
  // }, [user, navigate, location.pathname]);

//   useEffect(() => {
//   if (user && user.role === 'admin') {
//     // Redirect only if on the root page
//     if (location.pathname === '/') {
//       navigate('/admin-dashboard', { replace: true });
//     }
//   } else if (user && user.role == 'team_lead') {
//     if (location.pathname === '/') {
//       navigate('/monitor', { replace: true });
//     }
//   }
// }, [user, navigate, location.pathname]);

  // }, []); // Remove location.pathname and navigate from dependencies 
  const handleLogin = (userData) => {
    setUser(userData);
    setCurrentView(userData.role === 'admin' ? 'admin' : 'portal');
    
    // Navigate based on user role
    if (userData.role === 'admin') {
      navigate('/admin-dashboard');
    } else if (userData.role === 'operations_intern') {
      navigate('/operations');
    } else {
      navigate('/monitor-clients');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentView('portal');
    localStorage.removeItem('user');
    localStorage.removeItem('authToken');
    navigate('/', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Login onLogin={handleLogin} />;

  // ===============================
  // ✅ Admin Layout (with Navbar)
  // ===============================

  if (user.role === 'admin') {
    return (
      <div>
        {/* Admin Navigation Bar */}
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-3">
              <div className="flex items-center gap-3">
                {/* Logo */}
                <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 2h12v4H8v4h6v4H8v8H4V2z" />
                    <path d="M16 2c2 2 4 6 2 10-1 2-3 3-5 3 2-2 3-5 1-7-1-1-2-2-1-3 1-1 2-2 3-3z" />
                    <path d="M18 6c1 1 2 3 1 5-0.5 1-1.5 1.5-2.5 1.5 1-1 1.5-2.5 0.5-3.5-0.5-0.5-1-1-0.5-1.5 0.5-0.5 1-1 1.5-1.5z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Client Tracking Portal</h1>
                  <p className="text-sm text-gray-600">Admin: {user.email}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Link to="/operators-performance-report">
                  <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm">
                    Performance Report
                  </button>
                </Link>
                <Link to={location.pathname === "/admin-dashboard" ? "/monitor-clients" : "/admin-dashboard"}>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
                    {location.pathname === "/admin-dashboard" ? "Monitor Clients" : "Admin Dashboard"}
                  </button>
                </Link>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
        <Outlet context={{ user, userRole: user?.role }} />
      </div>
    );
  }

  // ===============================
  // ✅ Team Lead / Operations Intern Layout (with Navbar)
  // ===============================
  const roleLabel = user.role === 'operations_intern' ? 'Operations Intern' : 'Team Lead';
  
  return (
    <div>
      {/* Team Lead / Operations Intern Navigation Bar */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-3">
            <div className="flex items-center gap-3">
              {/* Logo */}
              <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 2h12v4H8v4h6v4H8v8H4V2z" />
                  <path d="M16 2c2 2 4 6 2 10-1 2-3 3-5 3 2-2 3-5 1-7-1-1-2-2-1-3 1-1 2-2 3-3z" />
                  <path d="M18 6c1 1 2 3 1 5-0.5 1-1.5 1.5-2.5 1.5 1-1 1.5-2.5 0.5-3.5-0.5-0.5-1-1-0.5-1.5 0.5-0.5 1-1 1.5-1.5z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Client Tracking Portal</h1>
                <p className="text-sm text-gray-600">{roleLabel}: {user.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
      <Outlet context={{ user, userRole: user?.role }} />
    </div>
  );
}

export default App;

