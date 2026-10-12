import type { CatalogStore } from '@apps/pinch/types';

// prettier-ignore
export const CATALOG_STORES: CatalogStore[] = [
  { id: 'cat-store-walmart', name: 'Walmart', domain: 'walmart.com' },
  { id: 'cat-store-costco', name: 'Costco', domain: 'costco.com' },
  { id: 'cat-store-target', name: 'Target', domain: 'target.com' },
  { id: 'cat-store-kroger', name: 'Kroger', domain: 'kroger.com' },
  { id: 'cat-store-safeway', name: 'Safeway', domain: 'safeway.com' },
  { id: 'cat-store-albertsons', name: 'Albertsons', domain: 'albertsons.com' },
  { id: 'cat-store-publix', name: 'Publix', domain: 'publix.com' },
  { id: 'cat-store-whole-foods', name: 'Whole Foods Market', domain: 'wholefoodsmarket.com' },
  { id: 'cat-store-trader-joes', name: "Trader Joe's", domain: 'traderjoes.com' },
  { id: 'cat-store-aldi', name: 'Aldi', domain: 'aldi.us' },
  { id: 'cat-store-lidl', name: 'Lidl', domain: 'lidl.com' },
  { id: 'cat-store-sams-club', name: "Sam's Club", domain: 'samsclub.com' },
  { id: 'cat-store-bjs', name: "BJ's Wholesale Club", domain: 'bjs.com' },
  { id: 'cat-store-meijer', name: 'Meijer', domain: 'meijer.com' },
  { id: 'cat-store-heb', name: 'H-E-B', domain: 'heb.com' },
  { id: 'cat-store-wegmans', name: 'Wegmans', domain: 'wegmans.com' },
  { id: 'cat-store-sprouts', name: 'Sprouts Farmers Market', domain: 'sprouts.com' },
  { id: 'cat-store-food-lion', name: 'Food Lion', domain: 'foodlion.com' },
  { id: 'cat-store-giant-eagle', name: 'Giant Eagle', domain: 'gianteagle.com' },
  { id: 'cat-store-stop-and-shop', name: 'Stop & Shop', domain: 'stopandshop.com' },
  { id: 'cat-store-shoprite', name: 'ShopRite', domain: 'shoprite.com' },
  { id: 'cat-store-harris-teeter', name: 'Harris Teeter', domain: 'harristeeter.com' },
  { id: 'cat-store-winco', name: 'WinCo Foods', domain: 'wincofoods.com' },
  { id: 'cat-store-save-a-lot', name: 'Save A Lot', domain: 'savealot.com' },
  { id: 'cat-store-fred-meyer', name: 'Fred Meyer', domain: 'fredmeyer.com' },
  { id: 'cat-store-ralphs', name: 'Ralphs', domain: 'ralphs.com' },
  { id: 'cat-store-vons', name: 'Vons', domain: 'vons.com' },
  { id: 'cat-store-smiths', name: "Smith's", domain: 'smithsfoodanddrug.com' },
  { id: 'cat-store-amazon-fresh', name: 'Amazon Fresh', domain: 'amazon.com' },
  { id: 'cat-store-instacart', name: 'Instacart', domain: 'instacart.com' },
];

export const CATALOG_STORES_BY_ID = new Map(
  CATALOG_STORES.map((store) => [store.id, store]),
);
