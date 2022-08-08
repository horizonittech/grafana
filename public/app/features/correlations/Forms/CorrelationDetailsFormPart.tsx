import React from 'react';
import { UseFormRegisterReturn } from 'react-hook-form';

import { Field, Input, TextArea } from '@grafana/ui';

interface Props {
  register: (path: 'label' | 'description') => UseFormRegisterReturn;
  readOnly?: boolean;
}

export function CorrelationDetailsFormPart<T>({ register, readOnly = false }: Props) {
  return (
    <>
      <Field label="Label">
        <Input id="lol1" {...register('label')} readOnly={readOnly} />
      </Field>

      <Field label="Description">
        <TextArea id="lol2" {...register('description')} readOnly={readOnly} />
      </Field>
    </>
  );
}
