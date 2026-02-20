import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Increase chunk warning to avoid noise for legitimate large chunks
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React runtime — cached long-term, rarely changes
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // State + utilities
          'vendor-utils': ['zustand', 'react-hot-toast'],
          // Heavy charting library — only loaded when dashboard is visited
          'vendor-charts': ['recharts'],
          // Icons — shared across pages, deduplicated into one chunk
          'vendor-icons': ['lucide-react'],
        }
      }
    }
  }
})
