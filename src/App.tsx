import { useState } from 'react';
import {
  Shield, Check, Copy, TrendingUp, Users, Globe, Eye,
  Clock, ArrowUpRight, BarChart3, Smartphone, Laptop,
  CheckCircle2, Sparkles, AlertCircle, X, ChevronRight, RefreshCw
} from 'lucide-react';

interface MetricStat {
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down';
}

const SAMPLE_PAGES = [
  { path: '/', views: 14280, pct: 46 },
  { path: '/pricing', views: 5410, pct: 18 },
  { path: '/blog/why-ditch-ga4', views: 3890, pct: 12 },
  { path: '/docs/quickstart', views: 2450, pct: 8 },
  { path: '/changelog', views: 1840, pct: 6 }
];

const SAMPLE_REFERRERS = [
  { source: 'Google Search', visitors: 9450, pct: 42 },
  { source: 'Direct / Bookmark', visitors: 4890, pct: 22 },
  { source: 'GitHub', visitors: 3120, pct: 14 },
  { source: 'Twitter / X', visitors: 2410, pct: 11 },
  { source: 'Hacker News', visitors: 1980, pct: 9 }
];

const SAMPLE_COUNTRIES = [
  { name: 'United States', code: 'US', visitors: 11200, pct: 51 },
  { name: 'United Kingdom', code: 'GB', visitors: 2850, pct: 13 },
  { name: 'Germany', code: 'DE', visitors: 2100, pct: 10 },
  { name: 'Canada', code: 'CA', visitors: 1650, pct: 8 },
  { name: 'Japan', code: 'JP', visitors: 1200, pct: 5 }
];

