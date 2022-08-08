package apikeyimpl

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/grafana/grafana/pkg/services/accesscontrol"
	"github.com/grafana/grafana/pkg/services/apikey"
	"github.com/grafana/grafana/pkg/services/sqlstore"
	"github.com/grafana/grafana/pkg/services/sqlstore/db"
	"github.com/grafana/grafana/pkg/setting"
	"github.com/jmoiron/sqlx"
	"xorm.io/xorm"
)

type sqlxStore struct {
	sqlxdb *sqlx.DB
	db     db.DB
	cfg    *setting.Cfg
}

func (ss *sqlxStore) GetAPIKeys(ctx context.Context, query *apikey.GetApiKeysQuery) error {
	return ss.db.WithDbSession(ctx, func(dbSession *sqlstore.DBSession) error {
		var sess *xorm.Session

		if query.IncludeExpired {
			sess = dbSession.Limit(100, 0).
				Where("org_id=?", query.OrgId).
				Asc("name")
		} else {
			sess = dbSession.Limit(100, 0).
				Where("org_id=? and ( expires IS NULL or expires >= ?)", query.OrgId, timeNow().Unix()).
				Asc("name")
		}

		sess = sess.Where("service_account_id IS NULL")

		if !accesscontrol.IsDisabled(ss.cfg) {
			filter, err := accesscontrol.Filter(query.User, "id", "apikeys:id:", accesscontrol.ActionAPIKeyRead)
			if err != nil {
				return err
			}
			sess.And(filter.Where, filter.Args...)
		}

		query.Result = make([]*apikey.APIKey, 0)
		return sess.Find(&query.Result)
	})
}

func (ss *sqlxStore) GetAllAPIKeys(ctx context.Context, orgID int64) []*apikey.APIKey {
	result := make([]*apikey.APIKey, 0)
	var err error
	if orgID != -1 {
		err = ss.sqlxdb.SelectContext(
			ctx, &result, ss.sqlxdb.Rebind("SELECT * FROM playlist WHERE service_account_id IS NULL AND org_id = ? ORDER BY name ASC"), orgID)
	} else {
		err = ss.sqlxdb.SelectContext(
			ctx, &result, ss.sqlxdb.Rebind("SELECT * FROM playlist WHERE service_account_id IS NULL ORDER BY name ASC"))
	}
	if err != nil {
		_ = err
		// TODO: return error
	}
	return result
}

func (ss *sqlxStore) DeleteApiKey(ctx context.Context, cmd *apikey.DeleteCommand) error {
	res, err := ss.sqlxdb.ExecContext(ctx, ss.sqlxdb.Rebind("DELETE FROM api_key WHERE id=? and org_id=? and service_account_id IS NULL"), cmd.Id, cmd.OrgId)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err == nil && n == 0 {
		return apikey.ErrNotFound
	}
	return err
}

func (ss *sqlxStore) AddAPIKey(ctx context.Context, cmd *apikey.AddCommand) error {

	updated := timeNow()
	var expires *int64 = nil
	if cmd.SecondsToLive > 0 {
		v := updated.Add(time.Second * time.Duration(cmd.SecondsToLive)).Unix()
		expires = &v
	} else if cmd.SecondsToLive < 0 {
		return apikey.ErrInvalidExpiration
	}

	err := ss.GetApiKeyByName(ctx, &apikey.GetByNameQuery{OrgId: cmd.OrgId, KeyName: cmd.Name})
	// If key with the same orgId and name already exist return err
	if !errors.Is(err, apikey.ErrInvalid) {
		return apikey.ErrDuplicate
	}

	t := apikey.APIKey{
		OrgId:            cmd.OrgId,
		Name:             cmd.Name,
		Role:             cmd.Role,
		Key:              cmd.Key,
		Created:          updated,
		Updated:          updated,
		Expires:          expires,
		ServiceAccountId: nil,
	}

	_, err = ss.sqlxdb.NamedExecContext(ctx,
		`INSERT INTO api_key (org_id, name, role, key, created, updated, expires, service_account_id) VALUES (:org_id, :name, :role, :key, :created, :updated, :expires, :service_account_id)`, t)
	cmd.Result = &t
	return err
}

func (ss *sqlxStore) GetApiKeyById(ctx context.Context, query *apikey.GetByIDQuery) error {
	var key apikey.APIKey
	err := ss.sqlxdb.GetContext(ctx, &key, ss.sqlxdb.Rebind("SELECT * FROM api_key WHERE id=?"), query.ApiKeyId)
	if err != nil && errors.Is(err, sql.ErrNoRows) {
		return apikey.ErrInvalid
	}
	query.Result = &key
	return err
}

func (ss *sqlxStore) GetApiKeyByName(ctx context.Context, query *apikey.GetByNameQuery) error {
	var key apikey.APIKey
	err := ss.sqlxdb.GetContext(ctx, &key, ss.sqlxdb.Rebind("SELECT * FROM api_key WHERE org_id=? AND name=?"), query.OrgId, query.KeyName)
	if err != nil && errors.Is(err, sql.ErrNoRows) {
		return apikey.ErrInvalid
	}
	query.Result = &key
	return err
}

func (ss *sqlxStore) GetAPIKeyByHash(ctx context.Context, hash string) (*apikey.APIKey, error) {
	var key apikey.APIKey
	err := ss.sqlxdb.GetContext(ctx, &key, ss.sqlxdb.Rebind(`SELECT * FROM api_key WHERE "key"=?`), hash)
	if err != nil && errors.Is(err, sql.ErrNoRows) {
		return nil, apikey.ErrInvalid
	}
	return &key, err
}

func (ss *sqlxStore) UpdateAPIKeyLastUsedDate(ctx context.Context, tokenID int64) error {
	now := timeNow()
	return ss.db.WithDbSession(ctx, func(sess *sqlstore.DBSession) error {
		if _, err := sess.Table("api_key").ID(tokenID).Cols("last_used_at").Update(&apikey.APIKey{LastUsedAt: &now}); err != nil {
			return err
		}

		return nil
	})
}
