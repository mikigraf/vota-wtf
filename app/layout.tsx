import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "vota.wtf",
  description: "Markets for what the room believes."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
