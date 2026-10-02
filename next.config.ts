import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,
  // PGlite (local dev database) loads its WASM from disk; keep it out of the bundle.
  serverExternalPackages: ['@electric-sql/pglite'],
};

export default nextConfig;
