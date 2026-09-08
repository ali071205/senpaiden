/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the development compiler isolated from production builds. Running
  // `next build` must not invalidate chunks used by an active dev server.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  turbopack: {
    root: new URL('.', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1)).replace(/\/$/, ''),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**', // Allow all image hosts for now, to support dynamic cover art from any provider
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
        pathname: '/manga-images/**',
      },
    ],
  },
  compress: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['lucide-react', '@supabase/supabase-js', 'framer-motion'],
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '',
    NEXT_PUBLIC_R2_URL: process.env.NEXT_PUBLIC_R2_URL || 'https://lsdnqbfiytyonvmzurxj.supabase.co/storage/v1/object/public/manga-images',
  }
};

export default nextConfig;
