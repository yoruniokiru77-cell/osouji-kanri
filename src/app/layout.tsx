import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ハウスクリーニング管理",
  description: "予約、報告、経費、収支を一元管理するMVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
