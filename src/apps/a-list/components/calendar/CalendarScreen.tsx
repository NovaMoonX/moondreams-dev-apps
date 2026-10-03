import SectionHeader from '@/components/SectionHeader';

function CalendarScreen() {
  return (
    <section className='space-y-4'>
      <SectionHeader title='Calendar' />
      <p className='text-muted-foreground text-sm'>
        Your movie nights will fill this month with posters. Nothing on the
        calendar yet.
      </p>
    </section>
  );
}

export default CalendarScreen;
