import type { ReactNode } from 'react';
import { Show, SignIn, UserButton } from '@clerk/react';
import { useRole } from './useRole';

export function AuthGate({ children }: { children: ReactNode }) {
  return (
    <>
      <Show when="signed-out">
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 24,
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>
            FreightOps Insights
          </h1>
          <SignIn routing="hash" />
        </div>
      </Show>

      <Show when="signed-in">
        {/* Temporary floating account button — move <UserButton /> into your header later if you like */}
        <div style={{ position: 'fixed', top: 12, right: 16, zIndex: 1000 }}>
          <UserButton />
        </div>
        <AccessGate>{children}</AccessGate>
      </Show>
    </>
  );
}

/** Signed in but no role yet (or a broker without a broker name): ask an admin instead of showing an empty dashboard. */
function AccessGate({ children }: { children: ReactNode }) {
  const { isLoaded, canSeeAll, brokerName, email } = useRole();
  if (!isLoaded) return null;
  if (canSeeAll || brokerName) return <>{children}</>;
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 16,
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Waiting for access</h1>
      <p style={{ margin: 0, maxWidth: 420, color: '#64748b' }}>
        You're signed in as {email}. An admin needs to assign your role in Settings → Users &amp; roles.
        Refresh this page once they have.
      </p>
    </div>
  );
}
