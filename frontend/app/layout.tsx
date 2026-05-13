import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Django login app",
  description: "Sign in, register, and view login attempts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
