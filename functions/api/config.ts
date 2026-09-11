import { json, type Env } from "../_shared/auth";

type Context = {
  env: Env;
};

export async function onRequestGet({ env }: Context) {
  return json({
    googleMapsKey: env.GOOGLE_MAPS_BROWSER_KEY ?? "",
    osApiKey: env.OS_API_KEY ?? "",
    mapCenter: { lat: 51.66, lng: 0.42 },
    mapZoom: 9,
    accessProtected: true
  });
}
