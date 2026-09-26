import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_SERVER_URL || 'http://127.0.0.1:8080'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
