import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns', 'framer-motion', '@nivo/core'],
  },
  async redirects() {
    return [
      {
        source: '/admin/prestaciones',
        destination: '/caja-admin/prestaciones',
        permanent: false,
      },
      {
        source: '/admin/liquidaciones',
        destination: '/caja-admin/liquidaciones',
        permanent: false,
      },
      {
        source: '/admin/staff',
        destination: '/caja-admin/personal',
        permanent: false,
      },
      {
        source: '/admin/staff/:id',
        destination: '/caja-admin/personal/:id',
        permanent: false,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
};

export default nextConfig;
