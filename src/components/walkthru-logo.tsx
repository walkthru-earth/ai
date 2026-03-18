import { basePath } from "@/lib/utils";

interface WalkthruLogoProps {
  size?: number;
  className?: string;
}

export function WalkthruLogo({ size = 20, className }: WalkthruLogoProps) {
  return (
    <img src={`${basePath}/walkthru-icon.svg`} alt="walkthru.earth" width={size} height={size} className={className} />
  );
}
