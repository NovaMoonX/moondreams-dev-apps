export const APP_REGISTRY = [
  {
    id: 'worth-the-wait',
    title: 'Worth the Wait - Moondreams Dev Apps',
    path: '/worth-the-wait',
    description:
      'A private space for companions to place thoughts, feelings, hopes, and desires until the right moment to share them arrives. Another Moondreams Dev App, built with passion, care, and intent.',
    image:
      'https://moondreams-dev-apps.web.app/banners/by-app/banner-worth-the-wait.png',
    params: {
      inviteCode: {
        isValid: (value) => value && value.length === 6,
        title: "You've been invited to join a private space on Worth the Wait",
        description:
          "You've been invited to join a private space on Worth the Wait. Accept this invitation to join the space and share your thoughts, feelings, hopes, and desires until we're ready to explore them together.",
      },
    },
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
    const isBot =
      /facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegram|redditbot|pinterest|applebot|skypeuripreview|vkshare|w3c_validator|embedly|quora link preview|outbrain|nuzzel|developers\.google\.com/i.test(
        userAgent,
      );

    // Fetch the standard index.html response from Firebase Hosting
    const response = await fetch(request);

    // Match the route path
    const appMeta = APP_REGISTRY.find((app) =>
      url.pathname.startsWith(app.path),
    );

    if (appMeta && appMeta.params) {
      // Check for query parameters and validate them
      const searchParams = new URLSearchParams(url.search);
      for (const [param, config] of Object.entries(appMeta.params)) {
        const value = searchParams.get(param);
        if (config.isValid && config.isValid(value)) {
          appMeta.title = config.title;
          appMeta.description = config.description;
          appMeta.siteName = 'Moondreams Dev Apps';
        }
      }
    }

    // If it's a social bot and we have custom meta for this route, rewrite the HTML tags
    if (appMeta && isBot) {
      return new HTMLRewriter()
        .on('meta[property="og:site_name"]', {
          element(e) {
            if (appMeta.siteName) {
              e.setAttribute('content', appMeta.siteName);
            }
          },
        })
        .on('meta[property="og:title"]', {
          element(e) {
            e.setAttribute('content', appMeta.title);
          },
        })
        .on('meta[property="og:description"]', {
          element(e) {
            e.setAttribute('content', appMeta.description);
          },
        })
        .on('meta[property="og:image"]', {
          element(e) {
            e.setAttribute('content', appMeta.image);
          },
        })
        .on('meta[property="og:url"]', {
          element(e) {
            e.setAttribute('content', url.href);
          },
        })
        .on('meta[name="twitter:title"]', {
          element(e) {
            e.setAttribute('content', appMeta.name);
          },
        })
        .on('meta[name="twitter:image"]', {
          element(e) {
            e.setAttribute('content', appMeta.image);
          },
        })
        .transform(response);
    }

    return response;
  },
};
