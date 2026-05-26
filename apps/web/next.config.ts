import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async rewrites() {
    const apiBase = process.env.FORKFIT_API_BASE_URL ?? "http://127.0.0.1:8000";
    return [
      {
        source: "/api/backend/:path*",
        destination: `${apiBase}/:path*`,
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
