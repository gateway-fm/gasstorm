import { DiscordIcon, GithubIcon, HyperlaneLogo, TwitterIcon } from '@hyperlane-xyz/widgets';
import clsx from 'clsx';
import Image from 'next/image';
import Link from 'next/link';
import { ReactNode } from 'react';
import { links } from '../../consts/links';
import { INTERCOM_APP_ID } from '../../features/analytics/intercom';
import { Color } from '../../styles/Color';
import AppLogo from '../../images/logos/app-logo.svg';

type FooterLink = {
  title: string;
  url: string;
  external: boolean;
  icon?: ReactNode;
};

const footerLinks: FooterLink[] = [
  { title: 'Docs', url: links.docs, external: true },
  { title: 'Support', url: links.support, external: true },
  { title: 'Twitter', url: links.twitter, external: true, icon: <TwitterIcon color="#fff" /> },
  { title: 'Gateway', url: links.home, external: true },
  { title: 'Privacy', url: links.privacyPolicy, external: true },
  { title: 'Discord', url: links.discord, external: true, icon: <DiscordIcon color="#fff" /> },
  { title: 'Explorer', url: links.explorer, external: true },
  { title: 'Terms', url: links.tos, external: true },
  { title: 'Github', url: links.github, external: true, icon: <GithubIcon color="#fff" /> },
];

export function Footer() {
  const chatboxExist = !!INTERCOM_APP_ID;
  return (
    <footer className="relative text-white">
      <div className="relative bg-gradient-to-b from-primary-500/80 to-primary-700/90 px-8 pb-5 pt-4 sm:pt-3">
        <div
          className={clsx(
            'flex flex-col items-center gap-8 sm:flex-row sm:gap-10',
            chatboxExist ? 'justify-end' : 'justify-between',
          )}
        >
          {!chatboxExist && <FooterLogo />}
          <FooterNav />
        </div>
      </div>
    </footer>
  );
}

function FooterLogo() {
  return (
    <div className="flex items-center justify-center">
      <div className="ml-2 h-12 w-12 sm:h-14 sm:w-14">
        <Image src={AppLogo} alt="Gateway" className="h-full w-full" />
      </div>
      <div className="ml-6 space-y-1 text-lg font-medium sm:text-xl">
        <div>Gateway Bridge</div>
        <div className="flex items-center text-sm text-gray-300">
          <span>Powered by</span>
          <div className="ml-2 h-5 w-5">
            <HyperlaneLogo color={Color.white} />
          </div>
          <span className="ml-1">Hyperlane</span>
        </div>
      </div>
    </div>
  );
}

function FooterNav() {
  return (
    <nav className="text-md font-medium">
      <ul style={{ gridTemplateColumns: 'auto auto auto' }} className="grid gap-x-7 gap-y-1.5">
        {footerLinks.map((item) => (
          <li key={item.title}>
            <Link
              className="flex items-center capitalize underline-offset-2 hover:underline"
              target={item.external ? '_blank' : '_self'}
              href={item.url}
            >
              {item?.icon && <div className="mr-3 mt-1 w-4">{item?.icon}</div>}
              {!item?.icon && <div>{item.title}</div>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
