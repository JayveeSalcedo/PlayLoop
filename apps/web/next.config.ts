import path from "node:path";
import { config } from "dotenv";
import type { NextConfig } from "next";

// Load the monorepo root .env (not apps/web/.env) so one file configures
// both this app and packages/db's CLI scripts. See .env.example.
config({ path: path.resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  transpilePackages: ["@playloop/ui", "@playloop/games", "@playloop/economy", "@playloop/db"],
};

export default nextConfig;
