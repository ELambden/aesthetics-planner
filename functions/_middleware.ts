import { getAccessConfig, isAuthenticated, json, privateResponse, type Env } from "./_shared/auth";

type Context = {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
};

export async function onRequest(context: Context) {
  const config = getAccessConfig(context.env);
  if (!config) {
    return json({ error: "Private access is not configured yet. Contact the site owner." }, { status: 503 });
  }

  if (!(await isAuthenticated(context.request, config))) {
    return json({ error: "Sign in through the site's Cloudflare Access login to continue." }, { status: 403 });
  }

  return privateResponse(await context.next());
}
