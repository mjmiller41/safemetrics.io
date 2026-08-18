import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/**
 * The step after "copy the snippet": where it goes in each stack, and how to
 * confirm it is reporting. Every tab is the same one-line script — the framework
 * only changes which file it lands in.
 */
type Platform = {
  id: string
  label: string
  file: string
  language: string
  code: (domain: string) => string
}

const PLATFORMS: Platform[] = [
  {
    id: 'html',
    label: 'HTML',
    file: 'index.html',
    language: 'html',
    code: (domain) =>
      `<!doctype html>
<html>
  <head>
    <title>${domain}</title>

    <!-- SafeMetrics — paste before </head> -->
    <script defer data-domain="${domain}" src="https://safemetrics.io/js/script.js"></script>
  </head>
  <body>...</body>
</html>`,
  },
  {
    id: 'next',
    label: 'Next.js',
    file: 'app/layout.tsx',
    language: 'tsx',
    code: (domain) =>
      `import Script from 'next/script'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script
          defer
          data-domain="${domain}"
          src="https://safemetrics.io/js/script.js"
        />
      </body>
    </html>
  )
}`,
  },
  {
    id: 'wordpress',
    label: 'WordPress',
    file: 'functions.php',
    language: 'php',
    code: (domain) =>
      `<?php
// Appearance → Theme File Editor → functions.php
add_action('wp_head', function () {
  echo '<script defer data-domain="${domain}" '
     . 'src="https://safemetrics.io/js/script.js"></script>';
});`,
  },
  {
    id: 'vite',
    label: 'Vite / SPA',
    file: 'index.html',
    language: 'html',
    code: (domain) =>
      `<!-- Vite, Astro, SvelteKit and Nuxt all serve a root index.html.
     The script auto-tracks SPA route changes — no extra config. -->
<script defer data-domain="${domain}" src="https://safemetrics.io/js/script.js"></script>`,
  },
  {
    id: 'proxy',
    label: 'Self-hosted proxy',
    file: 'nginx.conf',
    language: 'nginx',
    code: (domain) =>
      `# Serve the script from your own domain so ad blockers and
# content blockers never see a third-party request.
location = /js/sm.js {
  proxy_pass https://safemetrics.io/js/script.js;
  proxy_set_header Host safemetrics.io;
  proxy_cache_valid 200 6h;
}

# Then load it as:
# <script defer data-domain="${domain}" src="/js/sm.js"></script>`,
  },
]

export function InstallGuide({ domain }: { domain: string }) {
  const [active, setActive] = useState(PLATFORMS[0].id)
  const [copied, setCopied] = useState(false)

  const platform = PLATFORMS.find((option) => option.id === active) ?? PLATFORMS[0]
  const code = platform.code(domain)

  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-10">
      <h3 className="text-center text-lg font-bold text-white">Where it goes</h3>
      <p className="mb-5 mt-1 text-center text-sm text-slate-400">
        Pick your stack. Same one line, different file.
      </p>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-xl">
        <div
          className="flex flex-wrap gap-1 border-b border-slate-800 bg-slate-900/60 p-2"
          role="tablist"
          aria-label="Installation platform"
        >
          {PLATFORMS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={active === option.id}
              onClick={() => setActive(option.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                active === option.id
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
          <span className="font-mono text-xs text-slate-500">{platform.file}</span>
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-300">
          <code>{code}</code>
        </pre>
      </div>

      <ol className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          {
            step: '1',
            title: 'Paste the snippet',
            body: 'One line, under 1 KB, loaded with defer so it never blocks your render.',
          },
          {
            step: '2',
            title: 'Deploy and reload',
            body: `Open ${domain} once. The first pageview appears in the dashboard within a second.`,
          },
          {
            step: '3',
            title: 'Delete your cookie banner',
            body: 'Nothing is stored on the visitor’s device, so consent is not required.',
          },
        ].map((item) => (
          <li key={item.step} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
              {item.step}
            </span>
            <p className="mt-2.5 text-sm font-semibold text-slate-100">{item.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.body}</p>
          </li>
        ))}
      </ol>

      <p className="mt-5 text-center text-xs text-slate-500">
        Not seeing data? The snippet ignores traffic from <code className="text-slate-400">localhost</code> by
        default — set <code className="text-slate-400">data-track-localhost="true"</code> while testing.
      </p>
    </div>
  )
}
