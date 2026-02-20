import clsx from 'clsx';
import { Field, FieldAttributes } from 'formik';
import { ChangeEvent, InputHTMLAttributes, Ref, forwardRef } from 'react';

export function TextField({ className, ...props }: FieldAttributes<unknown>) {
  return <Field className={clsx(defaultClassName, className)} {...props} />;
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  onChange: (v: string) => void;
};

export const TextInput = forwardRef(function _TextInput(
  { onChange, className, ...props }: InputProps,
  ref: Ref<HTMLInputElement>,
) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e?.target?.value || '');
  };
  return (
    <input
      ref={ref}
      type="text"
      autoComplete="off"
      onChange={handleChange}
      className={clsx(defaultClassName, className)}
      {...props}
    />
  );
});

const defaultClassName =
  'mt-1.5 w-full rounded-md border border-primary-300/45 bg-slate-900/70 px-2.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-400 focus:border-primary-300 disabled:bg-slate-800 disabled:text-slate-400 outline-none transition-all duration-300';
