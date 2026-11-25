import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repositoryName = "/Whatsapp-Campaign-Manager";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: isGitHubPages ? "export" : undefined,
  basePath: isGitHubPages ? repositoryName : "",
  assetPrefix: isGitHubPages ? repositoryName : "",
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
