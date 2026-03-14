import "./globals.css";
export const metadata = { title: "MedCard AI", description: "教科書の写真からフラッシュカードを自動生成" };
export default function RootLayout({ children }) {
  return <html lang="ja"><body>{children}</body></html>;
}
