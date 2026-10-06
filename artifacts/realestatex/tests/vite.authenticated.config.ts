import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vite';

import appConfig from '../vite.config';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(appConfig, defineConfig({
  resolve: {
    alias: [
      { find: /^@clerk\/react$/, replacement: path.join(testDirectory, 'signed-in-auth.fixture.ts') },
      { find: /^@workspace\/api-client-react$/, replacement: path.join(testDirectory, 'application-account.fixture.ts') },
    ],
  },
}));
