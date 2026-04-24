package utils

import (
	"regexp"
	"strings"
)

var htmlTagRe = regexp.MustCompile(`<[^>]*>`)

// Strip removes all HTML tags from s and trims surrounding whitespace.
func Strip(s string) string {
	return strings.TrimSpace(htmlTagRe.ReplaceAllString(s, ""))
}
