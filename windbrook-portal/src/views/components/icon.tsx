import { raw } from 'hono/html';
import { ICON_PATHS, type IconName } from '../../lib/icons.js';

type IconProps = {
  name: IconName;
  size?: number;
  class?: string;
  'aria-hidden'?: boolean;
  title?: string;
};

export const Icon = ({
  name,
  size = 16,
  class: className = '',
  'aria-hidden': ariaHidden = true,
  title,
}: IconProps) => {
  const path = ICON_PATHS[name];
  const inner = title ? `<title>${title}</title>${path}` : path;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden={ariaHidden}
      class={className}
    >
      {raw(inner)}
    </svg>
  );
};
