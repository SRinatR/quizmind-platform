import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'QuizMind Platform',
  description: 'Unified control-plane foundation for QuizMind web, API, and worker runtimes.',
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
