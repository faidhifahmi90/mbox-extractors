const fs = require('fs');
const sharp = require('sharp');

const iconForegroundSvg = `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f97316" />
      <stop offset="50%" stop-color="#ec4899" />
      <stop offset="100%" stop-color="#6366f1" />
    </linearGradient>
  </defs>
  <g stroke="url(#grad)" stroke-width="64" stroke-linecap="round" stroke-linejoin="round" fill="none" transform="translate(192, 256) scale(26.6666)">
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M3 6l9 6 9-6" />
    <path d="M14 14l7 7m0-5v5h-5" />
  </g>
</svg>`;

const iconBackgroundSvg = `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#fcf8f8" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bgGrad)" />
</svg>`;

const iconSvg = `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f97316" />
      <stop offset="50%" stop-color="#ec4899" />
      <stop offset="100%" stop-color="#6366f1" />
    </linearGradient>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#fcf8f8" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bgGrad)" />
  <g stroke="url(#grad)" stroke-width="64" stroke-linecap="round" stroke-linejoin="round" fill="none" transform="translate(192, 256) scale(26.6666)">
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M3 6l9 6 9-6" />
    <path d="M14 14l7 7m0-5v5h-5" />
  </g>
</svg>`;

const splashSvg = `<svg width="2732" height="2732" viewBox="0 0 2732 2732" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f97316" />
      <stop offset="50%" stop-color="#ec4899" />
      <stop offset="100%" stop-color="#6366f1" />
    </linearGradient>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#fcf8f8" />
    </linearGradient>
  </defs>
  <rect width="2732" height="2732" fill="url(#bgGrad)" />
  <g stroke="url(#grad)" stroke-width="64" stroke-linecap="round" stroke-linejoin="round" fill="none" transform="translate(750, 750) scale(50)">
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M3 6l9 6 9-6" />
    <path d="M14 14l7 7m0-5v5h-5" />
  </g>
</svg>`;

const splashDarkSvg = `<svg width="2732" height="2732" viewBox="0 0 2732 2732" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f97316" />
      <stop offset="50%" stop-color="#ec4899" />
      <stop offset="100%" stop-color="#6366f1" />
    </linearGradient>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#121212" />
      <stop offset="100%" stop-color="#1c1b1b" />
    </linearGradient>
  </defs>
  <rect width="2732" height="2732" fill="url(#bgGrad)" />
  <g stroke="url(#grad)" stroke-width="64" stroke-linecap="round" stroke-linejoin="round" fill="none" transform="translate(750, 750) scale(50)">
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M3 6l9 6 9-6" />
    <path d="M14 14l7 7m0-5v5h-5" />
  </g>
</svg>`;

fs.mkdirSync('assets', { recursive: true });

Promise.all([
  sharp(Buffer.from(iconSvg)).resize(1024, 1024).png().toFile('assets/logo.png'),
  sharp(Buffer.from(iconSvg)).resize(1024, 1024).png().toFile('assets/icon.png'),
  sharp(Buffer.from(iconForegroundSvg)).resize(1024, 1024).png().toFile('assets/icon-foreground.png'),
  sharp(Buffer.from(iconBackgroundSvg)).resize(1024, 1024).png().toFile('assets/icon-background.png'),
  sharp(Buffer.from(splashSvg)).resize(2732, 2732).png().toFile('assets/splash.png'),
  sharp(Buffer.from(splashDarkSvg)).resize(2732, 2732).png().toFile('assets/splash-dark.png'),
  sharp(Buffer.from(iconSvg)).resize(192, 192).png().toFile('public/logo192.png'),
  sharp(Buffer.from(iconSvg)).resize(512, 512).png().toFile('public/logo512.png'),
  sharp(Buffer.from(iconSvg)).resize(64, 64).png().toFile('public/favicon.ico')
]).then(() => console.log('Assets generated successfully.'))
  .catch(console.error);
