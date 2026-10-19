import { useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import DeleteIconButton from '@/components/DeleteIconButton';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import SummaryRow from '@/components/SummaryRow';
import TickMark from '@/components/TickMark';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import ItemSearch from '@apps/pinch/components/plan/ItemSearch';
import PackageFields, {
  type PackageFieldValues,
} from '@apps/pinch/components/pantry/PackageFields';
import { usePackageActions } from '@apps/pinch/hooks/usePackageActions';
import {
  selectDefaultProducts,
  selectIngredientsById,
  selectPlannedMeals,
  selectProductsByIngredient,
  selectRecipes,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { Package, Product } from '@apps/pinch/types';
import { getIngredientUses, getPackageUnit } from '@apps/pinch/utils/gapOrder';
import {
  NO_DATE_ANSWER,
  getAnswerDate,
  getDateAnswer,
  getDefaultPlace,
  getPackageLabel,
  isValidPackageAmount,
  lowerFirst,
  parseAmountText,
} from '@apps/pinch/utils/packages';
import { formatSize } from '@apps/pinch/utils/productFormat';
import { getShopSection } from '@apps/pinch/utils/shopping';

const { custom } = FormFactories;

interface JustAdded {
  id: string;
  text: string;
}

interface PackageFormSheetProps {
  uid: string;
  /** The package being changed; null adds one. */
  pkg: Package | null;
  /** Adding with the ingredient already known (from its drawer); null asks what it is first. */
  ingredientId: string | null;
  onClose: () => void;
  /** Called with what was written, so the screen behind can show where it went. */
  onAdded?: (added: Package) => void;
}

function PackageFormSheet({
  uid,
  pkg,
  ingredientId: startIngredientId,
  onClose,
  onAdded,
}: PackageFormSheetProps) {
  const { confirm } = useActionModal();
  const { isReady, loadError, add, edit, remove, undoAdd } =
    usePackageActions(uid);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const productsByIngredient = useAppSelector(selectProductsByIngredient);
  const defaultProducts = useAppSelector(selectDefaultProducts);
  const recipes = useAppSelector(selectRecipes);
  const recipesById = useAppSelector(selectRecipesById);
  const plannedMeals = useAppSelector(selectPlannedMeals);
  const [ingredientId, setIngredientId] = useState<string | null>(
    pkg?.ingredientId ?? startIngredientId,
  );
  const [productId, setProductId] = useState<string | null>(
    pkg?.productId ??
      (startIngredientId === null
        ? null
        : (defaultProducts.get(startIngredientId)?.id ?? null)),
  );
  const [values, setValues] = useState<PackageFieldValues>(() => {
    if (pkg) {
      return {
        amountText: String(pkg.amount),
        unit: pkg.unit,
        place: pkg.place,
        date: getDateAnswer(pkg.expiresAt),
      };
    }
    const product =
      startIngredientId === null
        ? undefined
        : defaultProducts.get(startIngredientId);
    const ingredient =
      startIngredientId === null
        ? undefined
        : ingredientsById.get(startIngredientId);
    return {
      amountText: product ? String(product.sizeAmount) : '',
      unit:
        product?.sizeUnit ??
        getPackageUnit(
          startIngredientId === null
            ? undefined
            : getIngredientUses(
                recipes,
                plannedMeals,
                recipesById,
                ingredientsById,
              ).get(startIngredientId),
          ingredient,
        ),
      place: getDefaultPlace(getShopSection(ingredient)),
      date: NO_DATE_ANSWER,
    };
  });
  const [justAdded, setJustAdded] = useState<JustAdded | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ingredient =
    ingredientId === null ? undefined : ingredientsById.get(ingredientId);
  const name = ingredient?.name ?? pkg?.ingredientName ?? '';
  const packs = (
    ingredientId === null ? [] : (productsByIngredient.get(ingredientId) ?? [])
  ).reduce<Product[]>(
    (distinct, product) =>
      distinct.some(
        (known) =>
          known.sizeAmount === product.sizeAmount &&
          known.sizeUnit === product.sizeUnit,
      )
        ? distinct
        : [...distinct, product],
    [],
  );
  const amount = parseAmountText(values.amountText);
  const answer = getAnswerDate(values.date);

  const getNote = () => {
    if (loadError !== null)
      return "Your pantry couldn't load, so adding is paused.";
    if (!isReady) return 'Loading your pantry…';
    if (ingredientId === null || name === '') return 'Pick what it is.';
    if (!isValidPackageAmount(amount)) return 'Say how much there is.';
    return answer.isAnswered
      ? null
      : 'Choose when it expires, or pick No date.';
  };
  const note = getNote();
  const canSave = note === null && !isSubmitting;

  const handlePick = (id: string) => {
    const picked = ingredientsById.get(id);
    const product = defaultProducts.get(id);
    const uses = getIngredientUses(
      recipes,
      plannedMeals,
      recipesById,
      ingredientsById,
    );
    setIngredientId(id);
    setProductId(product?.id ?? null);
    setJustAdded(null);
    setError(null);
    setValues((current) => ({
      amountText: product ? String(product.sizeAmount) : '',
      unit: product?.sizeUnit ?? getPackageUnit(uses.get(id), picked),
      place: getDefaultPlace(getShopSection(picked)),
      date: current.date,
    }));
  };

  const handlePack = (id: string) => {
    const pack = packs.find((product) => product.id === id);
    if (!pack) return;

    setProductId(pack.id);
    setValues((current) => ({
      ...current,
      amountText: String(pack.sizeAmount),
      unit: pack.sizeUnit,
    }));
  };

  const handleSubmit = async (isAnother: boolean) => {
    if (!canSave || ingredientId === null) return;

    setError(null);
    setIsSubmitting(true);
    try {
      if (pkg) {
        await edit(pkg, {
          amount,
          unit: values.unit,
          place: values.place,
          expiresAt: answer.expiresAt,
          productId,
          ingredientName: name,
        });
        onClose();
        return;
      }
      const [created] = add([
        {
          ingredientId,
          ingredientName: name,
          productId,
          amount,
          unit: values.unit,
          place: values.place,
          expiresAt: answer.expiresAt,
        },
      ]);
      onAdded?.(created);
      if (!isAnother) {
        onClose();
        return;
      }
      setJustAdded({
        id: created.id,
        text: [
          `${name} ${formatSize(created.amount, created.unit)}`,
          lowerFirst(getPackageLabel(created.expiresAt) ?? 'no date'),
        ].join(', '),
      });
      setValues((current) => ({ ...current, date: NO_DATE_ANSWER }));
      setIsSubmitting(false);
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save this.'));
      setIsSubmitting(false);
    }
  };

  const handleUndoAdded = async () => {
    if (justAdded === null) return;

    const { id } = justAdded;
    setJustAdded(null);
    try {
      await undoAdd(id);
    } catch (undoError) {
      setError(getErrorMessage(undoError, "Couldn't undo that."));
    }
  };

  const handleDelete = async () => {
    if (!pkg) return;

    const isConfirmed = await confirm({
      title: `Delete this ${name}?`,
      message: `It and its history are erased, and this can't be undone. If you used it or threw it out, say so from the package instead.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!isConfirmed) return;

    setIsSubmitting(true);
    try {
      await remove(pkg);
      onClose();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete this.'));
      setIsSubmitting(false);
    }
  };

  const fields = [
    custom({
      name: 'details',
      label: '',
      renderComponent: () => (
        <div className='space-y-4'>
          {packs.length > 1 && (
            <div className='space-y-1'>
              <p className='text-muted-foreground text-xs'>Which pack</p>
              <PillGroup
                label='Which pack'
                options={packs.map((product) => ({
                  value: product.id,
                  label: formatSize(product.sizeAmount, product.sizeUnit),
                }))}
                value={productId}
                onChange={handlePack}
              />
            </div>
          )}
          <PackageFields value={values} onChange={setValues} name={name} />
          {pkg === null && (
            <Button
              type='button'
              variant='secondary'
              className='h-11 w-full'
              disabled={!canSave}
              onClick={() => void handleSubmit(true)}
            >
              Add another
            </Button>
          )}
        </div>
      ),
    }),
  ];

  return (
    <FormSheet isOpen onClose={onClose} title='Package'>
      <div className='grid gap-4'>
        {justAdded !== null && (
          <div
            role='status'
            className='bg-accent/60 border-border flex items-center gap-3 rounded-2xl border py-2 pr-2 pl-3'
          >
            <TickMark />
            <span className='min-w-0 flex-1 text-sm font-medium text-pretty'>
              Added {justAdded.text}
            </span>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className="relative h-9 shrink-0 rounded-full px-4 after:absolute after:-inset-0.5 after:content-['']"
              onClick={() => void handleUndoAdded()}
            >
              Undo
            </Button>
          </div>
        )}
        {ingredientId === null || name === '' ? (
          <div className='space-y-3'>
            <p className='font-medium'>What did you bring home?</p>
            <ItemSearch uid={uid} onPick={handlePick} autoFocus />
          </div>
        ) : (
          <>
            <SummaryRow
              label='What it is'
              ariaLabel={`${name}. Pick something else`}
              onClick={pkg === null ? () => setIngredientId(null) : undefined}
            >
              {name}
            </SummaryRow>
            <Form
              id='pinch-package'
              form={fields}
              initialData={{ details: '' }}
              columns={1}
              onSubmit={() => {
                void handleSubmit(false);
              }}
              submitButton={
                <ModalFooterActions
                  note={note}
                  leftActions={
                    pkg && (
                      <DeleteIconButton
                        label={`Delete ${name}`}
                        disabled={isSubmitting}
                        onClick={() => void handleDelete()}
                      />
                    )
                  }
                  cancelAction={
                    <Button
                      type='button'
                      variant='secondary'
                      onClick={onClose}
                      disabled={isSubmitting}
                    >
                      {justAdded === null ? 'Cancel' : 'Done'}
                    </Button>
                  }
                  rightActions={
                    <Button
                      type='submit'
                      loading={isSubmitting}
                      disabled={!canSave}
                    >
                      {pkg ? 'Save' : 'Add'}
                    </Button>
                  }
                />
              }
            />
          </>
        )}
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
      </div>
    </FormSheet>
  );
}

export default PackageFormSheet;
