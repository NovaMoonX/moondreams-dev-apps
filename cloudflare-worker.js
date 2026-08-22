export const APP_REGISTRY = [
  {
    id: 'worth-the-wait',
    name: 'Worth the Wait',
    path: '/worth-the-wait',
    description:
      'A private space for companions to place thoughts, feelings, hopes, and desires until the right moment to share them arrives.',
    image: 'https://moondreams-dev-apps.web.app/banners/by-app/banner-worth-the-wait.png',
  },
];

export const APP_REGISTRY_PATH_MAP = Object.fromEntries(
  APP_REGISTRY.map((app) => [app.path, app]),
);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const userAgent = request.headers.get('user-agent') || '';

    // List of known social crawler User-Agents
    const isBot = /facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegram/i.test(userAgent);

    // Fetch the standard index.html response from Firebase Hosting
    const response = await fetch(request);

    // Match the route path
    const appMeta = APP_REGISTRY.find((app) => url.pathname.startsWith(app.path));

    // If it's a social bot and we have custom meta for this route, rewrite the HTML tags
    if (appMeta && isBot) {
      return new HTMLRewriter()
        .on('meta[property="og:title"]', { element(e) { e.setAttribute('content', `${appMeta.name} - Moondreams Dev Apps`); } })
        .on('meta[property="og:description"]', { element(e) { e.setAttribute('content', appMeta.description); } })
        .on('meta[property="og:image"]', { element(e) { e.setAttribute('content', appMeta.image); } })
        .on('meta[property="og:url"]', { element(e) { e.setAttribute('content', url.href); } })
        .on('meta[name="twitter:title"]', { element(e) { e.setAttribute('content', appMeta.name); } })
        .on('meta[name="twitter:image"]', { element(e) { e.setAttribute('content', appMeta.image); } })
        .transform(response);
    }

    return response;
  }
};