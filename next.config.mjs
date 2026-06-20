import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb"
    }
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" }
    ]
  },
  webpack(config) {
    config.resolve.alias["@/lib"] = path.resolve(process.cwd(), "src/lib");
    config.resolve.alias["@/components"] = path.resolve(process.cwd(), "components");
    config.resolve.alias["@"] = path.resolve(process.cwd());
    return config;
  }
};

export default nextConfig;
