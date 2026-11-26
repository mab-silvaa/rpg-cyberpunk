import { useEffect, useState } from "react";

/** Carrega uma imagem do mesmo servidor (o cookie de sessão vai junto). */
export function useImage(url: string | null): HTMLImageElement | undefined {
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement }>();

  useEffect(() => {
    if (!url) return;
    const img = new window.Image();
    let cancelled = false;
    img.onload = () => {
      if (!cancelled) setLoaded({ url, image: img });
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Enquanto a imagem nova não chega, não mostra a da cena anterior.
  return loaded && loaded.url === url ? loaded.image : undefined;
}
