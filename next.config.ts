import type { NextConfig } from "next";

const STATIC_IMAGE_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800'

const nextConfig: NextConfig = {
  async headers() {
    return [
      // CORS headers for mobile API endpoints
      {
        source: '/api/mobile/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
      // Cache control headers
      {
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: STATIC_IMAGE_CACHE_CONTROL,
          },
        ],
      },
      {
        source: '/((?!_next/static|_next/image|favicon.ico|images(?:/|$)|api/uploads(?:/|$)).*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

