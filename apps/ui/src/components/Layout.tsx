import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950 transition-colors">
      {/* Top navigation */}
      <nav className="bg-gray-900 dark:bg-gray-900 text-white shadow-lg border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-1">
              <Link
                to="/"
                className="flex items-center gap-2 font-bold text-lg tracking-tight mr-6 text-white"
              >
                <img src="/logo.png" alt="Hoiho.io" className="h-8" />
                <span>Hoiho.io</span>
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
            <div className="flex items-center gap-3 text-sm">
              {/* Dark mode toggle */}
              <button
                onClick={toggleTheme}
                className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-gray-800"
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                  </svg>
                )}
              </button>

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
