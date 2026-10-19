import { Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Search } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  className?: string;
}

/** A filled, roomy search field with a magnifier, so it reads as the screen's one place to type. Use it for every list or picker search. */
function SearchInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  className,
}: SearchInputProps) {
  return (
    <div className={join('relative', className)}>
      <Search
        className='text-muted-foreground pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2'
        aria-hidden='true'
      />
      <Input
        type='search'
        variant='solid'
        rounded='full'
        className='h-12 pl-12! text-base'
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export default SearchInput;
