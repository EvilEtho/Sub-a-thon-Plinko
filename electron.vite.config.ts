import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __TWITCH_CLIENT_ID__: JSON.stringify(process.env.TWITCH_CLIENT_ID ?? '')
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { panel: resolve(__dirname, 'src/preload/panel.preload.ts') }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    // Copy resources/ (app icon) to the renderer output so it's served (favicon + in-app logo).
    publicDir: resolve(__dirname, 'resources'),
    plugins: [react()],
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    },
    build: {
      rollupOptions: {
        input: {
          panel: resolve(__dirname, 'src/panel/index.html'),
          board: resolve(__dirname, 'src/overlays/board/index.html'),
          timer: resolve(__dirname, 'src/overlays/timer/index.html'),
          feed: resolve(__dirname, 'src/overlays/feed/index.html'),
          goals: resolve(__dirname, 'src/overlays/goals/index.html')
        }
      }
    }
  }
})
