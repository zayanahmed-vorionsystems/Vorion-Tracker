import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vorion Tracker',
  description: 'Time tracking & screenshot monitoring for your team',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
