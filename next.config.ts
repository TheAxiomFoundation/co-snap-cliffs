import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname),
  serverExternalPackages: ["js-yaml"],
};

export default config;
