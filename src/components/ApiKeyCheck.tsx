import { AlertTriangle, Check, Copy } from "lucide-react";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";

interface ApiKeyCheckProps {
  children: React.ReactNode;
}

const CopyButton = ({ text }: { text: string }) => {
  const [copied, copy] = useCopyToClipboard();

  return (
    <button
      onClick={() => copy(text)}
      className="p-2 text-muted-foreground hover:text-foreground bg-muted rounded transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    </button>
  );
};

const ApiKeyMissingAlert = () => (
  <div className="p-5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-foreground">
    <div className="flex items-center gap-2 mb-3">
      <AlertTriangle className="w-4 h-4 text-amber-500" />
      <p className="text-sm font-semibold">API key required</p>
    </div>
    <div className="flex items-center gap-2 bg-muted/50 p-3 rounded-lg mb-3">
      <code className="text-sm flex-grow font-[family-name:var(--font-mono)]">npx tambo init</code>
      <CopyButton text="npx tambo init" />
    </div>
    <p className="text-xs text-muted-foreground">
      Set your API key in <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">.env.local</code>
    </p>
  </div>
);

export function ApiKeyCheck({ children }: ApiKeyCheckProps) {
  const isApiKeyMissing = !import.meta.env.VITE_TAMBO_API_KEY;

  if (isApiKeyMissing) {
    return <ApiKeyMissingAlert />;
  }

  return <>{children}</>;
}
