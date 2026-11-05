resource "cloudflare_workers_custom_domain" "site" {
  account_id = var.account_id
  zone_id    = data.cloudflare_zone.site.zone_id
  hostname   = var.zone_name
  service    = "ryantaylor-photos"
}
