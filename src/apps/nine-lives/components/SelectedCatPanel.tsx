import { useState } from 'react';

import {
  Avatar,
  Badge,
  Button,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@moondreamsdev/dreamer-ui/components';

import { getInitials } from '@/utils/accountUtils';

import type { Cat } from '../types';
import CatConditionsSection from './CatConditionsSection';
import PreventivesSection from './PreventivesSection';
import SymptomsSection from './SymptomsSection';
import VaccinationsSection from './VaccinationsSection';
import WeightEntriesSection from './WeightEntriesSection';

interface SelectedCatPanelProps {
  householdId: string;
  cats: Cat[];
  selectedCat: Cat;
  onEditDetails: () => void;
}

const SEX_LABELS: Record<Cat['sex'], string> = {
  male: 'Male',
  female: 'Female',
  unknown: 'Sex unknown',
};

const sectionOptions = [
  { text: 'Vaccinations', value: 'vaccinations' },
  { text: 'Preventives & Meds', value: 'preventives' },
  { text: 'Weight history', value: 'weight' },
  { text: 'Conditions', value: 'conditions' },
  { text: 'Symptoms', value: 'symptoms' },
];

function SelectedCatPanel({ householdId, cats, selectedCat, onEditDetails }: SelectedCatPanelProps) {
  const [activeSection, setActiveSection] = useState('vaccinations');

  return (
    <div className='mt-6 rounded-lg border border-border bg-background p-4'>
      <div className='mb-4 flex items-center justify-between gap-2'>
        <div className='flex items-center gap-3'>
          <Avatar
            src={selectedCat.photoURL ?? undefined}
            alt={selectedCat.name}
            initials={selectedCat.photoURL ? undefined : getInitials(selectedCat.name)}
            size='lg'
            shape='circle'
          />
          <div>
            <h3 className='text-lg font-semibold'>{selectedCat.name}</h3>
            <div className='flex flex-wrap items-center gap-1.5'>
              <Badge variant='muted' outline>
                {SEX_LABELS[selectedCat.sex]}
              </Badge>
              <Badge variant='muted' outline>
                {selectedCat.isSpayedNeutered ? 'Spayed / neutered' : 'Not spayed / neutered'}
              </Badge>
              {selectedCat.adoptionProfileURL && (
                <a href={selectedCat.adoptionProfileURL} target='_blank' rel='noopener noreferrer' className='text-primary text-xs hover:underline'>
                  Adoption profile
                </a>
              )}
              {selectedCat.microchipServiceURL && (
                <a href={selectedCat.microchipServiceURL} target='_blank' rel='noopener noreferrer' className='text-primary text-xs hover:underline'>
                  Microchip service
                </a>
              )}
              {selectedCat.otherLinks?.map((link) => (
                <a key={link.id} href={link.url} target='_blank' rel='noopener noreferrer' className='text-primary text-xs hover:underline'>
                  {link.label}
                </a>
              ))}
            </div>
            {(selectedCat.coatColors?.length || selectedCat.personalityTraits?.length) && (
              <p className='text-muted-foreground mt-1 text-sm'>
                {[...(selectedCat.coatColors ?? []), ...(selectedCat.personalityTraits ?? [])].join(' · ')}
              </p>
            )}
          </div>
        </div>
        <Button type='button' variant='secondary' size='sm' onClick={onEditDetails}>
          <span className='hidden sm:inline'>Edit details</span>
          <span className='sm:hidden'>Edit</span>
        </Button>
      </div>

      <div className='md:hidden'>
        <Select options={sectionOptions} value={activeSection} onChange={setActiveSection} />
      </div>

      <Tabs value={activeSection} onValueChange={setActiveSection} tabsWidth='full' variant='pills'>
        <TabsList className='hidden md:flex'>
          <TabsTrigger value='vaccinations'>Vaccinations</TabsTrigger>
          <TabsTrigger value='preventives'>Preventives &amp; Meds</TabsTrigger>
          <TabsTrigger value='weight'>Weight history</TabsTrigger>
          <TabsTrigger value='conditions'>Conditions</TabsTrigger>
          <TabsTrigger value='symptoms'>Symptoms</TabsTrigger>
        </TabsList>

        <TabsContent value='vaccinations' className='pt-4'>
          <VaccinationsSection householdId={householdId} catId={selectedCat.id} catName={selectedCat.name} />
        </TabsContent>

        <TabsContent value='preventives' className='pt-4'>
          <PreventivesSection
            householdId={householdId}
            catId={selectedCat.id}
            catName={selectedCat.name}
            cats={cats}
          />
        </TabsContent>

        <TabsContent value='weight' className='pt-4'>
          <WeightEntriesSection householdId={householdId} catId={selectedCat.id} catName={selectedCat.name} />
        </TabsContent>

        <TabsContent value='conditions' className='pt-4'>
          <CatConditionsSection householdId={householdId} catId={selectedCat.id} catName={selectedCat.name} />
        </TabsContent>

        <TabsContent value='symptoms' className='pt-4'>
          <SymptomsSection householdId={householdId} catId={selectedCat.id} catName={selectedCat.name} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default SelectedCatPanel;
