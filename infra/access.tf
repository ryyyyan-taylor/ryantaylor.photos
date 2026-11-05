resource "cloudflare_zero_trust_access_policy" "owner" {
  account_id       = var.account_id
  name             = "only me"
  decision         = "allow"
  include          = [{ email = { email = var.forward_to } }]
  session_duration = "168h"
}

resource "cloudflare_zero_trust_access_application" "utils" {
  zone_id          = data.cloudflare_zone.site.zone_id
  name             = var.zone_name
  type             = "self_hosted"
  domain           = "${var.zone_name}/utils/*"
  destinations     = [{ type = "public", uri = "${var.zone_name}/utils/*" }]
  session_duration = "24h"

  http_only_cookie_attribute = true

  policies = [{
    id         = cloudflare_zero_trust_access_policy.owner.id
    precedence = 1
  }]
}

output "access_aud" {
  value = cloudflare_zero_trust_access_application.utils.aud
}
