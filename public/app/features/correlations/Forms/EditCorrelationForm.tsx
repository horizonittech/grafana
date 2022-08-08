import React from 'react';
import { SubmitHandler } from 'react-hook-form';

import { Button } from '@grafana/ui';

import { CorrelationDetailsFormPart } from './CorrelationDetailsFormPart';
import { EditFormDTO } from './types';
import { useCorrelationForm } from './useCorrelationForm';

interface Props {
  onSubmit: SubmitHandler<EditFormDTO>;
  defaultValues: EditFormDTO;
  readOnly?: boolean;
}

export const EditCorrelationForm = ({ onSubmit, defaultValues, readOnly = false }: Props) => {
  const { handleSubmit, register } = useCorrelationForm<EditFormDTO>({ onSubmit, defaultValues });

  return (
    <form onSubmit={readOnly ? () => void 0 : handleSubmit}>
      <input type="hidden" {...register('uid')} />
      <input type="hidden" {...register('sourceUID')} />
      <CorrelationDetailsFormPart register={register} readOnly={readOnly} />
      <Button type="submit" disabled={readOnly}>
        Save
      </Button>
    </form>
  );
};
