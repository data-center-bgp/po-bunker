import { useEffect, useState } from "react";
import { storageService } from "@/services";

// Short-lived URL for an image in the private assets bucket (null while loading).
export const useSignedUrl = (path: string | null | undefined): string | null => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (!path) return;
    storageService.getSignedUrl(path).then((signed) => {
      if (!cancelled) setUrl(signed);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return url;
};
