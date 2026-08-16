import { Button, ButtonProps } from '@moondreamsdev/dreamer-ui/components';
import { Link } from 'react-router-dom';

// Recover the "button" branch of the union (the one with href?: never)
type ButtonOnlyProps = Extract<ButtonProps, { href?: undefined }>;

type NavButtonProps = Omit<ButtonOnlyProps, 'href' | 'ref'> & {
  href: string;
};

// Use this instead of `Button` when navigating to use the `Link` component,
// which prevents a full page reload and allows for client-side routing.
function NavButton({ href, ...rest }: NavButtonProps) {
  return (
    <Link to={href} className='shrink-0'>
      <Button {...rest}>
        {rest.children}
      </Button>
    </Link>
  );
}

export default NavButton;