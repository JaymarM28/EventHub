import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hay un pnpm-workspace.yaml suelto en el home del usuario
  // (/Users/jaymarm/pnpm-workspace.yaml, ajeno a este proyecto) que
  // confundía la inferencia automática de la raíz del monorepo — esto la
  // fija explícitamente en el repo real.
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
