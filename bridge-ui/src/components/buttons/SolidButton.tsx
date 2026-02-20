import { PropsWithChildren, ReactElement } from 'react';

interface ButtonProps {
  type?: 'submit' | 'reset' | 'button';
  color?: 'white' | 'primary' | 'accent' | 'green' | 'red' | 'gray'; // defaults to primary
  bold?: boolean;
  className?: string;
  icon?: ReactElement;
}

export function SolidButton(
  props: PropsWithChildren<ButtonProps & React.HTMLProps<HTMLButtonElement>>,
) {
  const {
    type,
    onClick,
    color: _color,
    className,
    bold,
    icon,
    disabled,
    title,
    ...passThruProps
  } = props;
  const color = _color ?? 'primary';

  const base =
    'flex items-center justify-center rounded-md transition-all duration-300 active:scale-[0.98] disabled:cursor-not-allowed';
  let baseColors, onHover;
  if (color === 'primary') {
    baseColors = 'bg-primary-500 text-white';
    onHover = 'hover:bg-primary-400 hover:shadow-primary';
  } else if (color === 'accent') {
    baseColors = 'bg-accent-500 text-white';
    onHover = 'hover:bg-accent-400 hover:shadow-primary';
  } else if (color === 'green') {
    baseColors = 'bg-green-500 text-white';
    onHover = 'hover:bg-green-600';
  } else if (color === 'red') {
    baseColors = 'bg-red-600 text-white';
    onHover = 'hover:bg-red-500';
  } else if (color === 'white') {
    baseColors = 'bg-slate-100 text-slate-900';
    onHover = 'hover:bg-white';
  } else if (color === 'gray') {
    baseColors = 'bg-slate-800 text-primary-200';
    onHover = 'hover:bg-slate-700';
  }
  const onDisabled = 'disabled:bg-slate-700 disabled:text-slate-400';
  const weight = bold ? 'font-semibold' : '';
  const allClasses = `${base} ${baseColors} ${onHover} ${onDisabled} ${weight} ${className}`;

  return (
    <button
      onClick={onClick}
      type={type ?? 'button'}
      disabled={disabled ?? false}
      title={title}
      className={allClasses}
      {...passThruProps}
    >
      {icon ? (
        <div className="flex items-center justify-center space-x-1">
          {props.icon}
          {props.children}
        </div>
      ) : (
        <>{props.children}</>
      )}
    </button>
  );
}
