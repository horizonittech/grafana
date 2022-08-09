import { css } from '@emotion/css';
import React, { ComponentProps, memo, useCallback, useMemo, useState } from 'react';
import { CellProps, SortByFn } from 'react-table';

import { GrafanaTheme2 } from '@grafana/data';
import { Badge, Button, DeleteButton, HorizontalGroup, useStyles2 } from '@grafana/ui';
import EmptyListCTA from 'app/core/components/EmptyListCTA/EmptyListCTA';
import { Page } from 'app/core/components/Page/Page';
import { contextSrv } from 'app/core/core';
import { AccessControlAction } from 'app/types';

import { useNavModel } from '../../core/hooks/useNavModel';

import { AddCorrelationForm } from './Forms/AddCorrelationForm';
import { EditCorrelationForm } from './Forms/EditCorrelationForm';
import { Column, Table } from './components/Table';
import { CorrelationData, useCorrelations } from './useCorrelations';

const sortDatasource: SortByFn<CorrelationData> = (a, b, column) =>
  a.values[column].name.localeCompare(b.values[column].name);

export default function CorrelationsPage() {
  const navModel = useNavModel('correlations');
  const [isAdding, setIsAdding] = useState(false);
  const { correlations, add, remove, edit, error } = useCorrelations();
  const canAddCorrelation = contextSrv.hasPermission(AccessControlAction.DataSourcesCreate);
  console.log({ canAddCorrelation });

  const handleAdd = useCallback<ComponentProps<typeof AddCorrelationForm>['onSubmit']>(
    async (correlation) => {
      await add(correlation);
      setIsAdding(false);
    },
    [add]
  );

  const RowActions = useCallback(
    ({
      row: {
        original: {
          source: { uid: sourceUID, readOnly },
          uid,
        },
      },
    }: CellProps<CorrelationData, void>) => !readOnly && <DeleteButton onConfirm={() => remove({ sourceUID, uid })} />,
    [remove]
  );

  const columns = useMemo<Array<Column<CorrelationData>>>(
    () => [
      {
        id: 'info',
        cell: InfoCell,
        shrink: true,
      },
      {
        id: 'source',
        header: 'Source',
        cell: DataSourceCell,
        sortType: sortDatasource,
      },
      {
        id: 'target',
        header: 'Target',
        cell: DataSourceCell,
        sortType: sortDatasource,
      },
      { id: 'label', header: 'Label', sortType: 'alphanumeric' },
      { id: 'actions', cell: RowActions, shrink: true },
    ],
    [RowActions]
  );

  const data = useMemo(() => correlations, [correlations]);

  if (error) {
    return error.stack;
  }

  if (!data) {
    return <>LOL</>;
  }

  return (
    <>
      <Page navModel={navModel}>
        <Page.Contents>
          {data.length === 0 && !isAdding && (
            <EmptyListCTA
              title="You haven't defined any correlation yet."
              buttonIcon="sitemap"
              onClick={() => setIsAdding(true)}
              buttonTitle="Add correlation"
            />
          )}

          {data.length >= 1 && (
            <div>
              <HorizontalGroup justify="space-between">
                <div>
                  <h4>Correlations</h4>
                  <p>Define how data living in different data sources relates to each other.</p>
                </div>
                <Button icon="plus" onClick={() => setIsAdding(true)} disabled={isAdding}>
                  Add
                </Button>
              </HorizontalGroup>
            </div>
          )}

          {isAdding && <AddCorrelationForm onClose={() => setIsAdding(false)} onSubmit={handleAdd} />}

          {data.length >= 1 && (
            <Table
              renderExpandedRow={({ target, source, ...correlation }) => (
                <EditCorrelationForm
                  defaultValues={{ sourceUID: source.uid, ...correlation }}
                  onSubmit={edit}
                  readOnly={source.readOnly}
                />
              )}
              columns={columns}
              data={data}
              expandable
              getRowId={(correlation) => `${correlation.source.uid}-${correlation.uid}`}
            />
          )}
        </Page.Contents>
      </Page>
    </>
  );
}

const getDatasourceCellStyles = (theme: GrafanaTheme2) => ({
  root: css`
    display: flex;
    align-items: center;
  `,
  dsLogo: css`
    margin-right: ${theme.spacing()};
    height: 16px;
    width: 16px;
  `,
});

const DataSourceCell = memo(
  function DataSourceCell({
    cell: { value },
  }: CellProps<CorrelationData, CorrelationData['source'] | CorrelationData['target']>) {
    const styles = useStyles2(getDatasourceCellStyles);

    return (
      <span className={styles.root}>
        <img src={value.meta.info.logos.small} className={styles.dsLogo} />
        {value.name}
      </span>
    );
  },
  ({ cell: { value } }, { cell: { value: prevValue } }) => {
    return value.type === prevValue.type && value.name === prevValue.name;
  }
);

const noWrap = css`
  white-space: nowrap;
`;

const InfoCell = memo(
  function InfoCell({ ...props }: CellProps<CorrelationData, void>) {
    const readOnly = props.row.original.source.readOnly;

    if (readOnly) {
      return <Badge text="Read only" color="red" className={noWrap} />;
    } else {
      return null;
    }
  },
  (props, prevProps) => props.row.original.source.readOnly === prevProps.row.original.source.readOnly
);
