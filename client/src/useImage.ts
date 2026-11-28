import { useEffect, useState } from "react";

export interface ImageState {
  image: HTMLImageElement | undefined;
  /** A imagem não carregou (estado de erro do sistema de design). */
  failed: boolean;
}

/** Carrega uma imagem do mesmo servidor (o cookie de sessão vai junto). */
export function useImageState(url: string | null): ImageState {
  const [loaded, setLoaded] = useState<{
    url: string;
    image?: HTMLImageElement;
    failed?: boolean;
  }>();

  useEffect(() => {
    if (!url) return;
    const img = new window.Image();
    let cancelled = false;
    img.onload = () => {
      if (!cancelled) setLoaded({ url, image: img });
    };
    img.onerror = () => {
      if (!cancelled) setLoaded({ url, failed: true });
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Enquanto a imagem nova não chega, não mostra a da cena anterior.
  const current = loaded && loaded.url === url ? loaded : undefined;
  return { image: current?.image, failed: current?.failed === true };
}

export function useImage(url: string | null): HTMLImageElement | undefined {
  return useImageState(url).image;
}
