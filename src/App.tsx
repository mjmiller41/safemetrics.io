import { useState, useEffect, useRef } from 'react';
import {
  SignedIn, SignedOut, SignInButton, SignUpButton, UserButton, useUser
} from '@clerk/clerk-react';
import {
  Shield, Check, Copy, TrendingUp, Users, Globe, Eye,
  Clock, ArrowUpRight, BarChart2,
  CheckCircle2, Sparkles, Activity, Zap, Layers,
  Plus, X, LogIn, Key
} from 'lucide-react';
import { redirectToCheckout } from './lib/stripe';
import { addDomain, fetchAccount } from './lib/account';
import { ROUTES, sectionHref, useRoute } from './lib/router';
import StatsPage from './components/StatsPage';

interface RouteData {
  path: string;
  views: number;
  pct: number;
  dwell: string;
}

interface SourceData {
  source: string;
  visitors: number;
  pct: number;
  bounce: string;
}

interface GeoData {
  country: string;
  code: string;
  visitors: number;
  pct: number;
}

interface GoalData {
  name: string;
  conversions: number;
  rate: string;
}

// Placeholder sites for the signed-out demo. These are deliberately RFC 2606
// reserved names: the dashboard shows invented traffic figures next to whatever is
// listed here, and attaching those to a domain somebody actually owns would be
// putting words in their mouth. `example.com` and its subdomains can never be
// registered, so there is nobody to misrepresent.
const DOMAINS_LIST = ['example.com', 'shop.example.com', 'docs.example.com', 'blog.example.com', 'app.example.com'];

const ROUTES_DATA: Record<string, RouteData[]> = {
  'example.com': [
    { path: '/', views: 34120, pct: 44, dwell: '3m 12s' },
    { path: '/features', views: 18450, pct: 24, dwell: '2m 45s' },
    { path: '/pricing', views: 9820, pct: 13, dwell: '1m 55s' },
    { path: '/about', views: 6410, pct: 8, dwell: '2m 10s' },
    { path: '/contact', views: 4230, pct: 5, dwell: '1m 40s' }
  ],
  'shop.example.com': [
    { path: '/', views: 12450, pct: 52, dwell: '2m 30s' },
    { path: '/collections/new-arrivals', views: 5890, pct: 25, dwell: '4m 10s' },
    { path: '/cart', views: 3410, pct: 14, dwell: '1m 20s' },
    { path: '/checkout', views: 1820, pct: 8, dwell: '3m 05s' }
  ],
  'docs.example.com': [
    { path: '/', views: 24800, pct: 62, dwell: '8m 45s' },
    { path: '/getting-started', views: 8900, pct: 22, dwell: '12m 10s' },
    { path: '/api-reference', views: 3600, pct: 9, dwell: '1m 15s' },
    { path: '/changelog', views: 2400, pct: 6, dwell: '2m 40s' }
  ]
};

const SOURCES_DATA: SourceData[] = [
  { source: 'Google Organic', visitors: 28450, pct: 45, bounce: '32%' },
  { source: 'Direct / Bookmark', visitors: 14200, pct: 23, bounce: '24%' },
  { source: 'GitHub Repositories', visitors: 8920, pct: 14, bounce: '28%' },
  { source: 'Twitter / X', visitors: 6140, pct: 10, bounce: '41%' },
  { source: 'Hacker News', visitors: 4890, pct: 8, bounce: '36%' }
];

const GEO_DATA: GeoData[] = [
  { country: 'United States', code: 'US', visitors: 34200, pct: 52 },
  { country: 'Germany', code: 'DE', visitors: 8400, pct: 13 },
  { country: 'United Kingdom', code: 'GB', visitors: 7100, pct: 11 },
  { country: 'Canada', code: 'CA', visitors: 5200, pct: 8 },
  { country: 'Japan', code: 'JP', visitors: 4100, pct: 6 },
  { country: 'Australia', code: 'AU', visitors: 3200, pct: 5 }
];

const GOALS_DATA: GoalData[] = [
  { name: 'Newsletter Subscription', conversions: 1840, rate: '4.2%' },
  { name: 'Pro Plan Checkout Initiated', conversions: 420, rate: '1.8%' },
  { name: 'API Key Generated', conversions: 890, rate: '3.4%' },
  { name: 'External Link Click (Docs/Store)', conversions: 3120, rate: '7.1%' }
];

const FRAMEWORKS = [
  { id: 'next', name: 'Next.js 14/15' },
  { id: 'html', name: 'HTML / Static' },
  { id: 'react', name: 'React + Vite' },
  { id: 'astro', name: 'Astro' },
  { id: 'wordpress', name: 'WordPress' },
  { id: 'laravel', name: 'Laravel Blade' }
];

