import { Button } from '@moondreamsdev/dreamer-ui/components';

function WeatherAttribution() {
  return (
    <Button
      href='https://open-meteo.com/'
      target='_blank'
      rel='noreferrer'
      variant='tertiary'
      size='sm'
      className="text-muted-foreground relative h-auto justify-start p-0! text-[11px] font-normal after:absolute after:-inset-y-3 after:inset-x-0 after:content-['']"
    >
      Weather data by Open-Meteo.com
    </Button>
  );
}

export default WeatherAttribution;
