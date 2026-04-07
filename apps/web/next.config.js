/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: [
    '@quizmind/auth',
    '@quizmind/billing',
    '@quizmind/config',
    '@quizmind/contracts',
    '@quizmind/permissions',
    '@quizmind/ui',
  ],
};

module.exports = nextConfig;