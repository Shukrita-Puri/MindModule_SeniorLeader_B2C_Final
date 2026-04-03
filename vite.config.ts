import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const vendorChunkGroups = [
  {
    name: "react-vendor",
    packages: [
      "react",
      "react-dom",
      "react-router",
      "react-router-dom",
      "@remix-run/router",
    ],
  },
  {
    name: "ui-vendor",
    packages: [
      "@radix-ui",
      "cmdk",
      "embla-carousel-react",
      "input-otp",
      "sonner",
      "vaul",
    ],
  },
  {
    name: "data-vendor",
    packages: [
      "@auth0/auth0-react",
      "@supabase/supabase-js",
      "@tanstack/react-query",
      "@capacitor",
      "@capgo/capacitor-health",
    ],
  },
  {
    name: "charts-vendor",
    packages: [
      "@nivo/radar",
      "recharts",
      "d3-",
    ],
  },
  {
    name: "forms-vendor",
    packages: [
      "@hookform/resolvers",
      "react-hook-form",
      "zod",
    ],
  },
];

const getManualChunk = (id: string) => {
  if (!id.includes("node_modules")) {
    return undefined;
  }

  const match = vendorChunkGroups.find(({ packages }) =>
    packages.some((pkg) => id.includes(`/node_modules/${pkg}/`) || id.includes(`/node_modules/${pkg}`))
  );

  return match?.name ?? "vendor";
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: getManualChunk,
      },
    },
  },
}));
