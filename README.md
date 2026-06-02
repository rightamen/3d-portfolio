# mrright.blog 3D Portfolio

A full-stack personal portfolio for Right, built with React, Vite, Tailwind CSS,
React Three Fiber, and a small Node/Express API.

## Features

- 3D hero scene with a responsive astronaut model and parallax background
- API-powered profile, projects, experience, and skills content
- Project, experience, about, contact, and footer sections
- Contact form endpoint that writes messages to `data/messages.jsonl`
- Production server that serves the Vite `dist` build and `/api/*`
- VPS deployment helper for systemd-based Linux servers

## Local Development

```bash
npm install
npm run dev:full
```

The frontend runs on `http://localhost:5173`; Vite proxies `/api` to the
Express server on `http://localhost:4173`.

## Production Build

```bash
npm run build
npm run start
```

The production server listens on `PORT` or `4173`.

## VPS Deploy

Set these environment variables before deployment:

```bash
VPS_HOST=147.79.20.232
VPS_PORT=22
VPS_USER=root
VPS_PASSWORD=your-root-password
```

Then run:

```bash
npm run deploy:vps
```

The script uploads the built app to `/opt/mrright-portfolio`, installs
production dependencies, creates a `mrright-portfolio` systemd service, and
checks `/api/health`.

## Cloudflare DNS

For `mrright.blog`, point:

- `mrright.blog` A record to the VPS IPv4 address
- `www.mrright.blog` CNAME to `mrright.blog`

After the VPS service is running behind port 80/443, keep Cloudflare proxy
enabled for the root and `www` records.
