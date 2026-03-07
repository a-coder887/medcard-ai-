import MedCardAI from "../components/MedCardAI";

export const metadata = {
  title: "MedCard AI — 医学フラッシュカード自動生成",
  description: "教科書の写真からフラッシュカードと穴埋めテストを自動生成",
};

export default function Home() {
  return <MedCardAI />;
}
