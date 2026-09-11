let loaderPromise: Promise<void> | null = null;

declare global {
  interface Window {
    google?: {
      maps: any;
    };
    initLinaGoogleMaps?: () => void;
  }
}

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    window.initLinaGoogleMaps = () => resolve();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&callback=initLinaGoogleMaps&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });

  return loaderPromise;
}
