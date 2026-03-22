import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@quizmind/auth',
    '@quizmind/billing',
    '@quizmind/config',
    '@quizmind/contracts',
    '@quizmind/permissions',
    '@quizmind/ui',
  ],
};

export default nextConfig;
