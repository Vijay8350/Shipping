// PM2 process manager (CLAUDE.md §4). One EC2 box runs BOTH processes:
//   - web    : the Remix server (behind Nginx/ALB)
//   - worker : BullMQ consumers + crons
// The worker is a separate process so it can later move to its own instance with
// zero code change. Run: `pm2 start ecosystem.config.cjs`.
module.exports = {
  apps: [
    {
      name: "web",
      script: "npm",
      args: "run start",
      env: { NODE_ENV: "production" },
      time: true,
    },
    {
      name: "worker",
      script: "npm",
      args: "run worker:start",
      env: { NODE_ENV: "production" },
      time: true,
    },
  ],
};
