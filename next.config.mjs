/** @type {import('next').NextConfig} */

// CSP: 'unsafe-inline' для стилей нужен из-за styled-jsx/inline-стилей Next.
// Скрипты — без unsafe-eval в проде.
// Демо по голому IP отдаётся по http. В этом режиме нельзя слать
// upgrade-insecure-requests и HSTS: браузер начнёт тянуть картинки по https,
// сертификата на IP нет — и вся страница поедет без стилей и фото.
// Ставим DEMO_HTTP=1 только на время показа, на боевом домене — убрать.
const demoHttp = process.env.DEMO_HTTP === '1';

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self'",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(demoHttp ? [] : ['upgrade-insecure-requests']),
].join('; ');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // standalone нужен для self-hosting на VPS (nginx + node server.js).
  // На Vercel его ставить не надо — платформа собирает по-своему.
  // Vercel сам выставляет VERCEL=1, так что переключается автоматически.
  ...(process.env.VERCEL ? {} : { output: 'standalone' }),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ];
  },
};

export default nextConfig;
