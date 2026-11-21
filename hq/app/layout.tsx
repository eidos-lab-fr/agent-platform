import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent HQ",
  description: "Le QG gamifié des agents d'Eidos Lab",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Press+Start+2P&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
