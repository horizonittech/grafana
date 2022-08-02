package searchV2

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/grafana/grafana/pkg/infra/log"
	"github.com/grafana/grafana/pkg/models"
	"github.com/grafana/grafana/pkg/registry"
	"github.com/grafana/grafana/pkg/services/accesscontrol"
	"github.com/grafana/grafana/pkg/services/featuremgmt"
	"github.com/grafana/grafana/pkg/services/sqlstore"
	"github.com/grafana/grafana/pkg/services/store"
	"github.com/grafana/grafana/pkg/setting"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"

	"github.com/blugelabs/bluge"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

var (
	namespace                             = "grafana"
	subsystem                             = "search"
	dashboardSearchFailureRequestsCounter = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: namespace,
			Subsystem: subsystem,
			Name:      "dashboard_search_failures_total",
			Help:      "A counter for failed dashboard search requests",
		},
		[]string{"reason"},
	)
	dashboardSearchSuccessRequestsDuration = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:      "dashboard_search_successes_duration_seconds",
			Buckets:   []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10, 25, 50, 100},
			Namespace: namespace,
			Subsystem: subsystem,
		})
	dashboardSearchFailureRequestsDuration = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:      "dashboard_search_failures_duration_seconds",
			Buckets:   []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10, 25, 50, 100},
			Namespace: namespace,
			Subsystem: subsystem,
		})
)

type StandardSearchService struct {
	registry.BackgroundService

	cfg  *setting.Cfg
	sql  *sqlstore.SQLStore
	auth FutureAuthService // eventually injected from elsewhere
	ac   accesscontrol.AccessControl

	logger log.Logger

	dashboardIndexExtender       DashboardIndexExtender
	dashboardIndexManager        *orgIndexManager
	dashboardReIndexCh           chan bool
	dashboardIndexingBatchSize   int
	dashboardReindexingBatchSize int
}

func ProvideService(cfg *setting.Cfg, sql *sqlstore.SQLStore, entityEventStore store.EntityEventsService, ac accesscontrol.AccessControl, storageService store.StorageService) (SearchService, error) {
	config, err := newConfig(cfg)
	if err != nil {
		return nil, err
	}
	s := &StandardSearchService{
		cfg: cfg,
		sql: sql,
		ac:  ac,
		auth: &simpleSQLAuthService{
			sql: sql,
			ac:  ac,
		},
		logger:                       log.New("searchV2"),
		dashboardIndexExtender:       &NoopExtender{},
		dashboardReIndexCh:           make(chan bool, 1),
		dashboardIndexingBatchSize:   config.DashboardIndexingBatchSize,
		dashboardReindexingBatchSize: config.DashboardReindexingBatchSize,
	}

	s.dashboardIndexManager = newOrgIndexManager(
		orgManagerConfig{
			Name:                  "dashboard",
			ReIndexInterval:       config.DashboardReIndexInterval,
			EventsPollingInterval: config.DashboardEventsPollingInterval,
			BackupMode:            config.DashboardBackup,
			BackupDiskPath:        config.DashboardBackupDiskPath,
		},
		s.getDashboardIndexFactory,
		entityEventStore,
		storageService,
	)
	return s, nil
}

func (s *StandardSearchService) getDashboardIndexFactory(ctx context.Context, orgID int64, writer *bluge.Writer) (Index, error) {
	return createDashboardIndex(ctx, orgID, writer, newSQLDashboardLoader(s.sql), s.dashboardIndexExtender.GetDocumentExtender(), newFolderIDLookup(s.sql), s.dashboardIndexingBatchSize, s.dashboardReindexingBatchSize)
}

func (s *StandardSearchService) IsDisabled() bool {
	if s.cfg == nil {
		return true
	}
	return !s.cfg.IsFeatureToggleEnabled(featuremgmt.FlagPanelTitleSearch)
}

func (s *StandardSearchService) Run(ctx context.Context) error {
	orgQuery := &models.SearchOrgsQuery{}
	err := s.sql.SearchOrgs(ctx, orgQuery)
	if err != nil {
		return fmt.Errorf("can't get org list: %w", err)
	}
	orgIDs := make([]int64, 0, len(orgQuery.Result))
	for _, org := range orgQuery.Result {
		orgIDs = append(orgIDs, org.Id)
	}
	// At this moment we only have dashboard manager, so just run it.
	return s.dashboardIndexManager.run(ctx, orgIDs, s.dashboardReIndexCh)
}

func (s *StandardSearchService) TriggerDashboardReIndex(force bool) {
	if force {
		go func() {
			// we need to make sure index rebuilt, so can't drop true
			// value here like we do below for the case with force == false
			s.dashboardReIndexCh <- true
		}()
	} else {
		select {
		case s.dashboardReIndexCh <- false:
		default:
			// channel is full => re-index will happen soon anyway.
		}
	}
}

