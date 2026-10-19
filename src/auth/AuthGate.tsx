import type { ReactNode } from 'react';
import { Show, SignIn, UserButton } from '@clerk/react';

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
        {children}
      </Show>
    </>
  );
}