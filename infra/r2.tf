import {
  to = cloudflare_r2_bucket.photos
  id = "${var.account_id}/ryantaylor-photos/default"
}

resource "cloudflare_r2_bucket" "photos" {
  account_id = var.account_id
  name       = "ryantaylor-photos"
}

resource "cloudflare_r2_custom_domain" "img" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.photos.name
  domain      = "img.${var.zone_name}"
  zone_id     = data.cloudflare_zone.site.zone_id
  enabled     = true
  min_tls     = "1.2"
}

resource "cloudflare_r2_managed_domain" "photos" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.photos.name
  enabled     = false
}

resource "cloudflare_r2_bucket_lifecycle" "photos" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.photos.name
  rules = [{
    id         = "Default Multipart Abort Rule"
    enabled    = true
    conditions = { prefix = "" }
    abort_multipart_uploads_transition = {
      condition = { type = "Age", max_age = 604800 }
    }
  }]
}
