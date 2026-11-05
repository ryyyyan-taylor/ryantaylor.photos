locals {
  form_endpoints = "{\"/api/gallery-auth\" \"/api/contact\"}"
}

# avif isn't in Cloudflare's default cacheable extensions, so R2 responses were
# all cf-cache-status: DYNAMIC; objects already carry immutable Cache-Control.
resource "cloudflare_ruleset" "cache" {
  zone_id = data.cloudflare_zone.site.zone_id
  name    = "Cache settings"
  kind    = "zone"
  phase   = "http_request_cache_settings"
  rules = [{
    description = "Cache R2 images at the edge"
    expression  = "(http.host eq \"${cloudflare_r2_custom_domain.img.domain}\")"
    action      = "set_cache_settings"
    action_parameters = {
      cache    = true
      edge_ttl = { mode = "respect_origin" }
    }
  }]
}

resource "cloudflare_ruleset" "rate_limit" {
  zone_id = data.cloudflare_zone.site.zone_id
  name    = "Rate limits"
  kind    = "zone"
  phase   = "http_ratelimit"
  rules = [{
    description = "Throttle password and contact form posts"
    expression  = "(http.request.uri.path in ${local.form_endpoints})"
    action      = "block"
    ratelimit = {
      characteristics     = ["cf.colo.id", "ip.src"]
      period              = 10
      requests_per_period = 5
      mitigation_timeout  = 10
    }
  }]
}

resource "cloudflare_ruleset" "waf" {
  zone_id = data.cloudflare_zone.site.zone_id
  name    = "Custom WAF"
  kind    = "zone"
  phase   = "http_request_firewall_custom"
  rules = [{
    description = "Form endpoints only accept POST"
    expression  = "(http.request.uri.path in ${local.form_endpoints} and http.request.method ne \"POST\")"
    action      = "block"
  }]
}
