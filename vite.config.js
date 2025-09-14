import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    open: true
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom/client",
      "pdfjs-dist",
      "pdfjs-dist/build/pdf.worker.mjs",
      "pdf-lib",
      "interactjs",
      "file-saver"
    ]
  }
});

