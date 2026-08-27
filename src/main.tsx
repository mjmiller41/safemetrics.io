import React, { useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';
import App from './App.tsx';
import './index.css';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';

/**
 * Hands the app a way to mint session tokens for the worker API.
 *
 * `useAuth` only works inside `ClerkProvider`, and the app also renders without one
 * (when no publishable key is configured), so the hook lives in this wrapper rather
 * than being called conditionally inside `App`.
 */
function AppWithClerk() {
  const { getToken, isSignedIn } = useAuth();
  // Stable identity: the app's account effect depends on this, and a fresh closure
  // each render would refetch the account and reset the selected site.
  const token = useCallback(() => getToken(), [getToken]);
  return <App hasClerk={true} isSignedIn={!!isSignedIn} getToken={token} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {clerkPubKey ? (
      <ClerkProvider
        publishableKey={clerkPubKey}
        appearance={{
          baseTheme: dark,
          variables: {
            colorPrimary: '#06b6d4',
            colorBackground: '#090d16',
            colorText: '#f1f5f9',
            colorInputBackground: '#05080f',
            colorInputText: '#f1f5f9',
          }
        }}
      >
        <AppWithClerk />
      </ClerkProvider>
    ) : (
      <App hasClerk={false} />
    )}
  </React.StrictMode>,
);
