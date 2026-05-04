import type { FC } from 'hono/jsx';
import { Shell } from '../layouts/shell.js';

const ErrorEditorial: FC<{
  title: string;
  phrase: string;
  caption: string;
  backHref: string;
  backLabel: string;
}> = ({ title, phrase, caption, backHref, backLabel }) => (
  <Shell title={title}>
    <main class="error-page">
      <hr class="rule mx-auto" style="width: 96px; margin-top: 0;" />
      <p class="error-phrase">{phrase}</p>
      <hr class="rule mx-auto" style="width: 96px;" />
      <p class="error-caption">{caption}</p>
      <a class="text-link-accent error-back" href={backHref}>
        {backLabel} &rarr;
      </a>
    </main>
  </Shell>
);

export const NotFoundPage: FC = () => (
  <ErrorEditorial
    title="Not found"
    phrase="We could not find that page."
    caption="The link may be old, or the household may have been removed."
    backHref="/dashboard"
    backLabel="Back to dashboard"
  />
);

export const ServerErrorPage: FC<{ requestId?: string }> = ({ requestId }) => (
  <ErrorEditorial
    title="Server error"
    phrase="Something is amiss."
    caption={
      requestId
        ? `The team has been notified. Reference: ${requestId}.`
        : 'The team has been notified. Please try again in a moment.'
    }
    backHref="/dashboard"
    backLabel="Back to dashboard"
  />
);
