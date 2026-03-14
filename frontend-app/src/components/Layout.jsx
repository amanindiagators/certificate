import { Outlet, Link, useLocation } from "react-router-dom";
import { FileText, History, Settings, Home } from "lucide-react";
import logo from "../assets/logo.png";
import { useAuth } from "../hooks/useAuth";

const Layout = () => {
  const location = useLocation();
  const { user, logout, isAdmin } = useAuth();
  
  const navItems = [
    { path: "/", icon: Home, label: "Home" },
    { path: "/history", icon: History, label: "History" },
    { path: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <nav className="no-print border-b border-border bg-card shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center space-x-3">
              <img src={logo} alt="CertifyPro Logo" className="h-10 w-10 object-contain" />
              <span className="text-xl font-display font-bold text-foreground">CertifyPro</span>
            </Link>
            <div className="flex items-center space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    data-testid={`nav-${item.label.toLowerCase()}`}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary/10 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                );
              })}
              {isAdmin ? (
                <Link
                  to="/admin/credentials"
                  className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                    location.pathname.startsWith("/admin")
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary/10 hover:text-foreground"
                  }`}
                >
                  <span className="font-medium">Admin</span>
                </Link>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              {user ? (
                <>
                  <span className="text-sm text-muted-foreground">
                    {isAdmin ? "P JYOTI & CO" : (user.full_name || user.username)} ({user.role})
                  </span>
                  <button
                    onClick={logout}
                    className="text-sm px-3 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  className="text-sm px-3 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground"
                >
                  Login
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