interface AppProps {
  hasClerk?: boolean;
  isSignedIn?: boolean;
  /** Mints a Clerk session token for the worker API. Absent when Clerk is unconfigured. */
  getToken?: () => Promise<string | null>;
}

export default function App({ hasClerk = false, isSignedIn = false, getToken }: AppProps) {
  const { path, navigate } = useRoute();
  const [selectedDomain, setSelectedDomain] = useState('example.com');
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [activeTab, setActiveTab] = useState<'routes' | 'sources' | 'geo' | 'goals'>('routes');
  const [customDomainInput, setCustomDomainInput] = useState('example.com');
  const [selectedFramework, setSelectedFramework] = useState('next');
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [calcViews, setCalcViews] = useState(100000);
  const [showAddDomainModal, setShowAddDomainModal] = useState(false);
  const [newDomainName, setNewDomainName] = useState('');
  const [userDomains, setUserDomains] = useState<string[]>(DOMAINS_LIST);
  const [showClerkSetupModal, setShowClerkSetupModal] = useState(false);

  const [livePings, setLivePings] = useState([
    { id: 1, path: '/categories/flea-market', country: 'US', time: 'Just now', latency: '42ms' },
    { id: 2, path: '/ca/los-angeles', country: 'GB', time: '3s ago', latency: '38ms' },
    { id: 3, path: '/', country: 'DE', time: '7s ago', latency: '45ms' }
  ]);

  const [activePlan, setActivePlan] = useState<'free' | 'pro' | 'scale'>('free');
  const [checkoutToast, setCheckoutToast] = useState<string | null>(null);

  // Load the signed-in account: its real plan and the domains it actually owns.
  // Signing in is also what provisions the tenant, since /api/me is the first
  // authenticated call the app makes. Keyed on sign-in state alone, via a ref, so a
  // token refresh cannot re-run this and snap the user's selected site back.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    const mintToken = getTokenRef.current;
    if (!isSignedIn || !mintToken) return;
    let cancelled = false;

    (async () => {
      const token = await mintToken();
      if (!token) return;
      const account = await fetchAccount(token);
      if (cancelled || !account) return;

      setActivePlan(account.plan === 'hobby' ? 'free' : account.plan);
      if (account.domains.length) {
        setUserDomains(account.domains);
        setSelectedDomain(account.domains[0]);
        setCustomDomainInput(account.domains[0]);
      }
    })();

    return () => { cancelled = true; };
  }, [isSignedIn]);

  // Simulate live incoming event stream
  useEffect(() => {
    const interval = setInterval(() => {
      const paths = ['/', '/categories/flea-market', '/pricing', '/ca/los-angeles', '/docs', '/login'];
      const countries = ['US', 'DE', 'GB', 'CA', 'JP', 'FR', 'AU'];
      const newPing = {
        id: Date.now(),
        path: paths[Math.floor(Math.random() * paths.length)],
        country: countries[Math.floor(Math.random() * countries.length)],
        time: 'Just now',
        latency: `${Math.floor(Math.random() * 25 + 30)}ms`
      };
      setLivePings(prev => [newPing, ...prev.slice(0, 3)]);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  // Check URL parameters for return from Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutStatus = params.get('checkout');
    const plan = params.get('plan') as 'pro' | 'scale' | null;

    if (checkoutStatus === 'success' && plan) {
      setActivePlan(plan);
      setCheckoutToast(`🎉 Welcome to SafeMetrics ${plan === 'pro' ? 'Pro Growth' : 'Scale Business'}!`);
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      url.searchParams.delete('plan');
      url.searchParams.delete('session_id');
      window.history.replaceState({}, '', url.toString());
    } else if (checkoutStatus === 'cancel') {
      setCheckoutToast('Checkout cancelled — you are still on your previous plan.');
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const handleCheckout = async (planId: 'pro' | 'scale') => {
    if (!hasClerk || !isSignedIn) {
      setCheckoutToast('Sign in first — a subscription has to belong to an account.');
      return;
    }

    try {
      await redirectToCheckout({
        planId,
        interval: billingCycle === 'annual' ? 'yearly' : 'monthly',
        token: getToken ? await getToken() : null,
      });
    } catch (err) {
      setCheckoutToast(`Checkout error: ${(err as Error).message}`);
    }
  };

  const getFrameworkSnippet = () => {
    const d = customDomainInput || 'yourdomain.com';
    switch (selectedFramework) {
      case 'next':
        return `// app/layout.tsx
import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script
          defer
          data-domain="${d}"
          src="https://safemetrics.io/js/script.js"
          strategy="afterInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}`;
      case 'react':
        return `<!-- index.html <head> -->
<script defer data-domain="${d}" src="https://safemetrics.io/js/script.js"></script>`;
      case 'astro':
        return `---
// src/layouts/Layout.astro
---
<head>
  <script is:inline defer data-domain="${d}" src="https://safemetrics.io/js/script.js"></script>
</head>`;
      case 'laravel':
        return `{{-- resources/views/layouts/app.blade.php --}}
<script defer data-domain="${d}" src="https://safemetrics.io/js/script.js"></script>`;
      case 'wordpress':
        return `// Add to your active child theme's functions.php
add_action('wp_head', function() {
    echo '<script defer data-domain="${d}" src="https://safemetrics.io/js/script.js"></script>';
});`;
      default:
        return `<script defer data-domain="${d}" src="https://safemetrics.io/js/script.js"></script>`;
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getFrameworkSnippet());
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomainName.trim()) return;
    let clean = newDomainName.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

    // Signed in, the domain is registered to the tenant — which is what makes the
    // beacon's events accepted for it. Signed out it is a local preview only.
    if (isSignedIn && getToken) {
      const token = await getToken();
      const result = token ? await addDomain(token, clean) : null;
      if (!result) return;
      if (!result.ok) {
        setCheckoutToast(result.message);
        return;
      }
      clean = result.domain;
    }

    if (!userDomains.includes(clean)) {
      setUserDomains(prev => [clean, ...prev]);
    }
    setSelectedDomain(clean);
    setCustomDomainInput(clean);
    setNewDomainName('');
    setShowAddDomainModal(false);
  };

  const currentRoutes = ROUTES_DATA[selectedDomain] || ROUTES_DATA['example.com'];

  // Carbon & Speed savings calculation
  const kbSavedMonthly = (calcViews * (45 - 0.8)).toFixed(0);
  const mbSavedMonthly = (Number(kbSavedMonthly) / 1024).toFixed(1);
  const hoursSaved = ((calcViews * 0.4) / 3600).toFixed(1);

  return (
    <div className="min-h-screen flex flex-col bg-cosmic-950 text-slate-100 selection:bg-cyan-500 selection:text-white font-sans bg-cyber-grid">
      {/* Add Domain Modal */}
      {showAddDomainModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="bg-cosmic-900 border border-cyan-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Globe className="w-4 h-4 text-cyan-400" /> Track New Website
              </h3>
              <button
                onClick={() => setShowAddDomainModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddDomain}>
              <label className="block text-xs font-mono text-slate-300 mb-2">Domain Name or Subdomain</label>
              <input
                type="text"
                placeholder="myproject.com"
                value={newDomainName}
                onChange={e => setNewDomainName(e.target.value)}
                className="w-full bg-cosmic-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 mb-4 font-mono"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddDomainModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 text-white text-xs font-bold hover:from-cyan-400 hover:to-indigo-500 transition shadow-glow-cyan"
                >
                  Add Website
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clerk Setup Info Modal */}
      {showClerkSetupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="bg-cosmic-900 border border-cyan-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-cyan-400" /> Multi-Tenant Authentication
              </h3>
              <button
                onClick={() => setShowClerkSetupModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              SafeMetrics uses <strong>Clerk Auth</strong> for multi-tenant organizations, invitations, and team permissions. Add your Clerk Publishable Key to enable instant live sign-in.
            </p>
            <div className="bg-cosmic-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-cyan-300 mb-4 overflow-x-auto">
              VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowClerkSetupModal(false)}
                className="px-4 py-2 rounded-lg bg-cyan-500 text-cosmic-950 font-bold text-xs hover:bg-cyan-400 transition"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Brand Top Signal Bar */}
      <div className="bg-cosmic-900/90 border-b border-cyan-500/20 py-2 px-4 text-xs font-medium text-slate-300 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 max-w-6xl mx-auto w-full justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-cyan-300 font-semibold">Zero-Telemetry Signal Grid Active</span>
            <span className="hidden sm:inline text-slate-500">&bull; 100% Cookie-Free &bull; Zero Banner Mandate &bull; Cloudflare D1 Backend</span>
          </div>
          <div className="hidden md:flex items-center gap-4 text-[11px] text-slate-400">
            <span>Database: <strong className="text-cyan-400">D1 Serverless SQL</strong></span>
            <span>GDPR/CCPA: <strong className="text-emerald-400">Certified Safe</strong></span>
          </div>
        </div>
      </div>

      {/* Primary Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-cosmic-950/80 border-b border-slate-800/80">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo & Emblem */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 p-[1px] shadow-glow-cyan">
              <div className="w-full h-full bg-cosmic-950 rounded-[11px] flex items-center justify-center">
                <svg className="w-6 h-6" viewBox="0 0 32 32" fill="none">
                  <polygon points="16,2 29,8 29,20 16,30 3,20 3,8" fill="#090d16" stroke="url(#hGrad)" strokeWidth="2" />
                  <path d="M8 17 L12 17 L14 11 L18 22 L20 15 L24 17" stroke="url(#hGrad)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  <defs>
                    <linearGradient id="hGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#22d3ee" />
                      <stop offset="100%" stopColor="#6366f1" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-white">SafeMetrics</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono font-semibold uppercase">
                  SaaS v1.0
                </span>
              </div>
              <p className="text-[10px] text-slate-400 tracking-wider">MULTI-TENANT TRAFFIC ENGINE</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center space-x-6 text-sm text-slate-300">
            {/* Your own analytics, only once there is an account to scope them to. */}
            {isSignedIn && (
              <a
                href={ROUTES.stats}
                onClick={e => { e.preventDefault(); navigate(ROUTES.stats); }}
                className={`transition flex items-center gap-1 ${
                  path === ROUTES.stats ? 'text-cyan-400 font-semibold' : 'hover:text-cyan-400'
                }`}
              >
                <BarChart2 className="w-3.5 h-3.5 text-cyan-400" /> My Stats
              </a>
            )}
            <a
              href={sectionHref(path, 'signal-center')}
              onClick={e => {
                if (path !== ROUTES.home) { e.preventDefault(); navigate(ROUTES.home); }
              }}
              className="hover:text-cyan-400 transition flex items-center gap-1"
            >
              <Activity className="w-3.5 h-3.5 text-cyan-400" /> Signal Studio
            </a>
            <a href={sectionHref(path, 'install')} className="hover:text-cyan-400 transition">Install Snippet</a>
            <a href={sectionHref(path, 'benchmarks')} className="hover:text-cyan-400 transition">vs GA4</a>
            <a href={sectionHref(path, 'calculator')} className="hover:text-cyan-400 transition">Speed Impact</a>
            <a href={sectionHref(path, 'pricing')} className="hover:text-cyan-400 transition">Pricing</a>
          </nav>

          {/* Authentication Actions */}
          <div className="flex items-center space-x-3">
            {hasClerk ? (
              <>
                <SignedOut>
                  <SignInButton mode="modal">
                    <button className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-900 transition flex items-center gap-1.5">
                      <LogIn className="w-3.5 h-3.5 text-cyan-400" /> Log In
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button className="px-4 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 text-white hover:from-cyan-400 hover:to-indigo-500 shadow-glow-cyan transition flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" /> Start Free
                    </button>
                  </SignUpButton>
                </SignedOut>
                <SignedIn>
                  <button
                    onClick={() => setShowAddDomainModal(true)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cosmic-900 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 transition flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Website
                  </button>
                  <UserButton afterSignOutUrl="/" />
                </SignedIn>
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowClerkSetupModal(true)}
                  className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-900 transition flex items-center gap-1.5"
                >
                  <LogIn className="w-3.5 h-3.5 text-cyan-400" /> Log In
                </button>
                <button
                  onClick={() => setShowAddDomainModal(true)}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 text-white hover:from-cyan-400 hover:to-indigo-500 shadow-glow-cyan transition flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" /> Launch Free Site
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {path === ROUTES.stats ? (
          <StatsPage isSignedIn={isSignedIn} getToken={getToken} />
        ) : (
        <>
        {/* Hero Section */}
        <section className="py-16 md:py-24 px-4 relative overflow-hidden text-center">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-cyan-600/15 via-indigo-600/15 to-transparent blur-[120px] rounded-full pointer-events-none -z-10" />

          <div className="max-w-4xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 text-xs font-mono font-medium mb-6">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>THE PRIVACY-NATIVE WEB ANALYTICS PLATFORM</span>
            </div>

            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight">
              Real-Time Traffic Intelligence <br className="hidden sm:inline" />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400">
                Without Cookies, Lag, or Consent Banners
              </span>
            </h1>

            <p className="text-base md:text-lg text-slate-400 max-w-2xl mx-auto mb-8 leading-relaxed">
              Ditch heavy, slow, invasive tracking scripts. SafeMetrics delivers crystal-clear live metrics in an ultra-compact &lt;1KB footprint that never sells your data or annoys visitors.
            </p>

            {/* Micro-Features Bar */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-300 mb-10 font-medium">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-cyan-400" /> No Cookie Consent Banner</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-cyan-400" /> &lt;0.8 KB Embed Script</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-cyan-400" /> 100% GDPR &amp; CCPA Compliant</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-cyan-400" /> Zero IP Storage</span>
            </div>

            {/* Live Telemetry Radar Stream */}
            <div className="max-w-2xl mx-auto bg-cosmic-900/80 border border-cyan-500/20 rounded-xl p-3 backdrop-blur-md shadow-xl text-left">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pb-2 border-b border-slate-800">
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <Activity className="w-3.5 h-3.5 animate-pulse" /> Live Telemetry Feed
                </span>
                <span>Active Properties: {userDomains.length}</span>
              </div>
              <div className="space-y-1.5 pt-2 font-mono text-xs">
                {livePings.map(ping => (
                  <div key={ping.id} className="flex items-center justify-between text-slate-300 p-1 rounded hover:bg-cosmic-850 transition">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 text-[10px] font-bold">{ping.country}</span>
                      <span className="text-slate-200">{ping.path}</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                      <span>{ping.latency}</span>
                      <span>{ping.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Interactive SafeMetrics Signal Center */}
          <div id="signal-center" className="max-w-5xl mx-auto glass-card rounded-2xl p-6 md:p-8 shadow-2xl text-left relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

            {/* Studio Navigation & Domain Selector */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800 mb-6">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-cosmic-950 border border-slate-800 rounded-lg p-1">
                  <Globe className="w-4 h-4 text-cyan-400 ml-2" />
                  <select
                    value={selectedDomain}
                    onChange={e => {
                      setSelectedDomain(e.target.value);
                      setCustomDomainInput(e.target.value);
                    }}
                    className="bg-transparent text-sm font-semibold text-white focus:outline-none pr-3 cursor-pointer"
                  >
                    {userDomains.map(d => (
                      <option key={d} value={d} className="bg-cosmic-900 text-slate-200">{d}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => setShowAddDomainModal(true)}
                  className="p-2 rounded-lg bg-cosmic-950 border border-slate-800 text-slate-400 hover:text-white hover:border-cyan-500/40 transition"
                  title="Add website to track"
                >
                  <Plus className="w-3.5 h-3.5 text-cyan-400" />
                </button>

                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>32 Live Sessions</span>
                </div>
              </div>

              {/* Timeframe selector */}
              <div className="flex items-center gap-1 bg-cosmic-950 p-1 rounded-lg border border-slate-800 text-xs font-medium">
                {(['24h', '7d', '30d', 'all'] as const).map(tf => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-3 py-1 rounded transition uppercase ${
                      timeframe === tf ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white font-bold shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Key Metrics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="p-4 rounded-xl bg-cosmic-950/80 border border-cyan-500/15">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                  <span>Unique Sessions</span>
                  <Users className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl font-extrabold text-white">41,280</div>
                <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-0.5 font-medium">
                  <TrendingUp className="w-3 h-3" /> +16.4% vs last week
                </div>
              </div>

              <div className="p-4 rounded-xl bg-cosmic-950/80 border border-indigo-500/15">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                  <span>Telemetry Pageviews</span>
                  <Eye className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-2xl font-extrabold text-white">128,450</div>
                <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-0.5 font-medium">
                  <TrendingUp className="w-3 h-3" /> +21.2% velocity
                </div>
              </div>

              <div className="p-4 rounded-xl bg-cosmic-950/80 border border-teal-500/15">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                  <span>Bounce Index</span>
                  <BarChart2 className="w-4 h-4 text-teal-400" />
                </div>
                <div className="text-2xl font-extrabold text-white">31.8%</div>
                <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-0.5 font-medium">
                  <TrendingUp className="w-3 h-3" /> -3.4% lower bounce
                </div>
              </div>

              <div className="p-4 rounded-xl bg-cosmic-950/80 border border-cyan-500/15">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                  <span>Mean Session Dwell</span>
                  <Clock className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl font-extrabold text-white">3m 18s</div>
                <div className="text-[11px] text-cyan-400 mt-1 flex items-center gap-0.5 font-medium">
                  <TrendingUp className="w-3 h-3" /> +45s engagement
                </div>
              </div>
            </div>

            {/* Glowing SVG Spline Area Chart */}
            <div className="mb-8 p-5 rounded-xl bg-cosmic-950/90 border border-slate-800 relative">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span>Visitor Traffic Spline</span>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">Aggregated in-memory &bull; Zero PII</span>
              </div>

              <div className="h-44 w-full relative">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 500 120" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#22d3ee" />
                      <stop offset="50%" stopColor="#06b6d4" />
                      <stop offset="100%" stopColor="#818cf8" />
                    </linearGradient>
                  </defs>
                  {/* Grid Lines */}
                  <line x1="0" y1="30" x2="500" y2="30" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                  <line x1="0" y1="60" x2="500" y2="60" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                  <line x1="0" y1="90" x2="500" y2="90" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />

                  {/* Area Fill */}
                  <path
                    d="M 0,90 Q 70,40 140,65 T 280,30 T 420,45 T 500,20 L 500,120 L 0,120 Z"
                    fill="url(#areaGrad)"
                  />
                  {/* Glowing Stroke */}
                  <path
                    d="M 0,90 Q 70,40 140,65 T 280,30 T 420,45 T 500,20"
                    fill="none"
                    stroke="url(#lineGrad)"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  {/* Data Point Pulsers */}
                  <circle cx="280" cy="30" r="4" fill="#22d3ee" className="animate-pulse" />
                  <circle cx="500" cy="20" r="4" fill="#818cf8" />
                </svg>
              </div>

              <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-2 pt-2 border-t border-slate-850">
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
                <span>Sun (Peak)</span>
              </div>
            </div>

            {/* Breakdown Explorer Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4 text-xs font-semibold">
              {(['routes', 'sources', 'geo', 'goals'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 rounded-lg transition capitalize flex items-center gap-1.5 ${
                    activeTab === tab
                      ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab === 'routes' && <Layers className="w-3.5 h-3.5" />}
                  {tab === 'sources' && <ArrowUpRight className="w-3.5 h-3.5" />}
                  {tab === 'geo' && <Globe className="w-3.5 h-3.5" />}
                  {tab === 'goals' && <Sparkles className="w-3.5 h-3.5" />}
                  <span>{tab}</span>
                </button>
              ))}
            </div>

            {/* Tab Views */}
            {activeTab === 'routes' && (
              <div className="space-y-2">
                {currentRoutes.map((r, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-cosmic-950/70 border border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="font-mono text-cyan-300 font-medium truncate max-w-xs">{r.path}</span>
                    <div className="flex items-center gap-6">
                      <span className="text-slate-400">Dwell: <strong className="text-slate-200">{r.dwell}</strong></span>
                      <span className="font-mono text-white font-bold">{r.views.toLocaleString()}</span>
                      <div className="w-16 h-1.5 bg-slate-850 rounded-full overflow-hidden hidden sm:block">
                        <div style={{ width: `${r.pct}%` }} className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'sources' && (
              <div className="space-y-2">
                {SOURCES_DATA.map((s, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-cosmic-950/70 border border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="text-slate-200 font-medium">{s.source}</span>
                    <div className="flex items-center gap-6">
                      <span className="text-slate-400">Bounce: <strong className="text-slate-200">{s.bounce}</strong></span>
                      <span className="font-mono text-white font-bold">{s.visitors.toLocaleString()}</span>
                      <div className="w-16 h-1.5 bg-slate-850 rounded-full overflow-hidden hidden sm:block">
                        <div style={{ width: `${s.pct}%` }} className="h-full bg-gradient-to-r from-teal-400 to-cyan-500 rounded-full" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'geo' && (
              <div className="grid sm:grid-cols-2 gap-3">
                {GEO_DATA.map((g, i) => (
                  <div key={i} className="p-3 rounded-lg bg-cosmic-950/70 border border-slate-800/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 text-[10px] font-bold font-mono">{g.code}</span>
                      <span className="text-slate-200">{g.country}</span>
                    </div>
                    <span className="font-mono text-white font-bold">{g.visitors.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'goals' && (
              <div className="space-y-2">
                {GOALS_DATA.map((goal, i) => (
                  <div key={i} className="p-3 rounded-lg bg-cosmic-950/70 border border-slate-800/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-slate-200 font-semibold">{goal.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-slate-400">Rate: <strong className="text-emerald-400">{goal.rate}</strong></span>
                      <span className="font-mono text-cyan-300 font-bold">{goal.conversions.toLocaleString()} conv.</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Multi-Framework Embed Studio */}
        <section id="install" className="py-16 px-4 bg-cosmic-900/60 border-t border-slate-800/80">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">1-Minute Instant Integration Studio</h2>
              <p className="text-sm text-slate-400">Select your framework, enter your domain, and drop in the ultra-compact beacon script.</p>
            </div>

            <div className="glass-card rounded-2xl p-6 shadow-2xl">
              {/* Domain Input */}
              <div className="mb-6">
                <label className="block text-xs font-mono font-semibold text-cyan-300 mb-2">Your Production Website Domain</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customDomainInput}
                    onChange={e => setCustomDomainInput(e.target.value)}
                    placeholder="mybrand.com"
                    className="w-full bg-cosmic-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500 transition"
                  />
                </div>
              </div>

              {/* Framework Selector Tabs */}
              <div className="flex flex-wrap gap-2 mb-4">
                {FRAMEWORKS.map(fw => (
                  <button
                    key={fw.id}
                    onClick={() => setSelectedFramework(fw.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      selectedFramework === fw.id
                        ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-glow-cyan'
                        : 'bg-cosmic-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {fw.name}
                  </button>
                ))}
              </div>

              {/* Code Snippet Box */}
              <div className="relative">
                <pre className="bg-cosmic-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-cyan-300 overflow-x-auto leading-relaxed">
                  {getFrameworkSnippet()}
                </pre>
                <button
                  onClick={handleCopy}
                  className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-cosmic-950 font-bold text-xs flex items-center gap-1.5 transition shadow-glow-cyan"
                >
                  {copiedSnippet ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSnippet ? 'Copied to Clipboard!' : 'Copy Code'}</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Head-to-Head Architectural Benchmarks */}
        <section id="benchmarks" className="py-16 px-4 bg-cosmic-950 border-t border-slate-800/80">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Architectural Comparison vs GA4</h2>
              <p className="text-sm text-slate-400">Why privacy-focused engineers and high-converting storefronts ditch GA4.</p>
            </div>

            <div className="glass-card rounded-2xl overflow-hidden shadow-2xl">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-cosmic-900/60">
                    <th className="py-3.5 px-4 font-semibold">Criteria / Spec</th>
                    <th className="py-3.5 px-4 font-bold text-cyan-400 bg-cyan-950/30">SafeMetrics SaaS</th>
                    <th className="py-3.5 px-4 font-semibold text-slate-400">Google Analytics 4 (GA4)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  <tr>
                    <td className="py-3.5 px-4 font-medium text-slate-200">Cookie Banner Needed?</td>
                    <td className="py-3.5 px-4 text-emerald-300 font-bold bg-cyan-950/20">❌ Never (Zero Cookies)</td>
                    <td className="py-3.5 px-4 text-rose-400">⚠️ Mandatory (EU/GDPR)</td>
                  </tr>
                  <tr>
                    <td className="py-3.5 px-4 font-medium text-slate-200">Script Payload on Wire</td>
                    <td className="py-3.5 px-4 text-cyan-300 font-mono font-bold bg-cyan-950/20">&lt; 0.8 KB (Instant)</td>
                    <td className="py-3.5 px-4 text-rose-400 font-mono">45.2 KB + GTM (Slows LCP)</td>
                  </tr>
                  <tr>
                    <td className="py-3.5 px-4 font-medium text-slate-200">Telemetry Ingestion Lag</td>
                    <td className="py-3.5 px-4 text-cyan-300 font-bold bg-cyan-950/20">⚡ 3.9ms (Cloudflare D1)</td>
                    <td className="py-3.5 px-4 text-slate-400">24 to 48 Hour Processing Lag</td>
                  </tr>
                  <tr>
                    <td className="py-3.5 px-4 font-medium text-slate-200">Regulatory Compliance</td>
                    <td className="py-3.5 px-4 text-emerald-300 font-bold bg-cyan-950/20">✅ 100% GDPR, CCPA, PECR</td>
                    <td className="py-3.5 px-4 text-rose-400">❌ Ruled non-compliant in EU</td>
                  </tr>
                  <tr>
                    <td className="py-3.5 px-4 font-medium text-slate-200">Data Monetization</td>
                    <td className="py-3.5 px-4 text-cyan-300 font-bold bg-cyan-950/20">🔒 0% (You own your data)</td>
                    <td className="py-3.5 px-4 text-slate-400">Indexed for Google Ads</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Speed & Environmental Calculator */}
        <section id="calculator" className="py-16 px-4 bg-cosmic-900/40 border-t border-slate-800/80">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Speed &amp; Carbon Savings Calculator</h2>
            <p className="text-sm text-slate-400 mb-8">See how much client data transfer you eliminate by replacing GA4 with SafeMetrics.</p>

            <div className="glass-card rounded-2xl p-6 md:p-8 text-left">
              <div className="mb-6">
                <div className="flex justify-between text-xs font-mono mb-2">
                  <span className="text-slate-300">Monthly Pageviews:</span>
                  <span className="text-cyan-400 font-bold">{calcViews.toLocaleString()} views</span>
                </div>
                <input
                  type="range"
                  min="10000"
                  max="1000000"
                  step="10000"
                  value={calcViews}
                  onChange={e => setCalcViews(Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="p-4 rounded-xl bg-cosmic-950 border border-slate-800">
                  <div className="text-3xl font-extrabold text-cyan-400 mb-1">{mbSavedMonthly} MB</div>
                  <div className="text-xs text-slate-400">Bandwidth Saved / Month</div>
                </div>
                <div className="p-4 rounded-xl bg-cosmic-950 border border-slate-800">
                  <div className="text-3xl font-extrabold text-emerald-400 mb-1">{hoursSaved} hrs</div>
                  <div className="text-xs text-slate-400">Visitor Waiting Time Eliminated</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SaaS Pricing Section */}
        <section id="pricing" className="py-16 px-4 bg-cosmic-950 border-t border-slate-800/80">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-white mb-3">Honest, Predictable SaaS Pricing</h2>
              <p className="text-sm text-slate-400">Scale seamlessly from side projects to enterprise clusters.</p>

              {/* Billing Toggle */}
              <div className="inline-flex items-center gap-2 p-1 bg-cosmic-900 border border-slate-800 rounded-xl mt-6">
                <button
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                    billingCycle === 'monthly' ? 'bg-cyan-500 text-cosmic-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingCycle('annual')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                    billingCycle === 'annual' ? 'bg-cyan-500 text-cosmic-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Annual</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1 rounded">2 Months Free</span>
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {/* Hobby */}
              <div className="p-6 rounded-2xl bg-cosmic-900/60 border border-slate-800 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Indie Hobby</h3>
                  <p className="text-xs text-slate-400 mb-4">For makers &amp; side projects</p>
                  <div className="text-3xl font-extrabold text-white mb-6">$0</div>

                  <ul className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" /> Up to 3 websites
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" /> 10,000 monthly events
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" /> Zero cookies / Zero banners
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" /> 30-day data retention
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => setShowAddDomainModal(true)}
                  className="mt-6 block w-full text-center py-2 px-4 rounded-lg bg-cosmic-950 border border-slate-800 text-xs font-semibold text-white hover:bg-slate-850 transition"
                >
                  Get Started Free
                </button>
              </div>

              {/* Pro Growth (Hero Tier) */}
              <div className="p-6 rounded-2xl bg-gradient-to-b from-cyan-950/50 to-cosmic-950 border-2 border-cyan-500/60 shadow-glow-cyan flex flex-col justify-between relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-600 text-[10px] font-bold text-white uppercase tracking-wider">
                  Most Popular
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Pro Growth</h3>
                  <p className="text-xs text-slate-400 mb-4">For founders &amp; growing SaaS</p>
                  <div className="text-3xl font-extrabold text-white mb-6">
                    {billingCycle === 'monthly' ? '$9' : '$7'}
                    <span className="text-xs font-normal text-slate-400">/mo</span>
                  </div>

                  <ul className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" /> Unlimited websites &amp; subdomains
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" /> 150,000 monthly events
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" /> Custom domain proxying
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" /> Weekly executive email digests
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" /> 2-year data retention
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => handleCheckout('pro')}
                  disabled={activePlan === 'pro'}
                  className={`mt-6 block w-full text-center py-2 px-4 rounded-lg text-xs font-bold transition ${
                    activePlan === 'pro'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 cursor-default'
                      : 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white hover:from-cyan-400 hover:to-indigo-500 shadow-glow-cyan'
                  }`}
                >
                  {activePlan === 'pro' ? 'Current Active Plan' : 'Upgrade to Pro Growth'}
                </button>
              </div>

              {/* Scale Business */}
              <div className="p-6 rounded-2xl bg-cosmic-900/60 border border-slate-800 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Scale Business</h3>
                  <p className="text-xs text-slate-400 mb-4">For agencies &amp; high-traffic brands</p>
                  <div className="text-3xl font-extrabold text-white mb-6">
                    {billingCycle === 'monthly' ? '$29' : '$24'}
                    <span className="text-xs font-normal text-slate-400">/mo</span>
                  </div>

                  <ul className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" /> 1,500,000 monthly events
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" /> Multi-user team RBAC permissions
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" /> Full REST API &amp; Webhook triggers
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" /> Unlimited data retention
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => handleCheckout('scale')}
                  disabled={activePlan === 'scale'}
                  className={`mt-6 block w-full text-center py-2 px-4 rounded-lg text-xs font-semibold transition ${
                    activePlan === 'scale'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 cursor-default'
                      : 'bg-cosmic-950 border border-slate-800 text-white hover:bg-slate-850'
                  }`}
                >
                  {activePlan === 'scale' ? 'Current Active Plan' : 'Upgrade to Scale Business'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {checkoutToast && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-cosmic-900 border border-cyan-500/40 text-slate-200 px-4 py-3 rounded-xl shadow-2xl shadow-cyan-950 animate-in fade-in slide-in-from-bottom-4">
            <Sparkles className="w-5 h-5 text-cyan-400 shrink-0" />
            <span className="text-sm font-medium">{checkoutToast}</span>
            <button
              onClick={() => setCheckoutToast(null)}
              className="ml-2 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-850 bg-cosmic-950 py-10 px-4 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-400">
            <Shield className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-white">SafeMetrics</span>
            <span>&bull; Zero-Telemetry Traffic Intelligence</span>
          </div>
          <p>&copy; {new Date().getFullYear()} SafeMetrics SaaS &bull; 100% GDPR, CCPA &amp; PECR Certified &bull; Zero Cookies.</p>
        </div>
      </footer>
    </div>
  );
}
