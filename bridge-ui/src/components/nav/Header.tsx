import Image from 'next/image';
import Link from 'next/link';
import { ConnectWalletButton } from '../../features/wallet/ConnectWalletButton';
import Logo from '../../images/logos/app-logo.svg';
import Name from '../../images/logos/app-name.svg';
import Title from '../../images/logos/app-title.svg';

export function Header() {
  return (
    <header className="w-full px-2 pb-2 pt-3 sm:px-6 lg:px-12">
      <div className="mx-auto flex max-w-screen-xl items-center justify-between rounded-xl border border-primary-300/45 bg-slate-950/55 px-3 py-2 shadow-card backdrop-blur-md sm:px-5 sm:py-3">
        <Link href="/" className="flex items-center py-1">
          <Image src={Logo} width={26} alt="" />
          <Image src={Name} width={110} alt="" className="ml-2 mt-0.5 hidden sm:block" />
          <Image src={Title} width={70} alt="" className="ml-1.5 mt-0.5 pb-px" />
        </Link>
        <div className="flex flex-col items-end gap-2 md:flex-row-reverse md:items-center md:gap-3">
          <span className="hidden rounded border border-accent-300/70 bg-accent-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-accent-200 sm:block">
            Local Route
          </span>
          <ConnectWalletButton />
        </div>
      </div>
    </header>
  );
}
