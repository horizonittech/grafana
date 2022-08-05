import { useState } from 'react';
import { useAsync } from 'react-use';

import { Correlation, DataSourceInstanceSettings } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { useGrafana } from 'app/core/context/GrafanaContext';

export interface CorrelationData extends Omit<Correlation, 'sourceUID' | 'targetUID'> {
  source: DataSourceInstanceSettings;
  target: DataSourceInstanceSettings;
}

const toEnrichedCorrelationData = (correlations: Correlation[]): CorrelationData[] =>
  correlations.map(({ sourceUID, targetUID, ...correlation }) => ({
    ...correlation,
    source: getDataSourceSrv().getInstanceSettings(sourceUID)!,
    target: getDataSourceSrv().getInstanceSettings(targetUID)!,
  }));

export const useCorrelations = () => {
  const { backend } = useGrafana();
  const [a, setA] = useState(Symbol());

  const getCorrelations = () =>
    backend.get<Correlation[]>('/api/datasources/correlations').then(toEnrichedCorrelationData);

  const reload = () => setA(Symbol());

  const { loading, value: correlations, error } = useAsync(getCorrelations, [a]);

  const add = ({ sourceUID, ...correlation }: Omit<Correlation, 'uid'>) => {
    return backend.post(`/api/datasources/uid/${sourceUID}/correlations`, correlation).finally(reload);
  };

  const remove = ({ sourceUID, uid }: Pick<Correlation, 'sourceUID' | 'uid'>) => {
    return backend.delete(`/api/datasources/uid/${sourceUID}/correlations/${uid}`).finally(reload);
  };

  return { loading, correlations, add, remove, error };
};
