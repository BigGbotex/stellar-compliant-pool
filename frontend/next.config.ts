import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @noir-lang/noir_wasm loads a .wasm file relative to its own package
  // directory at runtime. Bundling it into the server chunk breaks that
  // relative path, so it must run as a plain external Node dependency.
  serverExternalPackages: ["@noir-lang/noir_wasm", "@noir-lang/noir_js"],
};

export default nextConfig;
