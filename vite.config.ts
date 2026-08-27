import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

function stripeProxyPlugin(): Plugin {
  return {
    name: 'stripe-api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/checkout', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });

        req.on('end', async () => {
          try {
            const data = JSON.parse(body || '{}');
            const env = loadEnv('development', process.cwd(), '');
            const stripeKey = env.STRIPE_RESTRICTED_KEY || env.STRIPE_SECRET_KEY;

            if (!stripeKey) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'STRIPE_SECRET_KEY is not configured.' }));
              return;
            }

            const origin = req.headers.origin || `http://${req.headers.host}`;
            const params = new URLSearchParams({
              'success_url': `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}&plan=${data.planId || 'pro'}`,
              'cancel_url': `${origin}/?checkout=cancel`,
              'line_items[0][price]': data.priceId,
              'line_items[0][quantity]': '1',
              'mode': 'subscription',
            });

            if (data.userEmail) {
              params.append('customer_email', data.userEmail);
            }
            if (data.userId) {
              params.append('client_reference_id', data.userId);
            }
            if (data.planId) {
              params.append('metadata[planId]', data.planId);
            }

            const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${stripeKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: params.toString(),
            });

            const stripeData = await stripeRes.json();

            if (!stripeRes.ok) {
              res.statusCode = stripeRes.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(stripeData));
              return;
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ url: stripeData.url, sessionId: stripeData.id }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: (err as Error).message }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), stripeProxyPlugin()],
  server: {
    port: 3001,
  },
});
