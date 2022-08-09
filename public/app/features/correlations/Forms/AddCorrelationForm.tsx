import { css } from '@emotion/css';
import React from 'react';
import { Controller } from 'react-hook-form';

import { Correlation, DataSourceInstanceSettings, GrafanaTheme2 } from '@grafana/data';
import { DataSourcePicker } from '@grafana/runtime';
import { Button, Field, HorizontalGroup, PanelContainer, useStyles2 } from '@grafana/ui';
import { CloseButton } from 'app/core/components/CloseButton/CloseButton';

import { CorrelationDetailsFormPart } from './CorrelationDetailsFormPart';
import { FormDTO } from './types';
import { useCorrelationForm } from './useCorrelationForm';

const getStyles = (theme: GrafanaTheme2) => ({
  panelContainer: css`
    position: relative;
    padding: ${theme.spacing(1)};
    margin-bottom: ${theme.spacing(2)};
  `,
});

interface Props {
  onClose: () => void;
  onSubmit: (correlation: Omit<Correlation, 'uid'>) => void;
}

const withDsUID = (fn: Function) => (ds: DataSourceInstanceSettings) => fn(ds.uid);

export const AddCorrelationForm = ({ onClose, onSubmit: externalSubmit }: Props) => {
  const styles = useStyles2(getStyles);
  const { control, handleSubmit, register, errors } = useCorrelationForm<FormDTO>({ onSubmit: externalSubmit });

  return (
    <PanelContainer className={styles.panelContainer}>
      <CloseButton onClick={onClose} />
      <form onSubmit={handleSubmit}>
        <div>
          <HorizontalGroup>
            <Field
              label="Source data source"
              htmlFor="source"
              invalid={!!errors.sourceUID}
              error={errors.sourceUID?.message}
            >
              <Controller
                control={control}
                name="sourceUID"
                rules={{ required: { value: true, message: 'This field is required.' } }}
                render={({ field: { onChange, value } }) => (
                  <DataSourcePicker
                    onChange={withDsUID(onChange)}
                    noDefault
                    current={value}
                    inputId="source"
                    width={32}
                  />
                )}
              />
            </Field>
            links to:
            <Field
              label="Target data source"
              htmlFor="target"
              invalid={!!errors.targetUID}
              error={errors.targetUID?.message}
            >
              <Controller
                control={control}
                name="targetUID"
                rules={{ required: { value: true, message: 'This field is required.' } }}
                render={({ field: { onChange, value } }) => (
                  <DataSourcePicker
                    onChange={withDsUID(onChange)}
                    noDefault
                    current={value}
                    inputId="target"
                    invalid={!!errors.targetUID}
                    width={32}
                  />
                )}
              />
            </Field>
          </HorizontalGroup>
        </div>

        <CorrelationDetailsFormPart errors={errors} register={register} />

        <HorizontalGroup justify="flex-end">
          <Button variant="primary" icon="plus" type="submit">
            Add
          </Button>
        </HorizontalGroup>
      </form>
    </PanelContainer>
  );
};
