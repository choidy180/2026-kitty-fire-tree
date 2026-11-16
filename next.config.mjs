/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compiler: {
    // styled-components SSR / displayName 지원 (SWC)
    styledComponents: true,
  },
};

export default nextConfig;