export default function App() {
  const [timeframe, setTimeframe] = useState<'today' | '7d' | '30d'>('7d');
  const [domainInput, setDomainInput] = useState('fleadays.com');
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [activeTab, setActiveTab] = useState<'pages' | 'sources' | 'locations' | 'devices'>('pages');

  const snippet = `<script defer data-domain="${domainInput || 'yourdomain.com'}" src="https://safemetrics.io/js/script.js"></script>`;

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(snippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-white">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-900/40 via-teal-900/30 to-emerald-900/40 border-b border-emerald-500/20 py-2 px-4 text-center text-xs font-medium text-emerald-300 flex items-center justify-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
        <span>100% Cookie-Free &amp; GDPR Compliant. No Cookie Banner Required.</span>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-slate-950/80 border-b border-slate-800/80">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-emerald-300">
                SafeMetrics
              </span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                SaaS v1.0
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center space-x-6 text-sm text-slate-300">
            <a href="#demo" className="hover:text-white transition">Live Demo</a>
            <a href="#compare" className="hover:text-white transition">vs GA4</a>
            <a href="#embed" className="hover:text-white transition">Install Snippet</a>
            <a href="#pricing" className="hover:text-white transition">Pricing</a>
          </nav>

          <div className="flex items-center space-x-3">
            <a
              href="#pricing"
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 shadow-md shadow-emerald-600/20 transition"
            >
              Get Started Free
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-16 md:py-20 px-4 relative overflow-hidden text-center">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/20 via-slate-950 to-slate-950 -z-10" />

          <div className="max-w-4xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium mb-4">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Over 45x lighter than Google Analytics &bull; &lt;1 KB script
            </div>

            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-6">
              Web Analytics That Respects <br className="hidden sm:inline" />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-300">
                Visitor Privacy &amp; Your Time
              </span>
            </h1>

            <p className="text-base md:text-lg text-slate-400 max-w-2xl mx-auto mb-8">
              Track essential visitor stats in real time without cookies, complex menus, or 24-hour delays. Everything you need on a single, beautiful dashboard.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <a
                href="#demo"
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-sm font-semibold text-white hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-600/30 transition flex items-center gap-2"
              >
                <span>View Interactive Demo</span>
                <ChevronRight className="w-4 h-4" />
              </a>
              <a
                href="#embed"
                className="px-6 py-3 rounded-xl bg-slate-900 border border-slate-800 text-sm font-semibold text-slate-300 hover:text-white hover:bg-slate-850 transition"
              >
                Get Embed Snippet
              </a>
            </div>
          </div>

          {/* Interactive Live Dashboard Demo */}
          <div id="demo" className="max-w-5xl mx-auto bg-slate-900/90 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl backdrop-blur-xl text-left">
            {/* Dashboard Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800/80 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                <div>
                  <span className="text-sm font-bold text-white">fleadays.com</span>
                  <span className="ml-2 text-xs text-slate-400">&bull; Live Dashboard</span>
                </div>
                <div className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                  18 Active Now
                </div>
              </div>

              {/* Timeframe selector */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-medium">
                {(['today', '7d', '30d'] as const).map(tf => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-3 py-1 rounded transition capitalize ${
                      timeframe === tf ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tf === 'today' ? 'Today' : tf === '7d' ? 'Last 7 Days' : 'Last 30 Days'}
                  </button>
                ))}
              </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                  <span>Unique Visitors</span>
                  <Users className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white">22,480</div>
                <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" /> +14.2% vs prev period
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                  <span>Total Pageviews</span>
                  <Eye className="w-4 h-4 text-teal-400" />
                </div>
                <div className="text-2xl font-bold text-white">68,910</div>
                <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" /> +18.7% vs prev period
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                  <span>Bounce Rate</span>
                  <BarChart3 className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-white">38.4%</div>
                <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" /> -2.1% improvement
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                  <span>Avg Visit Duration</span>
                  <Clock className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-2xl font-bold text-white">2m 44s</div>
                <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" /> +32s engagement
                </div>
              </div>
            </div>

            {/* Visual Traffic Bar Chart */}
            <div className="mb-8 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="text-xs font-semibold text-slate-400 mb-3">Daily Visitors Trend</div>
              <div className="h-32 flex items-end justify-between gap-2 pt-4">
                {[3200, 3450, 4100, 3900, 4800, 5200, 4900].map((val, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                    <div
                      style={{ height: `${(val / 5500) * 100}%` }}
                      className="w-full rounded-t bg-gradient-to-t from-emerald-600 to-teal-400 group-hover:from-emerald-500 group-hover:to-teal-300 transition relative"
                    >
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-[10px] text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none">
                        {val.toLocaleString()}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500">Day {idx + 1}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Breakdown Tables Grid */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Top Pages */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="text-xs font-semibold text-slate-300 mb-3 flex items-center justify-between">
                  <span>Top Pages</span>
                  <span className="text-slate-500 font-normal">Views</span>
                </div>
                <div className="space-y-2 text-xs">
                  {SAMPLE_PAGES.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between p-1.5 rounded hover:bg-slate-900 transition">
                      <span className="font-mono text-slate-300 truncate max-w-[200px]">{p.path}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-medium">{p.views.toLocaleString()}</span>
                        <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div style={{ width: `${p.pct}%` }} className="h-full bg-emerald-500 rounded-full" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Referrers */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="text-xs font-semibold text-slate-300 mb-3 flex items-center justify-between">
                  <span>Top Traffic Sources</span>
                  <span className="text-slate-500 font-normal">Visitors</span>
                </div>
                <div className="space-y-2 text-xs">
                  {SAMPLE_REFERRERS.map((r, idx) => (
                    <div key={idx} className="flex items-center justify-between p-1.5 rounded hover:bg-slate-900 transition">
                      <span className="text-slate-300">{r.source}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-medium">{r.visitors.toLocaleString()}</span>
                        <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div style={{ width: `${r.pct}%` }} className="h-full bg-teal-500 rounded-full" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Head-to-Head Comparison */}
        <section id="compare" className="py-16 px-4 bg-slate-950 border-t border-slate-900">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">SafeMetrics vs Google Analytics 4 (GA4)</h2>
              <p className="text-sm text-slate-400">Why thousands of modern builders are abandoning GA4.</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-3 px-4 font-semibold">Feature / Metric</th>
                    <th className="py-3 px-4 font-bold text-emerald-400 bg-emerald-950/20">SafeMetrics</th>
                    <th className="py-3 px-4 font-semibold text-slate-400">Google Analytics 4 (GA4)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  <tr>
                    <td className="py-3 px-4 font-medium text-slate-200">Cookie Banner Needed?</td>
                    <td className="py-3 px-4 text-emerald-300 font-bold bg-emerald-950/20">❌ No (Zero Cookies)</td>
                    <td className="py-3 px-4 text-rose-400">⚠️ Mandatory (EU/GDPR)</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-slate-200">Embed Script Size</td>
                    <td className="py-3 px-4 text-emerald-300 font-bold bg-emerald-950/20">&lt; 1 KB (Ultra-fast)</td>
                    <td className="py-3 px-4 text-rose-400">45+ KB (Slows LCP)</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-slate-200">Real-time Visibility</td>
                    <td className="py-3 px-4 text-emerald-300 font-bold bg-emerald-950/20">⚡ Instant / Live</td>
                    <td className="py-3 px-4 text-slate-400">24 to 48 Hour Delay</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-slate-200">GDPR &amp; CCPA Compliant</td>
                    <td className="py-3 px-4 text-emerald-300 font-bold bg-emerald-950/20">✅ 100% Compliant</td>
                    <td className="py-3 px-4 text-rose-400">❌ Ruled illegal in Austria/France</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-slate-200">Data Ownership</td>
                    <td className="py-3 px-4 text-emerald-300 font-bold bg-emerald-950/20">🔒 You own 100%</td>
                    <td className="py-3 px-4 text-slate-400">Mined for Google Ads</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 1-Click Embed Generator */}
        <section id="embed" className="py-16 px-4 bg-slate-900/40 border-t border-slate-800/80">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">1-Click Simple Installation</h2>
              <p className="text-sm text-slate-400">Add one single line of code to your HTML or framework.</p>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <label className="block text-xs font-semibold text-slate-300 mb-2">Your Website Domain</label>
              <input
                type="text"
                value={domainInput}
                onChange={e => setDomainInput(e.target.value)}
                placeholder="example.com"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 mb-4"
              />

              <div className="relative">
                <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 font-mono text-xs text-emerald-300 overflow-x-auto">
                  {snippet}
                </pre>
                <button
                  onClick={handleCopySnippet}
                  className="absolute top-2.5 right-2.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 transition shadow"
                >
                  {copiedSnippet ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSnippet ? 'Copied!' : 'Copy Code'}</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-16 px-4 bg-slate-950 border-t border-slate-900">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-white mb-3">Honest, Predictable SaaS Pricing</h2>
              <p className="text-sm text-slate-400">No surprise charges. Upgrade or downgrade anytime.</p>

              {/* Toggle */}
              <div className="inline-flex items-center gap-2 p-1 bg-slate-900 border border-slate-800 rounded-xl mt-6">
                <button
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    billingCycle === 'monthly' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingCycle('annual')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                    billingCycle === 'annual' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Annual</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1 rounded">2 Months Free</span>
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {/* Starter */}
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Starter</h3>
                  <p className="text-xs text-slate-400 mb-4">For hobbyists &amp; side projects</p>
                  <div className="text-3xl font-extrabold text-white mb-6">$0</div>

                  <ul className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Up to 3 websites
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 10,000 monthly events
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 100% cookie-free
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 30-day data retention
                    </li>
                  </ul>
                </div>

                <a
                  href="#embed"
                  className="mt-6 block w-full text-center py-2 px-4 rounded-lg bg-slate-900 border border-slate-800 text-xs font-semibold text-white hover:bg-slate-800 transition"
                >
                  Start Free
                </a>
              </div>

              {/* Growth */}
              <div className="p-6 rounded-2xl bg-gradient-to-b from-emerald-950/80 to-slate-950 border-2 border-emerald-500/60 shadow-xl shadow-emerald-500/10 flex flex-col justify-between relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-[10px] font-bold text-white uppercase tracking-wider">
                  Recommended
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Growth Pro</h3>
                  <p className="text-xs text-slate-400 mb-4">For startups &amp; growing SaaS</p>
                  <div className="text-3xl font-extrabold text-white mb-6">
                    {billingCycle === 'monthly' ? '$9' : '$7.50'}
                    <span className="text-xs font-normal text-slate-400">/mo</span>
                  </div>

                  <ul className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Unlimited websites
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 100,000 monthly events
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Custom domain tracking proxy
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Weekly email summary digests
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 2-year data retention
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => alert('Stripe checkout integration active.')}
                  className="mt-6 block w-full text-center py-2 px-4 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-xs font-semibold text-white hover:from-emerald-500 hover:to-teal-500 shadow-md shadow-emerald-600/30 transition"
                >
                  Start 14-Day Free Trial
                </button>
              </div>

              {/* Business */}
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Scale Business</h3>
                  <p className="text-xs text-slate-400 mb-4">For agencies &amp; high-traffic brands</p>
                  <div className="text-3xl font-extrabold text-white mb-6">
                    {billingCycle === 'monthly' ? '$29' : '$24'}
                    <span className="text-xs font-normal text-slate-400">/mo</span>
                  </div>

                  <ul className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 1,000,000 monthly events
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Multi-user team permissions
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Full REST API &amp; Webhooks
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Unlimited data retention
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => alert('Contact sales for custom plans.')}
                  className="mt-6 block w-full text-center py-2 px-4 rounded-lg bg-slate-900 border border-slate-800 text-xs font-semibold text-white hover:bg-slate-800 transition"
                >
                  Contact Sales
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-8 px-4 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} SafeMetrics SaaS &bull; All rights reserved &bull; 100% GDPR, CCPA &amp; PECR Compliant.</p>
      </footer>
    </div>
  );
}
