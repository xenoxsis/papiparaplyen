/** @type {import('pm2').StartOptions[]} */
module.exports = {
  apps: [
    {
      name: "frontend",
      script: "/app/server.js", // Next.js standalone entry point
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "0.0.0.0", // listen on all interfaces inside the container
      },
    },
    {
      name: "backend",
      script: "/app/backend/dist/server.js",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
    },
  ],
};
