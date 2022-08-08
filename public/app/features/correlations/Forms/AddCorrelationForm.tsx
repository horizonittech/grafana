import { css } from '@emotion/css';
import React from 'react';
import { Controller } from 'react-hook-form';

import { Correlation, DataSourceInstanceSettings, GrafanaTheme2 } from '@grafana/data';
import { DataSourcePicker } from '@grafana/runtime';
import { Button, HorizontalGroup, PanelContainer, useStyles2 } from '@grafana/ui';
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
  buttonRow: css`
    display: flex;
    justify-content: flex-end;
  `,
});

interface Props {
  onClose: () => void;
  onSubmit: (correlation: Omit<Correlation, 'uid'>) => void;
}

const withDsUID = (fn: Function) => (ds: DataSourceInstanceSettings) => fn(ds.uid);

export const AddCorrelationForm = ({ onClose, onSubmit: externalSubmit }: Props) => {
  const styles = useStyles2(getStyles);
  const { control, handleSubmit, register } = useCorrelationForm<FormDTO>({ onSubmit: externalSubmit });

  return (
    <PanelContainer className={styles.panelContainer}>
      <CloseButton onClick={onClose} />
      <form onSubmit={handleSubmit}>
        <div>
          <HorizontalGroup>
            <Controller
              control={control}
              name="sourceUID"
              render={({ field: { onChange, value } }) => (
                <DataSourcePicker onChange={withDsUID(onChange)} noDefault current={value} />
              )}
            />
            links to:
            <Controller
              control={control}
              name="targetUID"
              render={({ field: { onChange, value } }) => (
                <DataSourcePicker onChange={withDsUID(onChange)} noDefault current={value} />
              )}
            />
          </HorizontalGroup>
        </div>

        <CorrelationDetailsFormPart register={register} />

        <div className={styles.buttonRow}>
          <Button variant="primary" icon="plus" type="submit">
            Add
          </Button>
        </div>
      </form>
    </PanelContainer>
  );
};
