import { useState } from "react";
import {
  Home,
  FileText,
  Inbox,
  MessageSquare,
  User,
  Settings,
  LogOut,
  Plus,
  Menu,
  X,
} from "lucide-react";
import styles from "./SidebarNav.module.css";

export default function SidebarNav({
  currentPage,
  onNavigate,
  onLogout,
  profile,
  invoiceCount,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { id: "home", label: "Home", icon: Home, badge: null },
    { id: "main", label: "Create Invoice", icon: Plus, badge: null },
    { id: "invoices", label: "My Invoices", icon: FileText, badge: invoiceCount },
    { id: "requests", label: "Requests", icon: Inbox, badge: null },
    { id: "negotiations", label: "Negotiations", icon: MessageSquare, badge: null },
  ];

  const bottomItems = [
    { id: "profile", label: "My Profile", icon: User },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  function nav(id) {
    onNavigate(id);
    setMobileOpen(false);
  }

  return (
    <>
      <div className={styles.mobileBar}>
        <div className={styles.logo} onClick={() => nav("main")} role="button" tabIndex={0}>
          <img src="/logo-full.png" alt="sabiquot" className={styles.logoImage} />
        </div>
        <button className={styles.mobileToggle} onClick={() => setMobileOpen((v) => !v)} aria-label={mobileOpen ? "Close menu" : "Open menu"}>
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {mobileOpen && <div className={styles.backdrop} onClick={() => setMobileOpen(false)} />}

      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.desktopLogo}>
          <div className={styles.logo} onClick={() => nav("main")} role="button" tabIndex={0}>
            <img src="/logo-full.png" alt="sabiquot" className={styles.logoImage} />
          </div>
        </div>

        <nav className={styles.nav}>
          <div className={styles.navSection}>
            <span className={styles.navSectionLabel}>Main</span>
            {navItems.map((item) => (
              <button
                key={item.id}
                className={`${styles.navItem} ${currentPage === item.id ? styles.navItemActive : ""}`}
                onClick={() => nav(item.id)}
              >
                <item.icon className={styles.navIcon} />
                <span className={styles.navLabel}>{item.label}</span>
                {item.badge > 0 && <span className={styles.navBadge}>{item.badge}</span>}
              </button>
            ))}
          </div>
        </nav>

        <div className={styles.sidebarNote}>
          <p className={styles.sidebarNoteLabel}>Quick tip</p>
          <p className={styles.sidebarNoteText}>Create an invoice, save it as draft, or send it when you&apos;re ready.</p>
        </div>

        <nav className={styles.bottomNav}>
          <div className={styles.navSection}>
            <span className={styles.navSectionLabel}>Account</span>
            {bottomItems.map((item) => (
              <button
                key={item.id}
                className={`${styles.navItem} ${currentPage === item.id ? styles.navItemActive : ""}`}
                onClick={() => nav(item.id)}
              >
                <item.icon className={styles.navIcon} />
                <span className={styles.navLabel}>{item.label}</span>
              </button>
            ))}
          </div>

          {profile && (
            <div className={styles.profileSection}>
              <div className={styles.profileAvatar}>{profile.name?.charAt(0).toUpperCase() || "U"}</div>
              <div className={styles.profileInfo}>
                <span className={styles.profileName}>{profile.name || profile.email}</span>
                <span className={styles.profileEmail}>{profile.email}</span>
              </div>
              <button className={styles.logoutBtn} onClick={onLogout} title="Logout">
                <LogOut className={styles.logoutIcon} />
              </button>
            </div>
          )}
        </nav>
      </aside>
    </>
  );
}
