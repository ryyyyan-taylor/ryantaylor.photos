resource "cloudflare_dns_record" "spf" {
  zone_id = data.cloudflare_zone.site.zone_id
  name    = var.zone_name
  type    = "TXT"
  content = "\"v=spf1 include:_spf.mx.cloudflare.net ~all\""
  ttl     = 1
}

resource "cloudflare_dns_record" "dmarc" {
  zone_id = data.cloudflare_zone.site.zone_id
  name    = "_dmarc.${var.zone_name}"
  type    = "TXT"
  content = "\"v=DMARC1; p=reject;\""
  ttl     = 1
}
