provider "cloudflare" {}

data "cloudflare_zone" "site" {
  filter = {
    name = var.zone_name
  }
}
