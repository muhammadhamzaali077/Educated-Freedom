import type { FC } from 'hono/jsx';

type WordmarkProps = {
  size?: 'sm' | 'md' | 'lg';
};

export const Wordmark: FC<WordmarkProps> = ({ size = 'md' }) => {
  const cls =
    size === 'lg'
      ? 'text-5xl md:text-6xl'
      : size === 'sm'
        ? 'text-xl'
        : 'text-3xl md:text-4xl';
  return (
    <h1 class={`font-display font-medium text-ink tracking-display ${cls}`}>
      Windbrook<span class="text-accent"> Solutions</span>
    </h1>
  );
};
