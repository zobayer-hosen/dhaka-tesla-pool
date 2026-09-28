import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // A small self-contained server for the Docker image (apps/web/Dockerfile).
  output: 'standalone',
  // npm workspaces install packages at the repo root, so the standalone build
  // must look there for the files it copies.
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
