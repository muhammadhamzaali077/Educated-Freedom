import type { FC } from 'hono/jsx';
import { Icon } from './icon.js';

export type Crumb = {
  label: string;
  href?: string;
};

type TopBarProps = {
  crumbs: Crumb[];
};

export const TopBar: FC<TopBarProps> = ({ crumbs }) => (
  <header class="app-topbar">
    <nav class="app-breadcrumb" aria-label="Breadcrumb">
      <ol>
        {crumbs.map((c, i) => (
          <>
            {i > 0 ? (
              <li class="app-breadcrumb-sep" aria-hidden="true">
                /
              </li>
            ) : null}
            <li>
              {c.href ? <a href={c.href}>{c.label}</a> : <span>{c.label}</span>}
            </li>
          </>
        ))}
      </ol>
    </nav>

    <form class="app-search" role="search" onsubmit="return false">
      <span class="app-search-icon" aria-hidden="true">
        <Icon name="search" size={14} />
      </span>
      <input
        type="search"
        placeholder="Search clients, reports..."
        aria-label="Search clients and reports"
        autocomplete="off"
      />
      <kbd class="app-search-kbd" aria-hidden="true">
        ⌘K
      </kbd>
    </form>
  </header>
);
