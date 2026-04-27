import { DropdownMenu } from '@hyperlane-xyz/widgets';
import Image from 'next/image';
import Link from 'next/link';
import { ConnectWalletButton } from '../../features/wallet/ConnectWalletButton';
import Logo from '../../images/logos/polygon-logo.svg';
import { HamburgerIcon } from '../icons/HamburgerIcon';
import { NavItem, navLinks } from './Nav';

export function Header() {
  return (
    <header className="relative flex w-full items-center justify-between bg-primary-25 px-4 py-3 shadow-[0px_4px_7px_rgba(0,0,0,0.05)] lg:justify-center lg:bg-transparent lg:px-6 lg:pb-2 lg:pt-3 lg:shadow-none">
      {/* Mobile/Tablet: Logo + Hamburger Menu */}
      <div className="flex items-center gap-3 lg:hidden">
        <Link href="/" aria-label="Homepage" className="flex items-center gap-2">
          <Image src={Logo} width={32} alt="" className="h-auto" />
          <span className="text-lg font-semibold text-primary-700">Polygon</span>
        </Link>
        <DropdownMenu
          button={<HamburgerIcon width={20} height={19} />}
          buttonClassname="rounded p-2 text-primary-500 data-[open]:bg-primary-25 data-[open]:shadow-[inset_4px_4px_4px_rgba(137,80,250,0.1)] data-[open]:text-white"
          menuClassname="py-4"
          menuItems={navLinks.map((item) => (
            <NavItem
              key={item.title}
              item={item}
              className="w-full gap-3 px-6 py-2 hover:bg-primary-50 hover:bg-opacity-30"
            />
          ))}
        />
      </div>

      {/* Desktop: Centered Logo */}
      <Link href="/" aria-label="Homepage" className="hidden items-center gap-3 py-2 lg:flex">
        <Image src={Logo} width={40} alt="" className="h-auto" />
        <span className="text-xl font-bold text-primary-700">Polygon</span>
      </Link>

      <div className="lg:absolute lg:right-12">
        <ConnectWalletButton />
      </div>
    </header>
  );
}
