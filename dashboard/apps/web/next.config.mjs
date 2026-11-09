/** @type {import('next').NextConfig} */
const nextConfig = {
  // Same-origin API: the browser talks to localhost:3001/api, Next proxies to
  // the Fastify server, so cookies are first-party and no CORS is involved.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:4000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
