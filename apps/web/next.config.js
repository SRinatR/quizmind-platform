/** @type {import('next').NextConfig} */
const nextConfig = {
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