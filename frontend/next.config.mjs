import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  webpack: (config, { dev }) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@": path.resolve(__dirname, "src"),
    };
    // В Docker на Windows file watching часто не срабатывает — включаем polling
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        ignored: /node_modules/,
      };
    }
    return config;
  },
};

export default nextConfig;
