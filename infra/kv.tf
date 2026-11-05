resource "cloudflare_workers_kv_namespace" "monitor" {
  account_id = var.account_id
  title      = "ryantaylor-photos-monitor"
}

output "monitor_kv_id" {
  value = cloudflare_workers_kv_namespace.monitor.id
}
