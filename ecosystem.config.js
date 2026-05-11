// ecosystem.config.js (root of project)
module.exports = {
  apps: [{
    name: "avatar-frame",
    script: "./server/index.js",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "300M",
    node_args: "--max-old-space-size=256",
    env: { NODE_ENV: "production", PORT: 3000 }
  }]
}