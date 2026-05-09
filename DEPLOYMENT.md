# Deployment Guide - Oracle Linux 9.7

This guide outlines how to deploy the Avatar Frame Studio Internal Tool on a low-RAM server (<1GB).

## 1. Prerequisites
- Node.js 20.x
- Nginx
- PM2 (`npm install -g pm2`)

## 2. Server Setup
Clone the repository and install dependencies.

```bash
cd server
npm install
cd ../client
npm install
npm run build
```

## 3. PM2 Configuration
Create a `ecosystem.config.js` in the root directory:

```javascript
module.exports = {
  apps: [{
    name: "avatar-studio-server",
    script: "./server/index.js",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "300M",
    node_args: "--max-old-space-size=256",
    env: {
      NODE_ENV: "production",
      PORT: 3000
    }
  }]
}
```

Start the server:
```bash
pm2 start ecosystem.config.js
```

## 4. Nginx Configuration
Configure Nginx as a reverse proxy and static file server.

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend build
    root /path/to/project/client/dist;
    index index.html;

    # Gzip for performance
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    # Max upload size
    client_max_body_size 5m;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Proxy
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Static Assets (uploads/exports)
    location /uploads/ {
        alias /path/to/project/uploads/;
        expires 7d;
    }

    location /exports/ {
        alias /path/to/project/exports/;
        expires 1d;
    }
}
```

## 5. Security Notes
- The admin credentials are hardcoded in `server/index.js`.
- Ensure directory permissions allow the Node.js process to write to `uploads/` and `exports/`.
- Use HTTPS if possible by adding SSL certificates via Certbot.
