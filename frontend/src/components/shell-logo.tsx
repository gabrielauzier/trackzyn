interface ShellLogoProps {
  size?: number
  className?: string
}

/** The app mark: a lightning bolt. Fills from currentColor so it follows
 *  whatever text colour (and theme) it is placed in. */
export function ShellLogo({ size = 24, className }: ShellLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <g fill="currentColor" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round">
        <path d="M13.6 2.2 4.4 13.1a.6.6 0 0 0 .46.99h5.84l-1.5 7.3c-.12.6.63.94 1.01.46l9.2-10.9a.6.6 0 0 0-.46-.99h-5.84l1.5-7.3c.12-.6-.63-.94-1.01-.46Z" />
      </g>
    </svg>
  )
}
