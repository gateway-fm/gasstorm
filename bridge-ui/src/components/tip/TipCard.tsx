import { IconButton, XCircleIcon } from '@hyperlane-xyz/widgets';
import Image from 'next/image';
import { useState } from 'react';
import { config } from '../../consts/config';
import { links } from '../../consts/links';
import InfoCircle from '../../images/icons/info-circle.svg';
import { Card } from '../layout/Card';

export function TipCard() {
  const [show, setShow] = useState(config.showTipBox);
  if (!show) return null;
  return (
    <Card className="w-full p-3 sm:w-[31rem]">
      <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-primary-300">
        Live Route Matrix
      </h2>
      <div className="flex items-end justify-between">
        <p className="mt-1 max-w-[75%] text-xs text-slate-300">
          High-speed, permissionless transfers between local L1 and L2. Use this panel to execute
          and monitor route activity in real time.
        </p>
        <a
          href={links.docs}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2 flex items-center rounded-lg border border-primary-200/40 bg-primary-500/10 px-3 py-1.5 text-xs text-primary-200 transition-all hover:bg-primary-500/20 active:bg-primary-500/30 sm:text-sm"
        >
          <Image src={InfoCircle} width={12} alt="" />
          <span className="ml-1.5 hidden text-sm sm:inline">Learn More</span>
        </a>
      </div>
      <div className="absolute right-3 top-3">
        <IconButton onClick={() => setShow(false)} title="Hide tip" className="hover:rotate-90">
          <XCircleIcon width={16} height={16} />
        </IconButton>
      </div>
    </Card>
  );
}
