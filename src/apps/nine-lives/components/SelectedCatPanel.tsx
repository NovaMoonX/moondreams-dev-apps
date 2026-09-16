import {
  Avatar,
  Button,
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

function SelectedCatPanel({ householdId, cats, selectedCat, onEditDetails }: SelectedCatPanelProps) {
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
          <h3 className='text-lg font-semibold'>{selectedCat.name}</h3>
        </div>
        <Button type='button' variant='secondary' size='sm' onClick={onEditDetails}>
          <span className='hidden sm:inline'>Edit details</span>
          <span className='sm:hidden'>Edit</span>
        </Button>
      </div>

      <Tabs defaultValue='vaccinations' tabsWidth='full' variant='pills'>
        <TabsList>
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
