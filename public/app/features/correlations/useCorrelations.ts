import { useState } from 'react';
import { useAsync } from 'react-use';

import { Correlation, DataSourceInstanceSettings } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { useGrafana } from 'app/core/context/GrafanaContext';

export interface CorrelationData extends Omit<Correlation, 'sourceUID' | 'targetUID'> {
  source: DataSourceInstanceSettings;
  target: DataSourceInstanceSettings;
}

const toEnrichedCorrelationData = ({ sourceUID, targetUID, ...correlation }: Correlation): CorrelationData => ({
  ...correlation,
  source: getDataSourceSrv().getInstanceSettings(sourceUID)!,
  target: getDataSourceSrv().getInstanceSettings(targetUID)!,
});

const toEnrichedCorrelationsData = (correlations: Correlation[]) => correlations.map(toEnrichedCorrelationData);

export const useCorrelations = () => {
  const { backend } = useGrafana();
  const [a, setA] = useState(Symbol());

  const getCorrelations = () =>
    backend.get<Correlation[]>('/api/datasources/correlations').then(toEnrichedCorrelationsData);

  const reload = () => setA(Symbol());

  const { loading, value: correlations, error } = useAsync(getCorrelations, [a]);

  const add = ({ sourceUID, ...correlation }: Omit<Correlation, 'uid'>) => {
    return backend
      .post(`/api/datasources/uid/${sourceUID}/correlations`, correlation)
      .then(toEnrichedCorrelationData)
      .finally(reload);
  };

  const remove = ({ sourceUID, uid }: Pick<Correlation, 'sourceUID' | 'uid'>) => {
    return backend.delete(`/api/datasources/uid/${sourceUID}/correlations/${uid}`).finally(reload);
  };

  const edit = ({ sourceUID, uid, ...correlation }: Omit<Correlation, 'targetUID'>) => {
    return backend
      .patch(`/api/datasources/uid/${sourceUID}/correlations/${uid}`, correlation)
      .then(toEnrichedCorrelationData)
      .finally(reload);
  };

  return { loading, correlations, add, remove, edit, error };
};
