import {
  to = cloudflare_workers_custom_domain.site
  id = "${var.account_id}/23a7a7cf5ffeb2f54faad0c5deab89c79f7c9349"
}

import {
  to = cloudflare_dns_record.spf
  id = "${data.cloudflare_zone.site.zone_id}/d660ea0952135a6bca4a9bb264c5762e"
}

import {
  to = cloudflare_dns_record.dmarc
  id = "${data.cloudflare_zone.site.zone_id}/20255c2382aac063a1d3cffeb2911591"
}

import {
  to = cloudflare_email_routing_settings.site
  id = data.cloudflare_zone.site.zone_id
}

import {
  to = cloudflare_email_routing_rule.contact
  id = "${data.cloudflare_zone.site.zone_id}/ca065225abd74efebe1d1f448576fe4a"
}

import {
  to = cloudflare_email_routing_catch_all.site
  id = data.cloudflare_zone.site.zone_id
}

import {
  to = cloudflare_email_routing_address.ryan
  id = "${var.account_id}/7bf8f2182d6e4b8db152391262b00534"
}

import {
  for_each = local.zone_settings
  to       = cloudflare_zone_setting.site[each.key]
  id       = "${data.cloudflare_zone.site.zone_id}/${each.key}"
}

import {
  to = cloudflare_zero_trust_access_application.utils
  id = "zones/${data.cloudflare_zone.site.zone_id}/afbd27cf-be5a-4d97-b13a-c6046163a0ca"
}
