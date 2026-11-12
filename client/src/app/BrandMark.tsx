/** Ai Gramam mark: a brass nilavilakku lamp with a living flame (original design). */
export default function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="shrink-0 drop-shadow-[0_2px_8px_rgba(227,176,75,0.45)]">
      <defs>
        <linearGradient id="brass" x1="0" x2="1">
          <stop offset="0" stopColor="#8a6418" />
          <stop offset="0.45" stopColor="#f2cf7a" />
          <stop offset="1" stopColor="#a8781f" />
        </linearGradient>
        <radialGradient id="flame" cx="0.5" cy="0.7" r="0.6">
          <stop offset="0" stopColor="#fff6c8" />
          <stop offset="0.5" stopColor="#ffc24d" />
          <stop offset="1" stopColor="#ff7a2a" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill="#13221e" stroke="rgba(227,176,75,0.55)" />
      <g className="origin-[20px_12px] animate-[flicker_1.6s_ease-in-out_infinite]">
        <path d="M20 4.5c2.6 3.2 3.4 5.4 3.4 7.2a3.4 3.4 0 1 1-6.8 0c0-1.8.8-4 3.4-7.2z" fill="url(#flame)" />
      </g>
      <ellipse cx="20" cy="17.2" rx="7.5" ry="2" fill="url(#brass)" />
      <path d="M18.6 17.5h2.8v12h-2.8z" fill="url(#brass)" />
      <ellipse cx="20" cy="23" rx="4.2" ry="1.3" fill="url(#brass)" />
      <path d="M13.5 32.5c1.5-2.2 3.8-3 6.5-3s5 .8 6.5 3z" fill="url(#brass)" />
      <style>{`@keyframes flicker{0%,100%{transform:scale(1,1)}30%{transform:scale(.92,1.06)}60%{transform:scale(1.05,.95)}}`}</style>
    </svg>
  );
}
