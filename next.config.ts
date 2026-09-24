import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow LAN / VPN hosts to load Next.js HMR assets in dev
  allowedDevOrigins: [
    "10.59.143.39",
    "26.81.214.207",
    "127.0.0.1",
    "localhost",
  ],
};

export default nextConfig;
