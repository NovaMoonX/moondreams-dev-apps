import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

const HOUSEHOLD_ID = 'seed-nine-lives-household';
const SECOND_HOUSEHOLD_ID = 'seed-nine-lives-other-household';

export async function seedNineLives(context: SeedContext): Promise<SeedResult> {
  const caretaker = FIXTURE_USERS.nineLivesCaretaker;
  const coCaretaker = FIXTURE_USERS.partnerTwo;
  const batch = context.firestore.batch();
  const householdRef = context.firestore
    .collection('apps')
    .doc('nine-lives')
    .collection('households')
    .doc(HOUSEHOLD_ID);
  const secondHouseholdRef = context.firestore
    .collection('apps')
    .doc('nine-lives')
    .collection('households')
    .doc(SECOND_HOUSEHOLD_ID);
  const createdAt = context.now - 1_209_600_000;

  batch.set(
    householdRef,
    {
      id: HOUSEHOLD_ID,
      name: 'Taylor and Jamie’s household',
      members: [caretaker.uid, coCaretaker.uid],
      inviteCode: 'LUNA7Q',
      createdBy: caretaker.uid,
      createdAt,
      lastEditedAt: context.now,
    },
    { merge: true },
  );

  const inviteCodeRef = context.firestore
    .collection('apps')
    .doc('nine-lives')
    .collection('inviteCodes')
    .doc('LUNA7Q');

  batch.set(inviteCodeRef, { householdId: HOUSEHOLD_ID }, { merge: true });

  batch.set(
    secondHouseholdRef,
    {
      id: SECOND_HOUSEHOLD_ID,
      name: 'Alex’s household',
      members: [coCaretaker.uid],
      inviteCode: 'NOVA9P',
      createdBy: coCaretaker.uid,
      createdAt,
      lastEditedAt: context.now,
    },
    { merge: true },
  );

  const secondInviteCodeRef = context.firestore
    .collection('apps')
    .doc('nine-lives')
    .collection('inviteCodes')
    .doc('NOVA9P');
  batch.set(secondInviteCodeRef, { householdId: SECOND_HOUSEHOLD_ID }, { merge: true });

  const cats = [
    {
      id: 'seed-cat-mochi',
      name: 'Mochi',
      originalName: 'Pumpkin',
      breed: 'Domestic Shorthair',
      coatColors: ['Orange / Ginger', 'White'],
      dateOfBirth: context.now - 63_072_000_000,
      isDateOfBirthEstimated: true,
      sex: 'female',
      lifestyle: 'indoor',
      microchipNumber: '985141000123456',
      microchipServiceURL: 'https://www.petlink.net',
      rabiesTagNumber: 'RB-20481',
      isSpayedNeutered: true,
      spayedNeuteredAt: context.now - 45_792_000_000,
      currentClinicId: 'seed-vet-clinic-blue-bark',
      shelterOrigin: {
        name: 'Moonlight Cat Rescue',
        address: '123 Adoption Lane',
      },
      adoptedAt: context.now - 47_520_000_000,
      adoptionProfileURL: 'https://www.moonlightcatrescue.example/pets/mochi',
      otherLinks: [{ id: 'seed-cat-mochi-link-insurance', label: 'Pet insurance portal', url: 'https://www.trupanion.com' }],
      customKeyDates: [
        {
          id: 'seed-cat-mochi-keydate-rabies',
          label: 'Rabies vaccine',
          date: context.now - 15_552_000_000,
        },
      ],
      insurance: {
        provider: 'Trupanion',
        policyNumber: 'TRU-445211',
        monthlyPremium: 34.75,
        coverageStartDate: context.now - 47_433_600_000,
        coverageNotes: 'Exam fees reimbursed after deductible.',
      },
      personalityTraits: ['Affectionate', 'Playful'],
      notes: 'Loves crinkle balls and insists on supervising every sink visit.',
    },
    {
      id: 'seed-cat-juniper',
      name: 'Juniper',
      originalName: null,
      breed: 'Ragdoll',
      coatColors: ['Cream', 'Bicolor'],
      dateOfBirth: context.now - 94_608_000_000,
      isDateOfBirthEstimated: false,
      sex: 'male',
      lifestyle: 'indoor_outdoor',
      microchipNumber: '985141000654321',
      microchipServiceURL: null,
      rabiesTagNumber: null,
      isSpayedNeutered: true,
      spayedNeuteredAt: null,
      shelterOrigin: {
        name: 'Willow Foster Network',
      },
      adoptedAt: context.now - 78_624_000_000,
      adoptionProfileURL: null,
      otherLinks: null,
      customKeyDates: [
        {
          id: 'seed-cat-juniper-keydate-dental',
          label: 'Dental cleaning',
          date: context.now - 7_776_000_000,
        },
      ],
      personalityTraits: ['Independent', 'Curious'],
      notes: 'Needs a slow feeder and always steals the warm laundry basket.',
    },
    {
      id: 'seed-cat-biscuit',
      name: 'Biscuit',
      originalName: null,
      breed: 'Domestic Shorthair',
      coatColors: ['Tabby'],
      dateOfBirth: Date.UTC(2021, 8, 20),
      isDateOfBirthEstimated: false,
      sex: 'male',
      lifestyle: 'indoor',
      microchipNumber: null,
      microchipServiceURL: null,
      rabiesTagNumber: null,
      isSpayedNeutered: false,
      spayedNeuteredAt: null,
      shelterOrigin: null,
      adoptedAt: Date.UTC(2022, 8, 15),
      adoptionProfileURL: null,
      otherLinks: null,
      customKeyDates: null,
      personalityTraits: ['Bold', 'Social'],
      // Birthday (Sep 20) and adoption anniversary (Sep 15) both fall near "today" so the
      // upcoming-birthday and adoption-anniversary banners have something to show in seed data.
      notes: 'Chatty and always the first to greet visitors.',
    },
  ] as const;

  const clinics = [
    {
      id: 'seed-vet-clinic-blue-bark',
      name: 'Blue Bark Veterinary Clinic',
      phone: '(415) 555-0147',
      email: 'urgent@bluebarkvet.example',
      website: 'https://www.bluebarkvet.example',
      address: '272 Maple Avenue, Portland, OR',
      isEmergency24Hour: true,
      notes: '24-hour urgent care for after-hours emergencies.',
    },
    {
      id: 'seed-vet-clinic-harbor',
      name: 'Harbor Cat & Pet Center',
      phone: '(415) 555-0192',
      email: 'hello@harborpet.example',
      website: 'https://www.harborpet.example',
      address: '184 River Street, Portland, OR',
      isEmergency24Hour: false,
      notes: 'Primary care visits and routine checkups.',
    },
    {
      id: 'seed-vet-clinic-willow-creek',
      name: 'Willow Creek Animal Hospital',
      phone: '(415) 555-0210',
      email: 'contact@willowcreekvet.example',
      address: '48 Willow Creek Road, Portland, OR',
      isEmergency24Hour: false,
      notes: 'Dental cleanings and specialty referrals.',
    },
    {
      id: 'seed-vet-clinic-northside',
      name: 'Northside Feline Clinic',
      phone: '(415) 555-0233',
      email: 'appointments@northsidefeline.example',
      address: '910 North Ave, Portland, OR',
      isEmergency24Hour: false,
      notes: 'Cats-only practice, low-stress handling.',
    },
    {
      id: 'seed-vet-clinic-riverside-emergency',
      name: 'Riverside Emergency Vet',
      phone: '(415) 555-0255',
      email: 'er@riversideemergencyvet.example',
      address: '15 Riverside Drive, Portland, OR',
      isEmergency24Hour: true,
      notes: '24-hour emergency and critical care.',
    },
  ] as const;

  const doctors = [
    {
      id: 'seed-doctor-maya',
      clinicId: 'seed-vet-clinic-blue-bark',
      name: 'Dr. Maya Lee',
      notes: 'Handles chronic condition follow-ups and urgent same-day visits.',
    },
    {
      id: 'seed-doctor-daniela',
      clinicId: 'seed-vet-clinic-harbor',
      name: 'Dr. Daniela Ruiz',
      notes: 'Routine wellness and dental visits.',
    },
  ] as const;

  const conditionLibraryEntries = [
    // illness
    {
      id: 'seed-condition-upper-respiratory',
      name: 'Upper respiratory infection',
      category: 'illness',
      description:
        'Sneezing, nasal discharge, and lethargy consistent with a common upper respiratory infection.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-feline-herpesvirus',
      name: 'Feline herpesvirus (FHV-1)',
      category: 'illness',
      description: 'A common viral cause of eye and upper respiratory flare-ups, often recurring under stress.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-calicivirus',
      name: 'Calicivirus',
      category: 'illness',
      description: 'A viral infection causing oral ulcers, sneezing, and mild fever.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-panleukopenia',
      name: 'Panleukopenia (feline distemper)',
      category: 'illness',
      description: 'A serious, highly contagious viral illness causing vomiting, diarrhea, and low white blood cell counts.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-fiv',
      name: 'Feline immunodeficiency virus (FIV)',
      category: 'illness',
      description: 'A lifelong viral infection that weakens the immune system, often with long symptom-free periods.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-felv',
      name: 'Feline leukemia virus (FeLV)',
      category: 'illness',
      description: 'A viral infection that suppresses immunity and increases risk of other illnesses.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-uti',
      name: 'Urinary tract infection',
      category: 'illness',
      description: 'Straining to urinate, frequent litter box trips, or blood in the urine from a urinary tract infection.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-conjunctivitis',
      name: 'Conjunctivitis',
      category: 'illness',
      description: 'Redness, swelling, or discharge from the eye membranes, often paired with a respiratory infection.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-gastroenteritis',
      name: 'Gastroenteritis',
      category: 'illness',
      description: 'Vomiting and diarrhea from an inflamed stomach and intestines, often short-lived.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-ringworm',
      name: 'Ringworm',
      category: 'illness',
      description: 'A contagious fungal skin infection causing circular patches of hair loss and flaking.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-ear-infection',
      name: 'Ear infection',
      category: 'illness',
      description: 'Head shaking, scratching at the ears, or odor and discharge from an inflamed ear canal.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-toxoplasmosis',
      name: 'Toxoplasmosis',
      category: 'illness',
      description: 'A parasitic infection that can cause mild GI upset or, rarely, more serious illness.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-uri-secondary-pneumonia',
      name: 'Pneumonia',
      category: 'illness',
      description: 'Lung infection causing coughing, labored breathing, or lethargy, sometimes following an untreated respiratory infection.',
      source: 'seed',
      sourceRef: null,
    },
    // injury
    {
      id: 'seed-condition-laceration',
      name: 'Laceration',
      category: 'injury',
      description: 'A skin wound or cut that may need cleaning, monitoring, or follow-up care.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-fracture',
      name: 'Fracture',
      category: 'injury',
      description: 'A broken bone, often from a fall or accident, needing imaging and immobilization.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-bite-wound',
      name: 'Bite wound',
      category: 'injury',
      description: 'A puncture or tear from another animal, at risk of infection or abscess if untreated.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-sprain-strain',
      name: 'Sprain or strain',
      category: 'injury',
      description: 'Soft-tissue injury causing limping or reluctance to bear weight on a limb.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-foreign-body',
      name: 'Foreign body ingestion',
      category: 'injury',
      description: 'Swallowing a non-food object, which can cause choking, vomiting, or intestinal blockage.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-burn',
      name: 'Burn',
      category: 'injury',
      description: 'Skin damage from heat, chemicals, or friction, ranging from mild to severe.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-dental-trauma',
      name: 'Dental trauma',
      category: 'injury',
      description: 'A chipped, cracked, or knocked-loose tooth from a fall or impact.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-eye-injury',
      name: 'Eye injury',
      category: 'injury',
      description: 'A scratch, ulcer, or trauma to the eye surface, requiring prompt care to protect vision.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-tail-injury',
      name: 'Tail injury',
      category: 'injury',
      description: 'Trauma to the tail from being caught, stepped on, or pulled.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-broken-claw',
      name: 'Broken or torn claw',
      category: 'injury',
      description: 'A cracked or partially torn claw, often bleeding and tender.',
      source: 'seed',
      sourceRef: null,
    },
    // chronic
    {
      id: 'seed-condition-arthritis',
      name: 'Arthritis',
      category: 'chronic',
      description: 'Chronic joint pain or stiffness that often needs ongoing monitoring and treatment.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-ckd',
      name: 'Chronic kidney disease',
      category: 'chronic',
      description: 'Progressive loss of kidney function, common in older cats, managed with diet and monitoring.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-hyperthyroidism',
      name: 'Hyperthyroidism',
      category: 'chronic',
      description: 'An overactive thyroid causing weight loss, increased appetite, and hyperactivity.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-diabetes',
      name: 'Diabetes mellitus',
      category: 'chronic',
      description: 'A metabolic condition requiring insulin management, increased thirst, and urination.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-ibd',
      name: 'Inflammatory bowel disease',
      category: 'chronic',
      description: 'Chronic irritation of the digestive tract causing vomiting, diarrhea, or weight loss.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-asthma',
      name: 'Feline asthma',
      category: 'chronic',
      description: 'A chronic airway condition causing coughing, wheezing, or breathing difficulty.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-cardiomyopathy',
      name: 'Hypertrophic cardiomyopathy',
      category: 'chronic',
      description: 'Thickening of the heart muscle, often silent until advanced, sometimes causing lethargy or collapse.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-dental-disease',
      name: 'Periodontal disease',
      category: 'chronic',
      description: 'Ongoing gum inflammation, tartar buildup, or tooth loss requiring dental care.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-obesity',
      name: 'Obesity',
      category: 'chronic',
      description: 'Excess body weight that raises the risk of diabetes, joint strain, and other conditions.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-hypertension',
      name: 'Hypertension',
      category: 'chronic',
      description: 'Chronically elevated blood pressure, often secondary to kidney or thyroid disease.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-fic',
      name: 'Feline idiopathic cystitis',
      category: 'chronic',
      description: 'Recurring bladder inflammation with no clear cause, often flaring during stress.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-epilepsy',
      name: 'Epilepsy',
      category: 'chronic',
      description: 'A chronic seizure disorder requiring ongoing monitoring and sometimes medication.',
      source: 'seed',
      sourceRef: null,
    },
    // parasite
    {
      id: 'seed-condition-flea-burden',
      name: 'Flea burden',
      category: 'parasite',
      description: 'Visible flea presence or itchy skin irritation from external parasites.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-ticks',
      name: 'Ticks',
      category: 'parasite',
      description: 'Attached ticks found on the skin, which can also transmit other diseases.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-ear-mites',
      name: 'Ear mites',
      category: 'parasite',
      description: 'Intense ear itching and dark, crumbly discharge from a mite infestation.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-roundworms',
      name: 'Roundworms',
      category: 'parasite',
      description: 'A common intestinal parasite that can cause a pot-bellied appearance or vomiting in kittens.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-hookworms',
      name: 'Hookworms',
      category: 'parasite',
      description: 'An intestinal parasite that feeds on blood and can cause anemia, especially in kittens.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-tapeworms',
      name: 'Tapeworms',
      category: 'parasite',
      description: 'A segmented intestinal parasite often picked up from swallowing fleas.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-giardia',
      name: 'Giardia',
      category: 'parasite',
      description: 'A single-celled intestinal parasite causing diarrhea and poor nutrient absorption.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-coccidia',
      name: 'Coccidia',
      category: 'parasite',
      description: 'A single-celled intestinal parasite common in kittens, causing watery diarrhea.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-heartworm',
      name: 'Heartworm',
      category: 'parasite',
      description: 'A parasite spread by mosquitoes that can damage the heart and lungs.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-mange',
      name: 'Mange',
      category: 'parasite',
      description: 'Skin irritation, hair loss, and itching caused by mange mites.',
      source: 'seed',
      sourceRef: null,
    },
    // allergy
    {
      id: 'seed-condition-food-allergy',
      name: 'Food allergy',
      category: 'allergy',
      description: 'Gentle rash, itchy skin, or digestive upset linked to a food or ingredient exposure.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-flea-allergy-dermatitis',
      name: 'Flea allergy dermatitis',
      category: 'allergy',
      description: 'An exaggerated skin reaction to flea saliva causing intense itching and scabbing.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-environmental-allergy',
      name: 'Environmental (atopic) allergy',
      category: 'allergy',
      description: 'Itchy skin, sneezing, or watery eyes triggered by pollen, dust, or mold exposure.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-contact-allergy',
      name: 'Contact allergy',
      category: 'allergy',
      description: 'Localized skin irritation from direct contact with an allergen, such as bedding or cleaning products.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-egc',
      name: 'Eosinophilic granuloma complex',
      category: 'allergy',
      description: 'A group of allergy-related skin reactions, often appearing as lip ulcers or skin plaques.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-miliary-dermatitis',
      name: 'Miliary dermatitis',
      category: 'allergy',
      description: 'Small, itchy skin crusts most often caused by an allergic reaction, frequently to fleas.',
      source: 'seed',
      sourceRef: null,
    },
  ] as const;

  interface SeedVaccinationDose {
    id: string;
    administeredAt: number;
    expiresAt: number | null;
    clinicId: string | null;
    doctorId: string | null;
    lotNumber: string | null;
  }

  /** `doses` is newest-first, matching the app's `history` invariant. */
  const vaccinationsByCat: Record<
    string,
    Array<{
      id: string;
      name: string;
      doses: SeedVaccinationDose[];
    }>
  > = {
    'seed-cat-mochi': [
      {
        id: 'seed-vaccination-mochi-rabies',
        name: 'Rabies',
        doses: [
          {
            id: 'seed-vaccination-mochi-rabies-dose-2',
            administeredAt: context.now - 15_552_000_000,
            expiresAt: context.now + 47_520_000_000,
            clinicId: 'seed-vet-clinic-blue-bark',
            doctorId: 'seed-doctor-maya',
            lotNumber: 'L-1024',
          },
          {
            id: 'seed-vaccination-mochi-rabies-dose-1',
            administeredAt: context.now - 47_088_000_000,
            expiresAt: context.now - 15_552_000_000,
            clinicId: 'seed-vet-clinic-blue-bark',
            doctorId: 'seed-doctor-maya',
            lotNumber: 'L-0512',
          },
        ],
      },
      {
        id: 'seed-vaccination-mochi-fvrcp',
        name: 'FVRCP',
        doses: [
          {
            id: 'seed-vaccination-mochi-fvrcp-dose-1',
            administeredAt: context.now - 31_536_000_000,
            expiresAt: context.now + 31_536_000_000,
            clinicId: 'seed-vet-clinic-blue-bark',
            doctorId: 'seed-doctor-maya',
            lotNumber: 'L-0876',
          },
        ],
      },
      {
        id: 'seed-vaccination-mochi-felv',
        name: 'FeLV',
        doses: [
          {
            // Overdue, so "needs attention" has a second overdue vaccination-adjacent example.
            id: 'seed-vaccination-mochi-felv-dose-1',
            administeredAt: context.now - 32_659_200_000,
            expiresAt: context.now - 86_400_000,
            clinicId: 'seed-vet-clinic-blue-bark',
            doctorId: 'seed-doctor-maya',
            lotNumber: 'L-4471',
          },
        ],
      },
    ],
    'seed-cat-juniper': [
      {
        id: 'seed-vaccination-juniper-rabies',
        name: 'Rabies',
        doses: [
          {
            id: 'seed-vaccination-juniper-rabies-dose-1',
            administeredAt: context.now - 23_328_000_000,
            expiresAt: context.now + 39_744_000_000,
            clinicId: 'seed-vet-clinic-harbor',
            doctorId: 'seed-doctor-daniela',
            lotNumber: 'L-2201',
          },
        ],
      },
      {
        id: 'seed-vaccination-juniper-bordetella',
        name: 'Bordetella',
        doses: [
          {
            // Due soon, so it shows up in the dashboard's "needs attention" section.
            id: 'seed-vaccination-juniper-bordetella-dose-1',
            administeredAt: context.now - 31_104_000_000,
            expiresAt: context.now + 4 * 86_400_000,
            clinicId: 'seed-vet-clinic-harbor',
            doctorId: 'seed-doctor-daniela',
            lotNumber: 'L-3390',
          },
        ],
      },
    ],
  };

  const customPreventiveProducts = [
    {
      id: 'seed-custom-preventive-product-bravecto',
      label: 'Bravecto',
    },
  ] as const;

  const customPreventiveTypes = [
    {
      id: 'seed-custom-preventive-type-ear-mite-treatment',
      label: 'Ear mite treatment',
    },
  ] as const;

  interface SeedPreventiveDose {
    id: string;
    administeredAt: number;
    expiresAt: number | null;
    dosage: string | null;
    clinicId: string | null;
    doctorId: string | null;
    linkedVisitId: string | null;
  }

  /** `doses` is newest-first, matching the app's `history` invariant. */
  const preventivesByCat: Record<
    string,
    Array<{
      id: string;
      name: string;
      customProductId: string | null;
      type: 'flea-tick' | 'heartworm' | 'mite' | 'dewormer' | 'medication' | 'other' | 'custom';
      customTypeId: string | null;
      doses: SeedPreventiveDose[];
    }>
  > = {
    'seed-cat-mochi': [
      {
        id: 'seed-preventive-mochi-revolution',
        name: 'Revolution Plus',
        customProductId: null,
        type: 'flea-tick',
        customTypeId: null,
        doses: [
          {
            id: 'seed-preventive-mochi-revolution-dose-3',
            administeredAt: context.now - 2_592_000_000,
            expiresAt: context.now + 2_592_000_000,
            dosage: '0.5 mL',
            clinicId: 'seed-vet-clinic-blue-bark',
            doctorId: 'seed-doctor-maya',
            linkedVisitId: null,
          },
          {
            id: 'seed-preventive-mochi-revolution-dose-2',
            administeredAt: context.now - 5_184_000_000,
            expiresAt: context.now - 2_592_000_000,
            dosage: '0.5 mL',
            clinicId: 'seed-vet-clinic-blue-bark',
            doctorId: 'seed-doctor-maya',
            linkedVisitId: null,
          },
          {
            id: 'seed-preventive-mochi-revolution-dose-1',
            administeredAt: context.now - 7_776_000_000,
            expiresAt: context.now - 5_184_000_000,
            dosage: '0.5 mL',
            clinicId: 'seed-vet-clinic-blue-bark',
            doctorId: 'seed-doctor-maya',
            linkedVisitId: null,
          },
        ],
      },
      {
        id: 'seed-preventive-mochi-bravecto',
        name: customPreventiveProducts[0].label,
        customProductId: customPreventiveProducts[0].id,
        type: 'custom',
        customTypeId: customPreventiveTypes[0].id,
        doses: [
          {
            id: 'seed-preventive-mochi-bravecto-dose-1',
            administeredAt: context.now - 1_296_000_000,
            expiresAt: context.now + 6_480_000_000,
            dosage: null,
            clinicId: null,
            doctorId: null,
            linkedVisitId: null,
          },
        ],
      },
    ],
    'seed-cat-juniper': [
      {
        id: 'seed-preventive-juniper-heartworm',
        name: 'Revolution Plus',
        customProductId: null,
        type: 'heartworm',
        customTypeId: null,
        doses: [
          {
            id: 'seed-preventive-juniper-heartworm-dose-1',
            administeredAt: context.now - 5_184_000_000,
            expiresAt: context.now + 25_920_000_000,
            dosage: '0.5 mL',
            clinicId: null,
            doctorId: null,
            linkedVisitId: null,
          },
        ],
      },
      {
        id: 'seed-preventive-juniper-dewormer',
        name: 'Panacur',
        customProductId: null,
        type: 'dewormer',
        customTypeId: null,
        doses: [
          {
            // Overdue, so it shows up as urgent in the dashboard's "needs attention" section.
            id: 'seed-preventive-juniper-dewormer-dose-1',
            administeredAt: context.now - 9_072_000_000,
            expiresAt: context.now - 2 * 86_400_000,
            dosage: '1 tablet',
            clinicId: 'seed-vet-clinic-harbor',
            doctorId: 'seed-doctor-daniela',
            linkedVisitId: null,
          },
        ],
      },
    ],
  };

  const weightEntriesByCat: Record<
    string,
    Array<{ id: string; weight: number; unit: 'lb' | 'kg'; measuredAt: number }>
  > = {
    'seed-cat-mochi': [
      {
        id: 'seed-weight-mochi-1',
        weight: 8.2,
        unit: 'lb',
        measuredAt: context.now - 15_552_000_000,
      },
      {
        id: 'seed-weight-mochi-2',
        weight: 8.6,
        unit: 'lb',
        measuredAt: context.now - 7_776_000_000,
      },
      {
        id: 'seed-weight-mochi-3',
        weight: 8.9,
        unit: 'lb',
        measuredAt: context.now - 2_592_000_000,
      },
    ],
    'seed-cat-juniper': [
      {
        id: 'seed-weight-juniper-1',
        weight: 9.4,
        unit: 'lb',
        measuredAt: context.now - 15_552_000_000,
      },
      {
        id: 'seed-weight-juniper-2',
        weight: 9.1,
        unit: 'lb',
        measuredAt: context.now - 5_184_000_000,
      },
    ],
  };

  const symptomsByCat: Record<
    string,
    Array<{
      id: string;
      description: string;
      quickTags: string[];
      firstNoticedAt: number;
      severity: 'mild' | 'moderate' | 'severe' | null;
      linkedConditionId: string | null;
      resolvedAt: number | null;
    }>
  > = {
    'seed-cat-mochi': [
      {
        id: 'seed-symptom-mochi-appetite',
        description:
          'Skipped breakfast two days in a row but drinking water normally.',
        quickTags: ['appetite_change'],
        firstNoticedAt: context.now - 1_728_000_000,
        severity: 'mild',
        linkedConditionId: null,
        resolvedAt: context.now - 1_209_600_000,
      },
    ],
    'seed-cat-juniper': [
      {
        id: 'seed-symptom-juniper-hiding',
        description:
          'Hiding under the bed more than usual and avoiding the living room.',
        quickTags: ['hiding', 'playfulness_change'],
        firstNoticedAt: context.now - 864_000_000,
        severity: 'moderate',
        linkedConditionId: null,
        resolvedAt: null,
      },
    ],
  };

  const expenses = [
    {
      id: 'seed-expense-mochi-adoption',
      catIds: ['seed-cat-mochi'],
      items: [{ id: 'seed-expense-item-mochi-adoption', category: 'adoption_fee', label: null, amount: 125 }],
      amount: 125,
      label: null,
      isRecurring: false,
      recurrenceInterval: null,
      recurrenceEndedAt: null,
      incurredAt: context.now - 47_520_000_000,
      visitId: null,
      notes: 'Adoption fee at Moonlight Cat Rescue.',
    },
    {
      id: 'seed-expense-mochi-insurance',
      catIds: ['seed-cat-mochi'],
      items: [{ id: 'seed-expense-item-mochi-insurance', category: 'insurance', label: null, amount: 34.75 }],
      amount: 34.75,
      label: null,
      isRecurring: true,
      recurrenceInterval: 'monthly',
      recurrenceEndedAt: null,
      incurredAt: context.now - 47_433_600_000,
      visitId: null,
      notes: 'Trupanion monthly premium.',
    },
    {
      id: 'seed-expense-mochi-checkup',
      catIds: ['seed-cat-mochi'],
      items: [{ id: 'seed-expense-item-mochi-checkup', category: 'vet', label: null, amount: 82 }],
      amount: 82,
      label: null,
      isRecurring: false,
      recurrenceInterval: null,
      recurrenceEndedAt: null,
      incurredAt: context.now - 2_592_000_000,
      visitId: null,
      notes: 'Routine checkup at Blue Bark Veterinary Clinic.',
    },
    {
      id: 'seed-expense-juniper-food',
      catIds: ['seed-cat-juniper'],
      items: [{ id: 'seed-expense-item-juniper-food', category: 'food', label: null, amount: 48.5 }],
      amount: 48.5,
      label: null,
      isRecurring: true,
      recurrenceInterval: 'monthly',
      recurrenceEndedAt: null,
      incurredAt: context.now - 5_184_000_000,
      visitId: null,
      notes: 'Grain-free dry food subscription.',
    },
    {
      id: 'seed-expense-juniper-dental',
      catIds: ['seed-cat-juniper'],
      items: [{ id: 'seed-expense-item-juniper-dental', category: 'vet', label: null, amount: 310 }],
      amount: 310,
      label: 'Dental cleaning',
      isRecurring: false,
      recurrenceInterval: null,
      recurrenceEndedAt: null,
      incurredAt: context.now - 7_776_000_000,
      visitId: null,
      notes: 'Dental cleaning at Harbor Cat & Pet Center.',
    },
    {
      id: 'seed-expense-household-annual-checkup',
      catIds: ['seed-cat-mochi', 'seed-cat-juniper'],
      items: [
        { id: 'seed-expense-item-household-exam', category: 'vet', label: 'Exam fee', amount: 90 },
        { id: 'seed-expense-item-household-bloodwork', category: 'vet', label: 'Bloodwork panel', amount: 78 },
      ],
      amount: 168,
      label: 'Annual wellness visit',
      isRecurring: false,
      recurrenceInterval: null,
      recurrenceEndedAt: null,
      incurredAt: context.now - 2_592_000_000,
      visitId: null,
      notes: 'Shared annual wellness visit for both cats.',
    },
    {
      id: 'seed-expense-mochi-old-insurance',
      catIds: ['seed-cat-mochi'],
      items: [
        { id: 'seed-expense-item-mochi-old-insurance', category: 'insurance', label: null, amount: 28 },
      ],
      amount: 28,
      label: 'Previous provider',
      isRecurring: true,
      recurrenceInterval: 'monthly',
      recurrenceEndedAt: context.now - 31_536_000_000,
      incurredAt: context.now - 63_072_000_000,
      visitId: null,
      notes: 'Cancelled after switching to Trupanion.',
    },
    {
      id: 'seed-expense-biscuit-birthday-party',
      catIds: ['seed-cat-biscuit'],
      // Demonstrates itemized line items with both a preset and a custom (non-enum) category.
      items: [
        { id: 'seed-expense-item-biscuit-cake', category: 'other', label: 'Cat-safe birthday cake', amount: 18 },
        { id: 'seed-expense-item-biscuit-photos', category: 'Photoshoot', label: 'Professional photos', amount: 65 },
      ],
      amount: 83,
      label: "Biscuit's birthday",
      isRecurring: false,
      recurrenceInterval: null,
      recurrenceEndedAt: null,
      incurredAt: context.now - 31_536_000_000,
      visitId: null,
      notes: 'Little celebration for his gotcha day last year.',
    },
    {
      id: 'seed-expense-juniper-membership',
      catIds: ['seed-cat-juniper'],
      items: [{ id: 'seed-expense-item-juniper-membership', category: 'other', label: null, amount: 60 }],
      amount: 60,
      label: 'Pet club membership',
      isRecurring: true,
      recurrenceInterval: 'yearly',
      recurrenceEndedAt: context.now - 15_552_000_000,
      incurredAt: context.now - 47_520_000_000,
      visitId: null,
      notes: 'Annual membership, not renewed.',
    },
  ] as const;

  const litterBoxes = [
    {
      id: 'seed-litter-box-main',
      name: 'Main litter box',
      location: 'Upstairs bathroom',
      isActive: true,
    },
    {
      id: 'seed-litter-box-office',
      name: 'Office litter box',
      location: 'Home office',
      isActive: true,
    },
    {
      id: 'seed-litter-box-basement',
      name: 'Basement litter box',
      location: 'Basement',
      isActive: true,
    },
  ] as const;

  const customLitterTypes = [
    {
      id: 'seed-custom-litter-type-recycled-paper',
      label: 'Recycled paper pellets',
    },
  ] as const;

  const litters = [
    {
      id: 'seed-litter-tidy-cats',
      brand: 'Tidy Cats',
      litterType: 'clumping_clay' as const,
      customLitterTypeId: null,
      weight: 20,
      weightUnit: 'lb' as const,
      cost: 22.99,
    },
    {
      id: 'seed-litter-yesterdays-news',
      brand: "Yesterday's News",
      litterType: 'custom' as const,
      customLitterTypeId: 'seed-custom-litter-type-recycled-paper',
      weight: 13.5,
      weightUnit: 'lb' as const,
      cost: 12.5,
    },
  ] as const;

  const litterEntries = [
    {
      id: 'seed-litter-main-1',
      litterBoxId: 'seed-litter-box-main',
      litterId: 'seed-litter-tidy-cats',
      weightBefore: 2.5,
      weightUnit: 'lb',
      refillWeight: 20,
      isFullChange: true,
      loggedAt: context.now - 16 * 86_400_000,
      notes: 'Full change — fresh Tidy Cats.',
    },
    {
      id: 'seed-litter-main-2',
      litterBoxId: 'seed-litter-box-main',
      litterId: 'seed-litter-tidy-cats',
      weightBefore: 14.25,
      weightUnit: 'lb',
      refillWeight: null,
      isFullChange: false,
      loggedAt: context.now - 9 * 86_400_000,
      notes: 'Weekly check after sifting.',
    },
    {
      id: 'seed-litter-main-3',
      litterBoxId: 'seed-litter-box-main',
      litterId: 'seed-litter-tidy-cats',
      weightBefore: 9.5,
      weightUnit: 'lb',
      refillWeight: 15,
      isFullChange: false,
      loggedAt: context.now - 2 * 86_400_000,
      notes: 'Topped off partway.',
    },
    {
      id: 'seed-litter-main-4',
      litterBoxId: 'seed-litter-box-main',
      litterId: 'seed-litter-tidy-cats',
      weightBefore: 13,
      weightUnit: 'lb',
      refillWeight: null,
      isFullChange: false,
      loggedAt: context.now - 1 * 86_400_000,
      notes: 'Used up more of the top-off.',
    },
    {
      id: 'seed-litter-main-5',
      litterBoxId: 'seed-litter-box-main',
      litterId: 'seed-litter-tidy-cats',
      weightBefore: 11,
      weightUnit: 'lb',
      refillWeight: 20,
      isFullChange: true,
      loggedAt: context.now - 12 * 3_600_000,
      notes: 'Full change.',
    },
    {
      id: 'seed-litter-main-6',
      litterBoxId: 'seed-litter-box-main',
      litterId: 'seed-litter-tidy-cats',
      weightBefore: 18,
      weightUnit: 'lb',
      refillWeight: null,
      isFullChange: false,
      loggedAt: context.now - 2 * 3_600_000,
      notes: null,
    },
    {
      id: 'seed-litter-office-1',
      litterBoxId: 'seed-litter-box-office',
      litterId: 'seed-litter-yesterdays-news',
      weightBefore: 1,
      weightUnit: 'lb',
      refillWeight: 13.5,
      isFullChange: true,
      // Overdue for a change, so it shows up in the dashboard's "needs attention" section.
      loggedAt: context.now - 32 * 86_400_000,
      notes: null,
    },
    {
      id: 'seed-litter-basement-1',
      litterBoxId: 'seed-litter-box-basement',
      litterId: 'seed-litter-tidy-cats',
      weightBefore: 2,
      weightUnit: 'lb',
      refillWeight: 20,
      isFullChange: true,
      // Approaching the 30-day mark, so it shows up as "coming up" rather than overdue.
      loggedAt: context.now - 25 * 86_400_000,
      notes: 'Full change — fresh Tidy Cats.',
    },
  ] as const;

  const customHealthRecordTypes = [
    {
      id: 'seed-custom-record-type-allergy-test',
      label: 'Allergy test',
    },
  ] as const;

  const healthRecords = [
    {
      id: 'seed-health-record-mochi-labs',
      catIds: ['seed-cat-mochi'],
      fileURL: 'https://example.com/seed-files/mochi-bloodwork.pdf',
      fileType: 'pdf' as const,
      fileName: 'mochi-bloodwork-results.pdf',
      label: null,
      recordType: 'lab_result' as const,
      customRecordTypeId: null,
      recordDate: context.now - 2_592_000_000,
      linkedVisitId: 'seed-visit-mochi-checkup',
      notes: 'Bloodwork from the routine checkup.',
    },
    {
      id: 'seed-health-record-juniper-allergy',
      catIds: ['seed-cat-juniper'],
      fileURL: 'https://example.com/seed-files/juniper-allergy-panel.pdf',
      fileType: 'pdf' as const,
      fileName: 'juniper-allergy-panel.pdf',
      label: null,
      recordType: 'custom' as const,
      customRecordTypeId: 'seed-custom-record-type-allergy-test',
      recordDate: context.now - 7_776_000_000,
      linkedVisitId: null,
      notes: null,
    },
    {
      id: 'seed-health-record-household-insurance',
      catIds: ['seed-cat-mochi', 'seed-cat-juniper'],
      fileURL: 'https://example.com/seed-files/household-insurance-policy.pdf',
      fileType: 'pdf' as const,
      fileName: 'household-insurance-policy.pdf',
      label: null,
      recordType: 'insurance' as const,
      customRecordTypeId: null,
      recordDate: null,
      linkedVisitId: null,
      notes: 'Shared insurance policy covering both cats.',
    },
    {
      id: 'seed-health-record-juniper-ear-photo',
      catIds: ['seed-cat-juniper'],
      fileURL: 'https://example.com/seed-files/IMG_2481.jpg',
      fileType: 'image' as const,
      fileName: 'IMG_2481.jpg',
      label: 'Ear infection photo',
      recordType: 'miscellaneous' as const,
      customRecordTypeId: null,
      recordDate: context.now - 1_296_000_000,
      linkedVisitId: null,
      notes: 'Photo sent to the vet before scheduling a follow-up.',
    },
    {
      id: 'seed-health-record-mochi-adoption',
      catIds: ['seed-cat-mochi'],
      fileURL: 'https://example.com/seed-files/mochi-adoption-contract.pdf',
      fileType: 'pdf' as const,
      fileName: 'mochi-adoption-contract.pdf',
      label: 'Adoption contract',
      recordType: 'shelter_adoption' as const,
      customRecordTypeId: null,
      recordDate: context.now - 25_920_000_000,
      linkedVisitId: null,
      notes: null,
    },
    {
      id: 'seed-health-record-juniper-microchip',
      catIds: ['seed-cat-juniper'],
      fileURL: 'https://example.com/seed-files/juniper-microchip-registration.pdf',
      fileType: 'pdf' as const,
      fileName: 'juniper-microchip-registration.pdf',
      label: null,
      recordType: 'microchip_registration' as const,
      customRecordTypeId: null,
      recordDate: context.now - 20_736_000_000,
      linkedVisitId: null,
      notes: null,
    },
    {
      id: 'seed-health-record-mochi-prescription',
      catIds: ['seed-cat-mochi'],
      fileURL: 'https://example.com/seed-files/mochi-gabapentin-rx.pdf',
      fileType: 'pdf' as const,
      fileName: 'mochi-gabapentin-rx.pdf',
      label: 'Gabapentin prescription',
      recordType: 'prescription' as const,
      customRecordTypeId: null,
      recordDate: context.now - 864_000_000,
      linkedVisitId: 'seed-visit-mochi-checkup',
      notes: null,
    },
    {
      id: 'seed-health-record-juniper-vet-paperwork',
      catIds: ['seed-cat-juniper'],
      fileURL: 'https://example.com/seed-files/juniper-intake-paperwork.pdf',
      fileType: 'pdf' as const,
      fileName: 'juniper-intake-paperwork.pdf',
      label: 'New patient intake paperwork',
      recordType: 'vet_paperwork' as const,
      customRecordTypeId: null,
      recordDate: context.now - 15_552_000_000,
      linkedVisitId: null,
      notes: null,
    },
    {
      id: 'seed-health-record-household-lab-panel',
      catIds: ['seed-cat-mochi', 'seed-cat-juniper'],
      fileURL: 'https://example.com/seed-files/annual-wellness-lab-panel.pdf',
      fileType: 'pdf' as const,
      fileName: 'annual-wellness-lab-panel.pdf',
      label: 'Annual wellness lab panel',
      recordType: 'lab_result' as const,
      customRecordTypeId: null,
      recordDate: context.now - 5_184_000_000,
      linkedVisitId: null,
      notes: 'Combined bloodwork visit for both cats.',
    },
  ] as const;

  const visits = [
    {
      id: 'seed-visit-mochi-checkup',
      catIds: ['seed-cat-mochi'],
      clinicId: 'seed-vet-clinic-blue-bark',
      doctorId: 'seed-doctor-maya',
      status: 'completed' as const,
      reason: 'checkup' as const,
      customReasonLabel: null,
      followUpOfVisitId: null,
      followUpNote: null,
      title: null,
      scheduledAt: context.now - 2_592_000_000,
      completedAt: context.now - 2_592_000_000,
      summary:
        'Routine checkup; weighed in and due for a rabies booster next cycle.',
      linkedSymptomIds: [],
      linkedConditionIds: [],
      linkedHealthRecordIds: [],
      linkedVaccinationIds: ['seed-vaccination-mochi-rabies'],
      linkedWeightEntryIds: ['seed-weight-mochi-3'],
    },
    {
      id: 'seed-visit-mochi-follow-up',
      catIds: ['seed-cat-mochi'],
      clinicId: 'seed-vet-clinic-blue-bark',
      doctorId: 'seed-doctor-maya',
      status: 'upcoming' as const,
      reason: 'follow_up' as const,
      customReasonLabel: null,
      followUpOfVisitId: 'seed-visit-mochi-checkup',
      followUpNote: 'Recheck weight and appetite in two weeks.',
      title: "Mochi's two-week recheck",
      // Scheduled for today, so it shows up in the dashboard's "needs attention" section.
      scheduledAt: context.now + 3 * 3_600_000,
      completedAt: null,
      summary: null,
      linkedSymptomIds: [],
      linkedConditionIds: [],
      linkedHealthRecordIds: [],
      linkedVaccinationIds: [],
      linkedWeightEntryIds: [],
    },
    {
      id: 'seed-visit-juniper-limp-check',
      catIds: ['seed-cat-juniper'],
      clinicId: 'seed-vet-clinic-harbor',
      doctorId: 'seed-doctor-daniela',
      status: 'upcoming' as const,
      reason: 'illness' as const,
      customReasonLabel: null,
      followUpOfVisitId: null,
      followUpNote: null,
      title: "Juniper's limp check-up",
      // Also scheduled for today, so "needs attention" has two same-day visits (one per cat).
      scheduledAt: context.now + 5 * 3_600_000,
      completedAt: null,
      summary: "Favoring her left front paw since yesterday morning — nothing swollen, but worth a look.",
      linkedSymptomIds: [],
      linkedConditionIds: [],
      linkedHealthRecordIds: [],
      linkedVaccinationIds: [],
      linkedWeightEntryIds: [],
    },
    {
      id: 'seed-visit-household-annual',
      catIds: ['seed-cat-mochi', 'seed-cat-juniper'],
      clinicId: 'seed-vet-clinic-harbor',
      doctorId: 'seed-doctor-daniela',
      status: 'upcoming' as const,
      reason: 'checkup' as const,
      customReasonLabel: null,
      followUpOfVisitId: null,
      followUpNote: null,
      title: 'Annual wellness exam',
      // A few days out, so "needs attention" also has a multi-cat visit beyond today's.
      scheduledAt: context.now + 4 * 86_400_000,
      completedAt: null,
      summary: null,
      linkedSymptomIds: [],
      linkedConditionIds: [],
      linkedHealthRecordIds: [],
      linkedVaccinationIds: [],
      linkedWeightEntryIds: [],
    },
    {
      id: 'seed-visit-mochi-dental-consult',
      catIds: ['seed-cat-mochi'],
      clinicId: 'seed-vet-clinic-blue-bark',
      doctorId: 'seed-doctor-maya',
      status: 'upcoming' as const,
      reason: 'checkup' as const,
      customReasonLabel: null,
      followUpOfVisitId: null,
      followUpNote: null,
      title: 'Dental cleaning consult',
      // A 4th "needs attention" visit, so the upcoming-visits list has enough to paginate.
      scheduledAt: context.now + 6 * 86_400_000,
      completedAt: null,
      summary: null,
      linkedSymptomIds: [],
      linkedConditionIds: [],
      linkedHealthRecordIds: [],
      linkedVaccinationIds: [],
      linkedWeightEntryIds: [],
    },
    {
      id: 'seed-visit-juniper-allergy-panel',
      catIds: ['seed-cat-juniper'],
      clinicId: 'seed-vet-clinic-northside',
      doctorId: null,
      status: 'completed' as const,
      reason: 'illness' as const,
      customReasonLabel: null,
      followUpOfVisitId: null,
      followUpNote: null,
      title: null,
      scheduledAt: context.now - 7_776_000_000,
      completedAt: context.now - 7_776_000_000,
      summary: 'Allergy panel drawn to rule out food sensitivity.',
      linkedSymptomIds: [],
      linkedConditionIds: [],
      linkedHealthRecordIds: [],
      linkedVaccinationIds: [],
      linkedWeightEntryIds: [],
    },
    {
      id: 'seed-visit-juniper-ear-recheck',
      catIds: ['seed-cat-juniper'],
      clinicId: 'seed-vet-clinic-northside',
      doctorId: null,
      status: 'completed' as const,
      reason: 'follow_up' as const,
      customReasonLabel: null,
      followUpOfVisitId: null,
      followUpNote: 'Recheck for ear infection.',
      title: null,
      scheduledAt: context.now - 1_209_600_000,
      completedAt: context.now - 1_209_600_000,
      summary: 'Ear looks clear, no further treatment needed.',
      linkedSymptomIds: [],
      linkedConditionIds: [],
      linkedHealthRecordIds: [],
      linkedVaccinationIds: [],
      linkedWeightEntryIds: [],
    },
    {
      id: 'seed-visit-mochi-dental',
      catIds: ['seed-cat-mochi'],
      clinicId: 'seed-vet-clinic-willow-creek',
      doctorId: null,
      status: 'completed' as const,
      reason: 'checkup' as const,
      customReasonLabel: null,
      followUpOfVisitId: null,
      followUpNote: null,
      title: 'Dental cleaning',
      scheduledAt: context.now - 5_184_000_000,
      completedAt: context.now - 5_184_000_000,
      summary: 'Dental cleaning and polish, mild tartar removed.',
      linkedSymptomIds: [],
      linkedConditionIds: [],
      linkedHealthRecordIds: [],
      linkedVaccinationIds: [],
      linkedWeightEntryIds: [],
    },
    {
      id: 'seed-visit-mochi-vaccination-booster',
      catIds: ['seed-cat-mochi'],
      clinicId: 'seed-vet-clinic-blue-bark',
      doctorId: 'seed-doctor-maya',
      status: 'completed' as const,
      reason: 'vaccination' as const,
      customReasonLabel: null,
      followUpOfVisitId: null,
      followUpNote: null,
      title: null,
      scheduledAt: context.now - 15_552_000_000,
      completedAt: context.now - 15_552_000_000,
      summary: 'Annual vaccination booster.',
      linkedSymptomIds: [],
      linkedConditionIds: [],
      linkedHealthRecordIds: [],
      linkedVaccinationIds: [],
      linkedWeightEntryIds: [],
    },
    {
      id: 'seed-visit-juniper-accident',
      catIds: ['seed-cat-juniper'],
      clinicId: 'seed-vet-clinic-riverside-emergency',
      doctorId: null,
      status: 'completed' as const,
      reason: 'accident' as const,
      customReasonLabel: null,
      followUpOfVisitId: null,
      followUpNote: null,
      title: 'Emergency claw injury',
      scheduledAt: context.now - 20_736_000_000,
      completedAt: context.now - 20_736_000_000,
      summary: 'Torn nail from a fall, cleaned and bandaged.',
      linkedSymptomIds: [],
      linkedConditionIds: [],
      linkedHealthRecordIds: [],
      linkedVaccinationIds: [],
      linkedWeightEntryIds: [],
    },
    {
      id: 'seed-visit-household-custom-nutrition',
      catIds: ['seed-cat-mochi', 'seed-cat-juniper'],
      clinicId: 'seed-vet-clinic-harbor',
      doctorId: 'seed-doctor-daniela',
      status: 'completed' as const,
      reason: 'custom' as const,
      customReasonLabel: 'Nutrition consult',
      followUpOfVisitId: null,
      followUpNote: null,
      title: null,
      scheduledAt: context.now - 10_368_000_000,
      completedAt: context.now - 10_368_000_000,
      summary: 'Discussed diet transition for both cats.',
      linkedSymptomIds: [],
      linkedConditionIds: [],
      linkedHealthRecordIds: [],
      linkedVaccinationIds: [],
      linkedWeightEntryIds: [],
    },
    {
      id: 'seed-visit-mochi-cancelled-dental',
      catIds: ['seed-cat-mochi'],
      clinicId: 'seed-vet-clinic-willow-creek',
      doctorId: null,
      status: 'cancelled' as const,
      reason: 'checkup' as const,
      customReasonLabel: null,
      followUpOfVisitId: null,
      followUpNote: null,
      title: null,
      scheduledAt: context.now - 12_960_000_000,
      completedAt: null,
      summary: null,
      linkedSymptomIds: [],
      linkedConditionIds: [],
      linkedHealthRecordIds: [],
      linkedVaccinationIds: [],
      linkedWeightEntryIds: [],
    },
  ] as const;

  const linkedVaccinationVisits: Record<string, string> = {
    'seed-vaccination-mochi-rabies': 'seed-visit-mochi-checkup',
  };
  const linkedWeightEntryVisits: Record<string, string> = {
    'seed-weight-mochi-3': 'seed-visit-mochi-checkup',
  };

  let vaccinationCount = 0;
  let preventiveCount = 0;
  let weightEntryCount = 0;
  let expenseCount = 0;
  let litterEntryCount = 0;
  let litterBoxCount = 0;
  let litterCount = 0;
  let customLitterTypeCount = 0;
  let healthRecordCount = 0;
  let conditionLibraryCount = 0;
  let symptomCount = 0;
  let visitCount = 0;

  conditionLibraryEntries.forEach((condition) => {
    const conditionRef = context.firestore
      .collection('apps')
      .doc('nine-lives')
      .collection('conditionLibrary')
      .doc(condition.id);

    batch.set(
      conditionRef,
      {
        ...condition,
        createdAt: context.now - 3_153_600_000,
      },
      { merge: true },
    );
    conditionLibraryCount += 1;
  });

  cats.forEach((cat) => {
    const catRef = householdRef.collection('cats').doc(cat.id);

    batch.set(
      catRef,
      {
        ...cat,
        householdId: HOUSEHOLD_ID,
        createdBy: caretaker.uid,
        createdAt,
        lastEditedAt: context.now,
      },
      { merge: true },
    );

    (vaccinationsByCat[cat.id] ?? []).forEach((vaccination) => {
      const vaccinationRef = householdRef
        .collection('vaccinations')
        .doc(vaccination.id);
      const history = vaccination.doses.map((dose, index) => ({
        ...dose,
        // Only the latest dose can be tied back to a seeded visit.
        linkedVisitId: index === 0 ? (linkedVaccinationVisits[vaccination.id] ?? null) : null,
        createdBy: caretaker.uid,
        createdAt,
      }));
      const [latestDose] = history;
      const oldestDose = history[history.length - 1];

      batch.set(
        vaccinationRef,
        {
          id: vaccination.id,
          householdId: HOUSEHOLD_ID,
          catId: cat.id,
          name: vaccination.name,
          history,
          firstAdministeredAt: oldestDose.administeredAt,
          lastAdministeredAt: latestDose.administeredAt,
          expiresAt: latestDose.expiresAt,
          createdBy: caretaker.uid,
          createdAt,
          lastEditedAt: context.now,
        },
        { merge: true },
      );
      vaccinationCount += 1;
    });

    (preventivesByCat[cat.id] ?? []).forEach((preventive) => {
      const preventiveRef = householdRef
        .collection('preventives')
        .doc(preventive.id);
      const history = preventive.doses.map((dose) => ({
        ...dose,
        createdBy: caretaker.uid,
        createdAt,
      }));
      const [latestDose] = history;
      const oldestDose = history[history.length - 1];

      batch.set(
        preventiveRef,
        {
          id: preventive.id,
          householdId: HOUSEHOLD_ID,
          catIds: [cat.id],
          name: preventive.name,
          customProductId: preventive.customProductId,
          type: preventive.type,
          customTypeId: preventive.customTypeId,
          history,
          firstAdministeredAt: oldestDose.administeredAt,
          lastAdministeredAt: latestDose.administeredAt,
          expiresAt: latestDose.expiresAt,
          createdBy: caretaker.uid,
          createdAt,
          lastEditedAt: context.now,
        },
        { merge: true },
      );
      preventiveCount += 1;
    });

    (weightEntriesByCat[cat.id] ?? []).forEach((weightEntry) => {
      const weightEntryRef = householdRef
        .collection('weightEntries')
        .doc(weightEntry.id);

      batch.set(
        weightEntryRef,
        {
          ...weightEntry,
          catId: cat.id,
          linkedVisitId: linkedWeightEntryVisits[weightEntry.id] ?? null,
          createdBy: caretaker.uid,
          createdAt,
        },
        { merge: true },
      );
      weightEntryCount += 1;
    });

    (symptomsByCat[cat.id] ?? []).forEach((symptom) => {
      const symptomRef = householdRef.collection('symptoms').doc(symptom.id);

      batch.set(
        symptomRef,
        {
          ...symptom,
          catId: cat.id,
          linkedVisitIds: [],
          createdBy: caretaker.uid,
          createdAt,
          lastEditedAt: context.now,
        },
        { merge: true },
      );
      symptomCount += 1;
    });
  });

  // Given to both cats together, so the "needs attention" section has an example of the cat
  // avatars stacking for an item with more than one cat.
  const householdFleaTickRef = householdRef.collection('preventives').doc('seed-preventive-household-flea-tick');
  const householdFleaTickDose = {
    id: 'seed-preventive-household-flea-tick-dose-1',
    administeredAt: context.now - 5_184_000_000,
    expiresAt: context.now + 5 * 86_400_000,
    dosage: '0.5 mL each',
    clinicId: 'seed-vet-clinic-blue-bark',
    doctorId: 'seed-doctor-maya',
    linkedVisitId: null,
    createdBy: caretaker.uid,
    createdAt,
  };
  batch.set(
    householdFleaTickRef,
    {
      id: 'seed-preventive-household-flea-tick',
      householdId: HOUSEHOLD_ID,
      catIds: ['seed-cat-mochi', 'seed-cat-juniper'],
      name: 'Frontline Plus',
      customProductId: null,
      type: 'flea-tick',
      customTypeId: null,
      history: [householdFleaTickDose],
      firstAdministeredAt: householdFleaTickDose.administeredAt,
      lastAdministeredAt: householdFleaTickDose.administeredAt,
      expiresAt: householdFleaTickDose.expiresAt,
      createdBy: caretaker.uid,
      createdAt,
      lastEditedAt: context.now,
    },
    { merge: true },
  );
  preventiveCount += 1;

  const secondCatRef = secondHouseholdRef.collection('cats').doc('seed-cat-other-household');
  batch.set(
    secondCatRef,
    {
      id: 'seed-cat-other-household',
      householdId: SECOND_HOUSEHOLD_ID,
      name: 'Pixel',
      photoURL: null,
      dateOfBirth: context.now - 31_536_000_000,
      isDateOfBirthEstimated: false,
      breed: 'Domestic Shorthair',
      lifestyle: 'indoor',
      microchipNumber: null,
      shelterOrigin: null,
      adoptedAt: context.now - 25_920_000_000,
      customKeyDates: null,
      diet: null,
      currentClinicId: null,
      insurance: null,
      personalityTraits: null,
      notes: 'Separate-household fixture cat for household-isolation scoping checks.',
      createdBy: coCaretaker.uid,
      createdAt,
      lastEditedAt: context.now,
    },
    { merge: true },
  );
  const secondPreventiveRef = secondHouseholdRef
    .collection('preventives')
    .doc('seed-preventive-other-household');
  const secondPreventiveDose = {
    id: 'seed-preventive-other-household-dose-1',
    administeredAt: context.now - 2_592_000_000,
    expiresAt: context.now + 2_592_000_000,
    dosage: '0.4 mL',
    clinicId: null,
    doctorId: null,
    linkedVisitId: null,
    createdBy: coCaretaker.uid,
    createdAt,
  };
  batch.set(
    secondPreventiveRef,
    {
      id: 'seed-preventive-other-household',
      householdId: SECOND_HOUSEHOLD_ID,
      catIds: ['seed-cat-other-household'],
      name: 'Advantage Multi',
      customProductId: null,
      type: 'flea-tick',
      customTypeId: null,
      history: [secondPreventiveDose],
      firstAdministeredAt: secondPreventiveDose.administeredAt,
      lastAdministeredAt: secondPreventiveDose.administeredAt,
      expiresAt: secondPreventiveDose.expiresAt,
      createdBy: coCaretaker.uid,
      createdAt,
      lastEditedAt: context.now,
    },
    { merge: true },
  );
  preventiveCount += 1;

  clinics.forEach((clinic) => {
    const clinicRef = householdRef.collection('vetClinics').doc(clinic.id);

    batch.set(
      clinicRef,
      {
        ...clinic,
        householdId: HOUSEHOLD_ID,
        createdAt,
        lastEditedAt: context.now,
      },
      { merge: true },
    );
  });

  visits.forEach((visit) => {
    const visitRef = householdRef.collection('visits').doc(visit.id);

    batch.set(
      visitRef,
      {
        ...visit,
        householdId: HOUSEHOLD_ID,
        createdBy: caretaker.uid,
        createdAt,
        lastEditedAt: context.now,
      },
      { merge: true },
    );
    visitCount += 1;
  });

  expenses.forEach((expense) => {
    const expenseRef = householdRef.collection('expenses').doc(expense.id);

    batch.set(
      expenseRef,
      {
        ...expense,
        householdId: HOUSEHOLD_ID,
        createdBy: caretaker.uid,
        createdAt,
        lastEditedAt: context.now,
      },
      { merge: true },
    );
    expenseCount += 1;
  });

  litterBoxes.forEach((litterBox) => {
    const litterBoxRef = householdRef.collection('litterBoxes').doc(litterBox.id);

    batch.set(
      litterBoxRef,
      {
        ...litterBox,
        householdId: HOUSEHOLD_ID,
        createdBy: caretaker.uid,
        createdAt,
        lastEditedAt: context.now,
      },
      { merge: true },
    );
    litterBoxCount += 1;
  });

  customLitterTypes.forEach((customType) => {
    const customTypeRef = householdRef.collection('customLitterTypes').doc(customType.id);

    batch.set(
      customTypeRef,
      {
        ...customType,
        householdId: HOUSEHOLD_ID,
        createdBy: caretaker.uid,
        createdAt,
      },
      { merge: true },
    );
    customLitterTypeCount += 1;
  });

  litters.forEach((litter) => {
    const litterRef = householdRef.collection('litters').doc(litter.id);

    batch.set(
      litterRef,
      {
        ...litter,
        householdId: HOUSEHOLD_ID,
        createdBy: caretaker.uid,
        createdAt,
        lastEditedAt: context.now,
      },
      { merge: true },
    );
    litterCount += 1;
  });

  litterEntries.forEach((entry) => {
    const entryRef = householdRef.collection('litterEntries').doc(entry.id);

    batch.set(
      entryRef,
      {
        ...entry,
        householdId: HOUSEHOLD_ID,
        createdBy: caretaker.uid,
        createdAt,
        lastEditedAt: context.now,
      },
      { merge: true },
    );
    litterEntryCount += 1;
  });

  customHealthRecordTypes.forEach((customType) => {
    const customTypeRef = householdRef
      .collection('customHealthRecordTypes')
      .doc(customType.id);

    batch.set(
      customTypeRef,
      {
        ...customType,
        householdId: HOUSEHOLD_ID,
        createdBy: caretaker.uid,
        createdAt,
      },
      { merge: true },
    );
  });

  customPreventiveProducts.forEach((customProduct) => {
    const customProductRef = householdRef
      .collection('customPreventiveProducts')
      .doc(customProduct.id);

    batch.set(
      customProductRef,
      {
        ...customProduct,
        householdId: HOUSEHOLD_ID,
        createdBy: caretaker.uid,
        createdAt,
      },
      { merge: true },
    );
  });

  customPreventiveTypes.forEach((customType) => {
    const customTypeRef = householdRef
      .collection('customPreventiveTypes')
      .doc(customType.id);

    batch.set(
      customTypeRef,
      {
        ...customType,
        householdId: HOUSEHOLD_ID,
        createdBy: caretaker.uid,
        createdAt,
      },
      { merge: true },
    );
  });

  healthRecords.forEach((record) => {
    const recordRef = householdRef.collection('healthRecords').doc(record.id);

    batch.set(
      recordRef,
      {
        ...record,
        householdId: HOUSEHOLD_ID,
        uploadedBy: caretaker.uid,
        createdAt,
        lastEditedAt: context.now,
      },
      { merge: true },
    );
    healthRecordCount += 1;
  });

  doctors.forEach((doctor) => {
    const doctorRef = householdRef.collection('doctors').doc(doctor.id);

    batch.set(
      doctorRef,
      {
        ...doctor,
        householdId: HOUSEHOLD_ID,
        createdAt,
      },
      { merge: true },
    );
  });

  batch.set(
    householdRef.collection('ingestionDrafts').doc('seed-ingestion-draft'),
    {
      id: 'seed-ingestion-draft',
      householdId: HOUSEHOLD_ID,
      sourceType: 'pdf',
      sourceFileName: 'blue-bark-visit-summary.pdf',
      proposedCats: [],
      proposedClinics: [],
      proposedVisits: [
        {
          catName: 'Mochi',
          clinicName: null,
          scheduledAt: context.now - 86_400_000,
          reason: 'checkup',
          customReasonLabel: null,
          notes: 'Annual wellness exam and vaccine review.',
        },
      ],
      proposedVaccinations: [
        {
          catName: 'Mochi',
          name: 'FVRCP',
          administeredAt: context.now - 86_400_000,
          expiresAt: context.now + 31_536_000_000,
          lotNumber: null,
        },
      ],
      proposedPreventives: [],
      proposedWeightEntry: null,
      proposedSymptoms: [],
      proposedConditions: [],
      proposedExpenses: [
        {
          catNames: ['Mochi'],
          items: [{ category: 'vet', label: 'Annual wellness exam', amount: 82 }],
          incurredAt: context.now - 86_400_000,
          notes: null,
        },
      ],
      suggestKeepAsRecord: false,
      confidence: 0.96,
      createdBy: caretaker.uid,
      createdAt: context.now,
    },
    { merge: true },
  );

  await batch.commit();

  const result: SeedResult = {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments:
      4 +
      conditionLibraryCount +
      cats.length +
      1 +
      1 +
      clinics.length +
      doctors.length +
      vaccinationCount +
      preventiveCount +
      weightEntryCount +
      expenseCount +
      litterEntryCount +
      litterBoxCount +
      litterCount +
      customLitterTypeCount +
      customHealthRecordTypes.length +
      customPreventiveProducts.length +
      customPreventiveTypes.length +
      healthRecordCount +
      symptomCount +
      visitCount +
      1, // seed-ingestion-draft
  };

  return result;
}
