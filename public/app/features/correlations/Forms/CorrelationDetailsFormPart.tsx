import { css, cx } from '@emotion/css';
import React from 'react';
import { DeepMap, FieldError, RegisterOptions, UseFormRegisterReturn } from 'react-hook-form';

import { Field, Input, TextArea } from '@grafana/ui';

import { EditFormDTO } from './types';

const getInputId = (inputName: string, correlation?: EditFormDTO) => {
  if (!correlation) {
    return inputName;
  }

  return `${inputName}_${correlation.sourceUID}-${correlation.uid}`;
};

const marginLess = css`
  margin: 0;
`;

interface Props {
  register: (path: 'label' | 'description', options?: RegisterOptions) => UseFormRegisterReturn;
  readOnly?: boolean;
  correlation?: EditFormDTO;
  errors: DeepMap<EditFormDTO, FieldError>;
}

export function CorrelationDetailsFormPart({ register, readOnly = false, correlation, errors }: Props) {
  console.log({ errors });
  return (
    <>
      <Field label="Label" invalid={!!errors.label} error={errors.label?.message}>
        <Input
          id={getInputId('label', correlation)}
          {...register('label', { required: { value: true, message: 'This field is required.' } })}
          readOnly={readOnly}
          placeholder="Logs to traces"
          width={16}
        />
      </Field>

      <Field
        label="Description"
        // the Field component automatically adds margin to itself, so we are forced to workaround it by overriding  its styles
        className={cx(readOnly && marginLess)}
      >
        <TextArea id={getInputId('description', correlation)} {...register('description')} readOnly={readOnly} />
      </Field>
    </>
  );
}
