import { css, cx } from '@emotion/css';
import memoizeOne from 'memoize-one';
import React from 'react';
import { connect, ConnectedProps } from 'react-redux';

import { DataQuery, ExploreUrlState, EventBusExtended, EventBusSrv, GrafanaTheme2 } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { Themeable2, withTheme2 } from '@grafana/ui';
import store from 'app/core/store';
import {
  DEFAULT_RANGE,
  ensureQueries,
  getTimeRange,
  getTimeRangeFromUrl,
  lastUsedDatasourceKeyForOrgId,
  parseUrlState,
} from 'app/core/utils/explore';
import { StoreState } from 'app/types';
import { ExploreId } from 'app/types/explore';

import { getFiscalYearStartMonth, getTimeZone } from '../profile/state/selectors';

import Explore from './Explore';
import { initializeExplore, refreshExplore } from './state/explorePane';
import { lastSavedUrl } from './state/main';

const getStyles = (theme: GrafanaTheme2) => {
  return {
    explore: css`
      overflow: scroll;
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      & + & {
        border-left: 1px dotted ${theme.colors.border.medium};
      }
    `,
  };
};

interface OwnProps extends Themeable2 {
  exploreId: ExploreId;
  urlQuery: string;
}

interface Props extends OwnProps, ConnectedProps<typeof connector> {}

/**
 * This component is responsible for handling initialization of an Explore pane and triggering synchronization
 * of state based on URL changes and preventing any infinite loops.
 */
class ExplorePaneContainerUnconnected extends React.PureComponent<Props> {
  el: any;
  exploreEvents: EventBusExtended;

  constructor(props: Props) {
    super(props);
    this.exploreEvents = new EventBusSrv();
    this.state = {
      openDrawer: undefined,
    };
  }

  componentDidMount() {
    const { initialized, exploreId, initialDatasource, initialQueries, initialRange, panelsState, width } = this.props;

    // initialize the whole explore first time we mount and if browser history contains a change in datasource
    if (!initialized) {
      this.props.initializeExplore(
        exploreId,
        initialDatasource,
        initialQueries,
        initialRange,
        width || 0,
        this.exploreEvents,
        panelsState
      );
    }
  }

  componentWillUnmount() {
    this.exploreEvents.removeAllListeners();
  }

  componentDidUpdate(prevProps: Props) {
    this.refreshExplore(prevProps.urlQuery);
  }

  refreshExplore = (prevUrlQuery: string) => {
    const { exploreId, urlQuery } = this.props;

    // Update state from url only if it changed and only if the change wasn't initialised by redux to prevent any loops
    if (urlQuery !== prevUrlQuery && urlQuery !== lastSavedUrl[exploreId]) {
      this.props.refreshExplore(exploreId, urlQuery);
    }
  };

  getRef = (el: any) => {
    this.el = el;
  };

  render() {
    const { theme, exploreId, initialized } = this.props;
    const styles = getStyles(theme);
    const exploreClass = cx(styles.explore);
    return (
      <div className={exploreClass} ref={this.getRef} data-testid={selectors.pages.Explore.General.container}>
        {initialized && <Explore exploreId={exploreId} />}
      </div>
    );
  }
}

const ensureQueriesMemoized = memoizeOne(ensureQueries);
const getTimeRangeFromUrlMemoized = memoizeOne(getTimeRangeFromUrl);

function mapStateToProps(state: StoreState, props: OwnProps) {
  const urlState = parseUrlState(props.urlQuery);
  const timeZone = getTimeZone(state.user);
  const fiscalYearStartMonth = getFiscalYearStartMonth(state.user);

  const { datasource, queries, range: urlRange, panelsState } = (urlState || {}) as ExploreUrlState;
  const initialDatasource = datasource || store.get(lastUsedDatasourceKeyForOrgId(state.user.orgId));
  const initialQueries: DataQuery[] = ensureQueriesMemoized(queries);
  const initialRange = urlRange
    ? getTimeRangeFromUrlMemoized(urlRange, timeZone, fiscalYearStartMonth)
    : getTimeRange(timeZone, DEFAULT_RANGE, fiscalYearStartMonth);

  return {
    initialized: state.explore[props.exploreId]?.initialized,
    initialDatasource,
    initialQueries,
    initialRange,
    panelsState,
    width: state.explore[props.exploreId]?.containerWidth,
  };
}

const mapDispatchToProps = {
  initializeExplore,
  refreshExplore,
};

const connector = connect(mapStateToProps, mapDispatchToProps);

export const ExplorePaneContainer = withTheme2(connector(ExplorePaneContainerUnconnected));
