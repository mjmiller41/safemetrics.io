import { useState, useEffect } from 'react';
import {
  Shield, Check, Copy, TrendingUp, Users, Globe, Eye,
  Clock, ArrowUpRight, BarChart2, Smartphone, Monitor,
  CheckCircle2, Sparkles, Activity, Zap, Layers, Code2,
  Lock, ArrowRight, ChevronRight, Sliders, ExternalLink, Cpu
} from 'lucide-react';
import { Dashboard } from './components/Dashboard';

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

const DOMAINS_LIST = ['fleadays.com', 'stillbeat.io', 'squiggles.ink', 'timbertracecrafts.com', 'ledgerdiff.com'];

const ROUTES_DATA: Record<string, RouteData[]> = {
  'fleadays.com': [
    { path: '/', views: 34120, pct: 44, dwell: '3m 12s' },
    { path: '/categories/flea-market', views: 18450, pct: 24, dwell: '2m 45s' },
    { path: '/ca/los-angeles', views: 9820, pct: 13, dwell: '1m 55s' },
    { path: '/tx/austin', views: 6410, pct: 8, dwell: '2m 10s' },
    { path: '/fl/orlando', views: 4230, pct: 5, dwell: '1m 40s' }
  ],
  'stillbeat.io': [
    { path: '/', views: 12450, pct: 52, dwell: '2m 30s' },
    { path: '/docs/api', views: 5890, pct: 25, dwell: '4m 10s' },
    { path: '/pricing', views: 3410, pct: 14, dwell: '1m 20s' },
    { path: '/integrations/telegram', views: 1820, pct: 8, dwell: '3m 05s' }
  ],
  'squiggles.ink': [
    { path: '/', views: 24800, pct: 62, dwell: '8m 45s' },
    { path: '/canvas/demo', views: 8900, pct: 22, dwell: '12m 10s' },
    { path: '/pricing', views: 3600, pct: 9, dwell: '1m 15s' },
    { path: '/export', views: 2400, pct: 6, dwell: '2m 40s' }
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
  { name: 'External Link Click (Etsy/Docs)', conversions: 3120, rate: '7.1%' }
];

const FRAMEWORKS = [
  { id: 'next', name: 'Next.js 14/15' },
  { id: 'html', name: 'HTML / Static' },
  { id: 'react', name: 'React + Vite' },
  { id: 'astro', name: 'Astro' },
  { id: 'wordpress', name: 'WordPress' },
  { id: 'laravel', name: 'Laravel Blade' }
];

export default function App() {
  const [selectedDomain, setSelectedDomain] = useState('fleadays.com');
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [activeTab, setActiveTab] = useState<'routes' | 'sources' | 'geo' | 'devices' | 'goals'>('routes');
  const [customDomainInput, setCustomDomainInput] = useState('fleadays.com');
  const [selectedFramework, setSelectedFramework] = useState('next');
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [calcViews, setCalcViews] = useState(100000);
  const [livePings, setLivePings] = useState([
    { id: 1, path: '/categories/flea-market', country: 'US', time: 'Just now', latency: '42ms' },
    { id: 2, path: '/ca/los-angeles', country: 'GB', time: '3s ago', latency: '38ms' },
    { id: 3, path: '/', country: 'DE', time: '7s ago', latency: '45ms' }
  ]);

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

  const currentRoutes = ROUTES_DATA[selectedDomain] || ROUTES_DATA['fleadays.com'];

  // Carbon & Speed savings math
  const kbSavedMonthly = (calcViews * (45 - 0.8)).toFixed(0);
  const mbSavedMonthly = (Number(kbSavedMonthly) / 1024).toFixed(1);
  const hoursSaved = ((calcViews * 0.4) / 3600).toFixed(1);

  return (
    <div className="min-h-screen flex flex-col bg-cosmic-950 text-slate-100 selection:bg-cyan-500 selection:text-white">
      {/* Brand Top Signal Bar */}
      <div className="bg-cosmic-900/90 border-b border-cyan-500/20 py-2 px-4 text-xs font-medium text-slate-300 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 max-w-6xl mx-auto w-full justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-cyan-300 font-semibold">Zero-Telemetry Signal Grid Active</span>
            <span className="hidden sm:inline text-slate-500">&bull; 100% Cookie-Free &bull; Zero Banner Mandate &bull; &lt;1KB Payload</span>
          </div>
          <div className="hidden md:flex items-center gap-4 text-[11px] text-slate-400">
            <span>Latency: <strong className="text-emerald-400">12ms</strong></span>
            <span>GDPR/CCPA: <strong className="text-cyan-400">Certified Safe</strong></span>
          </div>
        </div>
      </div>

      {/* Primary Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-cosmic-950/80 border-b border-slate-800/80">
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
              <p className="text-[10px] text-slate-400 tracking-wider">PRIVACY TRAFFIC ENGINE</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center space-x-6 text-sm text-slate-300">
            <a href="#signal-center" className="hover:text-cyan-400 transition flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-cyan-400" /> Signal Studio
            </a>
            <a href="#install" className="hover:text-cyan-400 transition">Install Snippet</a>
            <a href="#benchmarks" className="hover:text-cyan-400 transition">vs GA4</a>
            <a href="#calculator" className="hover:text-cyan-400 transition">Speed Impact</a>
            <a href="#pricing" className="hover:text-cyan-400 transition">Pricing</a>
          </nav>

          <div className="flex items-center space-x-3">
            <a
              href="#install"
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 text-white hover:from-cyan-400 hover:to-indigo-500 shadow-glow-cyan transition flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" /> Launch Free Site
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
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
                <span>Active Properties: {DOMAINS_LIST.length}</span>
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
          {/* Live analytics dashboard — the real interactive UI, not a mock */}
          <div id="signal-center" className="max-w-6xl mx-auto text-left">
            <Dashboard />
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
                    <td className="py-3.5 px-4 text-cyan-300 font-bold bg-cyan-950/20">⚡ 12ms (Real-Time Live)</td>
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

                <a
                  href="#install"
                  className="mt-6 block w-full text-center py-2 px-4 rounded-lg bg-cosmic-950 border border-slate-800 text-xs font-semibold text-white hover:bg-slate-850 transition"
                >
                  Get Started Free
                </a>
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
                  onClick={() => alert('Stripe checkout integration active.')}
                  className="mt-6 block w-full text-center py-2 px-4 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 text-xs font-bold text-white hover:from-cyan-400 hover:to-indigo-500 shadow-glow-cyan transition"
                >
                  Start 14-Day Free Trial
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
                  onClick={() => alert('Contact sales for custom plans.')}
                  className="mt-6 block w-full text-center py-2 px-4 rounded-lg bg-cosmic-950 border border-slate-800 text-xs font-semibold text-white hover:bg-slate-850 transition"
                >
                  Contact Sales
                </button>
              </div>
            </div>
          </div>
        </section>
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
