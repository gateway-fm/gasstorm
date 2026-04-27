import Image from 'next/image';
import Logo from '../../images/logos/polygon-logo.svg';

export function Footer() {
  return (
    <footer className="relative text-white">
      <div className="relative px-8 pb-5 pt-2 sm:pt-0">
        <div className="flex items-center justify-center gap-2">
          <Image src={Logo} width={20} alt="" className="h-auto opacity-60" />
          <span className="text-sm font-semibold text-primary-400">Polygon</span>
        </div>
      </div>
    </footer>
  );
}
