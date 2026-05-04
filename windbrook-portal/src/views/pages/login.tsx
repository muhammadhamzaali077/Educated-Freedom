import { Shell } from '../layouts/shell.js';

export const LoginPage = () => (
  <Shell title="Sign in">
    <main class="min-h-screen w-full flex items-center justify-center px-4 bg-bg">
      <div class="flex flex-col items-center gap-12">
        <div class="login-stage login-stage-1 text-center">
          <h1
            class="font-display text-ink"
            style="font-size: 72px; font-weight: 500; line-height: 1; letter-spacing: -0.01em;"
          >
            Windbrook
          </h1>
          <p
            class="font-body text-ink-muted mt-4"
            style="font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.12em;"
          >
            Family Office Portal
          </p>
        </div>

        <div class="login-stage login-stage-2" style="width: 420px">
          <hr class="rule border-t" />
          <form
            id="login-form"
            method="post"
            action="/login"
            hx-post="/login"
            hx-target="#login-error"
            hx-swap="innerHTML"
            hx-disabled-elt="find button"
            class="bg-bg-raised"
            style="padding: 80px"
          >
            <div
              id="login-error"
              role="alert"
              aria-live="polite"
              class="text-danger"
              style="font-size: 14px; min-height: 1.25em; margin-bottom: 24px;"
            ></div>

            <label
              for="email"
              class="font-body text-ink-muted block mb-2"
              style="font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em;"
            >
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              autocomplete="email"
              required
              class="login-input"
            />

            <label
              for="password"
              class="font-body text-ink-muted block mb-2 mt-8"
              style="font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em;"
            >
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              autocomplete="current-password"
              required
              class="login-input"
            />

            <button type="submit" class="login-submit mt-12">
              Continue
            </button>
          </form>
          <hr class="rule border-t" />
        </div>

        <footer class="login-stage login-stage-3 text-center">
          <div
            aria-hidden="true"
            class="mx-auto"
            style="height: 1px; width: 40px; background: var(--color-rule); margin-bottom: 16px;"
          ></div>
          <p
            class="text-ink-muted"
            style="font-size: 11px; letter-spacing: 0.12em; font-weight: 400;"
          >
            MMXXVI &middot; WINDBROOK SOLUTIONS
          </p>
        </footer>
      </div>
    </main>
  </Shell>
);

export const LoginErrorFragment = ({ message }: { message: string }) => <span>{message}</span>;
