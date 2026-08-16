import { Outlet } from 'react-router-dom';
import ThemeToggle from '@ui/ThemeToggle';

function Layout() {
	return (
		<div className='page transition-colors duration-200'>
			<ThemeToggle className='absolute bottom-4 left-4' />
			<Outlet />
		</div>
	);
}

export default Layout;
