import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tripweave | Plan a trip that fits",
  description:
    "Compare clearly labeled sample itineraries against the way you want to travel.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
