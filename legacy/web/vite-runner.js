import { createServer } from 'vite';

(async () => {
  try {
    const server = await createServer({
      configFile: './vite.config.ts',
    });
    await server.listen();
    server.printUrls();
  } catch (error) {
    console.error('Failed to start Vite server:', error);
    process.exit(1);
  }
})();
