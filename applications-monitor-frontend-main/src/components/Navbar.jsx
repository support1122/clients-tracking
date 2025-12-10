import { Outlet } from "react-router-dom";
export function AdminLayout({ user, onLogout }) {
  return (
    <div>
      {/* Admin Nav */}
      <div className="bg-white shadow-sm border-b">
        <div className="flex justify-between items-center p-3">
          <h1 className="font-semibold">Admin: {user.email}</h1>
          <button onClick={onLogout}>Logout</button>
        </div>
      </div>

      {/* Child Routes will render here */}
      <Outlet />
    </div>
  );
}

export function PortalLayout({ user, onLogout }) {
  return (
    <div>
      {/* Team Lead Nav */}
      <div className="bg-white shadow-sm border-b">
        <div className="flex justify-between items-center p-3">
          <h1 className="font-semibold">Team Lead: {user.email}</h1>
          <button onClick={onLogout}>Logout</button>
        </div>
      </div>

      {/* Child Routes will render here */}
      <Outlet />
    </div>
  );
}
