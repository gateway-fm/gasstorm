import clsx from 'clsx';
import Link from 'next/link';
import { forwardRef, ReactNode } from 'react';
import { Color } from '../../styles/Color';
import { BookIcon } from '../icons/BookIcon';
import { WebSimpleIcon } from '../icons/WebSimpleIcon';

interface NavLinkItem {
  title: string;
  url: string;
  icon: ReactNode;
}

export const navLinks: NavLinkItem[] = [
  { title: 'Gateway', url: 'https://gateway.fm', icon: <WebSimpleIcon width={20} height={20} /> },
  {
    title: 'Docs',
    url: 'https://docs.hyperlane.xyz',
    icon: <BookIcon color={Color.primary[500]} width={23} height={16} />,
  },
];

interface NavItemProps {
  item: NavLinkItem;
  className?: string;
}

export const NavItem = forwardRef<HTMLAnchorElement, NavItemProps>(function NavItem(
  { item, className },
  ref,
) {
  return (
    <Link
      ref={ref}
      className={clsx(
        'flex items-center gap-2 text-primary-500 decoration-primary-500 underline-offset-2 hover:underline',
        className,
      )}
      target="_blank"
      rel="noopener noreferrer"
      href={item.url}
    >
      <div className="w-5">{item.icon}</div>
      <span>{item.title}</span>
    </Link>
  );
});
