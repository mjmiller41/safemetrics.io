import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';
import App from './App.tsx';
import './index.css';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';

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
        <App hasClerk={true} />
      </ClerkProvider>
    ) : (
      <App hasClerk={false} />
    )}
  </React.StrictMode>,
);
