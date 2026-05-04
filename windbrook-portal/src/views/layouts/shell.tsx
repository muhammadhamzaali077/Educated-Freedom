import type { FC, PropsWithChildren } from 'hono/jsx';

type ShellProps = PropsWithChildren<{
  title: string;
}>;

export const Shell: FC<ShellProps> = ({ title, children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title} · Windbrook Solutions</title>
      <link
        rel="preload"
        href="/fonts/SourceSerif4-Variable.woff2"
        as="font"
        type="font/woff2"
        crossorigin="anonymous"
      />
      <link
        rel="preload"
        href="/fonts/Geist-Variable.woff2"
        as="font"
        type="font/woff2"
        crossorigin="anonymous"
      />
      <link rel="stylesheet" href="/css/app.css" />
      <script src="/vendor/htmx.min.js" defer></script>
    </head>
    <body class="min-h-screen bg-bg text-ink font-body antialiased">
      {children}
    </body>
  </html>
);
