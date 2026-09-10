export const APP_TITLE = 'MoonDreams App';
export const APP_DESCRIPTION =
  'A collection of mini-apps built to fit whatever felt useful, fun, or simply interesting during a particular moment in life.';

export const APP_REGISTRY = [
  {
    id: 'worth-the-wait',
    title: 'Worth the Wait - Moondreams Dev Apps',
    path: '/worth-the-wait',
    description:
      'A private space for companions to place thoughts, feelings, hopes, and desires until the right moment to share them arrives. Another Moondreams Dev App, built with passion, care, and intent.',
    image:
      'https://moondreams-dev-apps.web.app/banners/by-app/banner-worth-the-wait.png',
  },
  {
    id: 'nine-lives',
    title: 'Nine Lives - Moondreams Dev Apps',
    path: '/nine-lives',
    description:
      'A private home base for cat owners to keep track of health records, visits, vaccinations, symptoms, and the everyday care that keeps a household organized. Another Moondreams Dev App, built with care for the details that matter.',
    image: 'https://moondreams-dev-apps.web.app/banners/by-app/banner-nine-lives.png',
  },
];

export const APP_REGISTRY_PATH_MAP = Object.fromEntries(
  APP_REGISTRY.map((app) => [app.path, app]),
);

export const ADMIN_EMAIL = 'nova@moondreams.dev';
