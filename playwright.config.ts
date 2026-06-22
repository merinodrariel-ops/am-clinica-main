import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 60_000,
    fullyParallel: false,
    reporter: 'line',
    use: {
        baseURL: 'http://127.0.0.1:3001',
        trace: 'off',
    },
    webServer: {
        command: 'npm run build && npm run start -- --port 3001',
        url: 'http://127.0.0.1:3001/admision',
        reuseExistingServer: true,
        timeout: 180_000,
    },
    projects: [
        {
            name: 'mobile-chromium',
            use: {
                browserName: 'chromium',
                ...devices['iPhone 13'],
                locale: 'es-AR',
            },
        },
    ],
});
