import type { FC } from 'hono/jsx';
import { initialsOf } from '../../lib/greeting.js';
import type { IconName } from '../../lib/icons.js';
import { Icon } from './icon.js';

export type ActiveRoute = 'dashboard' | 'clients' | 'reports' | 'settings';

type NavItem = {
  key: ActiveRoute;
  label: string;
  href: string;
  icon: IconName;
};

const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'layout-dashboard' },
  { key: 'clients', label: 'Clients', href: '/clients', icon: 'users' },
  { key: 'reports', label: 'Reports', href: '/reports', icon: 'file-text' },
  { key: 'settings', label: 'Settings', href: '/settings', icon: 'settings' },
];

type SidebarProps = {
  active: ActiveRoute;
  userName: string;
  userRole: string | null;
};

export const Sidebar: FC<SidebarProps> = ({ active, userName, userRole }) => (
  <aside class="app-sidebar" aria-label="Primary navigation">
    <a class="app-sidebar-brand" href="/dashboard" aria-label="Windbrook home">
      <span class="app-sidebar-brand-mark">W</span>
      <span class="app-sidebar-brand-full">indbrook</span>
    </a>

    <nav class="app-sidebar-nav" aria-label="Sections">
      <ul>
        {NAV.map((item) => (
          <li>
            <a
              href={item.href}
              class={`app-nav-item${item.key === active ? ' is-active' : ''}`}
              aria-current={item.key === active ? 'page' : undefined}
            >
              <span class="app-nav-icon">
                <Icon name={item.icon} size={18} />
              </span>
              <span class="app-nav-label">{item.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>

    <details class="app-sidebar-user">
      <summary aria-label={`Account: ${userName}`}>
        <span class="app-avatar" aria-hidden="true">
          {initialsOf(userName)}
        </span>
        <span class="app-user-text">
          <span class="app-user-name">{userName}</span>
          {userRole ? <span class="app-user-role">{userRole}</span> : null}
        </span>
      </summary>
      <div class="app-popover" role="menu">
        <form method="post" action="/logout" hx-post="/logout" hx-disabled-elt="find button">
          <button type="submit" class="app-popover-item" role="menuitem">
            <Icon name="log-out" size={14} />
            <span>Sign out</span>
          </button>
        </form>
      </div>
    </details>
  </aside>
);
