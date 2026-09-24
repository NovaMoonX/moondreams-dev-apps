const SITE_NAME = 'Moondreams Dev Apps';

const hasInviteCode = (value) => value?.trim().length === 6;
const isPresent = (value) => Boolean(value?.trim());

// `params` is checked in order and the first valid match wins, so list the most specific link first.
const APP_REGISTRY = [
  {
    id: 'worth-the-wait',
    name: 'Worth the Wait',
    title: 'Worth the Wait - Moondreams Dev Apps',
    path: '/worth-the-wait',
    description:
      'A private space for companions to place thoughts, feelings, hopes, and desires until the right moment to share them arrives.',
    image:
      'https://moondreams-dev-apps.web.app/banners/by-app/banner-worth-the-wait.png',
    params: [
      {
        name: 'inviteCode',
        isValid: hasInviteCode,
        title: "You've been invited to join a private space on Worth the Wait",
        description:
          "You've been invited to join a private space on Worth the Wait. Accept this invitation to join the space and share your thoughts, feelings, hopes, and desires until we're ready to explore them together.",
      },
    ],
  },
  {
    id: 'nine-lives',
    name: 'Nine Lives',
    title: 'Nine Lives - Moondreams Dev Apps',
    path: '/nine-lives',
    description:
      'A private home base for cat owners to keep track of health records, visits, vaccinations, symptoms, and the everyday care that keeps a household organized.',
    image:
      'https://moondreams-dev-apps.web.app/banners/by-app/banner-nine-lives.png',
  },
  {
    id: 'waypoint',
    name: 'Waypoint',
    title: 'Waypoint - Moondreams Dev Apps',
    path: '/waypoint',
    description:
      'A collaborative trip planner for shared itineraries, live travel coordination, and the details that keep a journey running smoothly.',
    image:
      'https://moondreams-dev-apps.web.app/banners/by-app/banner-waypoint.png',
    params: [
      {
        name: 'inviteCode',
        isValid: hasInviteCode,
        title: "You're invited to plan a trip together on Waypoint",
        description:
          "Someone saved you a seat on their trip. Request to join and, once you're approved, you'll see the itinerary, stays, and shared expenses all in one place.",
      },
      {
        name: 'trip',
        isValid: isPresent,
        title: 'A trip on Waypoint',
        description:
          "Open the trip to catch up on the itinerary, today's plans, stays, and shared expenses. Trip members can jump right in.",
      },
    ],
  },
];

function getAppMeta(url) {
  const app = APP_REGISTRY.find((entry) => url.pathname.startsWith(entry.path));
  if (!app) {
    return null;
  }

  const match = (app.params ?? []).find(({ name, isValid }) =>
    isValid(url.searchParams.get(name)),
  );
  if (!match) {
    return app;
  }

  const meta = {
    ...app,
    title: match.title,
    description: match.description,
    siteName: SITE_NAME,
  };
  return meta;
}

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

    const appMeta = getAppMeta(url);

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
