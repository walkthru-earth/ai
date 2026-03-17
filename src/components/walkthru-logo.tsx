import Image from "next/image";

interface WalkthruLogoProps {
  size?: number;
  className?: string;
}

export function WalkthruLogo({ size = 20, className }: WalkthruLogoProps) {
  return (
    <Image
      src="/walkthru-icon.svg"
      alt="walkthru.earth"
      width={size}
      height={size}
      className={className}
      priority
    />
  );
}
