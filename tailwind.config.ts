import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0B0B0C",
        paper: "#FAFAF8",
        admin: "#EAEDF1",
        line: "#ECEAE3",
        soft: "#F1F0EC",
        muted: "#6b6b66",
        faded: "#9a958a",
        ember: "#FF5A1F",
        mint: "#18C97B",
        danger: "#FF5A5A",
        warn: "#F0C000",
        sky: "#1f9bd1",
        violet: "#6b55d7"
      },
      boxShadow: {
        panel: "0 18px 46px rgba(11, 11, 12, 0.10)",
        stage: "0 24px 80px rgba(11, 11, 12, 0.20)"
      }
    }
  },
  plugins: []
};

export default config;
