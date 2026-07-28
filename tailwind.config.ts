import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Control-room surface palette
        panel: {
          950: "#0a0e14",
          900: "#0d1218",
          850: "#111823",
          800: "#151f2e",
          700: "#1c2a3d",
          600: "#26384f",
        },
        // Kubernetes-inspired accent
        kube: {
          400: "#4d9dff",
          500: "#326ce5",
          600: "#2456c0",
        },
        // Status language (reference doc, Section 9)
        status: {
          running: "#22c55e",
          pending: "#eab308",
          failed: "#ef4444",
          terminated: "#64748b",
        },
      },
      fontFamily: {
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(50,108,229,0.35), 0 0 24px -6px rgba(50,108,229,0.55)",
        "glow-green": "0 0 12px -2px rgba(34,197,94,0.7)",
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        heartbeat: {
          "0%, 55%, 100%": { transform: "scale(1)", opacity: "0.55" },
          "25%": { transform: "scale(1.35)", opacity: "1" },
        },
      },
      animation: {
        pulseDot: "pulseDot 1.6s ease-in-out infinite",
        heartbeat: "heartbeat 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
