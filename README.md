# 3D Portfolio

A personal portfolio built with **React + Vite + Tailwind CSS + React Three Fiber**.

## Tech Stack

- React 19
- Vite 7
- Tailwind CSS 4
- three.js / @react-three/fiber / @react-three/drei
- motion (for UI animations)

## Getting Started

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` - start local development server
- `npm run build` - build production assets
- `npm run preview` - preview production build locally
- `npm run lint` - run ESLint checks

## Current Sections

- Navbar (desktop + mobile menu)
- Hero (3D astronaut + parallax background + animated text)
- Placeholder anchors for About / Work / Contact

## Notes

- The production build currently reports a large bundle warning because the 3D stack and model assets are loaded in the main entry chunk.
