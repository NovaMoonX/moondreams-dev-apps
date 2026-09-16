export const CUSTOM_BREED_OPTION = 'custom';

export const CAT_BREEDS = [
  'Domestic Shorthair',
  'Domestic Mediumhair',
  'Domestic Longhair',
  'Abyssinian',
  'American Bobtail',
  'American Curl',
  'American Shorthair',
  'Balinese',
  'Bengal',
  'Birman',
  'Bombay',
  'British Shorthair',
  'Burmese',
  'Chartreux',
  'Cornish Rex',
  'Devon Rex',
  'Egyptian Mau',
  'Exotic Shorthair',
  'Havana Brown',
  'Japanese Bobtail',
  'Maine Coon',
  'Manx',
  'Norwegian Forest Cat',
  'Ocicat',
  'Oriental Shorthair',
  'Persian',
  'Ragdoll',
  'Russian Blue',
  'Scottish Fold',
  'Siamese',
  'Siberian',
  'Singapura',
  'Sphynx',
  'Tonkinese',
  'Turkish Angora',
  'Turkish Van',
  'Unknown',
] as const;

export const INSURANCE_PROVIDER_OPTIONS = [
  'ASPCA Pet Health Insurance',
  'Nationwide',
  'Trupanion',
  'Petplan',
  'Embrace',
  'Healthy Paws',
  'Fetch',
  'Pets Best',
  'Lemonade',
  'Prudent Pet',
  'Figo',
  'Other',
] as const;

export const PREVENTIVE_NAME_OPTIONS = [
  'Revolution Plus',
  'Revolution',
  'Advantage Multi',
  'Drontal',
] as const;

export const PREVENTIVE_TYPE_OPTIONS = [
  { value: 'flea-tick', label: 'Flea / tick' },
  { value: 'heartworm', label: 'Heartworm' },
  { value: 'mite', label: 'Mite' },
  { value: 'dewormer', label: 'Dewormer' },
  { value: 'medication', label: 'Medication' },
  { value: 'other', label: 'Other' },
] as const;

export const PERSONALITY_TRAIT_OPTIONS = [
  'Affectionate',
  'Independent',
  'Playful',
  'Curious',
  'Shy',
  'Loyal',
  'Lazy',
  'Bold',
  'Social',
  'Gentle',
  'Feisty',
  'Cuddly',
] as const;

export const LITTER_TYPE_OPTIONS = [
  'clumping_clay',
  'non_clumping_clay',
  'pine_wood_pellet',
  'paper',
  'crystal_silica',
  'corn',
  'wheat',
  'walnut',
  'custom',
] as const;
