import type { FC, PropsWithChildren } from 'hono/jsx';
import { Sidebar, type ActiveRoute } from '../components/sidebar.js';
import { TopBar, type Crumb } from '../components/topbar.js';
import { Shell } from './shell.js';

type AppLayoutProps = PropsWithChildren<{
  title: string;
  active: ActiveRoute;
  crumbs: Crumb[];
  userName: string;
  userRole: string | null;
}>;

export const AppLayout: FC<AppLayoutProps> = ({
  title,
  active,
  crumbs,
  userName,
  userRole,
  children,
}) => (
  <Shell title={title}>
    <div class="app-frame">
      <Sidebar active={active} userName={userName} userRole={userRole} />
      <div class="app-main">
        <TopBar crumbs={crumbs} />
        <main class="app-content">{children}</main>
      </div>
    </div>
  </Shell>
);
