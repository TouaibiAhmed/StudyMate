import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }
export function Button({ children, variant = 'primary', className = '', ...props }: PropsWithChildren<Props>) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>
}
