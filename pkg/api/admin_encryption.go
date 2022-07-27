package api

import (
	"fmt"
	"net/http"

	"github.com/grafana/grafana/pkg/api/response"
	"github.com/grafana/grafana/pkg/models"
)

func (hs *HTTPServer) AdminRotateDataEncryptionKeys(c *models.ReqContext) response.Response {
	if err := hs.SecretsService.RotateDataKeys(c.Req.Context()); err != nil {
		return response.Error(http.StatusInternalServerError, "Failed to rotate data keys", err)
	}

	return response.Respond(http.StatusNoContent, "")
}

func (hs *HTTPServer) AdminReEncryptEncryptionKeys(c *models.ReqContext) response.Response {
	if err := hs.SecretsService.ReEncryptDataKeys(c.Req.Context()); err != nil {
		return response.Error(http.StatusInternalServerError, "Failed to re-encrypt data keys", err)
	}

	return response.Respond(http.StatusOK, "Data encryption keys re-encrypted successfully")
}

func (hs *HTTPServer) AdminReEncryptSecrets(c *models.ReqContext) response.Response {
	success, err := hs.secretsMigrator.ReEncryptSecrets(c.Req.Context())
	if err != nil {
		return response.Error(http.StatusInternalServerError, "Failed to re-encrypt secrets", err)
	}

	if !success {
		return response.Error(http.StatusPartialContent, "Something unexpected happened, refer to the server logs for more details", err)
	}

	return response.Respond(http.StatusOK, "Secrets re-encrypted successfully")
}

func (hs *HTTPServer) AdminRollbackSecrets(c *models.ReqContext) response.Response {
	success, err := hs.secretsMigrator.RollBackSecrets(c.Req.Context())
	if err != nil {
		return response.Error(http.StatusInternalServerError, "Failed to rollback secrets", err)
	}

	if !success {
		return response.Error(http.StatusPartialContent, "Something unexpected happened, refer to the server logs for more details", err)
	}

	return response.Respond(http.StatusOK, "Secrets rolled back successfully")
}

func (hs *HTTPServer) AdminDeleteAllSecretsManagerPluginSecrets(c *models.ReqContext) response.Response {
	if !hs.remoteSecretsCheck.ShouldUseRemoteSecretsPlugin() {
		return response.Respond(http.StatusConflict, "Secrets plugin must be installed and configured to run")
	}
	keys, err := hs.secretsStore.Keys(c.Req.Context(), -1, "", "")
	if err != nil {
		return response.Respond(http.StatusInternalServerError, "an error occurred while retrieving secrets")
	}
	for _, key := range keys {
		err := hs.secretsStore.Del(c.Req.Context(), key.OrgId, key.Namespace, key.Type)
		if err != nil {
			return response.Respond(http.StatusInternalServerError, fmt.Sprintf("error deleting key with org=%v namespace=%v type=%v. error=%v", key.OrgId, key.Namespace, key.Type, err.Error()))
		}
	}
	return response.Respond(http.StatusOK, "All Secrets Manager plugin secrets deleted")
}
