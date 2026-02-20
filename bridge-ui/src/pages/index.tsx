import type { NextPage } from 'next';
import { FloatingButtonStrip } from '../components/nav/FloatingButtonStrip';
import { TipCard } from '../components/tip/TipCard';
import { TransferTokenCard } from '../features/transfer/TransferTokenCard';

const Home: NextPage = () => {
  return (
    <div className="w-full max-w-[32rem] space-y-3 px-1 pt-4 sm:px-0">
      <TipCard />
      <div className="relative">
        <TransferTokenCard />
        <FloatingButtonStrip />
      </div>
    </div>
  );
};

export default Home;
