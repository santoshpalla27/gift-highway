package expo

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const apiURL = "https://exp.host/--/api/v2/push/send"

type Client struct {
	http        *http.Client
	accessToken string
}

func NewClient(accessToken string) *Client {
	return &Client{
		http:        &http.Client{Timeout: 10 * time.Second},
		accessToken: accessToken,
	}
}

type Message struct {
	To         string                 `json:"to"`
	Title      string                 `json:"title"`
	Body       string                 `json:"body"`
	Data       map[string]interface{} `json:"data,omitempty"`
	Sound      string                 `json:"sound"`
	Priority   string                 `json:"priority"`
	ChannelID  string                 `json:"channelId"`
	CollapseID string                 `json:"collapseId,omitempty"`
}

func IsValidToken(t string) bool {
	return strings.HasPrefix(t, "ExponentPushToken[") || strings.HasPrefix(t, "ExpoPushToken[")
}

// Send sends messages to Expo and returns invalid tokens that should be removed.
func (c *Client) Send(msgs []Message) (invalidTokens []string, err error) {
	if len(msgs) == 0 {
		return nil, nil
	}

	body, _ := json.Marshal(msgs)
	req, _ := http.NewRequest("POST", apiURL, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if c.accessToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.accessToken)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("expo API: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Data []struct {
			Status  string `json:"status"`
			Message string `json:"message"`
			Details *struct {
				Error string `json:"error"`
			} `json:"details"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("expo decode: %w", err)
	}

	for i, ticket := range result.Data {
		if ticket.Status == "error" && ticket.Details != nil && ticket.Details.Error == "DeviceNotRegistered" {
			if i < len(msgs) {
				invalidTokens = append(invalidTokens, msgs[i].To)
			}
		}
	}
	return invalidTokens, nil
}
