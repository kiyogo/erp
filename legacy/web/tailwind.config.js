/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        'discord-bg': '#313338',
        'discord-servers': '#1e1f22',
        'discord-channels': '#2b2d31',
        'discord-header': '#313338',
        'discord-user-bar': '#232428',
        'discord-text': '#dbdee1',
        'discord-text-muted': '#949ba4',
        'discord-brand': '#5865f2',
      },
    },
  },
  plugins: [],
};
