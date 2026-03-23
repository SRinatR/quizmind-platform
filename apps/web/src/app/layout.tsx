import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'QuizMind',
  description:
    'Ace every quiz with AI. QuizMind reads the question, finds the answer, and explains it — right inside your browser.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}