func (s *StandardSearchService) RegisterDashboardIndexExtender(ext DashboardIndexExtender) {
	s.dashboardIndexExtender = ext
}

func (s *StandardSearchService) getUser(ctx context.Context, backendUser *backend.User, orgId int64) (*models.SignedInUser, error) {
	// TODO: get user & user's permissions from the request context

	var user *models.SignedInUser
	if s.cfg.AnonymousEnabled && backendUser.Email == "" && backendUser.Login == "" {
		org, err := s.sql.GetOrgByName(s.cfg.AnonymousOrgName)
		if err != nil {
			s.logger.Error("Anonymous access organization error.", "org_name", s.cfg.AnonymousOrgName, "error", err)
			return nil, err
		}

		user = &models.SignedInUser{
			OrgId:       org.Id,
			OrgName:     org.Name,
			OrgRole:     models.RoleType(s.cfg.AnonymousOrgRole),
			IsAnonymous: true,
		}
	} else {
		getSignedInUserQuery := &models.GetSignedInUserQuery{
			Login: backendUser.Login,
			Email: backendUser.Email,
			OrgId: orgId,
		}
		err := s.sql.GetSignedInUser(ctx, getSignedInUserQuery)
		if err != nil {
			s.logger.Error("Error while retrieving user", "error", err, "email", backendUser.Email, "login", getSignedInUserQuery.Login)
			return nil, errors.New("auth error")
		}

		if getSignedInUserQuery.Result == nil {
			s.logger.Error("No user found", "email", backendUser.Email)
			return nil, errors.New("auth error")
		}

		user = getSignedInUserQuery.Result
	}

	if s.ac.IsDisabled() {
		return user, nil
	}

	if user.Permissions == nil {
		user.Permissions = make(map[int64]map[string][]string)
	}

	if _, ok := user.Permissions[orgId]; ok {
		// permissions as part of the `s.sql.GetSignedInUser` query - return early
		return user, nil
	}

	// TODO: ensure this is cached
	permissions, err := s.ac.GetUserPermissions(ctx, user,
		accesscontrol.Options{ReloadCache: false})
	if err != nil {
		s.logger.Error("failed to retrieve user permissions", "error", err, "email", backendUser.Email)
		return nil, errors.New("auth error")
	}

	user.Permissions[orgId] = accesscontrol.GroupScopesByAction(permissions)
	return user, nil
}

func (s *StandardSearchService) DoDashboardQuery(ctx context.Context, user *backend.User, orgID int64, q DashboardQuery) *backend.DataResponse {
	start := time.Now()
	query := s.doDashboardQuery(ctx, user, orgID, q)

	duration := time.Since(start).Seconds()
	if query.Error != nil {
		dashboardSearchFailureRequestsDuration.Observe(duration)
	} else {
		dashboardSearchSuccessRequestsDuration.Observe(duration)
	}

	return query
}

func (s *StandardSearchService) doDashboardQuery(ctx context.Context, user *backend.User, orgID int64, q DashboardQuery) *backend.DataResponse {
	rsp := &backend.DataResponse{}
	signedInUser, err := s.getUser(ctx, user, orgID)
	if err != nil {
		dashboardSearchFailureRequestsCounter.With(prometheus.Labels{
			"reason": "get_user_error",
		}).Inc()
		rsp.Error = err
		return rsp
	}

	filter, err := s.auth.GetDashboardReadFilter(signedInUser)
	if err != nil {
		dashboardSearchFailureRequestsCounter.With(prometheus.Labels{
			"reason": "get_dashboard_filter_error",
		}).Inc()
		rsp.Error = err
		return rsp
	}

	index, err := s.dashboardIndexManager.getOrCreateOrgIndex(ctx, orgID)
	if err != nil {
		rsp.Error = err
		return rsp
	}

	err = s.dashboardIndexManager.sync(ctx)
	if err != nil {
		dashboardSearchFailureRequestsCounter.With(prometheus.Labels{
			"reason": "get_index_error",
		}).Inc()
		rsp.Error = err
		return rsp
	}

	reader, cancel, err := index.Reader()
	if err != nil {
		dashboardSearchFailureRequestsCounter.With(prometheus.Labels{
			"reason": "dashboard_index_sync_error",
		}).Inc()
		rsp.Error = err
		return rsp
	}
	defer cancel()

	response := doSearchQuery(ctx, s.logger, reader, filter, q, s.dashboardIndexExtender.GetQueryExtender(q), s.cfg.AppSubURL)

	if q.WithAllowedActions {
		if err := s.addAllowedActionsField(ctx, orgID, signedInUser, response); err != nil {
			s.logger.Error("error when adding the allowedActions field", "err", err)
		}
	}

	if response.Error != nil {
		dashboardSearchFailureRequestsCounter.With(prometheus.Labels{
			"reason": "search_query_error",
		}).Inc()
	}

	return response
}
