import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const kyoboHand = localFont({
  src: "../../public/fonts/KyoboHandwriting2019-subset.woff",
  weight: "400",
  variable: "--font-hand",
  display: "block",
});

export const metadata: Metadata = {
  title: "우리 반 그림책 도서관",
  description: "우리 반 친구들이 함께 읽고 나누는 그림책 도서관",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${notoSansKr.variable} ${kyoboHand.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
