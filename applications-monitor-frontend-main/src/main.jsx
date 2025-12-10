import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// import App from './App.jsx'
// import RegisterClient from './components/RegisterClient.jsx'
// import { createBrowserRouter, RouterProvider } from 'react-router-dom'

// // const routes = createBrowserRouter([
// //   {
// //     path: '/clients/new',
// //     element: <RegisterClient />,
// //   }
// // ]);

// createRoot(document.getElementById('root')).render(
//   <StrictMode>  
//     {/* <RouterProvider router={routes}>      */}
//     <App />
//     {/* </RouterProvider> */}
//   </StrictMode>,
// )

import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import { AdminLayout, PortalLayout } from './components/Navbar';
import Monitor from './components/Monitor';
import ReactDOM from 'react-dom/client';
import RegisterClient from './components/RegisterClient';
import AdminDashboard from './components/AdminDashboard.jsx';
import ManagerDashboard from './components/ManagerDashboard.jsx';
import OperationsDetails from './components/OperationsDetails.jsx';
import ClientDashboard from './components/ClientDashboard.jsx';
import JobAnalytics from './components/JobAnalytics.jsx';
import ClientJobAnalysis from './components/ClientJobAnalysis.jsx';
import CallScheduler from './components/CallScheduler.jsx';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        element: <Monitor />,
        index : true
      },
      {
        path: '/clients/new',
        element: <Monitor />
      },
      {
        path : '/monitor',
        element: <Monitor />
      },
      {
        path : '/monitor-clients',
        element: <Monitor />
      },
      {
        path : '/admin-dashboard',
        element: <AdminDashboard />
      },
      {
        path : '/manager-dashboard',
        element: <ManagerDashboard />
      },
      {
        path : '/operations',
        element: <Monitor />
      },
      {
        path : '/client-dashboard',
        element: <ClientDashboard />
      },
      {
        path : '/job-analytics',
        element: <JobAnalytics />
      }
      ,{
        path : '/client-job-analysis',
        element: <ClientJobAnalysis />
      },
      {
        path: '/call-scheduler',
        element: <CallScheduler />
      }
    ]
  }
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <RouterProvider router={router} />
);
