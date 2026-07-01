import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vorion Tracker",
  description: "Time tracking & screenshot monitoring for your team",
  icons: {
    icon: "/file.svg",
    shortcut: "/vorion-logo-dark.png",
    apple: "/vorion-logo-dark.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}