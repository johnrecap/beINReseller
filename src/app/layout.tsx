import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const cairo = Cairo({
  variable: "--font-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "beIN Sports Reseller Panel",
  description: "لوحة تحكم موزعي خدمات beIN Sports",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="ltr">
      <body className={`${cairo.variable} font-arabic antialiased bg-gray-50`}>
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
