import {
  Button,
  ButtonProps,
  DropdownMenu,
  DropdownMenuProps,
  Tooltip,
  TooltipProps,
} from '@moondreamsdev/dreamer-ui/components';
import { DotsVertical } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';

interface EllipsisDropdownProps
  extends
    Pick<
      DropdownMenuProps,
      'placement' | 'alignment' | 'offset'
    >,
    Pick<ButtonProps, 'variant' | 'size' | 'className'> {
  items?: DropdownMenuProps['items'];
  onItemSelect?: DropdownMenuProps['onItemSelect'];
  ariaLabel: string;
  disabled?: boolean;
  disabledMessage?: TooltipProps['message'];
  disabledTooltipPlacement?: TooltipProps['placement'];
}

function EllipsisDropdown({
  items,
  onItemSelect,
  placement = 'bottom',
  alignment = 'end',
  offset = 8,
  ariaLabel,
  variant = 'secondary',
  size,
  className,
  disabled = false,
  disabledMessage,
  disabledTooltipPlacement,
}: EllipsisDropdownProps) {
  const button = (
    <Button
      type='button'
      variant={variant}
      size={size}
      disabled={disabled}
      className={join('size-8 p-0!', className)}
      aria-label={ariaLabel || 'Open actions'}
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <DotsVertical className='h-4 w-4' />
    </Button>
  );

  if (disabled) {
    return (
      <Tooltip message={disabledMessage} disabled={!disabledMessage} placement={disabledTooltipPlacement}>
        <span>
          <Button
            type='button'
            variant={variant}
            size={size}
            disabled={disabled}
            className={join('size-8 p-0!', className)}
            aria-label={ariaLabel || 'Open actions'}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <DotsVertical className='h-4 w-4' />
          </Button>
        </span>
      </Tooltip>
    );
  }

  if (!items || items.length === 0) {
    return button;
  }

  return (
    <DropdownMenu
      items={items}
      onItemSelect={onItemSelect}
      placement={placement}
      alignment={alignment}
      offset={offset}
      trigger={button}
    />
  );
}

export default EllipsisDropdown;
