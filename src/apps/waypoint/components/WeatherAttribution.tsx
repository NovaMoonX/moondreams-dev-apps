import { Button } from '@moondreamsdev/dreamer-ui/components';

function WeatherAttribution() {
  return (
    <Button
      href='https://open-meteo.com/'
      target='_blank'
      rel='noreferrer'
      variant='tertiary'
      size='sm'
      className='text-muted-foreground h-auto p-0 text-[10px] font-normal'
    >
      Weather data by Open-Meteo.com
    </Button>
  );
}

export default WeatherAttribution;
