import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const devHost = process.env.HOST || "localhost"
const devPort = process.env.PORT || "3000"

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: [
    `http://localhost:${devPort}`,
    `https://localhost:${devPort}`,
    `http://${devHost}:${devPort}`,
    `https://${devHost}:${devPort}`,
  ],
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: __dirname,
  },
}

export default nextConfig
