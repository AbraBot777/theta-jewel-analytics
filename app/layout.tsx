import "./globals.css";

export const metadata = {
  title: "Theta Jewel Analytics",
  description: "Trading System Theta analytics dashboard powered by Jewel paper and backtest data."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
