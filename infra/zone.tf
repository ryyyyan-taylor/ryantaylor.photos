locals {
  zone_settings = {
    always_use_https = "on"
    min_tls_version  = "1.2"
    ssl              = "strict"
    security_header = {
      strict_transport_security = {
        enabled            = true
        max_age            = 31536000
        include_subdomains = true
        preload            = false
        nosniff            = true
      }
    }
  }
}

resource "cloudflare_zone_setting" "site" {
  for_each   = local.zone_settings
  zone_id    = data.cloudflare_zone.site.zone_id
  setting_id = each.key
  value      = each.value
}
