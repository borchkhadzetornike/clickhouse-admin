import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navItems: { to: string; label: string; roles?: string[] }[] = [
    { to: "/clusters", label: "Clusters" },
    { to: "/explorer", label: "Explorer" },
    { to: "/proposals", label: "Proposals" },
    { to: "/admin-console", label: "Admin", roles: ["admin", "editor"] },
    { to: "/rbac", label: "RBAC" },
    { to: "/snapshots", label: "Snapshots" },
    { to: "/users", label: "Users", roles: ["admin"] },
    { to: "/audit", label: "Audit", roles: ["admin", "researcher"] },
  ];

  const visibleNav = navItems.filter(
    (item) => !item.roles || item.roles.includes(user?.role || ""),
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top navigation */}
      <nav className="bg-gray-900 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-1">
              <Link
                to="/"
                className="font-bold text-lg tracking-tight mr-6 text-blue-400"
              >
                CH Governance
              </Link>
              {visibleNav.map((item) => {
                const active = location.pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                      active
                        ? "bg-gray-700 text-white"
                        : "text-gray-300 hover:text-white hover:bg-gray-800"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-400">
                {user?.username}{" "}
                <span className="bg-blue-600/30 text-blue-300 px-2 py-0.5 rounded text-xs ml-1 font-medium">
                  {user?.role}
                </span>
              </span>
              <button
                onClick={handleLogout}
                className="text-gray-400 hover:text-white transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}
