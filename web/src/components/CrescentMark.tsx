interface CrescentMarkProps {
  className?: string;
  title?: string;
}

export function CrescentMark({ className, title }: CrescentMarkProps) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      fill="none"
      role={title ? "img" : undefined}
      viewBox="0 0 58 58"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M35.8 4.8C23.3 7.8 14 19.1 14 32.5 14 47 25.8 58.8 40.3 58.8c6.3 0 12-2.2 16.5-5.9a25.7 25.7 0 0 1-8.8 1.6c-14.4 0-26-11.7-26-26.1 0-10 5.6-18.7 13.8-23.6Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        transform="translate(-6 -3)"
      />
      <path
        d="M31.8 9.5C22.6 13 16 22 16 32.4c0 13.5 10.9 24.4 24.4 24.4 4.8 0 9.3-1.4 13.1-3.8-1.5.3-3.1.5-4.7.5-13.3 0-24.1-10.8-24.1-24.1 0-7.9 3.8-15 9.8-19.4l-2.7-.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.35"
        transform="translate(-4 -3)"
      />
    </svg>
  );
}

