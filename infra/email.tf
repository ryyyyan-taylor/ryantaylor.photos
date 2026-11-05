resource "cloudflare_email_routing_settings" "site" {
  zone_id            = data.cloudflare_zone.site.zone_id
  support_subaddress = false
}

resource "cloudflare_email_routing_address" "ryan" {
  account_id = var.account_id
  email      = var.forward_to
}

resource "cloudflare_email_routing_rule" "contact" {
  zone_id  = data.cloudflare_zone.site.zone_id
  name     = ""
  priority = 0
  enabled  = true
  matchers = [{
    type  = "literal"
    field = "to"
    value = "contact@${var.zone_name}"
  }]
  actions = [{
    type  = "forward"
    value = [cloudflare_email_routing_address.ryan.email]
  }]
}

resource "cloudflare_email_routing_catch_all" "site" {
  zone_id  = data.cloudflare_zone.site.zone_id
  name     = ""
  enabled  = false
  matchers = [{ type = "all" }]
  actions  = [{ type = "drop" }]
}
