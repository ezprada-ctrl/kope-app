import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default 1MB terlalu kecil buat PDF mutasi Jago berbulan-bulan
      // (upload rekonsiliasi lewat ekstrakSaldoDariPdf di rekonsiliasi/actions.ts).
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
